/**
 * Satış / alış / iade ekranlarında ve fişte görünecek ürün adı.
 *
 * Stok kartı açılırken ad `[marka, model, yazılan ad]` birleştirmesiyle üretilir
 * (bkz. ProductCreate). Bu fonksiyon baştaki marka ve model ön ekini kaldırır;
 * geriye yalnızca kullanıcının "Stok adı" alanına yazdığı metin kalır.
 *
 * Marka/model/kategori bilgisi olduğu gibi durur — stok kartı, stok listesi ve
 * raporlarda tam ad görünmeye devam eder, yalnızca fiş akışında gizlenir.
 */

/** Türkçe duyarlı katlama — useF2ProductSearch ve backend foldSearchText ile aynı */
const TR_FOLD_MAP: Record<string, string> = {
  İ: 'i', I: 'i', ı: 'i',
  Ş: 's', ş: 's',
  Ğ: 'g', ğ: 'g',
  Ü: 'u', ü: 'u',
  Ö: 'o', ö: 'o',
  Ç: 'c', ç: 'c',
};

/** Karakter sayısı korunur (1:1 eşleme) — dizin hesapları bozulmasın */
function fold(value: string): string {
  let out = '';
  for (const char of value) {
    out += TR_FOLD_MAP[char] ?? char;
  }
  return out.toLowerCase();
}

/** Kelime sınırı — "Samsung" ön eki "Samsungtech" adını kesmesin */
const SEPARATOR = /^[\s\-–—/,.]/;

function stripPrefix(text: string, prefix: string): string {
  const folded = fold(text);
  const foldedPrefix = fold(prefix);
  if (!foldedPrefix || !folded.startsWith(foldedPrefix)) return text;

  const rest = text.slice(prefix.length);
  if (rest.length > 0 && !SEPARATOR.test(rest)) return text;
  return rest.replace(/^[\s\-–—/,.]+/, '');
}

export type NamedProduct = {
  name: string;
  brand?: string | null;
  model?: string | null;
};

export function productDisplayName(
  product: NamedProduct | null | undefined
): string {
  const raw = product?.name?.trim() ?? '';
  if (!raw) return raw;

  let rest = raw;
  for (const part of [product?.brand, product?.model]) {
    const token = part?.trim();
    if (token) rest = stripPrefix(rest, token);
  }

  // Ad tamamen marka+modelden ibaretse boş satır göstermek yerine tam adı koru
  return rest.trim() || raw;
}
