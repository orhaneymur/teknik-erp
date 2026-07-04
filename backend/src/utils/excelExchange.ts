import * as XLSX from 'xlsx';
import type { Prisma, PrismaClient } from '@prisma/client';

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  categoriesCreated?: number;
  brandModelsCreated?: number;
  errors: string[];
};

function asString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function optionalString(value: unknown): string | null {
  const text = asString(value);
  if (!text || text === '0') return null;
  return text;
}

function asNumber(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readRows<T extends Record<string, unknown>>(buffer: Buffer): T[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json<T>(workbook.Sheets[sheetName], { defval: '' });
}

function toBuffer(workbook: XLSX.WorkBook): Buffer {
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

type CustomerExcelRow = {
  CariKodu?: string | number;
  CariAdi?: string;
  YetkiliAdi?: string;
  Adres?: string;
  Ilce?: string;
  Il?: string;
  Email?: string;
  Gsm?: string | number;
  VergiDairesi?: string;
  VergiTcNo?: string | number;
  KrediLimiti?: string | number;
  Bakiye?: string | number;
};

export async function exportCustomersExcel(prisma: PrismaClient): Promise<Buffer> {
  const customers = await prisma.customer.findMany({ orderBy: { code: 'asc' } });
  const rows = customers.map((c) => ({
    CariKodu: c.code,
    CariAdi: c.name,
    YetkiliAdi: c.contactPerson ?? '',
    Adres: c.address ?? '',
    Ilce: c.district ?? '',
    Il: c.city ?? '',
    Email: c.email ?? '',
    Gsm: c.phone ?? '',
    VergiDairesi: c.taxOffice ?? '',
    VergiTcNo: c.taxNumber ?? '',
    KrediLimiti: c.creditLimit,
    Bakiye: c.balance,
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Musteriler');
  return toBuffer(workbook);
}

export async function importCustomersExcel(
  prisma: PrismaClient,
  buffer: Buffer
): Promise<ImportResult> {
  const rows = readRows<CustomerExcelRow>(buffer);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const code = asString(row.CariKodu);
    const name = asString(row.CariAdi);

    if (!code || !name) {
      skipped += 1;
      errors.push(`Satir ${index + 2}: CariKodu veya CariAdi bos.`);
      continue;
    }

    const data = {
      name,
      contactPerson: optionalString(row.YetkiliAdi),
      address: optionalString(row.Adres),
      district: optionalString(row.Ilce),
      city: optionalString(row.Il),
      email: optionalString(row.Email),
      phone: optionalString(row.Gsm),
      taxOffice: optionalString(row.VergiDairesi),
      taxNumber: optionalString(row.VergiTcNo),
      creditLimit: asNumber(row.KrediLimiti, 0),
    };

    try {
      const existing = await prisma.customer.findUnique({ where: { code } });
      if (existing) {
        await prisma.customer.update({ where: { code }, data });
        updated += 1;
      } else {
        await prisma.customer.create({ data: { code, ...data } });
        created += 1;
      }
    } catch (error) {
      skipped += 1;
      errors.push(
        `Satir ${index + 2} (${code}): ${
          error instanceof Error ? error.message : 'Kayit hatasi'
        }`
      );
    }
  }

  return { created, updated, skipped, errors };
}

const APPEARANCE_LABELS: Record<string, string> = {
  CITALI: 'Çıtalı',
  CITASIZ: 'Çıtasız',
};

const QUALITY_LABELS: Record<string, string> = {
  A_KALITE: 'A Kalite',
  A_PLUS: 'A Plus',
  ORJINAL: 'Orjinal',
  REVIZYON_ORJINAL: 'Revizyon Orjinal',
  SERVIS_ORJINAL: 'Servis Orjinal',
  OLED: 'OLED',
};

function appearanceLabel(value: string | null | undefined): string {
  if (!value) return '';
  return APPEARANCE_LABELS[value] ?? value;
}

function qualityLabel(value: string | null | undefined): string {
  if (!value) return '';
  return QUALITY_LABELS[value] ?? value;
}

function appearanceCodeFromLabel(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const byCode = APPEARANCE_LABELS[trimmed];
  if (byCode) return trimmed;
  const entry = Object.entries(APPEARANCE_LABELS).find(([, label]) => label === trimmed);
  return entry?.[0] ?? trimmed;
}

function qualityCodeFromLabel(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const byCode = QUALITY_LABELS[trimmed];
  if (byCode) return trimmed;
  const entry = Object.entries(QUALITY_LABELS).find(([, label]) => label === trimmed);
  return entry?.[0] ?? trimmed;
}

type ProductExcelRow = {
  Id?: string | number;
  StokKodu?: string | number;
  StokAdi?: string;
  Kategori?: string;
  Marka?: string;
  Model?: string;
  Gorunum?: string;
  Kalite?: string;
  Renk?: string;
  Aciklama?: string;
  Rmb?: string | number;
  AlisFiyati?: string | number;
  SatisFiyati?: string | number;
  AlisAdedi?: string | number;
  SatisAdedi?: string | number;
  Bakiye?: string | number;
  /** Eski şablon uyumu */
  Barkod?: string | number;
  SatisUsd?: string | number;
  MerkezDepo?: string | number;
  CinIadeDepo?: string | number;
};

async function findOrCreateCategory(
  tx: Prisma.TransactionClient,
  rawName: string,
  cache: Map<string, number>,
  categoriesCreated: { count: number }
): Promise<number> {
  const name = rawName.trim();
  if (cache.has(name)) return cache.get(name)!;

  const existing = await tx.category.findUnique({ where: { name } });
  if (existing) {
    cache.set(name, existing.id);
    return existing.id;
  }

  const created = await tx.category.create({ data: { name } });
  cache.set(name, created.id);
  categoriesCreated.count += 1;
  return created.id;
}

function brandModelCacheKey(
  kind: 'MARKA' | 'MODEL',
  categoryId: number | null,
  name: string
) {
  return `${kind}:${categoryId ?? 0}:${name.toLocaleLowerCase('tr-TR')}`;
}

async function findOrCreateBrandModel(
  tx: Prisma.TransactionClient | PrismaClient,
  rawName: string,
  kind: 'MARKA' | 'MODEL',
  categoryId: number | null,
  cache: Map<string, number>,
  brandModelsCreated: { count: number }
): Promise<number> {
  const name = rawName.trim();
  if (!name) return 0;
  const key = brandModelCacheKey(kind, categoryId, name);
  if (cache.has(key)) return cache.get(key)!;

  const existing = await tx.brandModel.findFirst({
    where: { name, kind, categoryId },
  });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  try {
    const created = await tx.brandModel.create({
      data: { name, kind, categoryId },
    });
    cache.set(key, created.id);
    brandModelsCreated.count += 1;
    return created.id;
  } catch {
    const raced = await tx.brandModel.findFirst({
      where: { name, kind, categoryId },
    });
    if (raced) {
      cache.set(key, raced.id);
      return raced.id;
    }
    // Kategori baglantisi olmadan da dene (eski kayitlar)
    const anyKind = await tx.brandModel.findFirst({
      where: { name, kind },
    });
    if (anyKind) {
      cache.set(key, anyKind.id);
      return anyKind.id;
    }
    throw new Error(`Marka/model olusturulamadi: ${name}`);
  }
}

/** Urunlerdeki marka/model metinlerinden tanim listesini doldurur */
export async function syncBrandModelsFromProducts(
  prisma: PrismaClient
): Promise<{ brandModelsCreated: number }> {
  const brandModelsCreated = { count: 0 };
  const cache = new Map<string, number>();

  const existing = await prisma.brandModel.findMany({
    select: { id: true, name: true, kind: true, categoryId: true },
  });
  for (const entry of existing) {
    cache.set(
      brandModelCacheKey(entry.kind, entry.categoryId, entry.name),
      entry.id
    );
  }

  const products = await prisma.product.findMany({
    where: {
      OR: [{ brand: { not: null } }, { model: { not: null } }],
    },
    select: { brand: true, model: true, categoryId: true },
  });

  for (const product of products) {
    const categoryId = product.categoryId ?? null;
    if (product.brand?.trim()) {
      await findOrCreateBrandModel(
        prisma,
        product.brand,
        'MARKA',
        categoryId,
        cache,
        brandModelsCreated
      );
    }
    if (product.model?.trim()) {
      await findOrCreateBrandModel(
        prisma,
        product.model,
        'MODEL',
        categoryId,
        cache,
        brandModelsCreated
      );
    }
  }

  return { brandModelsCreated: brandModelsCreated.count };
}

async function getDepotIds(prisma: PrismaClient) {
  const merkez = await prisma.branch.findFirst({
    where: { name: 'MERKEZ_DEPO' },
    select: { id: true },
  });
  const cinIade = await prisma.branch.findFirst({
    where: { name: { in: ['CIN_IADE_DEPO', 'ARIZALI_DEPO'] } },
    select: { id: true },
  });
  if (!merkez || !cinIade) {
    throw new Error('Depo kayitlari bulunamadi.');
  }
  return { merkezId: merkez.id, cinIadeId: cinIade.id };
}

async function upsertStock(
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
      data: { quantity },
    });
  } else {
    await tx.productStock.create({
      data: { productId, branchId, quantity },
    });
  }
}

export async function exportProductsExcel(prisma: PrismaClient): Promise<Buffer> {
  const [products, purchaseQtyRows, salesQtyRows] = await Promise.all([
    prisma.product.findMany({
      orderBy: { sku: 'asc' },
      include: {
        category: { select: { name: true } },
        stocks: { include: { branch: { select: { name: true } } } },
      },
    }),
    prisma.invoiceItem.groupBy({
      by: ['productId'],
      where: { invoice: { type: 'ALIS', deletedAt: null } },
      _sum: { quantity: true },
    }),
    prisma.invoiceItem.groupBy({
      by: ['productId'],
      where: { invoice: { type: 'SATIS', deletedAt: null } },
      _sum: { quantity: true },
    }),
  ]);

  const purchaseQty = new Map(
    purchaseQtyRows.map((row) => [row.productId, row._sum.quantity ?? 0])
  );
  const salesQty = new Map(
    salesQtyRows.map((row) => [row.productId, row._sum.quantity ?? 0])
  );

  const rows = products.map((p) => {
    const bakiye =
      p.stocks.find((s) => s.branch.name === 'MERKEZ_DEPO')?.quantity ?? 0;

    return {
      Id: p.id,
      StokKodu: p.sku,
      StokAdi: p.name,
      Kategori: p.category?.name ?? '',
      Marka: p.brand ?? '',
      Model: p.model ?? '',
      Gorunum: appearanceLabel(p.appearance),
      Kalite: qualityLabel(p.quality),
      Renk: '',
      Aciklama: p.description ?? '',
      Rmb: p.rbmPrice,
      AlisFiyati: p.costPrice,
      SatisFiyati: p.priceUsd > 0 ? p.priceUsd : p.priceTl,
      AlisAdedi: purchaseQty.get(p.id) ?? 0,
      SatisAdedi: salesQty.get(p.id) ?? 0,
      Bakiye: bakiye,
    };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Stoklar');
  return toBuffer(workbook);
}

export async function importProductsExcel(
  prisma: PrismaClient,
  buffer: Buffer
): Promise<ImportResult> {
  const rows = readRows<ProductExcelRow>(buffer);
  const { merkezId, cinIadeId } = await getDepotIds(prisma);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const categoryCache = new Map<string, number>();
  const brandModelCache = new Map<string, number>();
  const categoriesCreated = { count: 0 };
  const brandModelsCreated = { count: 0 };

  const [existingCategories, existingBrandModels] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.brandModel.findMany({
      select: { id: true, name: true, kind: true, categoryId: true },
    }),
  ]);
  for (const category of existingCategories) {
    categoryCache.set(category.name, category.id);
  }
  for (const entry of existingBrandModels) {
    brandModelCache.set(
      brandModelCacheKey(entry.kind, entry.categoryId, entry.name),
      entry.id
    );
  }

  type ParsedRow = {
    rowIndex: number;
    sku: string;
    name: string;
    categoryName: string | null;
    brand: string | null;
    model: string | null;
    quality: string | null;
    appearance: string | null;
    description: string | null;
    hasDescriptionUpdate: boolean;
    rbmPrice: number | null;
    costPrice: number;
    priceTl: number;
    priceUsd: number;
    barcodeRaw: string | null;
    hasBarcodeColumn: boolean;
    merkezQty: number;
    cinIadeQty: number;
    hasCinIadeColumn: boolean;
  };

  const parsedRows: ParsedRow[] = [];

  for (const [index, row] of rows.entries()) {
    const sku = asString(row.StokKodu);
    const name = asString(row.StokAdi);

    if (!sku || !name) {
      skipped += 1;
      errors.push(`Satir ${index + 2}: StokKodu veya StokAdi bos.`);
      continue;
    }

    const salePrice = asNumber(row.SatisFiyati, 0);
    const saleUsd = asNumber(row.SatisUsd, 0);
    const priceUsd = saleUsd > 0 ? saleUsd : salePrice;
    const gorunum = optionalString(row.Gorunum);
    const renk = optionalString(row.Renk);
    const hasDescriptionUpdate =
      Object.prototype.hasOwnProperty.call(row, 'Aciklama') ||
      (Boolean(gorunum) && Boolean(renk));
    let description: string | null = optionalString(row.Aciklama);
    if (renk && gorunum) {
      description = description ? `${description} | Renk: ${renk}` : `Renk: ${renk}`;
    }

    parsedRows.push({
      rowIndex: index,
      sku,
      name,
      categoryName: optionalString(row.Kategori),
      brand: optionalString(row.Marka),
      model: optionalString(row.Model),
      quality: qualityCodeFromLabel(optionalString(row.Kalite)),
      appearance: appearanceCodeFromLabel(gorunum ?? renk),
      description,
      hasDescriptionUpdate,
      rbmPrice:
        Object.prototype.hasOwnProperty.call(row, 'Rmb') && row.Rmb !== ''
          ? asNumber(row.Rmb, 0)
          : null,
      costPrice: asNumber(row.AlisFiyati, 0),
      priceTl: priceUsd,
      priceUsd,
      barcodeRaw: optionalString(row.Barkod),
      hasBarcodeColumn: Object.prototype.hasOwnProperty.call(row, 'Barkod'),
      /** Bakiye = MERKEZ_DEPO stok adedi */
      merkezQty: asNumber(row.Bakiye ?? row.MerkezDepo, 0),
      cinIadeQty: asNumber(row.CinIadeDepo, 0),
      hasCinIadeColumn: Object.prototype.hasOwnProperty.call(row, 'CinIadeDepo'),
    });
  }

  const BATCH_SIZE = 50;
  const TX_TIMEOUT_MS = 120_000;

  const importRow = async (
    tx: Prisma.TransactionClient,
    item: ParsedRow,
    existingBySku: Map<string, number>
  ) => {
    let categoryId: number | null = null;
    if (item.categoryName) {
      categoryId = await findOrCreateCategory(
        tx,
        item.categoryName,
        categoryCache,
        categoriesCreated
      );
    }

    let brandModelId: number | null = null;
    if (item.brand) {
      await findOrCreateBrandModel(
        tx,
        item.brand,
        'MARKA',
        categoryId,
        brandModelCache,
        brandModelsCreated
      );
    }
    if (item.model) {
      brandModelId = await findOrCreateBrandModel(
        tx,
        item.model,
        'MODEL',
        categoryId,
        brandModelCache,
        brandModelsCreated
      );
    }

    const categoryUpdate =
      item.categoryName != null ? { categoryId } : {};

    const detailUpdate = {
      ...(item.brand != null ? { brand: item.brand || null } : {}),
      ...(item.model != null ? { model: item.model || null } : {}),
      ...(item.model != null ? { brandModelId } : {}),
      ...(item.quality != null ? { quality: item.quality } : {}),
      ...(item.appearance != null ? { appearance: item.appearance } : {}),
      ...(item.hasDescriptionUpdate
        ? { description: item.description || null }
        : {}),
      ...(item.rbmPrice != null ? { rbmPrice: item.rbmPrice } : {}),
    };

    const barcodeUpdate = item.hasBarcodeColumn
      ? { barcode: item.barcodeRaw }
      : {};

    const existingId = existingBySku.get(item.sku);
    const product = existingId
      ? await tx.product.update({
          where: { id: existingId },
          data: {
            name: item.name,
            costPrice: item.costPrice,
            priceTl: item.priceTl,
            priceUsd: item.priceUsd,
            ...categoryUpdate,
            ...detailUpdate,
            ...barcodeUpdate,
          },
        })
      : await tx.product.create({
          data: {
            sku: item.sku,
            name: item.name,
            costPrice: item.costPrice,
            priceTl: item.priceTl,
            priceUsd: item.priceUsd,
            ...categoryUpdate,
            ...detailUpdate,
            ...barcodeUpdate,
          },
        });

    existingBySku.set(item.sku, product.id);
    await upsertStock(tx, product.id, merkezId, item.merkezQty);
    if (item.hasCinIadeColumn) {
      await upsertStock(tx, product.id, cinIadeId, item.cinIadeQty);
    }

    return existingId ? 'updated' : 'created';
  };

  for (let offset = 0; offset < parsedRows.length; offset += BATCH_SIZE) {
    const batch = parsedRows.slice(offset, offset + BATCH_SIZE);

    try {
      await prisma.$transaction(
        async (tx) => {
          const skus = batch.map((item) => item.sku);
          const existingProducts = await tx.product.findMany({
            where: { sku: { in: skus } },
            select: { id: true, sku: true },
          });
          const existingBySku = new Map(existingProducts.map((p) => [p.sku, p.id]));

          for (const item of batch) {
            const result = await importRow(tx, item, existingBySku);
            if (result === 'updated') updated += 1;
            else created += 1;
          }
        },
        { timeout: TX_TIMEOUT_MS }
      );
    } catch {
      for (const item of batch) {
        try {
          await prisma.$transaction(
            async (tx) => {
              const existing = await tx.product.findUnique({
                where: { sku: item.sku },
                select: { id: true },
              });
              const existingBySku = new Map<string, number>();
              if (existing) existingBySku.set(item.sku, existing.id);
              const result = await importRow(tx, item, existingBySku);
              if (result === 'updated') updated += 1;
              else created += 1;
            },
            { timeout: TX_TIMEOUT_MS }
          );
        } catch (error) {
          skipped += 1;
          errors.push(
            `Satir ${item.rowIndex + 2} (${item.sku}): ${
              error instanceof Error ? error.message : 'Kayit hatasi'
            }`
          );
        }
      }
    }
  }

  // Urun alanlarindan tanim listesini senkronize et (onceki importlar dahil)
  const synced = await syncBrandModelsFromProducts(prisma);

  return {
    created,
    updated,
    skipped,
    categoriesCreated: categoriesCreated.count,
    brandModelsCreated: brandModelsCreated.count + synced.brandModelsCreated,
    errors,
  };
}

type InvoiceExcelRow = {
  FaturaNo?: string;
  Tip?: string;
  CariKodu?: string;
  CariAdi?: string;
  Tarih?: string;
  Odeme?: string;
  TutarTL?: string | number;
  TutarUSD?: string | number;
  Personel?: string;
  Aciklama?: string;
  Teslimat?: string;
  KaynakFatura?: string;
};

export async function exportInvoicesExcel(
  prisma: PrismaClient,
  typeFilter?: string
): Promise<Buffer> {
  const where =
    typeFilter && typeFilter !== 'ALL' ? { type: typeFilter } : {};

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { code: true, name: true } },
      originalInvoice: { select: { invoiceNo: true } },
      items: {
        include: {
          product: { select: { sku: true, name: true } },
        },
      },
    },
  });

  const summaryRows = invoices.map((inv) => ({
    FaturaNo: inv.invoiceNo,
    Tip: inv.type,
    CariKodu: inv.customer.code,
    CariAdi: inv.customer.name,
    Tarih: inv.createdAt.toISOString().slice(0, 19).replace('T', ' '),
    Odeme: inv.paymentMethod,
    TutarTL: inv.totalAmountTl,
    TutarUSD: inv.totalAmountUsd,
    Personel: inv.processedBy ?? '',
    Aciklama: inv.orderNotes ?? '',
    Teslimat: inv.deliveryType,
    KaynakFatura: inv.originalInvoice?.invoiceNo ?? '',
  }));

  const lineRows = invoices.flatMap((inv) =>
    inv.items.map((item) => ({
      FaturaNo: inv.invoiceNo,
      StokKodu: item.product.sku,
      UrunAdi: item.product.name,
      Miktar: item.quantity,
      BirimFiyat: item.unitPrice,
      Toplam: item.totalPrice,
    }))
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(summaryRows),
    'Faturalar'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(lineRows),
    'Kalemler'
  );
  return toBuffer(workbook);
}

export async function importInvoicesExcel(
  prisma: PrismaClient,
  buffer: Buffer
): Promise<ImportResult> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames.includes('Faturalar')
    ? 'Faturalar'
    : workbook.SheetNames[0];
  if (!sheetName) {
    return { created: 0, updated: 0, skipped: 0, errors: ['Excel sayfasi bulunamadi.'] };
  }

  const rows = XLSX.utils.sheet_to_json<InvoiceExcelRow>(
    workbook.Sheets[sheetName],
    { defval: '' }
  );

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const invoiceNo = asString(row.FaturaNo);
    if (!invoiceNo) {
      skipped += 1;
      continue;
    }

    try {
      const existing = await prisma.invoice.findUnique({ where: { invoiceNo } });
      if (!existing) {
        skipped += 1;
        errors.push(`Satir ${index + 2}: ${invoiceNo} bulunamadi.`);
        continue;
      }

      await prisma.invoice.update({
        where: { invoiceNo },
        data: {
          ...(asString(row.Odeme) ? { paymentMethod: asString(row.Odeme) } : {}),
          processedBy: optionalString(row.Personel),
          orderNotes: optionalString(row.Aciklama),
          ...(asString(row.Teslimat) ? { deliveryType: asString(row.Teslimat) } : {}),
        },
      });
      updated += 1;
    } catch (error) {
      skipped += 1;
      errors.push(
        `Satir ${index + 2} (${invoiceNo}): ${
          error instanceof Error ? error.message : 'Guncelleme hatasi'
        }`
      );
    }
  }

  return { created: 0, updated, skipped, errors };
}
