import 'dotenv/config';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import bcrypt from 'bcrypt';
import Fastify from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from './lib/prisma.js';
import {
  exportCustomersExcel,
  exportInvoicesExcel,
  exportProductsExcel,
  importCustomersExcel,
  importInvoicesExcel,
  importProductsExcel,
  syncBrandModelsFromProducts,
} from './utils/excelExchange.js';
import {
  buildInvoiceCreatedAt,
  formatTimestampInvoiceNo,
  getIstanbulYear,
  roundMoney,
} from './utils/datetime.js';
import { resolveSku } from './utils/sku.js';

const PORT = Number(process.env.PORT) || 3000;
const APP_VERSION = process.env.APP_VERSION ?? 'dev';

type StoreItem = {
  productId: number;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  isChinaReturn?: boolean;
  sourceInvoiceItemId?: number;
};

const ACTIVE_INVOICE_FILTER = { deletedAt: null } as const;

const app = Fastify({ logger: true });

/** Ortak fiş no: YYMMDDHHmmss — çakışırsa sonraki saniyeye kayar */
async function generateTimestampInvoiceNo(
  tx: Prisma.TransactionClient | typeof prisma
): Promise<string> {
  const now = new Date();
  for (let offset = 0; offset < 120; offset += 1) {
    const candidate = formatTimestampInvoiceNo(now, offset);
    const existing = await tx.invoice.findUnique({
      where: { invoiceNo: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${formatTimestampInvoiceNo(now)}${String(Date.now() % 100).padStart(2, '0')}`;
}

async function generateInvoiceNo(
  tx: Prisma.TransactionClient
): Promise<string> {
  return generateTimestampInvoiceNo(tx);
}

/**
 * Cari tahsilat/tediye fiş no — FATURA serisinden tamamen bağımsızdır.
 * Format: ÖDM-YYYY-0001, yıl başında 1'den başlar.
 */
const PAYMENT_RECEIPT_PREFIX = 'ÖDM';

async function generatePaymentReceiptNo(
  tx: Prisma.TransactionClient
): Promise<string> {
  const prefix = `${PAYMENT_RECEIPT_PREFIX}-${getIstanbulYear()}-`;
  const used = await tx.transaction.count({
    where: { receiptNo: { startsWith: prefix } },
  });

  // count sadece başlangıç noktasıdır; silinen/boşluklu seriler için ileri taranır
  for (let seq = used + 1; seq <= used + 1000; seq += 1) {
    const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    const existing = await tx.transaction.findFirst({
      where: { receiptNo: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  return `${prefix}${Date.now().toString().slice(-6)}`;
}

async function previewNextInvoiceNo(): Promise<string> {
  return formatTimestampInvoiceNo();
}

async function generatePurchaseInvoiceNo(
  tx: Prisma.TransactionClient
): Promise<string> {
  return generateTimestampInvoiceNo(tx);
}

async function previewNextPurchaseInvoiceNo(): Promise<string> {
  return formatTimestampInvoiceNo();
}

function calcLineTotalUsd(item: StoreItem): number {
  const discount = item.discountPercent ?? 0;
  const base = item.quantity * item.unitPrice;
  return base * (1 - discount / 100);
}

function calcLineTotalTl(item: StoreItem): number {
  const discount = Number(item.discountPercent) || 0;
  const base = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  return roundMoney(base * (1 - discount / 100));
}

function normalizeStoreItem(item: StoreItem): StoreItem {
  return {
    productId: Number(item.productId),
    quantity: Math.max(0, Math.trunc(Number(item.quantity) || 0)),
    unitPrice: Number(item.unitPrice) || 0,
    discountPercent: Number(item.discountPercent) || 0,
  };
}

function isCashLikePayment(method: string): boolean {
  return method === 'Nakit' || method === 'EFT/Havale' || method === 'Kart';
}

async function generateReturnInvoiceNo(
  tx: Prisma.TransactionClient
): Promise<string> {
  return generateTimestampInvoiceNo(tx);
}

const DEPOT_NAMES = {
  MERKEZ: 'MERKEZ_DEPO',
  CIN_IADE: 'CIN_IADE_DEPO',
} as const;

const DEPOT_LOOKUP: Record<keyof typeof DEPOT_NAMES, string[]> = {
  MERKEZ: ['MERKEZ_DEPO'],
  CIN_IADE: ['CIN_IADE_DEPO', 'ARIZALI_DEPO'],
};

async function getDepotBranchId(
  tx: Prisma.TransactionClient,
  depot: keyof typeof DEPOT_NAMES
): Promise<number> {
  const branch = await tx.branch.findFirst({
    where: { name: { in: DEPOT_LOOKUP[depot] } },
    select: { id: true },
  });
  if (!branch) {
    throw new Error(`${DEPOT_NAMES[depot]} şubesi bulunamadı.`);
  }
  return branch.id;
}

async function ensureDepots() {
  const merkez = await prisma.branch.findFirst({
    where: { name: 'MERKEZ_DEPO' },
    select: { id: true },
  });
  if (!merkez) {
    await prisma.branch.create({
      data: { name: 'MERKEZ_DEPO', type: 'WAREHOUSE' },
    });
  }

  const cinIade = await prisma.branch.findFirst({
    where: { name: 'CIN_IADE_DEPO' },
    select: { id: true },
  });
  const legacyArizali = await prisma.branch.findFirst({
    where: { name: 'ARIZALI_DEPO' },
    select: { id: true },
  });

  if (!cinIade && legacyArizali) {
    await prisma.branch.update({
      where: { id: legacyArizali.id },
      data: { name: 'CIN_IADE_DEPO' },
    });
  } else if (!cinIade) {
    await prisma.branch.create({
      data: { name: 'CIN_IADE_DEPO', type: 'WAREHOUSE' },
    });
  }
}

async function incrementStock(
  tx: Prisma.TransactionClient,
  productId: number,
  branchId: number,
  quantity: number
) {
  const existing = await tx.productStock.findUnique({
    where: { productId_branchId: { productId, branchId } },
  });

  if (existing) {
    await tx.productStock.update({
      where: { productId_branchId: { productId, branchId } },
      data: { quantity: { increment: quantity } },
    });
  } else {
    await tx.productStock.create({
      data: { productId, branchId, quantity },
    });
  }
}

async function adjustStockQuantity(
  tx: Prisma.TransactionClient,
  productId: number,
  branchId: number,
  delta: number
) {
  if (!delta) return;

  const stockKey = {
    productId_branchId: { productId, branchId },
  };
  const stock = await tx.productStock.findUnique({ where: stockKey });

  if (stock) {
    await tx.productStock.update({
      where: stockKey,
      data: { quantity: { increment: delta } },
    });
  } else {
    await tx.productStock.create({
      data: { productId, branchId, quantity: delta },
    });
  }
}

async function applyInvoiceStockDelta(
  tx: Prisma.TransactionClient,
  invoiceType: string,
  isPreOrder: boolean,
  productId: number,
  branchId: number,
  qtyDelta: number
) {
  if (!qtyDelta) return;

  if (invoiceType === 'SATIS') {
    if (isPreOrder) return;
    await adjustStockQuantity(tx, productId, branchId, -qtyDelta);
  } else if (invoiceType === 'ALIS' || invoiceType === 'IADE') {
    await adjustStockQuantity(tx, productId, branchId, qtyDelta);
  }
}

async function applyInvoiceFinancialDelta(
  tx: Prisma.TransactionClient,
  params: {
    invoiceType: string;
    /** Ön sipariş: cari ve kasa KESİNLİKLE etkilenmez (stok düşümüyle birlikte tamamlanınca işlenir) */
    isPreOrder?: boolean;
    paymentMethod: string;
    customerId: number;
    safeId: number;
    amountDelta: number;
  }
) {
  const { invoiceType, isPreOrder, paymentMethod, customerId, safeId, amountDelta } =
    params;
  if (!amountDelta) return;
  if (isPreOrder) return;

  if (invoiceType === 'SATIS') {
    if (paymentMethod === 'Cari') {
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: { increment: amountDelta } },
      });
    } else if (isCashLikePayment(paymentMethod)) {
      await tx.safe.update({
        where: { id: safeId },
        data: { balance: { increment: amountDelta } },
      });
    }
  } else if (invoiceType === 'ALIS') {
    if (paymentMethod === 'Cari') {
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: { decrement: amountDelta } },
      });
    } else if (isCashLikePayment(paymentMethod)) {
      await tx.safe.update({
        where: { id: safeId },
        data: { balance: { decrement: amountDelta } },
      });
    }
  } else if (invoiceType === 'IADE') {
    // Açık (Cari): müşteri bakiyesinden düş
    // Kapalı (nakit vb.): kasadan para çıkışı
    if (paymentMethod === 'Cari') {
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: { decrement: amountDelta } },
      });
    } else if (isCashLikePayment(paymentMethod)) {
      await tx.safe.update({
        where: { id: safeId },
        data: { balance: { decrement: amountDelta } },
      });
    }
  }
}

type InvoiceWithItems = {
  id: number;
  invoiceNo: string;
  type: string;
  customerId: number;
  safeId: number;
  isPreOrder: boolean;
  paymentMethod: string;
  totalAmountTl: number;
  deletedAt: Date | null;
  items: Array<{
    id: number;
    productId: number;
    quantity: number;
    isChinaReturn: boolean;
  }>;
};

async function assertInvoiceCanTrash(
  tx: Prisma.TransactionClient,
  invoice: InvoiceWithItems
) {
  if (invoice.deletedAt) {
    throw new Error('Bu fatura zaten silinmiş işlemler listesinde.');
  }

  for (const item of invoice.items) {
    const linkedReturns = await tx.invoiceItem.count({
      where: {
        sourceInvoiceItemId: item.id,
        invoice: ACTIVE_INVOICE_FILTER,
      },
    });
    if (linkedReturns > 0) {
      throw new Error(
        'Bu faturadan yapılmış aktif iade kaydı var; önce iadeleri silin.'
      );
    }
  }

  if (invoice.type === 'SATIS') {
    const linkedReturnInvoices = await tx.invoice.count({
      where: {
        originalInvoiceId: invoice.id,
        ...ACTIVE_INVOICE_FILTER,
      },
    });
    if (linkedReturnInvoices > 0) {
      throw new Error(
        'Bu faturaya bağlı aktif iade fişi var; önce iadeleri silin.'
      );
    }
  }
}

async function reverseInvoiceEffects(
  tx: Prisma.TransactionClient,
  invoice: InvoiceWithItems
) {
  const merkezDepoId = await getDepotBranchId(tx, 'MERKEZ');
  const cinIadeDepoId = await getDepotBranchId(tx, 'CIN_IADE');

  for (const item of invoice.items) {
    if (invoice.type === 'SATIS') {
      await applyInvoiceStockDelta(
        tx,
        invoice.type,
        invoice.isPreOrder,
        item.productId,
        merkezDepoId,
        -item.quantity
      );
    } else if (invoice.type === 'ALIS') {
      await applyInvoiceStockDelta(
        tx,
        invoice.type,
        false,
        item.productId,
        merkezDepoId,
        -item.quantity
      );
    } else if (invoice.type === 'IADE') {
      const stockBranchId = item.isChinaReturn ? cinIadeDepoId : merkezDepoId;
      await adjustStockQuantity(
        tx,
        item.productId,
        stockBranchId,
        -item.quantity
      );
    }
  }

  await applyInvoiceFinancialDelta(tx, {
    invoiceType: invoice.type,
    isPreOrder: invoice.isPreOrder,
    paymentMethod: invoice.paymentMethod,
    customerId: invoice.customerId,
    safeId: invoice.safeId,
    amountDelta: -invoice.totalAmountTl,
  });

  // Ön siparişte kayıt anında kasa hareketi oluşmadığı için ters kayıt da açılmaz
  if (invoice.isPreOrder) return;

  if (invoice.type === 'SATIS' && isCashLikePayment(invoice.paymentMethod)) {
    await tx.transaction.create({
      data: {
        safeId: invoice.safeId,
        customerId: invoice.customerId,
        type: 'CIKIS',
        amount: invoice.totalAmountTl,
        description: `${invoice.invoiceNo} fiş iptali`,
      },
    });
  } else if (invoice.type === 'ALIS' && isCashLikePayment(invoice.paymentMethod)) {
    await tx.transaction.create({
      data: {
        safeId: invoice.safeId,
        customerId: invoice.customerId,
        type: 'GIRIS',
        amount: invoice.totalAmountTl,
        description: `${invoice.invoiceNo} alış iptali`,
      },
    });
  } else if (invoice.type === 'IADE' && isCashLikePayment(invoice.paymentMethod)) {
    await tx.transaction.create({
      data: {
        safeId: invoice.safeId,
        customerId: invoice.customerId,
        type: 'GIRIS',
        amount: invoice.totalAmountTl,
        description: `${invoice.invoiceNo} iade iptali (kasa iadesi)`,
      },
    });
  }
}

type InvoiceFinancialSnapshot = {
  invoiceType: string;
  isPreOrder: boolean;
  paymentMethod: string;
  customerId: number;
  safeId: number;
  totalAmountTl: number;
};

async function reconcileInvoiceFinancials(
  tx: Prisma.TransactionClient,
  before: InvoiceFinancialSnapshot,
  after: InvoiceFinancialSnapshot
) {
  await applyInvoiceFinancialDelta(tx, {
    invoiceType: before.invoiceType,
    isPreOrder: before.isPreOrder,
    paymentMethod: before.paymentMethod,
    customerId: before.customerId,
    safeId: before.safeId,
    amountDelta: -before.totalAmountTl,
  });
  await applyInvoiceFinancialDelta(tx, {
    invoiceType: after.invoiceType,
    isPreOrder: after.isPreOrder,
    paymentMethod: after.paymentMethod,
    customerId: after.customerId,
    safeId: after.safeId,
    amountDelta: after.totalAmountTl,
  });
}

async function getReturnedQtyMap(
  sourceItemIds: number[]
): Promise<Map<number, number>> {
  if (sourceItemIds.length === 0) return new Map();

  const grouped = await prisma.invoiceItem.groupBy({
    by: ['sourceInvoiceItemId'],
    where: {
      sourceInvoiceItemId: { in: sourceItemIds },
      invoice: ACTIVE_INVOICE_FILTER,
    },
    _sum: { quantity: true },
  });

  const map = new Map<number, number>();
  for (const row of grouped) {
    if (row.sourceInvoiceItemId != null) {
      map.set(row.sourceInvoiceItemId, row._sum.quantity ?? 0);
    }
  }
  return map;
}

async function enrichInvoiceItemsWithReturnable<
  T extends { id: number; quantity: number },
>(items: T[]) {
  const returnedMap = await getReturnedQtyMap(items.map((item) => item.id));
  return items.map((item) => {
    const returnedQty = returnedMap.get(item.id) ?? 0;
    const returnableQty = Math.max(0, item.quantity - returnedQty);
    return { ...item, returnedQty, returnableQty };
  });
}

function isWithinReturnWindow(soldAt: Date): boolean {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  return soldAt >= cutoff;
}

type ReturnableItemLookup =
  | { status: 'ok'; invoiceId: number; invoiceNo: string; soldAt: string; exchangeRate: number; sourceInvoiceItemId: number; unitPrice: number; returnableQty: number; product: { id: number; sku: string; barcode: string | null; name: string } }
  | { status: 'never_purchased' }
  | { status: 'too_old'; lastPurchaseDate: string }
  | { status: 'fully_returned'; lastPurchaseDate: string };

async function findReturnableInvoiceItem(
  customerId: number,
  productId: number
): Promise<ReturnableItemLookup> {
  const items = await prisma.invoiceItem.findMany({
    where: {
      productId,
      invoice: { customerId, type: 'SATIS', ...ACTIVE_INVOICE_FILTER },
    },
    orderBy: { invoice: { createdAt: 'desc' } },
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNo: true,
          createdAt: true,
          exchangeRate: true,
        },
      },
      product: {
        // marka/model — iade ekranı fiş adını bunlara göre sadeleştirir
        select: {
          id: true,
          sku: true,
          barcode: true,
          name: true,
          brand: true,
          model: true,
        },
      },
    },
  });

  if (items.length === 0) {
    return { status: 'never_purchased' };
  }

  const returnedMap = await getReturnedQtyMap(items.map((item) => item.id));
  const mostRecent = items[0];
  const mostRecentDate = mostRecent.invoice.createdAt;

  for (const item of items) {
    if (!isWithinReturnWindow(item.invoice.createdAt)) continue;

    const returnedQty = returnedMap.get(item.id) ?? 0;
    const returnableQty = Math.max(0, item.quantity - returnedQty);
    const rate =
      toFloat(item.invoice.exchangeRate) > 0
        ? toFloat(item.invoice.exchangeRate)
        : 1;
    return {
      status: 'ok',
      invoiceId: item.invoice.id,
      invoiceNo: item.invoice.invoiceNo,
      soldAt: item.invoice.createdAt.toISOString(),
      exchangeRate: rate,
      sourceInvoiceItemId: item.id,
      unitPrice: toFloat(item.unitPrice),
      returnableQty,
      product: item.product,
    };
  }

  if (!isWithinReturnWindow(mostRecentDate)) {
    return {
      status: 'too_old',
      lastPurchaseDate: mostRecentDate.toISOString(),
    };
  }

  return {
    status: 'fully_returned',
    lastPurchaseDate: mostRecentDate.toISOString(),
  };
}

async function getRecentSoldProducts(
  limit: number,
  customerId: number | null,
  rate: number
) {
  const items = await prisma.invoiceItem.findMany({
    where: {
      invoice: {
        type: 'SATIS',
        ...(customerId ? { customerId } : {}),
      },
    },
    orderBy: { invoice: { createdAt: 'desc' } },
    take: limit * 5,
    select: {
      productId: true,
      unitPrice: true,
      product: {
        select: {
          id: true,
          sku: true,
          barcode: true,
          name: true,
          costPrice: true,
          priceTl: true,
          priceUsd: true,
        },
      },
    },
  });

  const seen = new Set<number>();
  const results: Array<{
    id: number;
    sku: string;
    barcode: string | null;
    name: string;
    costPrice: number;
    costUsd: number;
    priceTl: number;
    priceUsd: number;
    lastSoldPrice: number;
    lastSoldPriceUsd: number;
    stocks: [];
    merkezDepoQuantity: number;
  }> = [];

  for (const item of items) {
    if (seen.has(item.productId)) continue;
    seen.add(item.productId);

    const product = item.product;
    const lastSoldPrice = toFloat(item.unitPrice);
    const priceUsd = toFloat(product.priceUsd);
    const lastSoldPriceUsd =
      lastSoldPrice > priceUsd * 4 ? lastSoldPrice / rate : lastSoldPrice;

    results.push({
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      costPrice: toFloat(product.costPrice),
      costUsd: toFloat(product.costPrice) / rate,
      priceTl: toFloat(product.priceTl),
      priceUsd,
      lastSoldPrice,
      lastSoldPriceUsd,
      stocks: [],
      merkezDepoQuantity: 0,
    });

    if (results.length >= limit) break;
  }

  return results;
}

function toPartyPriceUsd(
  partyPriceTl: number | null,
  priceUsd: number,
  rate: number
): number | null {
  if (partyPriceTl == null) return null;
  return partyPriceTl > priceUsd * 4 ? partyPriceTl / rate : partyPriceTl;
}

async function getLastPartyPriceMap(
  productIds: number[],
  customerId: number,
  invoiceType: 'SATIS' | 'ALIS'
): Promise<Map<number, number>> {
  if (productIds.length === 0) return new Map();

  const items = await prisma.invoiceItem.findMany({
    where: {
      productId: { in: productIds },
      invoice: { customerId, type: invoiceType },
    },
    orderBy: { invoice: { createdAt: 'desc' } },
    select: { productId: true, unitPrice: true },
  });

  const map = new Map<number, number>();
  for (const item of items) {
    if (!map.has(item.productId)) {
      map.set(item.productId, toFloat(item.unitPrice));
    }
  }
  return map;
}

const PRODUCT_SEARCH_SELECT = {
  id: true,
  sku: true,
  barcode: true,
  name: true,
  // İstemci yerel filtresi sunucuyla aynı alanlarda eşleşsin diye döner
  brand: true,
  model: true,
  color: true,
  appearance: true,
  quality: true,
  costPrice: true,
  priceTl: true,
  priceUsd: true,
  stocks: {
    where: { branch: { name: DEPOT_NAMES.MERKEZ } },
    select: {
      quantity: true,
      branch: { select: { id: true, name: true } },
    },
  },
} as const;

type ProductSearchRow = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  appearance: string | null;
  quality: string | null;
  costPrice: number;
  priceTl: number;
  priceUsd: number;
  stocks: Array<{
    quantity: unknown;
    branch: { id: number; name: string };
  }>;
};

function mapProductSearchExtras(
  product: ProductSearchRow,
  lastPartyPriceTl: number | null,
  rate: number
) {
  const costUsd = toFloat(product.costPrice);
  const priceUsd =
    toFloat(product.priceUsd) > 0 ? toFloat(product.priceUsd) : toFloat(product.priceTl);
  const lastPartyPriceUsd = toPartyPriceUsd(lastPartyPriceTl, priceUsd, rate);
  const lastSoldPrice =
    lastPartyPriceTl != null && lastPartyPriceUsd != null ? lastPartyPriceTl : null;
  const lastSoldPriceUsd = lastPartyPriceUsd;

  const stocks = product.stocks.map((stock) => ({
    branchId: stock.branch.id,
    branchName: stock.branch.name,
    quantity: toFloat(stock.quantity),
  }));

  return {
    id: product.id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    model: product.model,
    color: product.color,
    appearance: product.appearance,
    quality: product.quality,
    costPrice: toFloat(product.costPrice),
    costUsd,
    priceTl: priceUsd,
    priceUsd,
    lastPartyPriceTl,
    lastPartyPriceUsd,
    lastSoldPrice,
    lastSoldPriceUsd,
    stocks,
    merkezDepoQuantity: stocks[0]?.quantity ?? 0,
  };
}

/**
 * Türkçe duyarlı arama katlaması.
 * `toLocaleLowerCase('tr-TR')` "INFİNİX" → "ınfinix" (noktasız ı) ürettiği için
 * kullanıcının yazdığı "infinix" ile eşleşmiyordu. Burada hem büyük/küçük hem de
 * aksan farkı ASCII tabanına indirgenir: İ/I/ı → i, Ş/ş → s, Ğ/ğ → g ...
 */
const TR_FOLD_MAP: Record<string, string> = {
  İ: 'i', I: 'i', ı: 'i',
  Ş: 's', ş: 's',
  Ğ: 'g', ğ: 'g',
  Ü: 'u', ü: 'u',
  Ö: 'o', ö: 'o',
  Ç: 'c', ç: 'c',
};

function foldSearchText(value: string | null | undefined): string {
  if (!value) return '';
  let out = '';
  for (const char of value) {
    out += TR_FOLD_MAP[char] ?? char;
  }
  return out.toLowerCase();
}

type ProductRankRow = {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  appearance: string | null;
  quality: string | null;
};

const PRODUCT_RANK_SELECT = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  brand: true,
  model: true,
  color: true,
  appearance: true,
  quality: true,
} as const;

/** Kelime sınırında eşleşme — "8" ifadesi "18" içinde sayılmaz */
function hasWordBoundary(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : haystack[at - 1];
    const afterIdx = at + needle.length;
    const after = afterIdx >= haystack.length ? '' : haystack[afterIdx];
    const isEdge = (ch: string) => ch === '' || !/[a-z0-9]/.test(ch);
    if (isEdge(before) && isEdge(after)) return true;
    from = at + 1;
  }
}

/**
 * Kelime BAŞINDA eşleşme — kullanıcı kelimeyi kısaltarak yazar ("kap" → "KAPAK").
 * `hasWordBoundary` bunu kaçırır (sonrası harf), `includes` ise fazla cömerttir
 * ("8" → "N980" ortasında). Aradaki doğru kademe budur.
 */
function hasWordPrefix(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : haystack[at - 1];
    if (before === '' || !/[a-z0-9]/.test(before)) return true;
    from = at + 1;
  }
}

/**
 * Relevans puanı. Önceki sürümde sıralama yalnızca `name asc` idi; bu yüzden
 * "Note 8" aramasında alfabetik olarak önce gelen "NOTE 10..." kayıtları
 * listenin başına, gerçek "NOTE 8" kayıtları 50. sıralara düşüyordu.
 */
function scoreProductMatch(
  row: ProductRankRow,
  phrase: string,
  words: string[]
): number {
  const name = foldSearchText(row.name);
  const sku = foldSearchText(row.sku);
  const barcode = foldSearchText(row.barcode);

  if (sku === phrase || barcode === phrase) return 1000;
  if (name === phrase) return 950;
  if (sku.startsWith(phrase) || barcode.startsWith(phrase)) return 900;

  if (name.startsWith(phrase)) return 850;
  if (hasWordBoundary(name, phrase)) return 800;
  if (name.includes(phrase)) return 750;

  if (words.every((word) => hasWordBoundary(name, word))) return 700;
  // "note 8 kap" → "NOTE 8 ARKA KAPAK": her parça bir kelimenin başında
  if (words.every((word) => hasWordPrefix(name, word))) return 680;

  if (sku.includes(phrase) || barcode.includes(phrase)) return 600;

  /*
   * Tüm parçalar adın içinde geçiyor ama en az biri kelime ORTASINDA.
   * "note 8 kap" aramasında "SAMSUNG N980 NOTE 20 ARKA KAPAK" buraya düşer
   * ("8" yalnızca "N980" içinde geçiyor); gerçek NOTE 8 kayıtlarının önüne
   * geçmemesi için kelime başı isabet sayısı kadar küçük bir prim alır.
   */
  if (words.every((word) => name.includes(word))) {
    const prefixHits = words.filter((word) => hasWordPrefix(name, word)).length;
    return 450 + prefixHits;
  }

  const attrs = foldSearchText(
    [row.brand, row.model, row.color, row.appearance, row.quality]
      .filter(Boolean)
      .join(' ')
  );
  const nameAndAttrs = `${name} ${attrs}`;
  if (words.every((word) => nameAndAttrs.includes(word))) return 400;

  // Yalnızca stok kodu / barkod / açıklama üzerinden dolaylı eşleşme
  return 100;
}

/**
 * Aynı relevans kademesindeki sıralama anahtarı — marka alfabetik.
 * Marka alanı boş ürünlerde ürün adının ilk kelimesi marka yerine geçer
 * (adlar "INFINIX ...", "SAMSUNG ..." biçiminde markayla başlıyor).
 */
function rankBrandKey(row: ProductRankRow): string {
  const brand = row.brand?.trim();
  if (brand) return foldSearchText(brand);
  return foldSearchText(row.name.trim().split(/\s+/)[0] ?? '');
}

function rankProductCandidates(
  rows: ProductRankRow[],
  search: string
): ProductRankRow[] {
  const phrase = foldSearchText(search);
  const words = phrase.split(/\s+/).filter(Boolean);

  return rows
    .map((row) => ({ row, score: scoreProductMatch(row, phrase, words) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Aynı puanda: marka alfabetik → ad alfabetik → id (kararlı sayfalama)
      const brandA = rankBrandKey(a.row);
      const brandB = rankBrandKey(b.row);
      if (brandA !== brandB) return brandA.localeCompare(brandB, 'tr');
      const byName = a.row.name.localeCompare(b.row.name, 'tr');
      return byName !== 0 ? byName : a.row.id - b.row.id;
    })
    .map((entry) => entry.row);
}

/** Relevans sıralaması için belleğe alınacak azami aday satır sayısı */
const RANK_CANDIDATE_CAP = 5000;

async function searchProductsForF2(options: {
  search?: string;
  page: number;
  limit: number;
  customerId: number | null;
  context: 'sales' | 'purchase' | 'return';
  rate: number;
  prioritizeProductId?: number | null;
}) {
  const { search, page, limit, customerId, context, rate, prioritizeProductId } = options;
  const trimmedSearch = search?.trim() ?? '';
  const where = trimmedSearch ? buildProductSearchWhere(trimmedSearch) : {};
  const invoiceType = context === 'purchase' ? 'ALIS' : 'SATIS';

  /*
   * ARAMALI DURUM — relevansa göre sırala.
   * Veritabanı tarafında `name asc` sıralaması "Note 8" aramasında "NOTE 10..."
   * kayıtlarını başa taşıyordu. Adaylar hafif alanlarla çekilir, bellekte
   * puanlanır, yalnızca ilgili sayfanın tam verisi ikinci sorguda alınır.
   */
  if (trimmedSearch) {
    const candidates = await prisma.product.findMany({
      where,
      select: PRODUCT_RANK_SELECT,
      orderBy: { id: 'asc' },
      take: RANK_CANDIDATE_CAP + 1,
    });

    const truncated = candidates.length > RANK_CANDIDATE_CAP;
    const pool = truncated ? candidates.slice(0, RANK_CANDIDATE_CAP) : candidates;
    const totalCount = truncated
      ? await prisma.product.count({ where })
      : pool.length;

    const ranked = rankProductCandidates(pool, trimmedSearch);
    const pageRows = ranked.slice((page - 1) * limit, (page - 1) * limit + limit);
    const pageIds = pageRows.map((row) => row.id);

    if (pageIds.length === 0) {
      return { data: [], totalCount, page, limit };
    }

    const full = await prisma.product.findMany({
      where: { id: { in: pageIds } },
      select: PRODUCT_SEARCH_SELECT,
    });
    const byId = new Map(full.map((product) => [product.id, product]));
    // Sıra relevans dizisinden gelir; `in` sorgusunun döndürdüğü sıra önemsizdir
    const orderedProducts = pageIds.flatMap((id) => {
      const product = byId.get(id);
      return product ? [product] : [];
    });

    const searchPartyPriceMap =
      customerId && !Number.isNaN(customerId)
        ? await getLastPartyPriceMap(pageIds, customerId, invoiceType)
        : new Map<number, number>();

    return {
      data: orderedProducts.map((product) =>
        mapProductSearchExtras(
          product,
          searchPartyPriceMap.get(product.id) ?? null,
          rate
        )
      ),
      totalCount,
      page,
      limit,
    };
  }

  /**
   * Sabitlenen ürün yalnızca 1. sayfada, listenin başında yer alır ve orada bir
   * satır tüketir. Sonraki sayfaların bu kaymayı telafi etmesi gerekir; aksi
   * halde her sayfa geçişinde bir ürün atlanıyordu.
   */
  const hasPinnedSlot = Boolean(
    !trimmedSearch && prioritizeProductId && prioritizeProductId > 0
  );

  let pinnedProduct: ProductSearchRow | null = null;
  if (page === 1 && hasPinnedSlot) {
    pinnedProduct = await prisma.product.findUnique({
      where: { id: prioritizeProductId! },
      select: PRODUCT_SEARCH_SELECT,
    });
  }

  const listWhere: Prisma.ProductWhereInput = hasPinnedSlot
    ? { AND: [where, { id: { not: prioritizeProductId! } }] }
    : where;

  const listTake = pinnedProduct ? Math.max(0, limit - 1) : limit;
  const skip = hasPinnedSlot
    ? Math.max(0, (page - 1) * limit - 1)
    : (page - 1) * limit;

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where: listWhere,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: listTake,
      skip,
      select: PRODUCT_SEARCH_SELECT,
    }),
    prisma.product.count({ where }),
  ]);

  const allProducts = pinnedProduct ? [pinnedProduct, ...products] : products;

  const partyPriceMap =
    customerId && !Number.isNaN(customerId)
      ? await getLastPartyPriceMap(
          allProducts.map((product) => product.id),
          customerId,
          invoiceType
        )
      : new Map<number, number>();

  const data = allProducts.map((product) =>
    mapProductSearchExtras(
      product,
      partyPriceMap.get(product.id) ?? null,
      rate
    )
  );

  return { data, totalCount, page, limit };
}

function normalizeSearchTerm(search: string): string {
  return search.trim().toLocaleLowerCase('tr-TR');
}

/** Aranabilir ürün kolonları — yerel (istemci) filtre ile aynı küme */
const PRODUCT_SEARCH_FIELDS = [
  'name',
  'sku',
  'barcode',
  'brand',
  'model',
  'color',
  'appearance',
  'quality',
  'description',
] as const;

/**
 * Çok kelimeli aramada KISA parçaların (ör. "8") stok kodu / barkod / açıklama
 * içindeki rakamlara denk gelip alakasız ürün getirmesini engeller.
 * "Note 8" araması, stok kodu 3015385 olan "NOTE 10" ürününü getiriyordu.
 */
const SHORT_TOKEN_FIELDS = ['name', 'brand', 'model'] as const;
const SHORT_TOKEN_MAX_LEN = 2;

/** Tek kelime için kolonlar arası OR — tr-TR küçük/büyük varyantları denenir */
function buildProductWordFilter(
  word: string,
  scope: readonly string[] = PRODUCT_SEARCH_FIELDS
): Prisma.ProductWhereInput {
  // MySQL Prisma sağlayıcısı mode: 'insensitive' desteklemez.
  // utf8mb4 collation + tr-TR normalize edilmiş terim ile çok yönlü arama yapılır.
  const terms = [
    ...new Set([
      word,
      word.toLocaleLowerCase('tr-TR'),
      word.toLocaleUpperCase('tr-TR'),
    ]),
  ];

  return {
    OR: terms.flatMap((term) =>
      scope.map(
        (field) => ({ [field]: { contains: term } }) as Prisma.ProductWhereInput
      )
    ),
  };
}

/**
 * Çok kelimeli arama: kelimeler AND'lenir, her kelime kolonlar arasında OR'lanır.
 * "samsung 128" → adı "Samsung" + modeli "128GB" olan ürünü de bulur.
 * Tek parça `contains` kullanılan eski sürümde bu tür kayıtlar hiç listelenmiyordu.
 */
const MAX_SEARCH_WORDS = 5;

function buildProductSearchWhere(search: string): Prisma.ProductWhereInput {
  const trimmed = search.trim();
  if (!trimmed) return {};

  const words = trimmed.split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_WORDS);
  if (words.length === 0) return {};
  // Tek kelimede tam kapsam korunur — 2 haneli stok kodu araması da çalışsın
  if (words.length === 1) return buildProductWordFilter(words[0]);

  // Kelimeler AND — ayrıca tam ifadeyi tek parça arayan OR dalı korunur
  return {
    OR: [
      {
        AND: words.map((word) =>
          buildProductWordFilter(
            word,
            word.length <= SHORT_TOKEN_MAX_LEN
              ? SHORT_TOKEN_FIELDS
              : PRODUCT_SEARCH_FIELDS
          )
        ),
      },
      buildProductWordFilter(trimmed),
    ],
  };
}

function toFloat(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Fatura tutarı — öncelik USD; eski kayıtlar için TL/kur dönüşümü */
function invoiceUsdAmount(invoice: {
  totalAmountUsd?: number | null;
  totalAmountTl?: number | null;
  exchangeRate?: number | null;
}): number {
  const usd = toFloat(invoice.totalAmountUsd);
  if (usd > 0) return roundMoney(usd);
  const tl = toFloat(invoice.totalAmountTl);
  const rate = toFloat(invoice.exchangeRate) > 0 ? toFloat(invoice.exchangeRate) : 1;
  return roundMoney(tl / rate);
}

const DEFAULT_LIST_TAKE = 50;
const MAX_LIST_TAKE = 500;

function parseListPageQuery(query: {
  page?: string;
  limit?: string;
  take?: string;
  skip?: string;
}) {
  const limitRaw = Number(query.limit ?? query.take);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), MAX_LIST_TAKE)
      : DEFAULT_LIST_TAKE;

  let page = Number(query.page);
  if (!Number.isFinite(page) || page < 1) {
    const skipRaw = Number(query.skip);
    if (Number.isFinite(skipRaw) && skipRaw >= 0) {
      page = Math.floor(skipRaw / limit) + 1;
    } else {
      page = 1;
    }
  }

  page = Math.floor(page);
  const skip = (page - 1) * limit;

  return { limit, page, skip };
}

function buildListResponse<T>(
  data: T[],
  totalCount: number,
  limit: number,
  page: number
) {
  return {
    success: true,
    data,
    totalCount,
    limit,
    page,
    message: 'OK',
  };
}

function buildCustomerSearchWhere(search: string): Prisma.CustomerWhereInput {
  const trimmed = search.trim();
  if (!trimmed) return {};

  const normalized = normalizeSearchTerm(trimmed);
  const terms = [...new Set([trimmed, normalized])];

  return {
    OR: terms.flatMap((term) => [
      { name: { contains: term } },
      { code: { contains: term } },
    ]),
  };
}

const FALLBACK_USD = 46.39;
const FALLBACK_EUR = 53.628;
const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';
const RATES_CACHE_MS = 15 * 60 * 1000;
const FALLBACK_CACHE_MS = 60 * 1000;

type CachedRates = {
  usd: number;
  eur: number;
  source: string;
  updatedAt: string;
  fetchedAt: number;
};

let ratesCache: CachedRates | null = null;

function parseTcmbForexSelling(xml: string, currencyCode: string): number | null {
  const blockMatch = xml.match(
    new RegExp(
      `<Currency[^>]*Kod="${currencyCode}"[\\s\\S]*?</Currency>`,
      'i'
    )
  );
  if (!blockMatch) return null;
  const sellingMatch = blockMatch[0].match(
    /<ForexSelling>([\d.,]+)<\/ForexSelling>/i
  );
  if (!sellingMatch) return null;
  const normalized = sellingMatch[1].includes(',')
    ? sellingMatch[1].replace(/\./g, '').replace(',', '.')
    : sellingMatch[1];
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function fetchFrankfurterTryRates(): Promise<{ usd: number; eur: number } | null> {
  try {
    const [usdRes, eurRes] = await Promise.all([
      fetch('https://api.frankfurter.app/latest?from=USD&to=TRY', {
        signal: AbortSignal.timeout(10000),
      }),
      fetch('https://api.frankfurter.app/latest?from=EUR&to=TRY', {
        signal: AbortSignal.timeout(10000),
      }),
    ]);
    if (!usdRes.ok || !eurRes.ok) return null;
    const usdJson = (await usdRes.json()) as { rates?: { TRY?: number } };
    const eurJson = (await eurRes.json()) as { rates?: { TRY?: number } };
    const usd = usdJson.rates?.TRY;
    const eur = eurJson.rates?.TRY;
    if (!usd || !eur || usd <= 0 || eur <= 0) return null;
    return { usd, eur };
  } catch (err) {
    console.warn(
      '[exchange-rates] Frankfurter failed:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

async function fetchTcmbRates(): Promise<CachedRates> {
  const now = Date.now();
  if (ratesCache) {
    const age = now - ratesCache.fetchedAt;
    const ttl =
      ratesCache.source === 'varsayılan' ? FALLBACK_CACHE_MS : RATES_CACHE_MS;
    if (age < ttl) return ratesCache;
  }

  try {
    const response = await fetch(TCMB_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AkgunTeknik-ERP/1.5)',
        Accept: 'application/xml,text/xml,*/*',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`TCMB HTTP ${response.status}`);

    const xml = await response.text();
    const usd = parseTcmbForexSelling(xml, 'USD');
    const eur = parseTcmbForexSelling(xml, 'EUR');

    if (!usd || !eur) throw new Error('TCMB parse hatası');

    ratesCache = {
      usd,
      eur,
      source: 'TCMB',
      updatedAt: new Date().toISOString(),
      fetchedAt: now,
    };
    return ratesCache;
  } catch (tcmbErr) {
    console.warn(
      '[exchange-rates] TCMB failed:',
      tcmbErr instanceof Error ? tcmbErr.message : tcmbErr
    );

    const frank = await fetchFrankfurterTryRates();
    if (frank) {
      ratesCache = {
        usd: frank.usd,
        eur: frank.eur,
        source: 'ECB',
        updatedAt: new Date().toISOString(),
        fetchedAt: now,
      };
      return ratesCache;
    }

    ratesCache = {
      usd: FALLBACK_USD,
      eur: FALLBACK_EUR,
      source: 'varsayılan',
      updatedAt: new Date().toISOString(),
      fetchedAt: now,
    };
    return ratesCache;
  }
}

async function buildAnalyticsReport() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const salesInvoices = await prisma.invoice.findMany({
    where: {
      type: 'SATIS',
      userId: { not: null },
      createdAt: { gte: startOfYear },
      ...ACTIVE_INVOICE_FILTER,
    },
    select: {
      userId: true,
      totalAmountUsd: true,
      totalAmountTl: true,
      exchangeRate: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
  });

  type TurnoverEntry = {
    userId: number;
    userName: string;
    daily: number;
    monthly: number;
    yearly: number;
  };

  const turnoverMap = new Map<number, TurnoverEntry>();

  for (const invoice of salesInvoices) {
    if (!invoice.userId || !invoice.user) continue;

    const entry =
      turnoverMap.get(invoice.userId) ??
      ({
        userId: invoice.userId,
        userName: invoice.user.name,
        daily: 0,
        monthly: 0,
        yearly: 0,
      } satisfies TurnoverEntry);

    entry.yearly += invoiceUsdAmount(invoice);
    if (invoice.createdAt >= startOfMonth) entry.monthly += invoiceUsdAmount(invoice);
    if (invoice.createdAt >= startOfDay) entry.daily += invoiceUsdAmount(invoice);
    turnoverMap.set(invoice.userId, entry);
  }

  const staffTurnover = Array.from(turnoverMap.values()).sort((a, b) =>
    a.userName.localeCompare(b.userName, 'tr')
  );

  const sevenDaysAgo = new Date(startOfDay);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [chartSales, chartPurchases, topProductRows, topCustomerInvoices, lowStockRows] =
    await Promise.all([
      prisma.invoice.findMany({
        where: { type: 'SATIS', createdAt: { gte: sevenDaysAgo }, ...ACTIVE_INVOICE_FILTER },
        select: { totalAmountUsd: true, totalAmountTl: true, exchangeRate: true, createdAt: true },
      }),
      prisma.invoice.findMany({
        where: { type: 'SATIS', createdAt: { gte: sixMonthsAgo }, ...ACTIVE_INVOICE_FILTER },
        select: { totalAmountUsd: true, totalAmountTl: true, exchangeRate: true, createdAt: true },
      }),
      prisma.invoiceItem.findMany({
        where: {
          invoice: { type: 'SATIS', createdAt: { gte: thirtyDaysAgo }, ...ACTIVE_INVOICE_FILTER },
        },
        select: {
          quantity: true,
          product: { select: { id: true, sku: true, name: true } },
        },
      }),
      prisma.invoice.findMany({
        where: {
          type: 'SATIS',
          createdAt: { gte: thirtyDaysAgo },
          ...ACTIVE_INVOICE_FILTER,
        },
        select: {
          totalAmountUsd: true,
          totalAmountTl: true,
          exchangeRate: true,
          customer: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.branch
        .findFirst({ where: { name: 'MERKEZ_DEPO' }, select: { id: true } })
        .then(async (branch) => {
          if (!branch) return [];
          return prisma.productStock.findMany({
            where: { branchId: branch.id, quantity: { lte: 5 } },
            include: {
              product: { select: { id: true, sku: true, name: true } },
            },
            orderBy: { quantity: 'asc' },
            take: 15,
          });
        }),
    ]);

  const dailySalesMap = new Map<string, number>();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    dailySalesMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const inv of chartSales) {
    const key = inv.createdAt.toISOString().slice(0, 10);
    if (dailySalesMap.has(key)) {
      dailySalesMap.set(key, (dailySalesMap.get(key) ?? 0) + invoiceUsdAmount(inv));
    }
  }
  const dailySales = Array.from(dailySalesMap.entries()).map(([date, total]) => ({
    date,
    label: new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', {
      weekday: 'short',
      day: 'numeric',
    }),
    total,
  }));

  const monthlySalesMap = new Map<string, number>();
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlySalesMap.set(key, 0);
  }
  for (const inv of chartPurchases) {
    const key = `${inv.createdAt.getFullYear()}-${String(inv.createdAt.getMonth() + 1).padStart(2, '0')}`;
    if (monthlySalesMap.has(key)) {
      monthlySalesMap.set(
        key,
        (monthlySalesMap.get(key) ?? 0) + invoiceUsdAmount(inv)
      );
    }
  }
  const monthlySales = Array.from(monthlySalesMap.entries()).map(
    ([month, total]) => ({
      month,
      label: new Date(`${month}-01T12:00:00`).toLocaleDateString('tr-TR', {
        month: 'short',
        year: '2-digit',
      }),
      total,
    })
  );

  type ProductAgg = {
    productId: number;
    sku: string;
    name: string;
    quantity: number;
  };
  const productQtyMap = new Map<number, ProductAgg>();
  for (const row of topProductRows) {
    const existing = productQtyMap.get(row.product.id);
    if (existing) {
      existing.quantity += row.quantity;
    } else {
      productQtyMap.set(row.product.id, {
        productId: row.product.id,
        sku: row.product.sku,
        name: row.product.name,
        quantity: row.quantity,
      });
    }
  }
  const allProductsBySales = Array.from(productQtyMap.values()).sort(
    (a, b) => b.quantity - a.quantity
  );
  const topProducts = allProductsBySales.slice(0, 10).map((row) => ({
    name: row.name,
    quantity: row.quantity,
    sku: row.sku,
    productId: row.productId,
  }));
  const bottomProducts = [...allProductsBySales]
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 10)
    .map((row) => ({
      name: row.name,
      quantity: row.quantity,
      sku: row.sku,
      productId: row.productId,
    }));

  type CustomerAgg = {
    customerId: number;
    code: string;
    name: string;
    amount: number;
    invoiceCount: number;
  };
  const customerSalesMap = new Map<number, CustomerAgg>();
  for (const inv of topCustomerInvoices) {
    const existing = customerSalesMap.get(inv.customer.id);
    const amount = invoiceUsdAmount(inv);
    if (existing) {
      existing.amount += amount;
      existing.invoiceCount += 1;
    } else {
      customerSalesMap.set(inv.customer.id, {
        customerId: inv.customer.id,
        code: inv.customer.code,
        name: inv.customer.name,
        amount,
        invoiceCount: 1,
      });
    }
  }
  const topCustomers = Array.from(customerSalesMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const lowStock = lowStockRows.map((row) => ({
    id: row.product.id,
    sku: row.product.sku,
    name: row.product.name,
    quantity: row.quantity,
  }));

  return {
    staffTurnover,
    charts: {
      dailySales,
      monthlySales,
      topProducts,
      bottomProducts,
      topCustomers,
      staffComparison: staffTurnover.map((s) => ({
        name: s.userName,
        monthly: s.monthly,
      })),
    },
    lowStock,
  };
}

app.register(cors, { origin: true });

app.get('/api/version', async () => ({
  success: true,
  data: {
    version: APP_VERSION,
    allowNegativeStock: true,
  },
  message: 'API version',
}));

const JWT_SECRET =
  process.env.JWT_SECRET ?? 'akgunteknik-dev-secret-degistirin';

app.register(jwt, { secret: JWT_SECRET });
app.register(rateLimit, { global: false });
app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

const ADMIN_USERNAME = 'akgunteknik';
const ADMIN_PASSWORD = '123456';
const ADMIN_BCRYPT_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

type AuthUserPayload = {
  sub: string;
  name: string;
  role: string;
};

async function issueAuthToken(
  reply: { jwtSign: (payload: AuthUserPayload, options?: { expiresIn: string }) => Promise<string> },
  user: AuthUserPayload
) {
  const token = await reply.jwtSign(user, { expiresIn: '7d' });
  return token;
}

app.post<{ Body: { username: string; password: string } }>(
  '/api/auth/login',
  {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  },
  async (request, reply) => {
    const { username, password } = request.body ?? {};
    const trimmedUsername = username?.trim();

    if (!trimmedUsername || !password) {
      return reply.status(400).send({
        success: false,
        message: 'Kullanıcı adı ve şifre zorunludur.',
        errors: null,
      });
    }

    if (trimmedUsername === ADMIN_USERNAME) {
      const valid =
        password === ADMIN_PASSWORD ||
        bcrypt.compareSync(password, ADMIN_BCRYPT_HASH);
      if (valid) {
        const token = await issueAuthToken(reply, {
          sub: ADMIN_USERNAME,
          name: 'Akgün Teknik',
          role: 'admin',
        });
        return {
          success: true,
          data: {
            token,
            user: {
              username: ADMIN_USERNAME,
              name: 'Akgün Teknik',
              role: 'admin',
            },
          },
          message: 'Giriş başarılı.',
        };
      }
    }

    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: trimmedUsername }, { name: trimmedUsername }],
      },
    });

    if (dbUser) {
      const stored = dbUser.password;
      const validPassword =
        stored.startsWith('$2') && bcrypt.compareSync(password, stored)
          ? true
          : stored === password;

      if (validPassword) {
        const token = await issueAuthToken(reply, {
          sub: String(dbUser.id),
          name: dbUser.name,
          role: dbUser.role,
        });
        return {
          success: true,
          data: {
            token,
            user: {
              username: dbUser.email,
              name: dbUser.name,
              role: dbUser.role,
            },
          },
          message: 'Giriş başarılı.',
        };
      }
    }

    return reply.status(401).send({
      success: false,
      message: 'Kullanıcı adı veya şifre hatalı.',
      errors: null,
    });
  }
);

app.get('/api/auth/me', async (request, reply) => {
  try {
    const payload = await request.jwtVerify<AuthUserPayload>();
    return {
      success: true,
      data: {
        username: payload.sub,
        name: payload.name,
        role: payload.role,
      },
      message: 'Oturum geçerli.',
    };
  } catch {
    return reply.status(401).send({
      success: false,
      message: 'Geçersiz veya süresi dolmuş oturum.',
      errors: null,
    });
  }
});

app.get('/api/exchange-rates', async () => {
  const rates = await fetchTcmbRates();
  return {
    success: true,
    data: {
      usd: rates.usd,
      eur: rates.eur,
      source: rates.source,
      updatedAt: rates.updatedAt,
    },
    message: 'Exchange rates retrieved successfully.',
  };
});

app.get('/api/sales/dashboard', async () => {
  const [safes, recentInvoices, recentPayments, analytics] = await Promise.all([
    prisma.safe.findMany({
      select: {
        id: true,
        name: true,
        currency: true,
        balance: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.invoice.findMany({
      take: 10,
      where: ACTIVE_INVOICE_FILTER,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.transaction.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        safe: { select: { id: true, name: true, currency: true } },
        customer: { select: { id: true, code: true, name: true } },
      },
    }),
    buildAnalyticsReport(),
  ]);

  return {
    success: true,
    data: {
      safeBalances: safes,
      recentInvoices,
      recentPayments,
      insights: {
        dailySales: analytics.charts.dailySales,
        monthlySales: analytics.charts.monthlySales,
        topProducts: analytics.charts.topProducts,
        topCustomers: analytics.charts.topCustomers,
        lowStock: analytics.lowStock.slice(0, 8),
      },
    },
    message: 'Dashboard data retrieved successfully.',
  };
});

app.get('/api/reports/analytics', async () => {
  const data = await buildAnalyticsReport();
  return {
    success: true,
    data,
    message: 'Analytics report retrieved successfully.',
  };
});

app.get<{ Querystring: { customerId?: string; productId?: string } }>(
  '/api/sales/returnable-item',
  async (request, reply) => {
    const customerId = Number(request.query.customerId);
    const productId = Number(request.query.productId);

    if (!Number.isFinite(customerId) || customerId <= 0) {
      return reply.status(400).send({
        success: false,
        message: 'Geçerli müşteri seçin.',
        errors: null,
      });
    }

    if (!Number.isFinite(productId) || productId <= 0) {
      return reply.status(400).send({
        success: false,
        message: 'Geçerli ürün seçin.',
        errors: null,
      });
    }

    const match = await findReturnableInvoiceItem(customerId, productId);

    return {
      success: true,
      data: match,
      message: 'Returnable item lookup completed.',
    };
  }
);

app.get<{ Querystring: { type?: string } }>(
  '/api/sales/invoices/export/excel',
  async (request, reply) => {
    const buffer = await exportInvoicesExcel(prisma, request.query.type);
    reply.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    reply.header(
      'Content-Disposition',
      'attachment; filename="faturalar.xlsx"'
    );
    return buffer;
  }
);

app.post('/api/sales/invoices/import/excel', async (request, reply) => {
  const upload = await request.file();
  if (!upload) {
    return reply.status(400).send({
      success: false,
      message: 'Excel dosyası gerekli.',
      errors: null,
    });
  }

  const buffer = await upload.toBuffer();
  const result = await importInvoicesExcel(prisma, buffer);

  return {
    success: true,
    data: result,
    message: `${result.updated} fatura güncellendi.`,
  };
});

app.get<{
  Querystring: {
    type?: string;
    customerId?: string;
    preOrder?: string;
    customerSearch?: string;
    productSearch?: string;
  };
}>(
  '/api/sales/invoices',
  async (request) => {
    const { type, customerId, preOrder, customerSearch, productSearch } = request.query;

    const where: Prisma.InvoiceWhereInput = { ...ACTIVE_INVOICE_FILTER };
    if (type && type !== 'ALL') {
      where.type = type;
    }
    if (preOrder === 'true' || preOrder === '1') {
      where.isPreOrder = true;
      where.type = 'SATIS';
    }
    if (customerId) {
      const parsedCustomerId = Number(customerId);
      if (Number.isFinite(parsedCustomerId) && parsedCustomerId > 0) {
        where.customerId = parsedCustomerId;
      }
    }

    const customerQuery = customerSearch?.trim();
    if (customerQuery) {
      where.customer = {
        OR: [
          { name: { contains: customerQuery } },
          { code: { contains: customerQuery } },
        ],
      };
    }

    const productQuery = productSearch?.trim();
    if (productQuery) {
      where.items = {
        some: {
          product: {
            OR: [
              { name: { contains: productQuery } },
              { sku: { contains: productQuery } },
              { barcode: { contains: productQuery } },
            ],
          },
        },
      };
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: {
        customer: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    return {
      success: true,
      data: invoices,
      message: 'Invoices retrieved successfully.',
    };
  }
);

app.get('/api/sales/invoices/trash', async () => {
  const invoices = await prisma.invoice.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
    take: 1000,
    include: {
      customer: { select: { id: true, code: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  });

  return {
    success: true,
    data: invoices,
    message: 'Deleted invoices retrieved successfully.',
  };
});

app.post<{ Params: { id: string } }>(
  '/api/sales/invoices/:id/trash',
  async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.status(400).send({
        success: false,
        message: 'Geçersiz fatura id.',
        errors: null,
      });
    }

    try {
      const trashed = await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findUnique({
          where: { id },
          include: { items: true },
        });

        if (!invoice) {
          throw new Error('Fatura bulunamadı.');
        }

        await assertInvoiceCanTrash(tx, invoice);
        await reverseInvoiceEffects(tx, invoice);

        return tx.invoice.update({
          where: { id },
          data: { deletedAt: new Date() },
          include: {
            customer: { select: { id: true, code: true, name: true } },
            branch: { select: { id: true, name: true } },
          },
        });
      });

      return {
        success: true,
        data: trashed,
        message: 'Fatura silinen işlemlere taşındı. Stok ve cari etkileri geri alındı.',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Fatura silinemedi.';
      return reply.status(500).send({
        success: false,
        message,
        errors: null,
      });
    }
  }
);

app.delete<{ Params: { id: string } }>(
  '/api/sales/invoices/:id/permanent',
  async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.status(400).send({
        success: false,
        message: 'Geçersiz fatura id.',
        errors: null,
      });
    }

    try {
      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) {
        return reply.status(404).send({
          success: false,
          message: 'Fatura bulunamadı.',
          errors: null,
        });
      }
      if (!invoice.deletedAt) {
        return reply.status(400).send({
          success: false,
          message: 'Kalıcı silme yalnızca silinen işlemler listesindeki faturalar için yapılabilir.',
          errors: null,
        });
      }

      await prisma.invoice.delete({ where: { id } });

      return {
        success: true,
        data: { id },
        message: 'Fatura kalıcı olarak silindi.',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Fatura kalıcı silinemedi.';
      return reply.status(500).send({
        success: false,
        message,
        errors: null,
      });
    }
  }
);

app.get<{ Params: { id: string } }>('/api/sales/invoices/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return reply.status(400).send({
      success: false,
      message: 'Geçersiz fatura id.',
      errors: null,
    });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true,
          code: true,
          name: true,
          balance: true,
        },
      },
      user: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      safe: { select: { id: true, name: true } },
      originalInvoice: { select: { id: true, invoiceNo: true, type: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              barcode: true,
              name: true,
              // marka/model — fatura düzenleme ve fiş ekranı adı sadeleştirir
              brand: true,
              model: true,
              priceTl: true,
              priceUsd: true,
            },
          },
        },
      },
    },
  });

  if (!invoice) {
    return reply.status(404).send({
      success: false,
      message: 'Fatura bulunamadı.',
      errors: null,
    });
  }

  const items = await enrichInvoiceItemsWithReturnable(invoice.items);

  return {
    success: true,
    data: { ...invoice, items },
    message: 'Invoice detail retrieved successfully.',
  };
});

app.put<{
  Params: { id: string };
  Body: {
    paymentMethod?: string;
    paymentType?: string | null;
    processedBy?: string | null;
    orderNotes?: string | null;
    deliveryType?: string;
    shippingCompany?: string | null;
    trackingNumber?: string | null;
    dueDate?: string | null;
    invoiceDate?: string | null;
    exchangeRate?: number;
    isPreOrder?: boolean;
    customerId?: number;
    removeItemIds?: number[];
    items?: Array<{
      id?: number;
      productId?: number;
      quantity?: number;
      unitPrice?: number;
      discountPercent?: number;
    }>;
  };
}>('/api/sales/invoices/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return reply.status(400).send({
      success: false,
      message: 'Geçersiz fatura id.',
      errors: null,
    });
  }

  const body = request.body ?? {};

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existing) {
        throw new Error('Fatura bulunamadı.');
      }
      if (existing.deletedAt) {
        throw new Error('Silinmiş fatura düzenlenemez.');
      }

      const merkezDepoId = await getDepotBranchId(tx, 'MERKEZ');
      const returnedMap = await getReturnedQtyMap(existing.items.map((item) => item.id));

      const nextIsPreOrder =
        body.isPreOrder !== undefined ? body.isPreOrder : existing.isPreOrder;
      const nextCustomerId =
        body.customerId !== undefined ? Number(body.customerId) : existing.customerId;
      const nextPaymentMethod =
        body.paymentMethod !== undefined ? body.paymentMethod : existing.paymentMethod;
      const nextSafeId = existing.safeId;
      const nextRate =
        body.exchangeRate !== undefined && body.exchangeRate > 0
          ? Number(body.exchangeRate)
          : existing.exchangeRate;

      if (
        body.customerId !== undefined &&
        (!Number.isFinite(nextCustomerId) || nextCustomerId <= 0)
      ) {
        throw new Error('Geçersiz müşteri.');
      }

      if (
        existing.type === 'SATIS' &&
        body.isPreOrder !== undefined &&
        body.isPreOrder !== existing.isPreOrder
      ) {
        for (const item of existing.items) {
          if (body.isPreOrder) {
            await adjustStockQuantity(tx, item.productId, merkezDepoId, item.quantity);
          } else {
            await adjustStockQuantity(tx, item.productId, merkezDepoId, -item.quantity);
          }
        }
      }

      if (body.removeItemIds?.length || body.items?.length) {
        const itemMap = new Map(existing.items.map((item) => [item.id, item]));

        if (body.removeItemIds?.length) {
          const uniqueRemoves = [
            ...new Set(
              body.removeItemIds
                .map((raw) => Number(raw))
                .filter((itemId) => Number.isFinite(itemId) && itemId > 0)
            ),
          ];

          for (const itemId of uniqueRemoves) {
            const current = itemMap.get(itemId);
            if (!current) {
              throw new Error(`Silinecek kalem #${itemId} bulunamadı.`);
            }

            const returnedQty = returnedMap.get(itemId) ?? 0;
            if (returnedQty > 0) {
              throw new Error(
                `${current.id} numaralı satırda ${returnedQty} adet iade kaydı var; satır silinemez.`
              );
            }

            await applyInvoiceStockDelta(
              tx,
              existing.type,
              nextIsPreOrder,
              current.productId,
              merkezDepoId,
              -current.quantity
            );

            await tx.invoiceItem.delete({ where: { id: itemId } });
            itemMap.delete(itemId);
          }
        }

        for (const patch of body.items ?? []) {
          if (!patch.id) continue;

          const current = itemMap.get(patch.id);
          if (!current) {
            throw new Error(`Fatura kalemi #${patch.id} bulunamadı.`);
          }

          const nextQty =
            patch.quantity !== undefined ? Number(patch.quantity) : current.quantity;
          const nextUnitPrice =
            patch.unitPrice !== undefined ? Number(patch.unitPrice) : current.unitPrice;
          const nextDiscount =
            patch.discountPercent !== undefined
              ? Number(patch.discountPercent)
              : current.discountPercent;

          if (!Number.isFinite(nextQty) || nextQty <= 0) {
            throw new Error('Adet sıfırdan büyük olmalı.');
          }
          if (!Number.isFinite(nextUnitPrice) || nextUnitPrice < 0) {
            throw new Error('Birim fiyat geçersiz.');
          }

          const returnedQty = returnedMap.get(current.id) ?? 0;
          if (nextQty < returnedQty) {
            throw new Error(
              `${current.id} numaralı satırda iade edilen ${returnedQty} adetten az olamaz.`
            );
          }

          const qtyDelta = nextQty - current.quantity;
          await applyInvoiceStockDelta(
            tx,
            existing.type,
            nextIsPreOrder,
            current.productId,
            merkezDepoId,
            qtyDelta
          );

          const lineTotal = roundMoney(
            calcLineTotalTl({
              productId: current.productId,
              quantity: nextQty,
              unitPrice: nextUnitPrice,
              discountPercent: nextDiscount,
            })
          );

          await tx.invoiceItem.update({
            where: { id: current.id },
            data: {
              quantity: nextQty,
              unitPrice: roundMoney(nextUnitPrice),
              discountPercent: nextDiscount,
              totalPrice: lineTotal,
            },
          });

          if (existing.type === 'ALIS' && patch.unitPrice !== undefined) {
            await tx.product.update({
              where: { id: current.productId },
              data: {
                costPrice: roundMoney(nextUnitPrice),
                priceUsd: nextUnitPrice > 0 ? nextUnitPrice / nextRate : 0,
              },
            });
          }
        }

        for (const patch of body.items ?? []) {
          if (patch.id) continue;

          const productId = Number(patch.productId);
          if (!Number.isFinite(productId) || productId <= 0) {
            throw new Error('Yeni kalem için geçerli ürün seçin.');
          }

          const nextQty = Number(patch.quantity);
          const nextUnitPrice = Number(patch.unitPrice);
          const nextDiscount =
            patch.discountPercent !== undefined ? Number(patch.discountPercent) : 0;

          if (!Number.isFinite(nextQty) || nextQty <= 0) {
            throw new Error('Yeni kalem adedi sıfırdan büyük olmalı.');
          }
          if (!Number.isFinite(nextUnitPrice) || nextUnitPrice < 0) {
            throw new Error('Yeni kalem birim fiyatı geçersiz.');
          }

          const product = await tx.product.findUnique({ where: { id: productId } });
          if (!product) {
            throw new Error('Ürün bulunamadı.');
          }

          const lineTotal = roundMoney(
            calcLineTotalTl({
              productId,
              quantity: nextQty,
              unitPrice: nextUnitPrice,
              discountPercent: nextDiscount,
            })
          );

          await tx.invoiceItem.create({
            data: {
              invoiceId: id,
              productId,
              quantity: nextQty,
              unitPrice: roundMoney(nextUnitPrice),
              discountPercent: nextDiscount,
              totalPrice: lineTotal,
            },
          });

          await applyInvoiceStockDelta(
            tx,
            existing.type,
            nextIsPreOrder,
            productId,
            merkezDepoId,
            nextQty
          );
        }
      }

      const refreshedItems = await tx.invoiceItem.findMany({ where: { invoiceId: id } });
      const totalAmountTl = roundMoney(
        refreshedItems.reduce(
          (sum, item) =>
            sum +
            calcLineTotalTl({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
            }),
          0
        )
      );
      const totalAmountUsd = roundMoney(totalAmountTl / nextRate);

      const financialChanged =
        body.customerId !== undefined ||
        body.paymentMethod !== undefined ||
        body.items !== undefined ||
        body.exchangeRate !== undefined ||
        body.isPreOrder !== undefined;

      if (financialChanged) {
        const beforeFinancial: InvoiceFinancialSnapshot = {
          invoiceType: existing.type,
          isPreOrder: existing.isPreOrder,
          paymentMethod: existing.paymentMethod,
          customerId: existing.customerId,
          safeId: existing.safeId,
          totalAmountTl: existing.totalAmountTl,
        };
        const afterFinancial: InvoiceFinancialSnapshot = {
          invoiceType: existing.type,
          isPreOrder: nextIsPreOrder,
          paymentMethod: nextPaymentMethod,
          customerId: nextCustomerId,
          safeId: nextSafeId,
          totalAmountTl,
        };

        /*
         * isPreOrder da mutabakat tetikleyicisidir: ön siparişte mali kayıt
         * yoktur, satışa dönüşünce eklenir; satıştan ön siparişe alınırsa geri alınır.
         */
        if (
          beforeFinancial.customerId !== afterFinancial.customerId ||
          beforeFinancial.paymentMethod !== afterFinancial.paymentMethod ||
          beforeFinancial.isPreOrder !== afterFinancial.isPreOrder ||
          beforeFinancial.totalAmountTl !== afterFinancial.totalAmountTl
        ) {
          await reconcileInvoiceFinancials(tx, beforeFinancial, afterFinancial);
        }
      }

      const matchedUser =
        body.processedBy !== undefined && body.processedBy
          ? await tx.user.findFirst({ where: { name: body.processedBy } })
          : null;

      return tx.invoice.update({
        where: { id },
        data: {
          ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod } : {}),
          ...(body.paymentType !== undefined ? { paymentType: body.paymentType } : {}),
          ...(body.processedBy !== undefined
            ? {
                processedBy: body.processedBy,
                userId: matchedUser?.id ?? null,
              }
            : {}),
          ...(body.orderNotes !== undefined ? { orderNotes: body.orderNotes } : {}),
          ...(body.deliveryType !== undefined ? { deliveryType: body.deliveryType } : {}),
          ...(body.shippingCompany !== undefined
            ? { shippingCompany: body.shippingCompany }
            : {}),
          ...(body.trackingNumber !== undefined
            ? { trackingNumber: body.trackingNumber }
            : {}),
          ...(body.dueDate !== undefined
            ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
            : {}),
          ...(body.invoiceDate !== undefined
            ? {
                createdAt: body.invoiceDate
                  ? buildInvoiceCreatedAt(body.invoiceDate)
                  : existing.createdAt,
              }
            : {}),
          ...(body.exchangeRate !== undefined ? { exchangeRate: nextRate } : {}),
          ...(body.isPreOrder !== undefined ? { isPreOrder: body.isPreOrder } : {}),
          ...(body.customerId !== undefined ? { customerId: nextCustomerId } : {}),
          totalAmountTl,
          totalAmountUsd,
        },
        include: {
          customer: { select: { id: true, code: true, name: true } },
          branch: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          safe: { select: { id: true, name: true } },
          items: {
            include: {
              product: {
                select: { id: true, sku: true, name: true, barcode: true },
              },
            },
          },
        },
      });
    });

    const items = await enrichInvoiceItemsWithReturnable(updated.items);

    return {
      success: true,
      data: { ...updated, items },
      message: 'Fatura güncellendi.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fatura güncellenemedi.';
    return reply.status(500).send({
      success: false,
      message,
      errors: null,
    });
  }
});

app.post<{ Params: { id: string } }>(
  '/api/sales/invoices/:id/fulfill',
  async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.status(400).send({
        success: false,
        message: 'Geçersiz fatura id.',
        errors: null,
      });
    }

    try {
      const invoice = await prisma.$transaction(async (tx) => {
        const existing = await tx.invoice.findUnique({
          where: { id },
          include: { items: true },
        });

        if (!existing) {
          throw new Error('Fatura bulunamadı.');
        }
        if (existing.type !== 'SATIS' || !existing.isPreOrder) {
          throw new Error('Yalnızca ön sipariş satış faturaları tamamlanabilir.');
        }

        const merkezDepoId = await getDepotBranchId(tx, 'MERKEZ');

        for (const item of existing.items) {
          await adjustStockQuantity(
            tx,
            item.productId,
            merkezDepoId,
            -item.quantity
          );
        }

        /*
         * Mali etki ön sipariş aşamasında hiç işlenmediği için burada, sipariş
         * gerçek satışa dönüşürken tek seferde işlenir (cari veya kasa).
         */
        await applyInvoiceFinancialDelta(tx, {
          invoiceType: existing.type,
          isPreOrder: false,
          paymentMethod: existing.paymentMethod,
          customerId: existing.customerId,
          safeId: existing.safeId,
          amountDelta: existing.totalAmountTl,
        });

        if (isCashLikePayment(existing.paymentMethod)) {
          await tx.transaction.create({
            data: {
              safeId: existing.safeId,
              customerId: existing.customerId,
              type: 'GIRIS',
              amount: existing.totalAmountTl,
              description: `${existing.invoiceNo} satış tahsilatı (${existing.paymentMethod})`,
            },
          });
        }

        return tx.invoice.update({
          where: { id },
          data: { isPreOrder: false },
          include: {
            customer: { select: { id: true, code: true, name: true } },
            items: true,
          },
        });
      });

      return {
        success: true,
        data: invoice,
        message: 'Ön sipariş tamamlandı, stok düşüldü.',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Ön sipariş tamamlanamadı.';
      return reply.status(500).send({
        success: false,
        message,
        errors: null,
      });
    }
  }
);

app.get('/api/sales/init', async () => {
  const [branches, safes, personnels, nextInvoiceNo] = await Promise.all([
    prisma.branch.findMany({
      where: { type: 'STORE' },
      orderBy: { name: 'asc' },
    }),
    prisma.safe.findMany({
      include: { branch: { select: { id: true, name: true, type: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    previewNextInvoiceNo(),
  ]);

  return {
    success: true,
    data: { branches, safes, personnels, nextInvoiceNo },
    message: 'Sales init data retrieved successfully.',
  };
});

app.get('/api/purchases/init', async () => {
  const [branches, safes, personnels, nextInvoiceNo] = await Promise.all([
    prisma.branch.findMany({
      where: { type: 'STORE' },
      orderBy: { name: 'asc' },
    }),
    prisma.safe.findMany({
      include: { branch: { select: { id: true, name: true, type: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    previewNextPurchaseInvoiceNo(),
  ]);

  return {
    success: true,
    data: { branches, safes, personnels, nextInvoiceNo },
    message: 'Purchase init data retrieved successfully.',
  };
});

app.post<{
  Body: {
    customerId: number;
    branchId: number;
    safeId: number;
    paymentMethod: string;
    paymentType?: string;
    exchangeRate?: number;
    dueDate?: string;
    invoiceDate?: string;
    processedBy?: string;
    orderNotes?: string;
    items: StoreItem[];
  };
}>('/api/purchases/store', async (request, reply) => {
  const {
    customerId,
    branchId,
    safeId,
    paymentMethod,
    paymentType,
    exchangeRate,
    dueDate,
    invoiceDate,
    processedBy,
    orderNotes,
    items,
  } = request.body;

  if (!customerId || !branchId || !safeId || !paymentMethod || !items?.length) {
    return reply.status(400).send({
      success: false,
      message: 'Eksik veya geçersiz alış faturası bilgileri.',
      errors: null,
    });
  }

  const rate = exchangeRate && exchangeRate > 0 ? exchangeRate : 1;
  const totalAmountTl = items.reduce(
    (sum, item) => sum + calcLineTotalTl(item),
    0
  );
  const totalAmountUsd = totalAmountTl / rate;

  // Fiş üzerinde "Eski bakiye / Güncel bakiye" için — Satış ile aynı standart
  const supplierBefore = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { balance: true },
  });
  const balanceBefore = roundMoney(supplierBefore?.balance ?? 0);

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNo = await generatePurchaseInvoiceNo(tx);
      const stockBranchId = await getDepotBranchId(tx, 'MERKEZ');

      const matchedUser = processedBy
        ? await tx.user.findFirst({ where: { name: processedBy } })
        : null;

      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNo,
          type: 'ALIS',
          customerId,
          safeId,
          branchId,
          userId: matchedUser?.id,
          paymentMethod,
          paymentType: paymentType ?? null,
          exchangeRate: rate,
          deliveryType: 'Mağazadan Teslim',
          dueDate: dueDate ? new Date(dueDate) : null,
          processedBy: processedBy ?? null,
          orderNotes: orderNotes ?? null,
          totalAmountTl,
          totalAmountUsd,
          ...(invoiceDate ? { createdAt: new Date(invoiceDate) } : {}),
          items: {
            create: items.map((item) => {
              const lineTotal = calcLineTotalTl(item);
              return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountPercent: item.discountPercent ?? 0,
                totalPrice: lineTotal,
              };
            }),
          },
        },
        include: { items: true },
      });

      for (const item of items) {
        await incrementStock(tx, item.productId, stockBranchId, item.quantity);

        await tx.product.update({
          where: { id: item.productId },
          data: {
            costPrice: item.unitPrice,
            priceUsd: item.unitPrice > 0 ? item.unitPrice / rate : 0,
          },
        });
      }

      if (isCashLikePayment(paymentMethod)) {
        await tx.safe.update({
          where: { id: safeId },
          data: { balance: { decrement: totalAmountTl } },
        });

        await tx.transaction.create({
          data: {
            safeId,
            customerId,
            type: 'CIKIS',
            amount: totalAmountTl,
            description: `${invoiceNo} alış ödemesi (${paymentMethod})`,
          },
        });
      } else if (paymentMethod === 'Cari') {
        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { decrement: totalAmountTl } },
        });
      }

      return createdInvoice;
    });

    const updatedSupplier = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, code: true, name: true, balance: true },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...invoice,
        customer: updatedSupplier,
        balanceBefore,
        balanceAfter: roundMoney(updatedSupplier?.balance ?? balanceBefore),
      },
      message: 'Purchase invoice created successfully.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Alış faturası kaydedilemedi.';
    return reply.status(500).send({
      success: false,
      message,
      errors: null,
    });
  }
});

app.get<{ Querystring: { search?: string; page?: string; limit?: string; take?: string; skip?: string } }>(
  '/api/customers',
  async (request) => {
    const { search, page, limit, take, skip } = request.query;
    const pagination = parseListPageQuery({ page, limit, take, skip });

    const where = search ? buildCustomerSearchWhere(search) : {};

    const [customers, totalCount] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        take: pagination.limit,
        skip: pagination.skip,
      }),
      prisma.customer.count({ where }),
    ]);

    return {
      ...buildListResponse(
        customers,
        totalCount,
        pagination.limit,
        pagination.page
      ),
      message: 'Customers retrieved successfully.',
    };
  }
);

app.get('/api/customers/export/excel', async (_request, reply) => {
  const buffer = await exportCustomersExcel(prisma);
  reply.header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  reply.header(
    'Content-Disposition',
    'attachment; filename="musteriler.xlsx"'
  );
  return buffer;
});

app.post('/api/customers/import/excel', async (request, reply) => {
  const upload = await request.file();
  if (!upload) {
    return reply.status(400).send({
      success: false,
      message: 'Excel dosyası gerekli.',
      errors: null,
    });
  }

  const buffer = await upload.toBuffer();
  const result = await importCustomersExcel(prisma, buffer);

  return {
    success: true,
    data: result,
    message: `${result.created} yeni, ${result.updated} güncellendi.`,
  };
});

app.get<{ Params: { id: string } }>('/api/customers/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return reply.status(400).send({
      success: false,
      message: 'Geçersiz müşteri id.',
      errors: null,
    });
  }

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    return reply.status(404).send({
      success: false,
      message: 'Müşteri bulunamadı.',
      errors: null,
    });
  }

  return {
    success: true,
    data: customer,
    message: 'Customer retrieved successfully.',
  };
});

app.post<{
  Body: {
    code?: string;
    name: string;
    contactPerson?: string;
    address?: string;
    district?: string;
    city?: string;
    email?: string;
    phone?: string;
    taxOffice?: string;
    taxNumber?: string;
    creditLimit?: number;
  };
}>('/api/customers', async (request, reply) => {
  const {
    code,
    name,
    contactPerson,
    address,
    district,
    city,
    email,
    phone,
    taxOffice,
    taxNumber,
    creditLimit,
  } = request.body ?? {};

  const trimmedName = name?.trim();
  if (!trimmedName) {
    return reply.status(400).send({
      success: false,
      message: 'Müşteri adı zorunludur.',
      errors: null,
    });
  }

  const customerCode =
    code?.trim() ||
    `M${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;

  try {
    const customer = await prisma.customer.create({
      data: {
        code: customerCode,
        name: trimmedName,
        contactPerson: contactPerson?.trim() || null,
        address: address?.trim() || null,
        district: district?.trim() || null,
        city: city?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        taxOffice: taxOffice?.trim() || null,
        taxNumber: taxNumber?.trim() || null,
        creditLimit: creditLimit ?? 0,
      },
    });

    return reply.status(201).send({
      success: true,
      data: customer,
      message: 'Müşteri oluşturuldu.',
    });
  } catch {
    return reply.status(409).send({
      success: false,
      message: 'Müşteri eklenemedi. Kod benzersiz olmalı.',
      errors: null,
    });
  }
});

app.put<{
  Params: { id: string };
  Body: {
    code?: string;
    name?: string;
    contactPerson?: string;
    address?: string;
    district?: string;
    city?: string;
    email?: string;
    phone?: string;
    taxOffice?: string;
    taxNumber?: string;
    creditLimit?: number;
    balance?: number;
  };
}>('/api/customers/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return reply.status(400).send({
      success: false,
      message: 'Geçersiz müşteri id.',
      errors: null,
    });
  }

  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) {
    return reply.status(404).send({
      success: false,
      message: 'Müşteri bulunamadı.',
      errors: null,
    });
  }

  const {
    code,
    name,
    contactPerson,
    address,
    district,
    city,
    email,
    phone,
    taxOffice,
    taxNumber,
    creditLimit,
    balance,
  } = request.body ?? {};

  if (name !== undefined && !name.trim()) {
    return reply.status(400).send({
      success: false,
      message: 'Müşteri adı boş olamaz.',
      errors: null,
    });
  }

  try {
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(code !== undefined ? { code: code.trim() } : {}),
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(contactPerson !== undefined
          ? { contactPerson: contactPerson.trim() || null }
          : {}),
        ...(address !== undefined ? { address: address.trim() || null } : {}),
        ...(district !== undefined ? { district: district.trim() || null } : {}),
        ...(city !== undefined ? { city: city.trim() || null } : {}),
        ...(email !== undefined ? { email: email.trim() || null } : {}),
        ...(phone !== undefined ? { phone: phone.trim() || null } : {}),
        ...(taxOffice !== undefined
          ? { taxOffice: taxOffice.trim() || null }
          : {}),
        ...(taxNumber !== undefined
          ? { taxNumber: taxNumber.trim() || null }
          : {}),
        ...(creditLimit !== undefined ? { creditLimit } : {}),
        ...(balance !== undefined && Number.isFinite(balance) ? { balance } : {}),
      },
    });

    return {
      success: true,
      data: customer,
      message: 'Müşteri güncellendi.',
    };
  } catch {
    return reply.status(409).send({
      success: false,
      message: 'Güncelleme başarısız. Kod benzersiz olmalı.',
      errors: null,
    });
  }
});

app.post<{
  Body: {
    customerId: number;
    safeId: number;
    amount: number;
    type: 'GIRIS' | 'CIKIS';
    method?: string;
    description?: string;
  };
}>('/api/customers/payment', async (request, reply) => {
  const { customerId, safeId, amount, type, method, description } = request.body;

  if (!customerId || !safeId || !amount || amount <= 0 || !type) {
    return reply.status(400).send({
      success: false,
      message: 'Eksik veya geçersiz ödeme bilgileri.',
      errors: null,
    });
  }

  if (type !== 'GIRIS' && type !== 'CIKIS') {
    return reply.status(400).send({
      success: false,
      message: 'Geçersiz işlem tipi. GIRIS veya CIKIS olmalı.',
      errors: null,
    });
  }

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const [customer, safe] = await Promise.all([
        tx.customer.findUnique({ where: { id: customerId } }),
        tx.safe.findUnique({ where: { id: safeId } }),
      ]);

      if (!customer) {
        throw new Error('Müşteri bulunamadı.');
      }

      if (!safe) {
        throw new Error('Kasa bulunamadı.');
      }

      /*
       * Kasa bakiyesi yetersizlik kontrolü kaldırıldı — kasa eksiye düşebilir.
       * Nakit fiilen kasadan çıkmışken kaydın engellenmesi, işlemin sisteme
       * hiç girilmemesine yol açıyordu; eksi bakiye rapordan takip edilir.
       */
      if (type === 'GIRIS') {
        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { decrement: amount } },
        });
        await tx.safe.update({
          where: { id: safeId },
          data: { balance: { increment: amount } },
        });
      } else {
        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { increment: amount } },
        });
        await tx.safe.update({
          where: { id: safeId },
          data: { balance: { decrement: amount } },
        });
      }

      const receiptNo = await generatePaymentReceiptNo(tx);

      return tx.transaction.create({
        data: {
          safeId,
          customerId,
          type,
          amount,
          method: method?.trim() || null,
          receiptNo,
          description:
            description?.trim() ||
            (type === 'GIRIS'
              ? `${customer.code} cari tahsilat`
              : `${customer.code} cari ödeme`),
        },
        include: {
          customer: { select: { id: true, code: true, name: true, balance: true } },
          safe: { select: { id: true, name: true, currency: true, balance: true } },
        },
      });
    });

    return reply.status(201).send({
      success: true,
      data: payment,
      message: 'Payment recorded successfully.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Ödeme kaydedilemedi.';
    return reply.status(500).send({
      success: false,
      message,
      errors: null,
    });
  }
});

app.get<{ Querystring: { customerId?: string; page?: string; limit?: string } }>(
  '/api/customers/payments',
  async (request) => {
    const { customerId, page, limit } = request.query;
    const pagination = parseListPageQuery({ page, limit });
    const parsedCustomerId = customerId ? Number(customerId) : undefined;

    const where: Prisma.TransactionWhereInput = {
      customerId: { not: null },
    };
    if (parsedCustomerId && Number.isFinite(parsedCustomerId) && parsedCustomerId > 0) {
      where.customerId = parsedCustomerId;
    }

    const [payments, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pagination.limit,
        skip: pagination.skip,
        include: {
          customer: { select: { id: true, code: true, name: true, balance: true } },
          safe: { select: { id: true, name: true, currency: true, balance: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      ...buildListResponse(payments, totalCount, pagination.limit, pagination.page),
      message: 'Customer payments retrieved successfully.',
    };
  }
);

app.put<{
  Params: { id: string };
  Body: {
    customerId?: number;
    safeId?: number;
    amount?: number;
    type?: 'GIRIS' | 'CIKIS';
    method?: string;
    description?: string;
  };
}>('/api/customers/payment/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return reply.status(400).send({
      success: false,
      message: 'Geçersiz işlem id.',
      errors: null,
    });
  }

  const body = request.body ?? {};

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({
        where: { id },
        include: { customer: true, safe: true },
      });

      if (!existing || !existing.customerId) {
        throw new Error('Düzenlenebilir cari ödeme kaydı bulunamadı.');
      }

      const nextCustomerId = body.customerId ?? existing.customerId;
      const nextSafeId = body.safeId ?? existing.safeId;
      const nextAmount = body.amount ?? existing.amount;
      const nextType = body.type ?? existing.type;
      const nextDescription =
        body.description !== undefined
          ? body.description.trim() ||
            (nextType === 'GIRIS'
              ? `${existing.customer!.code} cari tahsilat`
              : `${existing.customer!.code} cari ödeme`)
          : existing.description;

      if (!nextCustomerId || !nextSafeId || !nextAmount || nextAmount <= 0) {
        throw new Error('Müşteri, kasa ve tutar zorunludur.');
      }

      if (nextType !== 'GIRIS' && nextType !== 'CIKIS') {
        throw new Error('Geçersiz işlem tipi.');
      }

      const [nextCustomer, nextSafe] = await Promise.all([
        tx.customer.findUnique({ where: { id: nextCustomerId } }),
        tx.safe.findUnique({ where: { id: nextSafeId } }),
      ]);

      if (!nextCustomer) throw new Error('Müşteri bulunamadı.');
      if (!nextSafe) throw new Error('Kasa bulunamadı.');

      if (existing.type === 'GIRIS') {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { balance: { increment: existing.amount } },
        });
        await tx.safe.update({
          where: { id: existing.safeId },
          data: { balance: { decrement: existing.amount } },
        });
      } else {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { balance: { decrement: existing.amount } },
        });
        await tx.safe.update({
          where: { id: existing.safeId },
          data: { balance: { increment: existing.amount } },
        });
      }

      if (nextType === 'GIRIS') {
        await tx.customer.update({
          where: { id: nextCustomerId },
          data: { balance: { decrement: nextAmount } },
        });
        await tx.safe.update({
          where: { id: nextSafeId },
          data: { balance: { increment: nextAmount } },
        });
      } else {
        // Kasa eksiye düşebilir — bkz. ödeme oluşturma ucundaki not
        await tx.customer.update({
          where: { id: nextCustomerId },
          data: { balance: { increment: nextAmount } },
        });
        await tx.safe.update({
          where: { id: nextSafeId },
          data: { balance: { decrement: nextAmount } },
        });
      }

      // Eski kayıtlarda fiş no yoksa düzenleme sırasında seriye dahil edilir
      const receiptNo =
        existing.receiptNo ?? (await generatePaymentReceiptNo(tx));

      return tx.transaction.update({
        where: { id },
        data: {
          customerId: nextCustomerId,
          safeId: nextSafeId,
          amount: nextAmount,
          type: nextType,
          receiptNo,
          ...(body.method !== undefined
            ? { method: body.method.trim() || null }
            : {}),
          description: nextDescription,
        },
        include: {
          customer: { select: { id: true, code: true, name: true, balance: true } },
          safe: { select: { id: true, name: true, currency: true, balance: true } },
        },
      });
    });

    return {
      success: true,
      data: updated,
      message: 'Ödeme güncellendi.',
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Ödeme güncellenemedi.';
    return reply.status(500).send({
      success: false,
      message,
      errors: null,
    });
  }
});

app.get<{
  Querystring: {
    search?: string;
    customerId?: string;
    exchangeRate?: string;
    page?: string;
    limit?: string;
    context?: string;
    prioritizeProductId?: string;
  };
}>('/api/sales/products', async (request, reply) => {
  const {
    search,
    customerId,
    exchangeRate: exchangeRateQuery,
    page: pageQuery,
    limit: limitQuery,
    context: contextQuery,
    prioritizeProductId: prioritizeQuery,
  } = request.query;

  const parsedCustomerId = customerId ? Number(customerId) : null;
  const parsedPrioritizeId = prioritizeQuery ? Number(prioritizeQuery) : null;
  const rate =
    exchangeRateQuery && Number(exchangeRateQuery) > 0
      ? Number(exchangeRateQuery)
      : 1;
  const page = Math.max(1, Number(pageQuery) || 1);
  const limit = Math.min(Math.max(Number(limitQuery) || 100, 1), 200);
  const contextRaw = (contextQuery ?? 'sales').toLowerCase();
  const context =
    contextRaw === 'purchase' || contextRaw === 'return' ? contextRaw : 'sales';

  try {
    const result = await searchProductsForF2({
      search,
      page,
      limit,
      customerId:
        parsedCustomerId && !Number.isNaN(parsedCustomerId) ? parsedCustomerId : null,
      context,
      rate,
      prioritizeProductId:
        parsedPrioritizeId && parsedPrioritizeId > 0 ? parsedPrioritizeId : null,
    });

    return {
      success: true,
      data: result.data,
      totalCount: result.totalCount,
      page: result.page,
      limit: result.limit,
      message: 'Products retrieved successfully.',
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Ürün araması başarısız.';
    return reply.status(500).send({
      success: false,
      data: [],
      totalCount: 0,
      message,
    });
  }
});

app.post<{
  Body: {
    customerId: number;
    branchId: number;
    safeId: number;
    paymentMethod: string;
    paymentType?: string;
    exchangeRate: number;
    deliveryType?: string;
    dueDate?: string;
    invoiceDate?: string;
    isPreOrder?: boolean;
    processedBy?: string;
    orderNotes?: string;
    items: StoreItem[];
  };
}>('/api/sales/store', async (request, reply) => {
  const {
    customerId: rawCustomerId,
    branchId,
    safeId,
    paymentMethod,
    paymentType,
    exchangeRate,
    deliveryType,
    dueDate,
    invoiceDate,
    isPreOrder = false,
    processedBy,
    orderNotes,
    items,
  } = request.body;

  const customerId = Number(rawCustomerId);
  const parsedBranchId = Number(branchId);
  const parsedSafeId = Number(safeId);

  if (
    !Number.isFinite(customerId) ||
    customerId <= 0 ||
    !Number.isFinite(parsedBranchId) ||
    parsedBranchId <= 0 ||
    !Number.isFinite(parsedSafeId) ||
    parsedSafeId <= 0 ||
    !paymentMethod ||
    !items?.length
  ) {
    return reply.status(400).send({
      success: false,
      message: 'Eksik veya geçersiz istek gövdesi.',
      errors: null,
    });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, code: true, name: true, balance: true },
  });

  if (!customer) {
    return reply.status(400).send({
      success: false,
      message: 'Seçilen müşteri bulunamadı. Lütfen listeden müşteri seçin.',
      errors: null,
    });
  }

  const balanceBefore = roundMoney(customer.balance);

  const rate = exchangeRate > 0 ? Number(exchangeRate) : 1;
  const normalizedItems = items.map(normalizeStoreItem);
  const totalAmountTl = roundMoney(
    normalizedItems.reduce((sum, item) => sum + calcLineTotalTl(item), 0)
  );
  const totalAmountUsd = roundMoney(totalAmountTl / rate);
  const invoiceCreatedAt = buildInvoiceCreatedAt(invoiceDate);

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNo = await generateInvoiceNo(tx);

      const matchedUser = processedBy
        ? await tx.user.findFirst({ where: { name: processedBy } })
        : null;

      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNo,
          type: 'SATIS',
          customerId: customer.id,
          safeId: parsedSafeId,
          branchId: parsedBranchId,
          userId: matchedUser?.id,
          paymentMethod,
          paymentType: paymentType ?? null,
          exchangeRate: rate,
          deliveryType: deliveryType ?? 'Mağazadan Teslim',
          dueDate: dueDate ? new Date(dueDate) : null,
          isPreOrder,
          processedBy: processedBy ?? null,
          orderNotes: orderNotes ?? null,
          totalAmountTl,
          totalAmountUsd,
          createdAt: invoiceCreatedAt,
          items: {
            create: normalizedItems.map((item) => {
              const lineTotal = calcLineTotalTl(item);
              return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: roundMoney(item.unitPrice),
                discountPercent: item.discountPercent ?? 0,
                totalPrice: lineTotal,
              };
            }),
          },
        },
        include: {
          items: true,
          customer: { select: { id: true, code: true, name: true } },
        },
      });

      if (!isPreOrder) {
        const stockBranchId = await getDepotBranchId(tx, 'MERKEZ');

        for (const item of normalizedItems) {
          const stockKey = {
            productId_branchId: {
              productId: item.productId,
              branchId: stockBranchId,
            },
          };

          const stock = await tx.productStock.findUnique({ where: stockKey });

          if (stock) {
            await tx.productStock.update({
              where: stockKey,
              data: {
                quantity: { decrement: item.quantity },
              },
            });
          } else {
            await tx.productStock.create({
              data: {
                productId: item.productId,
                branchId: stockBranchId,
                quantity: -item.quantity,
              },
            });
          }
        }
      }

      /*
       * Ön sipariş: yalnızca sipariş kaydıdır. Cari bakiyeye ve kasaya
       * HİÇBİR kayıt düşmez; mali etki "Stok Düş (Ön Siparişi Tamamla)"
       * adımında (/fulfill) işlenir.
       */
      if (isPreOrder) {
        return createdInvoice;
      }

      if (isCashLikePayment(paymentMethod)) {
        await tx.safe.update({
          where: { id: parsedSafeId },
          data: { balance: { increment: totalAmountTl } },
        });

        await tx.transaction.create({
          data: {
            safeId: parsedSafeId,
            customerId: customer.id,
            type: 'GIRIS',
            amount: totalAmountTl,
            description: `${invoiceNo} satış tahsilatı (${paymentMethod})`,
          },
        });
      } else if (paymentMethod === 'Cari') {
        await tx.customer.update({
          where: { id: customer.id },
          data: { balance: { increment: totalAmountTl } },
        });
      }

      return createdInvoice;
    });

    const updatedCustomer = await prisma.customer.findUnique({
      where: { id: customer.id },
      select: { id: true, code: true, name: true, balance: true },
    });
    const balanceAfter = roundMoney(updatedCustomer?.balance ?? balanceBefore);

    return reply.status(201).send({
      success: true,
      data: {
        ...invoice,
        customer: updatedCustomer ?? customer,
        balanceBefore,
        balanceAfter,
      },
      message: 'Invoice created successfully.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Satış kaydedilemedi.';
    return reply.status(500).send({
      success: false,
      message,
      errors: null,
    });
  }
});

app.post<{
  Body: {
    customerId: number;
    branchId: number;
    safeId: number;
    /** Açık = Cari, Kapalı = Nakit (kasadan çıkış) */
    paymentMethod?: string;
    exchangeRate?: number;
    originalInvoiceId: number;
    orderNotes?: string;
    /** @deprecated Satır bazlı isChinaReturn kullanın */
    isDefective?: boolean;
    items: StoreItem[];
  };
}>('/api/sales/return', async (request, reply) => {
  const {
    customerId,
    branchId,
    safeId,
    paymentMethod: bodyPaymentMethod,
    exchangeRate,
    originalInvoiceId,
    orderNotes: bodyOrderNotes,
    isDefective,
    items,
  } = request.body;

  const paymentMethod =
    bodyPaymentMethod === 'Nakit' ||
    bodyPaymentMethod === 'EFT/Havale' ||
    bodyPaymentMethod === 'Kart'
      ? bodyPaymentMethod
      : 'Cari';

  if (
    !customerId ||
    !branchId ||
    !safeId ||
    !originalInvoiceId ||
    !items?.length
  ) {
    return reply.status(400).send({
      success: false,
      message: 'Müşteri, şube, kasa, kaynak fatura ve iade kalemleri zorunludur.',
      errors: null,
    });
  }

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const sourceInvoice = await tx.invoice.findUnique({
        where: { id: originalInvoiceId },
        include: { items: true },
      });

      if (!sourceInvoice || sourceInvoice.type !== 'SATIS') {
        throw new Error('Kaynak satış faturası bulunamadı.');
      }
      if (sourceInvoice.deletedAt) {
        throw new Error('Kaynak satış faturası silinmiş.');
      }

      if (sourceInvoice.customerId !== customerId) {
        throw new Error('Seçilen fatura bu müşteriye ait değil.');
      }

      const sourceItemMap = new Map(
        sourceInvoice.items.map((line) => [line.id, line])
      );

      const normalizedItems: StoreItem[] = [];

      for (const item of items) {
        if (!item.sourceInvoiceItemId || item.quantity <= 0) {
          throw new Error('Her iade satırı için geçerli miktar ve fatura kalemi seçin.');
        }
      }

      for (const item of items) {
        const sourceLine = sourceItemMap.get(item.sourceInvoiceItemId!);
        if (!sourceLine) {
          throw new Error('İade kalemi kaynak faturada bulunamadı.');
        }

        normalizedItems.push({
          productId: sourceLine.productId,
          quantity: item.quantity,
          unitPrice: sourceLine.unitPrice,
          isChinaReturn: item.isChinaReturn ?? isDefective ?? false,
          sourceInvoiceItemId: sourceLine.id,
        });
      }

      const totalAmountTl = normalizedItems.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      );
      const rate =
        exchangeRate && exchangeRate > 0
          ? exchangeRate
          : sourceInvoice.exchangeRate > 0
            ? sourceInvoice.exchangeRate
            : 1;
      const totalAmountUsd = totalAmountTl / rate;

      const invoiceNo = await generateReturnInvoiceNo(tx);
      const merkezDepoId = await getDepotBranchId(tx, 'MERKEZ');
      const cinIadeDepoId = await getDepotBranchId(tx, 'CIN_IADE');

      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNo,
          type: 'IADE',
          customerId,
          safeId,
          branchId,
          paymentMethod,
          exchangeRate: rate,
          deliveryType: 'Mağazadan Teslim',
          totalAmountTl,
          totalAmountUsd,
          originalInvoiceId: sourceInvoice.id,
          orderNotes: [bodyOrderNotes?.trim(), `Kaynak fatura: ${sourceInvoice.invoiceNo}`]
            .filter(Boolean)
            .join(' · '),
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
              sourceInvoiceItemId: item.sourceInvoiceItemId,
              isChinaReturn: item.isChinaReturn ?? false,
            })),
          },
        },
        include: { items: true },
      });

      for (const item of normalizedItems) {
        const toChinaReturn = item.isChinaReturn ?? false;
        const stockBranchId = toChinaReturn ? cinIadeDepoId : merkezDepoId;
        await incrementStock(
          tx,
          item.productId,
          stockBranchId,
          item.quantity
        );
      }

      if (paymentMethod === 'Cari') {
        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { decrement: totalAmountTl } },
        });
      } else if (isCashLikePayment(paymentMethod)) {
        const safe = await tx.safe.findUnique({ where: { id: safeId } });
        if (!safe) throw new Error('Kasa bulunamadı.');
        // Kasa eksiye düşebilir — yetersiz bakiye iadeyi engellemez
        await tx.safe.update({
          where: { id: safeId },
          data: { balance: { decrement: totalAmountTl } },
        });
        await tx.transaction.create({
          data: {
            safeId,
            customerId,
            type: 'CIKIS',
            amount: totalAmountTl,
            description: `${invoiceNo} iade ödemesi (${paymentMethod})`,
          },
        });
      }

      return createdInvoice;
    });

    return reply.status(201).send({
      success: true,
      data: invoice,
      message: 'Return recorded successfully.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'İade kaydedilemedi.';
    return reply.status(500).send({
      success: false,
      message,
      errors: null,
    });
  }
});

app.post<{
  Body: {
    customerId: number;
    branchId: number;
    safeId: number;
    paymentMethod?: string;
    exchangeRate?: number;
    items: Array<{
      productId: number;
      quantity: number;
      unitPrice: number;
      isChinaReturn?: boolean;
    }>;
    note?: string;
  };
}>('/api/sales/return-discretionary', async (request, reply) => {
  const {
    customerId,
    branchId,
    safeId,
    paymentMethod: bodyPaymentMethod,
    exchangeRate,
    items,
    note,
  } = request.body;

  const paymentMethod =
    bodyPaymentMethod === 'Nakit' ||
    bodyPaymentMethod === 'EFT/Havale' ||
    bodyPaymentMethod === 'Kart'
      ? bodyPaymentMethod
      : 'Cari';

  if (!customerId || !branchId || !safeId || !items?.length) {
    return reply.status(400).send({
      success: false,
      message: 'Müşteri, şube, kasa ve iade kalemleri zorunludur.',
      errors: null,
    });
  }

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const normalizedItems = items
        .filter((item) => item.productId && item.quantity > 0)
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          isChinaReturn: item.isChinaReturn ?? false,
        }));

      if (normalizedItems.length === 0) {
        throw new Error('Geçerli iade kalemi bulunamadı.');
      }

      for (const item of normalizedItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) {
          throw new Error(`Ürün bulunamadı (id: ${item.productId}).`);
        }
      }

      const rate = exchangeRate && exchangeRate > 0 ? exchangeRate : 1;
      const totalAmountTl = normalizedItems.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      );
      const totalAmountUsd = totalAmountTl / rate;

      const invoiceNo = await generateReturnInvoiceNo(tx);
      const merkezDepoId = await getDepotBranchId(tx, 'MERKEZ');
      const cinIadeDepoId = await getDepotBranchId(tx, 'CIN_IADE');

      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNo,
          type: 'IADE',
          customerId,
          safeId,
          branchId,
          paymentMethod,
          exchangeRate: rate,
          deliveryType: 'Mağazadan Teslim',
          totalAmountTl,
          totalAmountUsd,
          orderNotes:
            note?.trim() ||
            'İnsiyatif iade — satın alma kaydı doğrulanmadı veya süre dışı',
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
              isChinaReturn: item.isChinaReturn ?? false,
            })),
          },
        },
        include: { items: true },
      });

      for (const item of normalizedItems) {
        const stockBranchId = item.isChinaReturn ? cinIadeDepoId : merkezDepoId;
        await incrementStock(tx, item.productId, stockBranchId, item.quantity);
      }

      if (paymentMethod === 'Cari') {
        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { decrement: totalAmountTl } },
        });
      } else if (isCashLikePayment(paymentMethod)) {
        const safe = await tx.safe.findUnique({ where: { id: safeId } });
        if (!safe) throw new Error('Kasa bulunamadı.');
        // Kasa eksiye düşebilir — yetersiz bakiye iadeyi engellemez
        await tx.safe.update({
          where: { id: safeId },
          data: { balance: { decrement: totalAmountTl } },
        });
        await tx.transaction.create({
          data: {
            safeId,
            customerId,
            type: 'CIKIS',
            amount: totalAmountTl,
            description: `${invoiceNo} iade ödemesi (${paymentMethod})`,
          },
        });
      }

      return createdInvoice;
    });

    return reply.status(201).send({
      success: true,
      data: invoice,
      message: 'Discretionary return recorded successfully.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'İnsiyatif iade kaydedilemedi.';
    return reply.status(500).send({
      success: false,
      message,
      errors: null,
    });
  }
});

app.post<{
  Body: {
    sku?: string;
    name: string;
    costPrice: number;
    priceTl?: number;
    barcode?: string;
    priceUsd?: number;
    priceUsd2?: number;
    initialQuantity?: number;
    categoryId?: number;
    brand?: string;
    model?: string;
    brandModelId?: number;
    color?: string;
    appearance?: string;
    quality?: string;
    rbmPrice?: number;
    description?: string;
  };
}>('/api/products', async (request, reply) => {
  const {
    sku,
    name,
    costPrice,
    priceTl,
    barcode,
    priceUsd,
    priceUsd2,
    initialQuantity,
    categoryId,
    brand,
    model,
    brandModelId,
    color,
    appearance,
    quality,
    rbmPrice,
    description,
  } = request.body;

  if (!name?.trim() || costPrice == null || priceUsd == null) {
    return reply.status(400).send({
      success: false,
      message: 'Stok adı, alış fiyatı (USD) ve Satış 1 (USD) zorunludur.',
      errors: null,
    });
  }

  if (
    costPrice < 0 ||
    priceUsd < 0 ||
    (priceUsd2 != null && priceUsd2 < 0) ||
    (rbmPrice != null && rbmPrice < 0)
  ) {
    return reply.status(400).send({
      success: false,
      message: 'Fiyatlar negatif olamaz.',
      errors: null,
    });
  }

  const resolvedSku = resolveSku(sku);
  const resolvedPriceUsd = priceUsd != null && priceUsd >= 0 ? priceUsd : 0;
  // Satış 2 boşsa Satış 1 ile aynı
  const resolvedPriceUsd2 =
    priceUsd2 != null && priceUsd2 > 0 ? priceUsd2 : resolvedPriceUsd;
  const resolvedPriceTl =
    resolvedPriceUsd > 0
      ? resolvedPriceUsd
      : priceTl != null && priceTl >= 0
        ? priceTl
        : 0;

  try {
    let resolvedBrand = brand?.trim() || null;
    let resolvedModel = model?.trim() || null;
    let resolvedBrandModelId: number | null = null;

    if (brandModelId && brandModelId > 0) {
      const brandModel = await prisma.brandModel.findUnique({
        where: { id: brandModelId },
      });
      if (!brandModel) {
        return reply.status(400).send({
          success: false,
          message: 'Seçilen model tanımı bulunamadı.',
          errors: null,
        });
      }
      resolvedBrandModelId = brandModel.id;
      if (brandModel.kind === 'MODEL') {
        resolvedModel = brandModel.name;
      } else if (!resolvedBrand) {
        resolvedBrand = brandModel.name;
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          sku: resolvedSku,
          name: name.trim(),
          costPrice,
          priceTl: resolvedPriceTl,
          priceUsd: resolvedPriceUsd,
          priceUsd2: resolvedPriceUsd2,
          barcode: barcode?.trim() || null,
          categoryId: categoryId ?? null,
          brand: resolvedBrand,
          model: resolvedModel,
          brandModelId: resolvedBrandModelId,
          color: color?.trim() || null,
          appearance: appearance?.trim() || null,
          quality: quality?.trim() || null,
          rbmPrice: rbmPrice ?? 0,
          description: description?.trim() || null,
        },
      });

      const merkezDepoId = await getDepotBranchId(tx, 'MERKEZ');
      await tx.productStock.create({
        data: {
          productId: created.id,
          branchId: merkezDepoId,
          quantity: initialQuantity ?? 0,
        },
      });

      await tx.productStock.create({
        data: {
          productId: created.id,
          branchId: await getDepotBranchId(tx, 'CIN_IADE'),
          quantity: 0,
        },
      });

      return created;
    });

    return reply.status(201).send({
      success: true,
      data: product,
      message: 'Product created successfully.',
    });
  } catch {
    return reply.status(409).send({
      success: false,
      message: 'Ürün eklenemedi. SKU veya barkod benzersiz olmalı.',
      errors: null,
    });
  }
});

app.get<{
  Querystring: {
    search?: string;
    page?: string;
    limit?: string;
    take?: string;
    skip?: string;
    categoryId?: string;
    brand?: string;
    model?: string;
    color?: string;
    appearance?: string;
  };
}>(
  '/api/products',
  async (request) => {
    const { search, page, limit, take, skip, categoryId, brand, model, color, appearance } =
      request.query;
    const pagination = parseListPageQuery({ page, limit, take, skip });

    /*
     * Serbest metin araması ile kolon filtreleri birlikte çalışır (AND).
     * Filtre değerleri açılır listeden geldiği için tam eşleşme aranır;
     * MySQL varsayılan collation büyük/küçük harfe duyarsızdır.
     */
    const filters: Prisma.ProductWhereInput[] = [];
    if (search?.trim()) filters.push(buildProductSearchWhere(search));

    const categoryIdNum = Number(categoryId);
    if (Number.isFinite(categoryIdNum) && categoryIdNum > 0) {
      filters.push({ categoryId: categoryIdNum });
    }
    if (brand?.trim()) filters.push({ brand: brand.trim() });
    if (model?.trim()) filters.push({ model: model.trim() });
    if (color?.trim()) filters.push({ color: color.trim() });
    if (appearance?.trim()) filters.push({ appearance: appearance.trim() });

    const where: Prisma.ProductWhereInput = filters.length > 0 ? { AND: filters } : {};

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        take: pagination.limit,
        skip: pagination.skip,
        include: {
          category: { select: { id: true, name: true } },
          stocks: {
            include: {
              branch: {
                select: { id: true, name: true, type: true },
              },
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return {
      ...buildListResponse(
        products,
        totalCount,
        pagination.limit,
        pagination.page
      ),
      message: 'Products retrieved successfully.',
    };
  }
);

app.get('/api/products/export/excel', async (_request, reply) => {
  const buffer = await exportProductsExcel(prisma);
  reply.header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  reply.header(
    'Content-Disposition',
    'attachment; filename="stoklar.xlsx"'
  );
  return buffer;
});

app.post('/api/products/import/excel', async (request, reply) => {
  const upload = await request.file();
  if (!upload) {
    return reply.status(400).send({
      success: false,
      message: 'Excel dosyası gerekli.',
      errors: null,
    });
  }

  const buffer = await upload.toBuffer();
  const result = await importProductsExcel(prisma, buffer);

  const notes: string[] = [
    `${result.created} yeni`,
    `${result.updated} güncellendi`,
  ];
  if (result.deleted && result.deleted > 0) {
    notes.push(`${result.deleted} silindi`);
  }
  if (result.stockZeroed && result.stockZeroed > 0) {
    notes.push(`${result.stockZeroed} faturalı ürün stok=0`);
  }
  if (result.categoriesCreated && result.categoriesCreated > 0) {
    notes.push(`${result.categoriesCreated} yeni kategori`);
  }
  if (result.brandModelsCreated && result.brandModelsCreated > 0) {
    notes.push(`${result.brandModelsCreated} yeni marka/model`);
  }

  return {
    success: true,
    data: result,
    message: `Excel senkron: ${notes.join(', ')}.`,
  };
});

app.get<{ Params: { id: string } }>('/api/products/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return reply.status(400).send({
      success: false,
      message: 'Geçersiz ürün id.',
      errors: null,
    });
  }

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      stocks: {
        include: {
          branch: { select: { id: true, name: true, type: true } },
        },
      },
    },
  });

  if (!product) {
    return reply.status(404).send({
      success: false,
      message: 'Ürün bulunamadı.',
      errors: null,
    });
  }

  return {
    success: true,
    data: product,
    message: 'Product retrieved successfully.',
  };
});

app.put<{
  Params: { id: string };
  Body: {
    sku?: string;
    name?: string;
    barcode?: string | null;
    costPrice?: number;
    priceTl?: number;
    priceUsd?: number;
    priceUsd2?: number;
    categoryId?: number | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    appearance?: string | null;
    quality?: string | null;
    rbmPrice?: number;
    description?: string | null;
  };
}>('/api/products/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return reply.status(400).send({
      success: false,
      message: 'Geçersiz ürün id.',
      errors: null,
    });
  }

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    return reply.status(404).send({
      success: false,
      message: 'Ürün bulunamadı.',
      errors: null,
    });
  }

  const {
    sku,
    name,
    barcode,
    costPrice,
    priceTl,
    priceUsd,
    priceUsd2,
    categoryId,
    brand,
    model,
    color,
    appearance,
    quality,
    rbmPrice,
    description,
  } = request.body ?? {};

  if (name !== undefined && !name.trim()) {
    return reply.status(400).send({
      success: false,
      message: 'Ürün adı boş olamaz.',
      errors: null,
    });
  }

  if (
    (costPrice !== undefined && costPrice < 0) ||
    (priceTl !== undefined && priceTl < 0) ||
    (priceUsd !== undefined && priceUsd < 0) ||
    (priceUsd2 !== undefined && priceUsd2 < 0)
  ) {
    return reply.status(400).send({
      success: false,
      message: 'Fiyatlar negatif olamaz.',
      errors: null,
    });
  }

  try {
    const product = await prisma.product.update({
      where: { id },
      data: {
        // Kod boş bırakılırsa kayıt kodsuz kalmasın — otomatik kod atanır
        ...(sku !== undefined ? { sku: resolveSku(sku) } : {}),
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(barcode !== undefined
          ? { barcode: barcode?.trim() || null }
          : {}),
        ...(costPrice !== undefined ? { costPrice } : {}),
        ...(priceUsd !== undefined ? { priceUsd, priceTl: priceUsd } : {}),
        ...(priceTl !== undefined && priceUsd === undefined ? { priceTl } : {}),
        ...(priceUsd2 !== undefined ? { priceUsd2 } : {}),
        ...(categoryId !== undefined ? { categoryId: categoryId ?? null } : {}),
        ...(brand !== undefined ? { brand: brand?.trim() || null } : {}),
        ...(model !== undefined ? { model: model?.trim() || null } : {}),
        ...(color !== undefined ? { color: color?.trim() || null } : {}),
        ...(appearance !== undefined ? { appearance: appearance?.trim() || null } : {}),
        ...(quality !== undefined ? { quality: quality?.trim() || null } : {}),
        ...(rbmPrice !== undefined ? { rbmPrice } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        stocks: {
          include: {
            branch: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });

    return {
      success: true,
      data: product,
      message: 'Ürün güncellendi.',
    };
  } catch {
    return reply.status(409).send({
      success: false,
      message: 'Güncelleme başarısız. SKU veya barkod benzersiz olmalı.',
      errors: null,
    });
  }
});

app.put<{
  Params: { id: string };
  Body: {
    stocks?: Array<{ branchId: number; quantity: number }>;
  };
}>('/api/products/:id/stock', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return reply.status(400).send({
      success: false,
      message: 'Geçersiz ürün id.',
      errors: null,
    });
  }

  const stocks = request.body?.stocks;
  if (!stocks?.length) {
    return reply.status(400).send({
      success: false,
      message: 'En az bir depo stok satırı gerekli.',
      errors: null,
    });
  }

  try {
    const product = await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id } });
      if (!existing) {
        throw new Error('Ürün bulunamadı.');
      }

      for (const row of stocks) {
        const branchId = Number(row.branchId);
        const quantity = Number(row.quantity);
        if (!Number.isFinite(branchId) || branchId <= 0) {
          throw new Error('Geçersiz şube id.');
        }
        if (!Number.isFinite(quantity)) {
          throw new Error('Geçersiz stok miktarı.');
        }

        const branch = await tx.branch.findUnique({ where: { id: branchId } });
        if (!branch) {
          throw new Error(`Şube #${branchId} bulunamadı.`);
        }

        const stockKey = {
          productId_branchId: { productId: id, branchId },
        };
        const current = await tx.productStock.findUnique({ where: stockKey });

        if (current) {
          await tx.productStock.update({
            where: stockKey,
            data: { quantity },
          });
        } else {
          await tx.productStock.create({
            data: { productId: id, branchId, quantity },
          });
        }
      }

      return tx.product.findUnique({
        where: { id },
        include: {
          stocks: {
            include: {
              branch: { select: { id: true, name: true, type: true } },
            },
          },
        },
      });
    });

    return {
      success: true,
      data: product,
      message: 'Stok miktarları güncellendi.',
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Stok güncellenemedi.';
    return reply.status(500).send({
      success: false,
      message,
      errors: null,
    });
  }
});

app.delete<{ Params: { id: string } }>('/api/products/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return reply.status(400).send({
      success: false,
      message: 'Geçersiz ürün id.',
      errors: null,
    });
  }

  const existing = await prisma.product.findUnique({
    where: { id },
    select: { id: true, name: true, sku: true },
  });

  if (!existing) {
    return reply.status(404).send({
      success: false,
      message: 'Ürün bulunamadı.',
      errors: null,
    });
  }

  const invoiceItemCount = await prisma.invoiceItem.count({
    where: { productId: id },
  });

  if (invoiceItemCount > 0) {
    return reply.status(409).send({
      success: false,
      message: `Bu ürün ${invoiceItemCount} fatura kaleminde kullanılmış; silinemez. Adını veya fiyatını düzenleyebilirsiniz.`,
      errors: null,
    });
  }

  await prisma.product.delete({ where: { id } });

  return {
    success: true,
    data: existing,
    message: 'Ürün silindi.',
  };
});

app.post<{
  Body: {
    productId: number;
    fromBranchId?: number;
    toBranchId: number;
    quantity: number;
  };
}>('/api/products/stock-movement', async (request, reply) => {
  const { productId, fromBranchId, toBranchId, quantity } = request.body;

  if (!productId || !toBranchId || !quantity || quantity <= 0) {
    return reply.status(400).send({
      success: false,
      message: 'Eksik veya geçersiz stok hareketi bilgileri.',
      errors: null,
    });
  }

  if (fromBranchId && fromBranchId === toBranchId) {
    return reply.status(400).send({
      success: false,
      message: 'Kaynak ve hedef şube aynı olamaz.',
      errors: null,
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) {
        throw new Error('Ürün bulunamadı.');
      }

      const toBranch = await tx.branch.findUnique({ where: { id: toBranchId } });
      if (!toBranch) {
        throw new Error('Hedef şube bulunamadı.');
      }

      if (fromBranchId) {
        const fromBranch = await tx.branch.findUnique({
          where: { id: fromBranchId },
        });
        if (!fromBranch) {
          throw new Error('Kaynak şube bulunamadı.');
        }

        const sourceStock = await tx.productStock.findUnique({
          where: {
            productId_branchId: {
              productId,
              branchId: fromBranchId,
            },
          },
        });

        if (!sourceStock) {
          throw new Error('Kaynak şubede stok kaydı bulunamadı.');
        }

        if (sourceStock.quantity < quantity) {
          throw new Error(
            `Kaynak şubede yetersiz stok. Mevcut: ${sourceStock.quantity}, istenen: ${quantity}`
          );
        }

        await tx.productStock.update({
          where: {
            productId_branchId: {
              productId,
              branchId: fromBranchId,
            },
          },
          data: { quantity: { decrement: quantity } },
        });
      }

      const destStock = await tx.productStock.findUnique({
        where: {
          productId_branchId: {
            productId,
            branchId: toBranchId,
          },
        },
      });

      if (destStock) {
        await tx.productStock.update({
          where: {
            productId_branchId: {
              productId,
              branchId: toBranchId,
            },
          },
          data: { quantity: { increment: quantity } },
        });
      } else {
        await tx.productStock.create({
          data: {
            productId,
            branchId: toBranchId,
            quantity,
          },
        });
      }

      return tx.product.findUnique({
        where: { id: productId },
        include: {
          stocks: {
            include: {
              branch: { select: { id: true, name: true, type: true } },
            },
          },
        },
      });
    });

    return reply.status(201).send({
      success: true,
      data: result,
      message: 'Stock movement recorded successfully.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Stok hareketi kaydedilemedi.';
    return reply.status(500).send({
      success: false,
      message,
      errors: null,
    });
  }
});

app.get('/api/reports/balances', async () => {
  const customers = await prisma.customer.findMany({
    orderBy: { balance: 'desc' },
    select: {
      id: true,
      code: true,
      name: true,
      creditLimit: true,
      balance: true,
    },
  });

  const totalReceivable = customers
    .filter((c) => c.balance > 0)
    .reduce((sum, c) => sum + c.balance, 0);

  const riskyTotalBalance = customers
    .filter((c) => c.balance > c.creditLimit)
    .reduce((sum, c) => sum + c.balance, 0);

  const debtorCount = customers.filter((c) => c.balance > 0).length;

  const totalPayable = customers
    .filter((c) => c.balance < 0)
    .reduce((sum, c) => sum + Math.abs(c.balance), 0);

  const creditorCount = customers.filter((c) => c.balance < 0).length;

  return {
    success: true,
    data: {
      totalReceivable,
      riskyTotalBalance,
      debtorCount,
      totalPayable,
      creditorCount,
      customers,
    },
    message: 'Balance report retrieved successfully.',
  };
});

app.get('/api/reports/profit', async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const invoiceItems = await prisma.invoiceItem.findMany({
    where: {
      invoice: { type: 'SATIS' },
    },
    include: {
      product: {
        select: { id: true, sku: true, name: true, costPrice: true, priceTl: true },
      },
      invoice: {
        select: { createdAt: true, customerId: true },
      },
    },
  });

  type ProductProfit = {
    productId: number;
    sku: string;
    name: string;
    quantitySold: number;
    revenue: number;
    profit: number;
  };

  type PeriodStats = {
    totalRevenue: number;
    totalProfit: number;
    profitMarginPercent: number;
    itemCount: number;
  };

  const calcPeriod = (items: typeof invoiceItems): PeriodStats => {
    let totalRevenue = 0;
    let totalProfit = 0;

    for (const item of items) {
      const revenue = item.quantity * item.unitPrice;
      const costBase = item.product.costPrice;
      const profit = (item.unitPrice - costBase) * item.quantity;
      totalRevenue += revenue;
      totalProfit += profit;
    }

    const profitMarginPercent =
      totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalProfit,
      profitMarginPercent,
      itemCount: items.length,
    };
  };

  const monthItems = invoiceItems.filter(
    (item) => item.invoice.createdAt >= startOfMonth
  );

  const productMap = new Map<number, ProductProfit>();

  for (const item of monthItems) {
    const revenue = item.quantity * item.unitPrice;
    const profit = (item.unitPrice - item.product.costPrice) * item.quantity;

    const existing = productMap.get(item.productId);
    if (existing) {
      existing.quantitySold += item.quantity;
      existing.revenue += revenue;
      existing.profit += profit;
    } else {
      productMap.set(item.productId, {
        productId: item.productId,
        sku: item.product.sku,
        name: item.product.name,
        quantitySold: item.quantity,
        revenue,
        profit,
      });
    }
  }

  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.profit - a.profit)
    .map((p) => ({
      ...p,
      profitMarginPercent: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
    }));

  return {
    success: true,
    data: {
      thisMonth: calcPeriod(monthItems),
      allTime: calcPeriod(invoiceItems),
      topProducts,
    },
    message: 'Profit report retrieved successfully.',
  };
});

app.get('/api/settings/categories', async () => {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { products: true, brandModels: true } },
      brandModels: { orderBy: { name: 'asc' } },
    },
  });

  return {
    success: true,
    data: categories,
    message: 'Categories retrieved successfully.',
  };
});

app.post<{ Body: { name: string } }>(
  '/api/settings/category',
  async (request, reply) => {
    const { name } = request.body;
    const trimmed = name?.trim();

    if (!trimmed) {
      return reply.status(400).send({
        success: false,
        message: 'Kategori adı zorunludur.',
        errors: null,
      });
    }

    try {
      const category = await prisma.category.create({
        data: { name: trimmed },
      });
      return reply.status(201).send({
        success: true,
        data: category,
        message: 'Category created successfully.',
      });
    } catch {
      return reply.status(409).send({
        success: false,
        message: 'Bu kategori adı zaten kayıtlı.',
        errors: null,
      });
    }
  }
);

app.get('/api/settings/brand-models', async () => {
  // Urunlerdeki marka/model metinlerini tanim listesine aktar
  await syncBrandModelsFromProducts(prisma);

  const brandModels = await prisma.brandModel.findMany({
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    include: {
      category: { select: { id: true, name: true } },
      _count: { select: { products: true } },
    },
  });

  return {
    success: true,
    data: brandModels,
    message: 'Brand models retrieved successfully.',
  };
});

app.get('/api/settings/color-suggestions', async () => {
  const rows = await prisma.product.findMany({
    where: { color: { not: null } },
    select: { color: true },
    distinct: ['color'],
    take: 300,
  });

  const colors = rows
    .map((row) => row.color?.trim() ?? '')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'tr'));

  return {
    success: true,
    data: colors,
    message: 'Color suggestions retrieved successfully.',
  };
});

app.get<{ Querystring: { categoryId?: string; brand?: string; strict?: string } }>(
  '/api/settings/model-suggestions',
  async (request) => {
    const categoryIdRaw = request.query.categoryId;
    const brandQuery = request.query.brand?.trim().toLocaleLowerCase('tr-TR') ?? '';
    /**
     * `strict=1` — markanın hiç modeli yoksa tüm listeye DÜŞMEZ, boş döner.
     * Filtre açılır listesinde doğru davranış budur: marka+model seçimi sıfır
     * sonuç verecekse o modelin listede görünmemesi gerekir. Öneri alanlarında
     * (stok kartı formu) ise geniş liste tercih edilir, oralarda gönderilmez.
     */
    const strict = request.query.strict === '1';
    const categoryId =
      categoryIdRaw && !Number.isNaN(Number(categoryIdRaw)) ? Number(categoryIdRaw) : undefined;

    await syncBrandModelsFromProducts(prisma);

    const names = new Set<string>();
    const brandMatched = new Set<string>();

    const definitionWhere: Prisma.BrandModelWhereInput = { kind: 'MODEL' };
    if (categoryId != null) {
      definitionWhere.OR = [{ categoryId }, { categoryId: null }];
    }
    const definitions = await prisma.brandModel.findMany({
      where: definitionWhere,
      select: { name: true },
    });
    for (const entry of definitions) {
      const model = entry.name.trim();
      if (model) names.add(model);
    }

    const productWhere: Prisma.ProductWhereInput = {
      model: { not: null },
      NOT: { model: '' },
    };
    if (categoryId != null) {
      productWhere.categoryId = categoryId;
    }
    const products = await prisma.product.findMany({
      where: productWhere,
      select: { model: true, brand: true },
    });
    for (const product of products) {
      const model = product.model?.trim();
      if (!model) continue;
      names.add(model);
      if (brandQuery) {
        const productBrand = product.brand?.trim().toLocaleLowerCase('tr-TR') ?? '';
        if (productBrand === brandQuery) {
          brandMatched.add(model);
        }
      }
    }

    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'tr'));
    /*
     * Marka seçiliyse YALNIZCA o markayla kullanılmış modeller döner (önceden
     * diğer markaların modelleri de listeleniyor, sadece sıraya alınıyordu).
     * BrandModel tanımlarında marka→model bağı olmadığı için eşleşme ürün
     * verisinden çıkarılır; o markaya ait hiç model yoksa (yeni marka) tüm
     * liste döner, aksi hâlde alan hiç öneri vermezdi.
     */
    const data =
      brandQuery && (strict || brandMatched.size > 0)
        ? sorted.filter((name) => brandMatched.has(name))
        : sorted;

    return {
      success: true,
      data,
      message: 'Model suggestions retrieved successfully.',
    };
  }
);

app.post<{ Body: { name: string; categoryId?: number; kind?: 'MARKA' | 'MODEL' } }>(
  '/api/settings/brand-model',
  async (request, reply) => {
    const { name, categoryId, kind } = request.body;
    const trimmed = name?.trim();
    const resolvedKind = kind === 'MARKA' ? 'MARKA' : 'MODEL';

    if (!trimmed) {
      return reply.status(400).send({
        success: false,
        message: 'Marka/model adı zorunludur.',
        errors: null,
      });
    }

    try {
      const brandModel = await prisma.brandModel.create({
        data: {
          name: trimmed,
          kind: resolvedKind,
          categoryId: categoryId ?? null,
        },
        include: { category: { select: { id: true, name: true } } },
      });
      return reply.status(201).send({
        success: true,
        data: brandModel,
        message: 'Brand model created successfully.',
      });
    } catch {
      return reply.status(409).send({
        success: false,
        message: 'Bu marka/model zaten kayıtlı.',
        errors: null,
      });
    }
  }
);

app.get('/api/settings/safes', async () => {
  const safes = await prisma.safe.findMany({
    orderBy: { name: 'asc' },
    include: {
      branch: { select: { id: true, name: true, type: true } },
    },
  });

  return {
    success: true,
    data: safes,
    message: 'Safes retrieved successfully.',
  };
});

app.post<{
  Body: {
    branchId: number;
    name: string;
    currency?: string;
    balance?: number;
  };
}>('/api/settings/safe', async (request, reply) => {
  const { branchId, name, currency, balance } = request.body;
  const trimmed = name?.trim();

  if (!branchId || !trimmed) {
    return reply.status(400).send({
      success: false,
      message: 'Şube ve kasa adı zorunludur.',
      errors: null,
    });
  }

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    return reply.status(404).send({
      success: false,
      message: 'Şube bulunamadı.',
      errors: null,
    });
  }

  const safe = await prisma.safe.create({
    data: {
      branchId,
      name: trimmed,
      currency: currency ?? 'TRY',
      balance: balance ?? 0,
    },
    include: {
      branch: { select: { id: true, name: true, type: true } },
    },
  });

  return reply.status(201).send({
    success: true,
    data: safe,
    message: 'Safe created successfully.',
  });
});

app.get('/api/settings/personnels', async () => {
  const personnels = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { invoices: true } },
    },
  });

  return {
    success: true,
    data: personnels,
    message: 'Personnels retrieved successfully.',
  };
});

app.post<{
  Body: {
    name: string;
    email: string;
    password: string;
    role?: string;
  };
}>('/api/settings/personnel', async (request, reply) => {
  const { name, email, password, role } = request.body;
  const trimmedName = name?.trim();
  const trimmedEmail = email?.trim().toLowerCase();

  if (!trimmedName || !trimmedEmail || !password) {
    return reply.status(400).send({
      success: false,
      message: 'Ad, e-posta ve şifre zorunludur.',
      errors: null,
    });
  }

  try {
    const hashedPassword = password.startsWith('$2')
      ? password
      : bcrypt.hashSync(password, 10);
    const user = await prisma.user.create({
      data: {
        name: trimmedName,
        email: trimmedEmail,
        password: hashedPassword,
        role: role ?? 'staff',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.status(201).send({
      success: true,
      data: user,
      message: 'Personnel created successfully.',
    });
  } catch {
    return reply.status(409).send({
      success: false,
      message: 'Bu e-posta adresi zaten kayıtlı.',
      errors: null,
    });
  }
});

app.put<{
  Params: { id: string };
  Body: {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  };
}>('/api/settings/personnel/:id', async (request, reply) => {
  const id = Number(request.params.id);
  const { name, email, password, role } = request.body;

  if (Number.isNaN(id)) {
    return reply.status(400).send({
      success: false,
      message: 'Geçersiz personel kimliği.',
      errors: null,
    });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return reply.status(404).send({
      success: false,
      message: 'Personel bulunamadı.',
      errors: null,
    });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(email?.trim() ? { email: email.trim().toLowerCase() } : {}),
        ...(password ? { password } : {}),
        ...(role ? { role } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      data: user,
      message: 'Personnel updated successfully.',
    };
  } catch {
    return reply.status(409).send({
      success: false,
      message: 'Güncelleme başarısız. E-posta başka bir kayıtta olabilir.',
      errors: null,
    });
  }
});

app.get('/api/settings/branches', async () => {
  const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
  return {
    success: true,
    data: branches,
    message: 'Branches retrieved successfully.',
  };
});

app.get<{
  Querystring: {
    page?: string;
    limit?: string;
    search?: string;
    productId?: string;
    customerId?: string;
  };
}>(
  '/api/reports/stock-history',
  async (request) => {
    const pagination = parseListPageQuery(request.query);
    const {
      search,
      productId: productIdQuery,
      customerId: customerIdQuery,
    } = request.query;
    const merkezDepo = await prisma.branch.findFirst({
      where: { name: 'MERKEZ_DEPO' },
      select: { id: true, name: true },
    });

    const invoiceWhere: Prisma.InvoiceWhereInput = {
      type: { in: ['SATIS', 'ALIS', 'IADE'] },
      deletedAt: null,
    };

    const parsedCustomerId = customerIdQuery ? Number(customerIdQuery) : null;
    if (parsedCustomerId && Number.isFinite(parsedCustomerId) && parsedCustomerId > 0) {
      invoiceWhere.customerId = parsedCustomerId;
    }

    const itemWhere: Prisma.InvoiceItemWhereInput = {
      invoice: invoiceWhere,
    };

    const parsedProductId = productIdQuery ? Number(productIdQuery) : null;
    if (parsedProductId && Number.isFinite(parsedProductId) && parsedProductId > 0) {
      itemWhere.productId = parsedProductId;
    } else if (search?.trim()) {
      itemWhere.product = buildProductSearchWhere(search.trim());
    }

    const [items, totalCount] = await Promise.all([
      prisma.invoiceItem.findMany({
        where: itemWhere,
        orderBy: { invoice: { createdAt: 'desc' } },
        take: pagination.limit,
        skip: pagination.skip,
        include: {
          product: { select: { id: true, sku: true, name: true, barcode: true } },
          invoice: {
            select: {
              id: true,
              invoiceNo: true,
              type: true,
              createdAt: true,
              isPreOrder: true,
              paymentMethod: true,
              paymentType: true,
              processedBy: true,
              exchangeRate: true,
              totalAmountTl: true,
              totalAmountUsd: true,
              customer: { select: { id: true, code: true, name: true } },
              branch: { select: { id: true, name: true } },
              safe: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.invoiceItem.count({ where: itemWhere }),
    ]);

    const data = items.map((item) => {
      let direction: 'IN' | 'OUT' = 'IN';
      let depot = merkezDepo?.name ?? 'MERKEZ_DEPO';
      let affectsStock = true;

      if (item.invoice.type === 'SATIS') {
        direction = 'OUT';
        depot = merkezDepo?.name ?? 'MERKEZ_DEPO';
        affectsStock = !item.invoice.isPreOrder;
      } else if (item.invoice.type === 'ALIS') {
        direction = 'IN';
        depot = merkezDepo?.name ?? 'MERKEZ_DEPO';
      } else if (item.invoice.type === 'IADE') {
        direction = 'IN';
        depot = merkezDepo?.name ?? 'MERKEZ_DEPO';
      }

      return {
        id: item.id,
        invoiceId: item.invoice.id,
        invoiceItemId: item.id,
        product: item.product,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        lineTotal: item.totalPrice,
        direction,
        depot,
        affectsStock,
        invoiceNo: item.invoice.invoiceNo,
        invoiceType: item.invoice.type,
        isPreOrder: item.invoice.isPreOrder,
        paymentMethod: item.invoice.paymentMethod,
        paymentType: item.invoice.paymentType,
        processedBy: item.invoice.processedBy,
        exchangeRate: item.invoice.exchangeRate,
        invoiceTotalTl: item.invoice.totalAmountTl,
        invoiceTotalUsd: invoiceUsdAmount(item.invoice),
        customer: item.invoice.customer,
        branch: item.invoice.branch,
        safe: item.invoice.safe,
        createdAt: item.invoice.createdAt,
      };
    });

    return buildListResponse(data, totalCount, pagination.limit, pagination.page);
  }
);

app.get('/api/reports/stock-value', async (request, reply) => {
  const stocks = await prisma.productStock.findMany({
    where: { branch: { name: 'MERKEZ_DEPO' } },
    include: {
      product: {
        select: { id: true, sku: true, name: true, costPrice: true, priceUsd: true },
      },
    },
    orderBy: { product: { name: 'asc' } },
  });

  const rows = stocks.map((row) => ({
    productId: row.product.id,
    sku: row.product.sku,
    name: row.product.name,
    quantity: row.quantity,
    costPrice: row.product.costPrice,
    priceUsd: row.product.priceUsd,
    stockValue: row.quantity * row.product.costPrice,
    retailValue: row.quantity * row.product.priceUsd,
  }));

  const totals = rows.reduce(
    (acc, row) => ({
      totalQuantity: acc.totalQuantity + row.quantity,
      totalCostValue: acc.totalCostValue + row.stockValue,
      totalRetailValue: acc.totalRetailValue + row.retailValue,
    }),
    { totalQuantity: 0, totalCostValue: 0, totalRetailValue: 0 }
  );

  if (request.headers.accept?.includes('text/csv')) {
    const header = 'SKU;Ürün;Adet;Maliyet;Stok Değeri;Perakende Değeri';
    const lines = rows.map(
      (r) =>
        `${r.sku};${r.name};${r.quantity};${r.costPrice};${r.stockValue.toFixed(2)};${r.retailValue.toFixed(2)}`
    );
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header(
      'Content-Disposition',
      'attachment; filename="stok-degeri.csv"'
    );
    return `${header}\n${lines.join('\n')}`;
  }

  return {
    success: true,
    data: { rows, totals },
    message: 'Stock value report retrieved successfully.',
  };
});

app.get<{ Querystring: { from?: string; to?: string } }>(
  '/api/reports/cash-flow',
  async (request, reply) => {
    const now = new Date();
    const from = request.query.from
      ? new Date(request.query.from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = request.query.to ? new Date(request.query.to) : now;
    to.setHours(23, 59, 59, 999);

    const transactions = await prisma.transaction.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' },
      include: {
        safe: { select: { id: true, name: true, currency: true } },
        customer: { select: { id: true, code: true, name: true } },
      },
    });

    const summary = transactions.reduce(
      (acc, tx) => {
        if (tx.type === 'GIRIS') acc.totalIn += tx.amount;
        else acc.totalOut += tx.amount;
        return acc;
      },
      { totalIn: 0, totalOut: 0 }
    );

    if (request.headers.accept?.includes('text/csv')) {
      const header = 'Tarih;Tip;Kasa;Tutar;Açıklama';
      const lines = transactions.map((tx) =>
        [
          tx.createdAt.toISOString(),
          tx.type,
          tx.safe.name,
          tx.amount,
          tx.description.replace(/;/g, ','),
        ].join(';')
      );
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header(
        'Content-Disposition',
        'attachment; filename="kasa-raporu.csv"'
      );
      return `${header}\n${lines.join('\n')}`;
    }

    return {
      success: true,
      data: {
        from,
        to,
        summary: { ...summary, net: summary.totalIn - summary.totalOut },
        transactions,
      },
      message: 'Cash flow report retrieved successfully.',
    };
  }
);

app.get<{ Querystring: { customerId?: string } }>(
  '/api/reports/customer-statement',
  async (request, reply) => {
    const customerId = Number(request.query.customerId);
    if (!Number.isFinite(customerId) || customerId <= 0) {
      return {
        success: false,
        message: 'customerId zorunludur.',
        errors: null,
      };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        code: true,
        name: true,
        balance: true,
        creditLimit: true,
      },
    });

    if (!customer) {
      return {
        success: false,
        message: 'Müşteri bulunamadı.',
        errors: null,
      };
    }

    const [invoices, payments] = await Promise.all([
      prisma.invoice.findMany({
        /*
         * Ön siparişler cari hesabı etkilemez; ekstrede de yer almazlar.
         * Yalnızca "Ön Siparişler" ekranından takip edilirler.
         */
        where: { customerId, isPreOrder: false, ...ACTIVE_INVOICE_FILTER },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNo: true,
          type: true,
          isPreOrder: true,
          totalAmountTl: true,
          totalAmountUsd: true,
          exchangeRate: true,
          paymentMethod: true,
          paymentType: true,
          processedBy: true,
          orderNotes: true,
          createdAt: true,
          items: {
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              discountPercent: true,
              totalPrice: true,
              product: { select: { id: true, sku: true, name: true } },
            },
          },
        },
      }),
      prisma.transaction.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        include: {
          safe: { select: { name: true, currency: true } },
        },
      }),
    ]);

    type StatementItem = {
      id: number;
      productSku: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      discountPercent: number;
      lineTotal: number;
    };

    type StatementLine = {
      id: number;
      date: Date;
      kind: 'invoice' | 'payment';
      description: string;
      debit: number;
      credit: number;
      invoiceNo?: string;
      invoiceType?: string;
      isPreOrder?: boolean;
      paymentMethod?: string | null;
      paymentType?: string | null;
      processedBy?: string | null;
      orderNotes?: string | null;
      amount?: number;
      safeName?: string | null;
      safeId?: number;
      receiptNo?: string | null;
      items?: StatementItem[];
    };

    const lines: StatementLine[] = [];

    for (const inv of invoices) {
      const isDebit = inv.type === 'SATIS';
      lines.push({
        id: inv.id,
        date: inv.createdAt,
        kind: 'invoice',
        description: `${inv.invoiceNo} (${inv.type})`,
        debit: isDebit ? inv.totalAmountTl : 0,
        credit: !isDebit ? inv.totalAmountTl : 0,
        invoiceNo: inv.invoiceNo,
        invoiceType: inv.type,
        isPreOrder: inv.isPreOrder,
        paymentMethod: inv.paymentMethod,
        paymentType: inv.paymentType,
        processedBy: inv.processedBy,
        orderNotes: inv.orderNotes,
        amount: inv.totalAmountUsd ?? inv.totalAmountTl,
        items: inv.items.map((item) => ({
          id: item.id,
          productSku: item.product.sku,
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent,
          lineTotal: item.totalPrice,
        })),
      });
    }

    for (const pay of payments) {
      lines.push({
        id: pay.id,
        date: pay.createdAt,
        kind: 'payment',
        description: pay.description,
        debit: pay.type === 'CIKIS' ? pay.amount : 0,
        credit: pay.type === 'GIRIS' ? pay.amount : 0,
        paymentType: pay.type,
        amount: pay.amount,
        safeName: pay.safe?.name ?? null,
        // Ekstreden "Düzenle" için gereken alanlar
        receiptNo: pay.receiptNo,
        safeId: pay.safeId,
        paymentMethod: pay.method,
      });
    }

    lines.sort((a, b) => b.date.getTime() - a.date.getTime());

    if (request.headers.accept?.includes('text/csv')) {
      const header = 'Tarih;Açıklama;Borç;Alacak';
      const csvLines = lines.map((line) =>
        [
          line.date.toISOString(),
          line.description.replace(/;/g, ','),
          line.debit,
          line.credit,
        ].join(';')
      );
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header(
        'Content-Disposition',
        `attachment; filename="ekstre-${customer.code}.csv"`
      );
      return `${header}\n${csvLines.join('\n')}`;
    }

    return {
      success: true,
      data: { customer, lines },
      message: 'Customer statement retrieved successfully.',
    };
  }
);

async function start() {
  try {
    await ensureDepots();
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`API sunucusu http://localhost:${PORT} adresinde çalışıyor`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();
