import { foldSearchText } from './textSearch.js';

/**
 * Muadil (uyumlu) ürün eşleştirmesi.
 *
 * Mobil parça sektöründe aynı parça birden çok modele uyar: iPhone 16 Pro
 * ekranı iPhone 17'ye de takılabilir. Kullanıcı bunu stok kartının "Uyumlu"
 * alanına model ADIYLA yazar ("iPhone 17"), stok koduyla değil — çünkü
 * bir modelin kalite/görünüm/renk kırılımıyla onlarca kartı olabilir ve
 * hepsini tek tek yazmak gerçekçi değil.
 *
 * Eşleşme SİMETRİKTİR: A'ya "B" yazmak, B seçildiğinde A'nın önerilmesi için
 * de yeterlidir. Böylece iki satırı birden doldurup güncel tutma yükü ortadan
 * kalkar; asıl kazanç, birinin unutulup muadilliğin sessizce yarım kalmasını
 * engellemesidir.
 *
 * Zincirleme YOKTUR: A~B ve B~C yazılmışsa A ile C muadil sayılmaz. Aksi
 * halde tek bir hatalı kayıt tüm ağı kirletir ve sebebini bulmak zorlaşır.
 */

/** Kelime sayılabilmesi için en az bu kadar harf gerekir */
const MIN_COMPAT_TOKEN_LEN = 2;

/** Parça tipi karşılaştırmasında ayırt ediciliği olmayan kelimeler */
const GENERIC_NAME_WORDS = new Set(['ile', 've', 'için', 'icin']);

export type CompatibilityCandidate = {
  name: string;
  model: string | null;
  compatibleWith: string | null;
};

/**
 * "Uyumlu" hücresini düzenli bir listeye çevirir.
 *
 * Kullanıcı virgül, noktalı virgül, eğik çizgi, dikey çizgi ya da alt satır
 * kullanabilir; hepsi aynı ayraç sayılır. Tekrarlar (büyük/küçük harf farkı
 * dahil) atılır, sonuç her zaman ", " ile yazılır — böylece Excel'e geri
 * indiğinde tek bir yazım biçimi görünür.
 */
export function normalizeCompatibleList(
  value: string | null | undefined
): string | null {
  if (!value?.trim()) return null;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of value.split(/[,;/\n|]+/)) {
    const part = raw.trim().replace(/\s+/g, ' ');
    if (!part) continue;
    /*
     * Tekrar anahtari KATLANMIS metindir. toLocaleLowerCase('tr-TR')
     * "IPHONE 17" -> "ıphone 17" (noktasiz i) uretip "iPhone 17" ile ayni
     * saymiyordu; kullanicinin iki yazimi da listede kaliyordu.
     */
    const key = foldSearchText(part);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Normalize edilmiş listeyi tek tek adlara ayırır */
export function parseCompatibleList(value: string | null | undefined): string[] {
  const normalized = normalizeCompatibleList(value);
  if (!normalized) return [];
  return normalized
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Ad içindeki anlamlı kelimeler — katlanmış, kısa ve dolgu kelimeler atılmış */
export function compatWords(value: string | null | undefined): string[] {
  return foldSearchText(value)
    .split(/[^a-z0-9]+/)
    .filter(
      (word) => word.length >= MIN_COMPAT_TOKEN_LEN && !GENERIC_NAME_WORDS.has(word)
    );
}

/**
 * Aday gerçekten kaynağın muadili mi?
 *
 * Veritabanı LIKE'ı yalnızca kaba bir ön eleme yapar (Türkçe harf katlaması
 * SQL tarafında yok). Son karar burada, katlanmış metin üzerinde verilir.
 *
 * İki yol vardır:
 *   İLERİ  Kaynağın Uyumlu listesindeki ad, adayın Model alanında ya da
 *          adında geçiyorsa. Model alanı boş olan eski kartlar da böylece
 *          yakalanır — parça tipi ve model adı zaten ürün adının içinde.
 *   GERİ   Adayın Uyumlu listesinde kaynağın Model adı geçiyorsa. Simetriyi
 *          bu yol sağlar; çalışması için kaynağın Model alanı dolu olmalıdır.
 */
export function isCompatibleMatch(
  sourceNames: string[],
  sourceModelFolded: string,
  candidate: CompatibilityCandidate
): boolean {
  const candidateModel = foldSearchText(candidate.model);
  const candidateName = foldSearchText(candidate.name);

  for (const rawName of sourceNames) {
    const folded = foldSearchText(rawName);
    if (!folded) continue;
    if (candidateModel && candidateModel.includes(folded)) return true;
    if (candidateName.includes(folded)) return true;
  }

  if (sourceModelFolded) {
    for (const rawName of parseCompatibleList(candidate.compatibleWith)) {
      const folded = foldSearchText(rawName);
      if (folded && sourceModelFolded.includes(folded)) return true;
    }
  }

  return false;
}

/**
 * Kaynakla adayın ortak kelime sayısı — aynı PARÇA TİPİ olma göstergesi.
 *
 * Veride parça tipini tutan bir alan yok (kategori tek: "iPhone Yedek
 * Parça"), tip ürün adının içinde geçiyor: "... ARKA KAMERA", "... LCD".
 * Bu yüzden "16 PRO EKRAN" için "17 EKRAN" üste, "17 ARKA KAPAK" alta düşer.
 *
 * Düşük puanlı adaylar ELENMEZ, yalnızca aşağı iner: yanlış öneriyi
 * görmezden gelmek bir bakış, doğru öneriyi saklamak bir satış kaybıdır.
 */
export function sharedWordCount(
  sourceWords: Set<string>,
  candidateName: string
): number {
  let shared = 0;
  for (const word of new Set(compatWords(candidateName))) {
    if (sourceWords.has(word)) shared += 1;
  }
  return shared;
}
