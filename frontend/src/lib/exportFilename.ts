import { getTenantConfig } from './tenantConfig';

/**
 * İndirilen Excel dosyalarının adı.
 *
 * Eskiden her indirme aynı adla (`stoklar.xlsx`) iniyordu: aynı gün ikinci kez
 * indirince tarayıcı `stoklar (1).xlsx` yapıyor, hangisinin güncel olduğu
 * belirsizleşiyordu. Ayrıca birden çok müşteriye bakan biri (canlı / prova /
 * demo) dosyanın hangisinden geldiğini ayırt edemiyordu.
 *
 * Yeni biçim:
 *
 *     SM-stoklar-20260907-1432.xlsx
 *     └┬┘ └──┬──┘ └──┬───┘ └┬─┘
 *      │     │       │      └── saat-dakika
 *      │     │       └───────── yıl-ay-gün
 *      │     └───────────────── içerik
 *      └─────────────────────── firma kısaltması
 *
 * Tarih/saat KULLANICININ saatidir (tarayıcı yereli). Dosyayı indiren kişi
 * "saat 14:32'de indirdim" diye hatırlar; sunucu saati onun için bir şey
 * ifade etmez.
 *
 * Ad sıralanabilir olsun diye yıl-ay-gün sırası kullanıldı: klasörü ada göre
 * sıraladığında dosyalar kendiliğinden tarih sırasına girer.
 */

/** Firma adında ayırt ediciliği olmayan, kısaltmaya girmemesi gereken kelimeler */
const FILLER_WORDS = new Set([
  'ltd',
  'sti',
  'as',
  'ac',
  'san',
  'sanayi',
  'tic',
  'ticaret',
  've',
  'ith',
  'ihr',
]);

const TR_FOLD_MAP: Record<string, string> = {
  İ: 'I', I: 'I', ı: 'i',
  Ş: 'S', ş: 's',
  Ğ: 'G', ğ: 'g',
  Ü: 'U', ü: 'u',
  Ö: 'O', ö: 'o',
  Ç: 'C', ç: 'c',
};

function foldTurkish(value: string): string {
  let out = '';
  for (const char of value) {
    out += TR_FOLD_MAP[char] ?? char;
  }
  return out;
}

/**
 * Firma adından kısa etiket üretir.
 *
 *   "Shenzhen Market"  -> "SM"
 *   "TeknikERP Demo"   -> "TD"
 *   "Akgün"            -> "AKG"     (tek kelimede ilk üç harf)
 *   "Öz Şen Ltd. Şti." -> "OS"      (dolgu kelimeler atılır)
 *
 * Müşteri kendi etiketini seçmek isterse `tenant.fileTag` ile ezebilir;
 * bu fonksiyon yalnızca varsayılanı üretir.
 */
export function companyFileTag(companyName: string): string {
  const words = foldTurkish(companyName)
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !FILLER_WORDS.has(word.toLowerCase()));

  if (words.length === 0) return 'ERP';

  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }

  return words
    .slice(0, 4)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `20260907-1432` — ada göre sıralanınca tarih sırası veren damga */
export function fileTimestamp(now: Date = new Date()): string {
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `${date}-${time}`;
}

/**
 * `stoklar.xlsx` → `SM-stoklar-20260907-1432.xlsx`
 *
 * Uzantı korunur; damga uzantıdan ÖNCE eklenir, yoksa dosya Excel tarafından
 * tanınmaz.
 */
export function buildExportFilename(baseName: string, now: Date = new Date()): string {
  const dot = baseName.lastIndexOf('.');
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const extension = dot > 0 ? baseName.slice(dot) : '';

  const config = getTenantConfig();
  const tag = config.fileTag?.trim() || companyFileTag(config.companyName);

  return `${tag}-${stem}-${fileTimestamp(now)}${extension}`;
}
