import 'dotenv/config';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { BranchType, Prisma, PrismaClient } from '@prisma/client';
import { resolveSku } from './sku.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL ortam değişkeni tanımlı değil.');
}

const adapter = new PrismaMariaDb(connectionString);
const prisma = new PrismaClient({ adapter });

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const CUSTOMERS_FILE = path.join(BACKEND_ROOT, 'musteriler.xlsx');
const PRODUCTS_FILE = path.join(BACKEND_ROOT, 'urunler.xlsx');

const EXCHANGE_RATE = 46.37;
const PRODUCT_BATCH_SIZE = 100;

type CustomerRow = {
  CariKodu?: string | number;
  CariAdi?: string;
  YetkiliAdi?: string;
  YetkiliSoyadi?: string;
  Adres?: string;
  Ilce?: string;
  Il?: string;
  Email?: string;
  Gsm?: string | number;
  VergiDairesi?: string;
  VergiTcNo?: string | number;
};

type ProductRow = {
  StokKodu?: string | number;
  StokAdi?: string;
  Kategori?: string;
  Barkod?: string | number;
  Birim?: string;
  AlisFiyati?: string | number;
  SatisFiyati?: string | number;
  KritikSeviye?: string | number;
  MevcutStok?: string | number;
  Bakiye?: string | number;
};

const categoryCache = new Map<string, number>();

async function findOrCreateCategoryId(name: string): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  if (categoryCache.has(trimmed)) return categoryCache.get(trimmed)!;

  const existing = await prisma.category.findUnique({ where: { name: trimmed } });
  if (existing) {
    categoryCache.set(trimmed, existing.id);
    return existing.id;
  }

  const created = await prisma.category.create({ data: { name: trimmed } });
  categoryCache.set(trimmed, created.id);
  return created.id;
}

function readExcelRows<T extends Record<string, unknown>>(filePath: string): T[] {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error(`${filePath} dosyasında sayfa bulunamadı.`);
  }

  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<T>(sheet, { defval: '' });
}

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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildContactPerson(row: CustomerRow): string | null {
  const parts = [asString(row.YetkiliAdi), asString(row.YetkiliSoyadi)].filter(
    Boolean
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

async function ensureDepots(): Promise<{ merkezDepoId: number; cinIadeDepoId: number }> {
  const merkezDepo = await prisma.branch.upsert({
    where: { id: 2 },
    update: { name: 'MERKEZ_DEPO', type: BranchType.WAREHOUSE },
    create: { name: 'MERKEZ_DEPO', type: BranchType.WAREHOUSE },
  });

  const cinIadeDepo = await prisma.branch.upsert({
    where: { id: 3 },
    update: { name: 'CIN_IADE_DEPO', type: BranchType.WAREHOUSE },
    create: { name: 'CIN_IADE_DEPO', type: BranchType.WAREHOUSE },
  });

  return { merkezDepoId: merkezDepo.id, cinIadeDepoId: cinIadeDepo.id };
}

async function importCustomers(): Promise<{
  success: number;
  skipped: number;
  errors: string[];
}> {
  console.log('\n📥 Müşteri aktarımı başlıyor...');
  console.log(`   Dosya: ${CUSTOMERS_FILE}`);

  const rows = readExcelRows<CustomerRow>(CUSTOMERS_FILE);
  let success = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const code = asString(row.CariKodu);
    const name = asString(row.CariAdi);

    if (!code || !name) {
      skipped += 1;
      errors.push(`Satır ${index + 2}: CariKodu veya CariAdi boş — atlandı.`);
      continue;
    }

    try {
      await prisma.customer.upsert({
        where: { code },
        update: {
          name,
          contactPerson: buildContactPerson(row),
          address: optionalString(row.Adres),
          district: optionalString(row.Ilce),
          city: optionalString(row.Il),
          email: optionalString(row.Email),
          phone: optionalString(row.Gsm),
          taxOffice: optionalString(row.VergiDairesi),
          taxNumber: optionalString(row.VergiTcNo),
        },
        create: {
          code,
          name,
          contactPerson: buildContactPerson(row),
          address: optionalString(row.Adres),
          district: optionalString(row.Ilce),
          city: optionalString(row.Il),
          email: optionalString(row.Email),
          phone: optionalString(row.Gsm),
          taxOffice: optionalString(row.VergiDairesi),
          taxNumber: optionalString(row.VergiTcNo),
        },
      });
      success += 1;
    } catch (error) {
      skipped += 1;
      const message =
        error instanceof Error ? error.message : 'Bilinmeyen müşteri hatası';
      errors.push(`Satır ${index + 2} (${code}): ${message}`);
    }
  }

  return { success, skipped, errors };
}

async function upsertProductWithStock(
  row: ProductRow,
  merkezDepoId: number,
  cinIadeDepoId: number,
  rowIndex: number
): Promise<void> {
  const name = asString(row.StokAdi);

  if (!name) {
    throw new Error('StokAdi boş');
  }

  // Stok kodu boş gelen satırlar atlanmasın — otomatik kod atanır
  const sku = resolveSku(row.StokKodu == null ? '' : String(row.StokKodu));

  const costPrice = asNumber(row.AlisFiyati, 0);
  const priceTl = asNumber(row.SatisFiyati, 0);
  const priceUsd = priceTl > 0 ? priceTl / EXCHANGE_RATE : 0;
  const priceUsd2 = priceUsd;
  const barcodeRaw = optionalString(row.Barkod);
  const quantity = asNumber(row.MevcutStok ?? row.Bakiye, 0);
  const categoryName = optionalString(row.Kategori);
  const categoryId = categoryName ? await findOrCreateCategoryId(categoryName) : null;

  const productData: Prisma.ProductCreateInput = {
    sku,
    name,
    costPrice,
    priceTl,
    priceUsd,
    priceUsd2,
    ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
    ...(barcodeRaw ? { barcode: barcodeRaw } : {}),
  };

  let productId: number;

  try {
    const product = await prisma.product.upsert({
      where: { sku },
      update: {
        name,
        costPrice,
        priceTl,
        priceUsd,
        priceUsd2,
        ...(categoryName != null ? { categoryId } : {}),
        ...(barcodeRaw ? { barcode: barcodeRaw } : { barcode: null }),
      },
      create: productData,
      select: { id: true },
    });
    productId = product.id;
  } catch (error) {
    if (
      barcodeRaw &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const product = await prisma.product.upsert({
        where: { sku },
        update: {
          name,
          costPrice,
          priceTl,
          priceUsd,
          priceUsd2,
          barcode: null,
        },
        create: {
          sku,
          name,
          costPrice,
          priceTl,
          priceUsd,
          priceUsd2,
        },
        select: { id: true },
      });
      productId = product.id;
    } else {
      throw new Error(
        `Satır ${rowIndex + 2} (${sku}): ${
          error instanceof Error ? error.message : 'Ürün kaydı başarısız'
        }`
      );
    }
  }

  await prisma.productStock.upsert({
    where: {
      productId_branchId: { productId, branchId: merkezDepoId },
    },
    update: { quantity },
    create: {
      productId,
      branchId: merkezDepoId,
      quantity,
    },
  });

  await prisma.productStock.upsert({
    where: {
      productId_branchId: { productId, branchId: cinIadeDepoId },
    },
    update: {},
    create: {
      productId,
      branchId: cinIadeDepoId,
      quantity: 0,
    },
  });
}

async function importProducts(
  merkezDepoId: number,
  cinIadeDepoId: number
): Promise<{
  success: number;
  skipped: number;
  errors: string[];
}> {
  console.log('\n📦 Ürün ve stok aktarımı başlıyor...');
  console.log(`   Dosya: ${PRODUCTS_FILE}`);

  const rows = readExcelRows<ProductRow>(PRODUCTS_FILE);
  let success = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += PRODUCT_BATCH_SIZE) {
    const batch = rows.slice(i, i + PRODUCT_BATCH_SIZE);

    for (const [batchIndex, row] of batch.entries()) {
      const rowIndex = i + batchIndex;
      try {
        await upsertProductWithStock(row, merkezDepoId, cinIadeDepoId, rowIndex);
        success += 1;
      } catch (error) {
        skipped += 1;
        errors.push(
          error instanceof Error ? error.message : `Satır ${rowIndex + 2}: bilinmeyen hata`
        );
      }
    }

    const processed = Math.min(i + PRODUCT_BATCH_SIZE, rows.length);
    if (processed % 500 === 0 || processed === rows.length) {
      console.log(`   İlerleme: ${processed}/${rows.length} ürün işlendi...`);
    }
  }

  return { success, skipped, errors };
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Akgün Teknik — Toplu Excel Aktarımı');
  console.log('═══════════════════════════════════════════');

  const { merkezDepoId, cinIadeDepoId } = await ensureDepots();
  console.log(`\n✓ MERKEZ_DEPO (id: ${merkezDepoId}) hazır`);
  console.log(`✓ CIN_IADE_DEPO (id: ${cinIadeDepoId}) hazır`);

  const customerResult = await importCustomers();
  const productResult = await importProducts(merkezDepoId, cinIadeDepoId);

  const totalCustomers = await prisma.customer.count();
  const totalProducts = await prisma.product.count();

  console.log('\n═══════════════════════════════════════════');
  console.log('  AKTARIM ÖZETİ');
  console.log('═══════════════════════════════════════════');
  console.log(`  Müşteri  → ${customerResult.success} kayıt aktarıldı`);
  if (customerResult.skipped > 0) {
    console.log(`             ${customerResult.skipped} satır atlandı/hatalı`);
  }
  console.log(`  Ürün     → ${productResult.success} kayıt aktarıldı`);
  if (productResult.skipped > 0) {
    console.log(`             ${productResult.skipped} satır atlandı/hatalı`);
  }
  console.log('───────────────────────────────────────────');
  console.log(`  Veritabanındaki toplam müşteri: ${totalCustomers}`);
  console.log(`  Veritabanındaki toplam ürün:   ${totalProducts}`);
  console.log('═══════════════════════════════════════════\n');

  const allErrors = [...customerResult.errors, ...productResult.errors];
  if (allErrors.length > 0) {
    console.log('İlk 10 hata:');
    allErrors.slice(0, 10).forEach((err) => console.log(`  • ${err}`));
    if (allErrors.length > 10) {
      console.log(`  ... ve ${allErrors.length - 10} hata daha`);
    }
  }
}

main()
  .catch((error) => {
    console.error('\n❌ Aktarım başarısız:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
