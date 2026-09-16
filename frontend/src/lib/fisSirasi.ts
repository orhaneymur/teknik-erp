/**
 * Fiş kalem sırası — müşteri isteği (15 ve 17 Eylül 2026).
 *
 *   1. Kategori: EKR (ekran) en üstte, sonra BAT (batarya), sonra diğer
 *      kategoriler alfabetik, kategorisiz ürün en sonda
 *   2. Kategori içinde ad — DOĞAL sıra: IPH-8 < IPH-11 < IPH-12
 *      (düz alfabetik 11'i 8'in önüne koyar)
 *
 * Nerede geçerli:
 *   - Fiş / A4 / PDF çıktısı: HER ZAMAN bu sıra
 *   - Ekrandaki sepet: yeni fiş yazılırken EKLEME sırası (personel yeni
 *     satırı nerede göreceğini bilsin); kaydedildikten sonra ve listeden
 *     düzenlemeye açılınca bu sıra
 *
 * Sunucudaki F2 arama listesi aynı kuralı kullanır (`f2KategoriSirasi`,
 * backend/src/index.ts). Kural değişirse İKİ YER birlikte değişmeli.
 * Kategori öneki kategori ADINDAN türetilir (backend/src/utils/sku.ts
 * `categoryPrefix` ile aynı), stok kodundan değil — eski kodlu ürünler
 * (7 haneli vb.) böylece doğru kategoriye düşer.
 */

/** Sabit sıradaki kategoriler; genişletmek için buraya önek eklenir */
export const FIS_KATEGORI_ONCELIGI = ['EKR', 'BAT'];

const TR_MAP: Record<string, string> = {
  Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
  ç: 'C', ğ: 'G', ı: 'I', ö: 'O', ş: 'S', ü: 'U',
};

/** Kategori adından 3 harflik önek — backend `categoryPrefix` ile birebir */
export function kategoriOneki(ad: string | null | undefined): string {
  const raw = (ad ?? '').trim();
  if (!raw) return 'GEN';
  const ascii = raw
    .split('')
    .map((ch) => TR_MAP[ch] ?? ch)
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (!ascii) return 'GEN';
  return ascii.slice(0, 3).padEnd(3, 'X');
}

/**
 * Sıralama anahtarı: "0EKR", "1BAT" sabit sıradakiler; diğerleri "9" + ad
 * (alfabetik); kategorisiz "~~~" (her harften sonra).
 */
export function fisKategoriAnahtari(kategoriAdi: string | null | undefined): string {
  const ad = (kategoriAdi ?? '').trim();
  if (!ad) return '~~~';
  const onek = kategoriOneki(ad);
  const oncelik = FIS_KATEGORI_ONCELIGI.indexOf(onek);
  // Diğerleri ASCII'ye indirgenmiş küçük harfle alfabetik (backend
  // foldSearchText ile aynı sonuç)
  const duz = ad.split('').map((ch) => TR_MAP[ch] ?? ch).join('').toLowerCase();
  return oncelik >= 0 ? `${oncelik}${onek}` : `9${duz}`;
}

/**
 * Kalemleri fiş sırasına dizer. Girdiyi değiştirmez, yeni dizi döner.
 * Eşit anahtarlarda eklenme sırası korunur (Array.sort kararlı).
 */
export function fisKalemleriSirala<T>(
  kalemler: readonly T[],
  oku: (kalem: T) => { ad: string; kategori: string | null | undefined }
): T[] {
  return kalemler
    .map((kalem, sira) => {
      const { ad, kategori } = oku(kalem);
      return { kalem, sira, ad, anahtar: fisKategoriAnahtari(kategori) };
    })
    .sort((a, b) => {
      if (a.anahtar !== b.anahtar) return a.anahtar < b.anahtar ? -1 : 1;
      const adFarki = a.ad.localeCompare(b.ad, 'tr', { numeric: true });
      return adFarki !== 0 ? adFarki : a.sira - b.sira;
    })
    .map((x) => x.kalem);
}
