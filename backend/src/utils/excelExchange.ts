import * as XLSX from 'xlsx';
import type { Prisma, PrismaClient } from '@prisma/client';
import { generateSku } from './sku.js';

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  deleted?: number;
  stockZeroed?: number;
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

/** Excel basliklarini esnek eslestir (StokKod/StokKodu, Marka, vb.) */
function normalizeHeaderKey(key: string): string {
  return key
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

function cell(row: Record<string, unknown>, ...aliases: string[]): unknown {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    map.set(normalizeHeaderKey(key), value);
  }
  for (const alias of aliases) {
    const normalized = normalizeHeaderKey(alias);
    if (map.has(normalized)) return map.get(normalized);
  }
  for (const alias of aliases) {
    const normalized = normalizeHeaderKey(alias);
    for (const [key, value] of map) {
      if (key.startsWith(normalized) || normalized.startsWith(key)) {
        return value;
      }
    }
  }
  return undefined;
}

function hasCell(row: Record<string, unknown>, ...aliases: string[]): boolean {
  return cell(row, ...aliases) !== undefined;
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
  /** Eski tek fiyatlı şablonlar — yalnızca içeri aktarmada okunur, dışa verilmez */
  SatisFiyati?: string | number;
  /** Satış 1 (Perakende) — yoksa SatisFiyati kullanılır */
  Satis1?: string | number;
  /** Satış 2 (Toptan) — yoksa Satış 1 kopyalanır */
  Satis2?: string | number;
  AlisAdedi?: string | number;
  SatisAdedi?: string | number;
  Bakiye?: string | number;
  /** Eski şablon uyumu */
  Barkod?: string | number;
  SatisUsd?: string | number;
  MerkezDepo?: string | number;
  CinIadeDepo?: string | number;
  /** Yeni gelen adet — mevcut stoga EKLENIR (Bakiye gibi uzerine yazmaz) */
  GelenAdet?: string | number;
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

/**
 * Mevcut stoga adet EKLER (uzerine yazmaz).
 *
 * "Gelen Adet" sutunu icin kullanilir: kullanici yalnizca yeni gelen adedi
 * yazar, mevcut stogu bilmesi ve toplamasi gerekmez. Kayit yoksa dogrudan
 * gelen adet yazilir.
 */
async function addToStock(
  tx: Prisma.TransactionClient,
  productId: number,
  branchId: number,
  delta: number
) {
  const existing = await tx.productStock.findUnique({
    where: { productId_branchId: { productId, branchId } },
  });
  const current = existing ? Number(existing.quantity) : 0;
  const next = current + delta;
  if (existing) {
    await tx.productStock.update({
      where: { productId_branchId: { productId, branchId } },
      data: { quantity: next },
    });
  } else {
    await tx.productStock.create({
      data: { productId, branchId, quantity: next },
    });
  }
}

/**
 * Eski Excel şeması rengi ayrı kolon yerine açıklamanın sonuna
 * `... | Renk: Black` biçiminde yazıyordu (v1.8.44'te kaldırıldı). Bu yüzden
 * canlı kayıtlarda `color` boş, renk bilgisi açıklamada kalmıştı: dışa
 * aktarımda Renk sütunu boş, Açıklama sütunu "Renk: Black" görünüyordu.
 * Dışa aktarım bu artığı okuyup doğru sütuna taşır; içe aktarımda Renk
 * sütunu zaten `color` alanına yazıldığı için bir tur indir/yükle ile veri
 * kalıcı olarak düzelir (aynı taşıma migration ile de yapılır).
 */
const LEGACY_COLOR_TAG = 'Renk:';

function legacyColorFromDescription(description: string | null): string {
  if (!description) return '';
  const at = description.lastIndexOf(LEGACY_COLOR_TAG);
  if (at < 0) return '';
  return description
    .slice(at + LEGACY_COLOR_TAG.length)
    .split('|')[0]
    .trim();
}

function stripLegacyColor(description: string | null): string {
  if (!description) return '';
  const at = description.lastIndexOf(LEGACY_COLOR_TAG);
  if (at < 0) return description;
  return description.slice(0, at).replace(/[\s|]+$/, '').trim();
}

/**
 * Stok listesini Excel'e aktarır.
 *
 * @param where  Ekrandaki filtrenin aynısı. Verilmezse tüm ürünler iner.
 *               Kullanıcı listede filtre uygulamışsa Excel de aynı satırları
 *               içermeli — aksi halde "40 ürün görüyorum ama 5000 satır indi"
 *               durumu oluşuyordu.
 *
 * Sıralama stok koduna göre değil ADA göre yapılır: Excel'i açan kişi ürünü
 * adıyla arıyor, kodla değil.
 */
export async function exportProductsExcel(
  prisma: PrismaClient,
  where: Prisma.ProductWhereInput = {}
): Promise<Buffer> {
  const [products, purchaseQtyRows, salesQtyRows] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
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

    const legacyColor = legacyColorFromDescription(p.description);
    const color = p.color?.trim() || legacyColor;
    const description = legacyColor
      ? stripLegacyColor(p.description)
      : (p.description ?? '');

    return {
      Id: p.id,
      StokKodu: p.sku,
      StokAdi: p.name,
      Kategori: p.category?.name ?? '',
      Marka: p.brand ?? '',
      Model: p.model ?? '',
      Gorunum: appearanceLabel(p.appearance),
      Kalite: qualityLabel(p.quality),
      Renk: color,
      Aciklama: description,
      Rmb: p.rbmPrice,
      AlisFiyati: p.costPrice,
      /* Fiyat yalnızca Satis1 (perakende) ve Satis2 (toptan) olarak dışa verilir;
         eski tek sütunlu SatisFiyati içeri aktarmada hâlâ okunur. */
      Satis1: p.priceUsd > 0 ? p.priceUsd : p.priceTl,
      Satis2: p.priceUsd2 > 0 ? p.priceUsd2 : p.priceUsd > 0 ? p.priceUsd : p.priceTl,
      AlisAdedi: purchaseQty.get(p.id) ?? 0,
      SatisAdedi: salesQty.get(p.id) ?? 0,
      Bakiye: bakiye,
      /*
       * En sagdaki sutun BILEREK BOS iner. Kullanici buraya yeni gelen
       * adedi yazar; ice aktarimda mevcut stoga EKLENIR (Bakiye gibi
       * uzerine yazmaz). Boylece "20 adet geldi" demek icin mevcut stogu
       * bilip toplamak gerekmez.
       */
      GelenAdet: '',
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
    /** Excel'deki Id sütunu — StokKodu boş satırlarda mevcut kaydı bulmak için */
    excelId: number;
    /** Kod Excel'de boştu, otomatik atandı */
    autoSku: boolean;
    /** StokKodu boş + veritabanındaki kod da boş → bu kayda kod yazılır */
    forcedExistingId: number | null;
    name: string;
    categoryName: string | null;
    hasCategory: boolean;
    brand: string | null;
    hasBrand: boolean;
    model: string | null;
    hasModel: boolean;
    quality: string | null;
    hasQuality: boolean;
    appearance: string | null;
    hasAppearance: boolean;
    color: string | null;
    hasColor: boolean;
    description: string | null;
    hasDescriptionUpdate: boolean;
    rbmPrice: number | null;
    hasRmb: boolean;
    costPrice: number;
    priceTl: number;
    priceUsd: number;
    priceUsd2: number;
    barcodeRaw: string | null;
    hasBarcodeColumn: boolean;
    merkezQty: number;
    /** Excel'de GelenAdet sutunu doldurulmus mu */
    hasGelenAdet: boolean;
    /** Mevcut stoga eklenecek adet */
    gelenAdet: number;
    cinIadeQty: number;
    hasCinIadeColumn: boolean;
  };

  const parsedRows: ParsedRow[] = [];

  for (const [index, row] of rows.entries()) {
    const record = row as Record<string, unknown>;
    const sku = asString(cell(record, 'StokKodu', 'StokKod', 'SKU'));
    const name = asString(cell(record, 'StokAdi', 'StokAd', 'UrunAdi', 'UrunAd'));

    /*
     * Eskiden StokKodu boş satır atlanıyordu; tam senkron da o ürünü
     * "Excel'de yok" sayıp siliyordu. Artık yalnızca ad zorunlu; kod boşsa
     * aşağıda otomatik atanır (varsa Id ile mevcut kayda bağlanır).
     */
    if (!name) {
      skipped += 1;
      errors.push(`Satir ${index + 2}: StokAdi bos.`);
      continue;
    }

    const salePrice = asNumber(cell(record, 'SatisFiyati', 'SatisFiyat'), 0);
    const saleUsd = asNumber(cell(record, 'SatisUsd'), 0);
    const sale1Raw = asNumber(cell(record, 'Satis1', 'SatisBir'), 0);
    const sale2Raw = asNumber(cell(record, 'Satis2', 'SatisIki'), 0);
    // Öncelik: Satis1 > SatisUsd > SatisFiyati
    const priceUsd =
      sale1Raw > 0 ? sale1Raw : saleUsd > 0 ? saleUsd : salePrice;
    // Satış 2 yoksa Satış 1 ile aynı
    const priceUsd2 = sale2Raw > 0 ? sale2Raw : priceUsd;
    const hasGorunum = hasCell(record, 'Gorunum', 'Gorunun');
    const hasRenk = hasCell(record, 'Renk');
    const gorunum = optionalString(cell(record, 'Gorunum', 'Gorunun'));
    const renk = optionalString(cell(record, 'Renk'));
    const hasDescriptionUpdate = hasCell(record, 'Aciklama', 'Aciklam');
    const description: string | null = optionalString(
      cell(record, 'Aciklama', 'Aciklam')
    );

    const hasBrand = hasCell(record, 'Marka');
    const hasModel = hasCell(record, 'Model');
    const hasCategory = hasCell(record, 'Kategori');

    parsedRows.push({
      rowIndex: index,
      sku,
      excelId: asNumber(cell(record, 'Id'), 0),
      autoSku: false,
      forcedExistingId: null,
      name,
      categoryName: optionalString(cell(record, 'Kategori')),
      hasCategory,
      brand: optionalString(cell(record, 'Marka')),
      hasBrand,
      model: optionalString(cell(record, 'Model')),
      hasModel,
      quality: qualityCodeFromLabel(
        optionalString(cell(record, 'Kalite'))
      ),
      hasQuality: hasCell(record, 'Kalite'),
      appearance: appearanceCodeFromLabel(gorunum),
      hasAppearance: hasGorunum,
      color: renk,
      hasColor: hasRenk,
      description,
      hasDescriptionUpdate,
      rbmPrice: hasCell(record, 'Rmb', 'Rm', 'RMB')
        ? asNumber(cell(record, 'Rmb', 'Rm', 'RMB'), 0)
        : null,
      hasRmb: hasCell(record, 'Rmb', 'Rm', 'RMB'),
      costPrice: asNumber(cell(record, 'AlisFiyati', 'AlisFiyat'), 0),
      priceTl: priceUsd,
      priceUsd,
      priceUsd2,
      barcodeRaw: optionalString(cell(record, 'Barkod')),
      hasBarcodeColumn: hasCell(record, 'Barkod'),
      /** Bakiye = MERKEZ_DEPO stok adedi */
      merkezQty: asNumber(cell(record, 'Bakiye', 'MerkezDepo'), 0),
      hasGelenAdet: asNumber(cell(record, 'GelenAdet', 'GelenAdedi'), 0) !== 0,
      gelenAdet: asNumber(cell(record, 'GelenAdet', 'GelenAdedi'), 0),
      cinIadeQty: asNumber(cell(record, 'CinIadeDepo'), 0),
      hasCinIadeColumn: hasCell(record, 'CinIadeDepo'),
    });
  }

  /*
   * StokKodu boş satırlar için kod çözümü — kayıtları işlemeye başlamadan önce
   * tek sorguda yapılır:
   *   · Id mevcut bir ürünü gösteriyor ve o ürünün kodu doluysa → o kod kullanılır
   *     (kullanıcı Excel'de kodu silmişse mevcut kod korunur, tam senkron
   *     ürünü yanlışlıkla silmez).
   *   · Id mevcut ama veritabanındaki kod da boşsa → yeni kod üretilir ve
   *     doğrudan o kayda yazılır (yeni ürün oluşturulmaz).
   *   · Id yoksa → yeni ürün, yeni kod.
   */
  let autoSkuAssigned = 0;

  /*
   * EŞLEŞTİRME SIRASI — Excel'deki `Id` sütunu BİRİNCİL anahtardır.
   *
   *   1. Id sütunu doluysa ve o kayıt varsa  -> o ürün güncellenir
   *   2. Id yoksa/eşleşmiyorsa               -> StokKodu ile eşleştirilir
   *   3. İkisi de tutmuyorsa                 -> yeni ürün
   *
   * Neden Id önce: stok kodları yeniden üretilebiliyor. Kod eşleştirmesi
   * birincil olsaydı, kodlar değiştikten sonra elindeki eski Excel dosyaları
   * kullanılamaz hâle gelir, sistem 5278 ürünün hepsini "yeni ürün" sanıp
   * ikinci kez eklerdi. Id hiç değişmediği için eski dosyalar çalışmaya
   * devam eder.
   *
   * Id ile eşleşen satırda Excel'deki StokKodu YOK SAYILIR; veritabanındaki
   * kod geçerli kalır. Kodları artık sistem üretiyor, Excel değil.
   */
  const idCandidates = [
    ...new Set(
      parsedRows
        .map((row) => row.excelId)
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  const existingById =
    idCandidates.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: idCandidates } },
          select: { id: true, sku: true },
        })
      : [];
  const skuById = new Map(existingById.map((product) => [product.id, product.sku]));

  for (const row of parsedRows) {
    const dbSku = skuById.get(row.excelId)?.trim();

    if (skuById.has(row.excelId)) {
      // Id ile eşleşti: veritabanındaki kod geçerli
      row.forcedExistingId = row.excelId;
      if (dbSku) {
        row.sku = dbSku;
      } else {
        // Kaydın kodu boşmuş — şimdi doldurulur
        row.sku = generateSku();
        row.autoSku = true;
        autoSkuAssigned += 1;
      }
      continue;
    }

    // Id tutmadı: StokKodu ile eşleşecek. Kod da boşsa yeni kod üretilir.
    if (!row.sku) {
      row.sku = generateSku();
      row.autoSku = true;
      autoSkuAssigned += 1;
    }
  }

  const BATCH_SIZE = 50;
  const TX_TIMEOUT_MS = 120_000;

  const importRow = async (
    tx: Prisma.TransactionClient,
    item: ParsedRow,
    existingBySku: Map<string, number>
  ) => {
    const existingId = item.forcedExistingId ?? existingBySku.get(item.sku);
    let categoryId: number | null = null;
    if (item.hasCategory && item.categoryName) {
      categoryId = await findOrCreateCategory(
        tx,
        item.categoryName,
        categoryCache,
        categoriesCreated
      );
    } else if (item.hasCategory) {
      categoryId = null;
    } else if (existingId) {
      const existingProduct = await tx.product.findUnique({
        where: { id: existingId },
        select: { categoryId: true },
      });
      categoryId = existingProduct?.categoryId ?? null;
    }

    let brandModelId: number | null = null;
    if (item.hasBrand && item.brand) {
      await findOrCreateBrandModel(
        tx,
        item.brand,
        'MARKA',
        categoryId,
        brandModelCache,
        brandModelsCreated
      );
    }
    if (item.hasModel && item.model) {
      brandModelId = await findOrCreateBrandModel(
        tx,
        item.model,
        'MODEL',
        categoryId,
        brandModelCache,
        brandModelsCreated
      );
    } else if (item.hasModel) {
      brandModelId = null;
    }

    // Excel'de sutun varsa her zaman yaz (Marka/Model/Kategori bos gelse bile)
    const categoryUpdate = item.hasCategory ? { categoryId } : {};

    const detailUpdate = {
      ...(item.hasBrand ? { brand: item.brand } : {}),
      ...(item.hasModel ? { model: item.model, brandModelId } : {}),
      ...(item.hasQuality ? { quality: item.quality } : {}),
      ...(item.hasAppearance ? { appearance: item.appearance } : {}),
      ...(item.hasColor ? { color: item.color } : {}),
      ...(item.hasDescriptionUpdate
        ? { description: item.description || null }
        : {}),
      ...(item.hasRmb ? { rbmPrice: item.rbmPrice ?? 0 } : {}),
    };

    const barcodeUpdate = item.hasBarcodeColumn
      ? { barcode: item.barcodeRaw }
      : {};

    const product = existingId
      ? await tx.product.update({
          where: { id: existingId },
          data: {
            // Kodsuz kayda otomatik kod yazılır
            ...(item.forcedExistingId ? { sku: item.sku } : {}),
            name: item.name,
            costPrice: item.costPrice,
            priceTl: item.priceTl,
            priceUsd: item.priceUsd,
            priceUsd2: item.priceUsd2,
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
            priceUsd2: item.priceUsd2,
            ...categoryUpdate,
            ...detailUpdate,
            ...barcodeUpdate,
          },
        });

    existingBySku.set(item.sku, product.id);
    /*
     * GelenAdet sutunu doluysa Bakiye YOK SAYILIR ve adet mevcut stoga
     * EKLENIR. Bos ise eski davranis surer: Bakiye stok adedini belirler.
     */
    if (item.hasGelenAdet) {
      await addToStock(tx, product.id, merkezId, item.gelenAdet);
    } else {
      await upsertStock(tx, product.id, merkezId, item.merkezQty);
    }
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

  if (autoSkuAssigned > 0) {
    errors.push(
      `${autoSkuAssigned} satirda StokKodu bos oldugu icin otomatik stok kodu atandi.`
    );
  }

  /*
   * SILME YOK.
   *
   * Eskiden "tam senkron" calisiyordu: Excel'de olmayan urunler faturasi
   * yoksa siliniyor, faturasi varsa stogu sifirlaniyordu. Musteri Excel'i
   * bosaltip yalnizca yeni gelenleri yazdiginda eski urunler kayboluyordu.
   *
   * Artik Excel yalnizca EKLER ve GUNCELLER. Bir urunu gercekten silmek
   * icin stok listesinden tek tek silinir — kasitsiz toplu silme olmaz.
   *
   * Sayaclar geriye donuk uyumluluk icin durur, her zaman 0'dir.
   */
  const deleted = 0;
  const stockZeroed = 0;

  // Urun alanlarindan tanim listesini senkronize et
  const synced = await syncBrandModelsFromProducts(prisma);

  return {
    created,
    updated,
    skipped,
    deleted,
    stockZeroed,
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
