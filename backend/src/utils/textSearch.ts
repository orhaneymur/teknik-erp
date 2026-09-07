/**
 * Türkçe duyarlı arama katlaması.
 *
 * `toLocaleLowerCase('tr-TR')` "INFİNİX" → "ınfinix" (noktasız ı) ürettiği için
 * kullanıcının yazdığı "infinix" ile eşleşmiyordu. Burada hem büyük/küçük hem de
 * aksan farkı ASCII tabanına indirgenir: İ/I/ı → i, Ş/ş → s, Ğ/ğ → g ...
 *
 * Aynı eşleme istemcide de var (`frontend/src/hooks/useF2ProductSearch.ts`);
 * ikisi aynı sonucu vermek zorunda, yoksa sunucudan gelen liste ile yazarken
 * uygulanan yerel süzme ayrışır.
 */
const TR_FOLD_MAP: Record<string, string> = {
  İ: 'i', I: 'i', ı: 'i',
  Ş: 's', ş: 's',
  Ğ: 'g', ğ: 'g',
  Ü: 'u', ü: 'u',
  Ö: 'o', ö: 'o',
  Ç: 'c', ç: 'c',
};

export function foldSearchText(value: string | null | undefined): string {
  if (!value) return '';
  let out = '';
  for (const char of value) {
    out += TR_FOLD_MAP[char] ?? char;
  }
  return out.toLowerCase();
}
