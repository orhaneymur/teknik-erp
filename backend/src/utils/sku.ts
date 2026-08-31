/**
 * Stok kodu üretimi — kategoriye göre kısa kod.
 *
 * Biçim: 3 harf kategori öneki + 5 hane sıra numarası = 8 karakter
 *
 *   TEL00001   Telefon
 *   LCD00042   LCD Ekran
 *   GEN00007   kategorisiz ürün
 *
 * Önceki biçim `SK` + zaman damgası + sayaç + rastgele idi (~16 karakter,
 * örn. SKM2K4X9P001ABC). Çakışma olmasın diye böyle yazılmıştı ama okunmuyor,
 * elle yazılmıyor, telefonda söylenemiyordu. Artık sıra numarası
 * veritabanından geldiği için hem kısa hem tekil.
 *
 * Stok kodu ile barkod AYRI alanlardır; kodun değişmesi basılı barkodları
 * etkilemez.
 */

/** Kategorisi olmayan ürünler için önek */
export const DEFAULT_SKU_PREFIX = 'GEN';

/** Sıra numarası hane sayısı (8 - 3 harf = 5) */
const SEQUENCE_DIGITS = 5;

/** Yeni kod biçimi: 3 harf + 5 rakam */
export const SKU_PATTERN = /^[A-Z]{3}\d{5}$/;

/**
 * ESKİ otomatik üretilmiş kod biçimi: SK + zaman damgası + sayaç + rastgele.
 * Örn. SKMRN9SYQ1NNRN — 14-16 karakter.
 *
 * Yalnızca bunlar yeniden numaralandırılır. Elle girilmiş ya da eski
 * sistemden gelen anlamlı kodlara (ör. 7 haneli `3013044`) DOKUNULMAZ —
 * onlar kâğıtta, Excel'de ve müşteri listelerinde karşılığı olan kodlar.
 */
export const LEGACY_AUTO_SKU_PATTERN = /^SK[0-9A-Z]{9,}$/;

const TR_MAP: Record<string, string> = {
  Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
  ç: 'C', ğ: 'G', ı: 'I', ö: 'O', ş: 'S', ü: 'U',
};

/**
 * Kategori adından 3 harflik önek üretir.
 *
 * Türkçe harfler ASCII karşılığına çevrilir, harf olmayanlar atılır,
 * 3 harften kısaysa X ile tamamlanır.
 *
 *   "Telefon"      -> TEL
 *   "LCD Ekran"    -> LCD
 *   "Şarj Aleti"   -> SAR
 *   "5G"           -> GXX
 *   ""             -> GEN
 */
export function categoryPrefix(name: string | null | undefined): string {
  const raw = (name ?? '').trim();
  if (!raw) return DEFAULT_SKU_PREFIX;

  const ascii = raw
    .split('')
    .map((ch) => TR_MAP[ch] ?? ch)
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

  if (!ascii) return DEFAULT_SKU_PREFIX;
  return ascii.slice(0, 3).padEnd(3, 'X');
}

/**
 * Aynı öneke düşen kategorileri ayrıştırır.
 *
 * "Ekran" ve "Ekipman" ikisi de EKR/EKI olabilir; çakışan ikinci kategori
 * EK2, üçüncüsü EK3 olarak ayrılır. `used` daha önce dağıtılmış önekleri
 * tutar ve bu çağrıyla güncellenir.
 */
export function uniqueCategoryPrefix(
  name: string | null | undefined,
  used: Set<string>
): string {
  const base = categoryPrefix(name);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  // İlk iki harf sabit kalır, son karakter 2'den başlayarak rakam olur
  for (let n = 2; n <= 9; n += 1) {
    const candidate = `${base.slice(0, 2)}${n}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  // Dokuzdan fazla aynı önek: son karakteri harf turuna çevir
  for (let code = 65; code <= 90; code += 1) {
    const candidate = `${base.slice(0, 2)}${String.fromCharCode(code)}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  used.add(base);
  return base;
}

/** Önek + sıra numarasından kodu kurar: ('TEL', 42) -> 'TEL00042' */
export function buildSku(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}

/**
 * Verilen kod listesindeki en büyük sıra numarasını bulur.
 *
 * Yalnızca yeni biçime uyan kodlara bakar; eski biçimli (SK...) kodlar
 * hesaba katılmaz, böylece geçiş sırasında karışma olmaz.
 */
export function maxSequenceForPrefix(skus: string[], prefix: string): number {
  let max = 0;
  for (const sku of skus) {
    const trimmed = sku?.trim();
    if (!trimmed || !SKU_PATTERN.test(trimmed)) continue;
    if (!trimmed.startsWith(prefix)) continue;
    const seq = Number(trimmed.slice(3));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return max;
}

/** Kod arayabilen en dar veritabanı arayüzü (test edilebilirlik için) */
type SkuLookup = {
  product: {
    findMany: (args: {
      where: { sku: { startsWith: string } };
      select: { sku: true };
    }) => Promise<Array<{ sku: string }>>;
  };
};

/**
 * Verilen kategori için sıradaki kodu üretir.
 *
 * Aynı önekteki en büyük numarayı bulup bir artırır. Eşzamanlı iki kayıt
 * aynı numarayı alırsa veritabanındaki tekillik kısıtı hatayı yakalar.
 */
export async function nextSkuForCategory(
  db: SkuLookup,
  categoryName: string | null | undefined
): Promise<string> {
  const prefix = categoryPrefix(categoryName);
  const rows = await db.product.findMany({
    where: { sku: { startsWith: prefix } },
    select: { sku: true },
  });
  const next = maxSequenceForPrefix(rows.map((row) => row.sku), prefix) + 1;
  return buildSku(prefix, next);
}

/**
 * Kategori bilgisine erişilemeyen yollarda kullanılan yedek üretici.
 * Yeni kayıtlarda `nextSkuForCategory` tercih edilmelidir.
 */
let fallbackSequence = 0;
export function generateSku(): string {
  fallbackSequence = (fallbackSequence + 1) % 46_656;
  const stamp = Date.now().toString(36).toUpperCase();
  const seq = fallbackSequence.toString(36).toUpperCase().padStart(3, '0');
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `SK${stamp}${seq}${random}`;
}

/** Girilen kod boşsa otomatik kod üretir */
export function resolveSku(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  return trimmed || generateSku();
}
