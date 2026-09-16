/**
 * Tek yazdırma akışı — kullanıcı yazdırma diyaloğunda PDF veya fiş yazıcısını seçer.
 * Dar sayfa (termal) → .receipt-slip, geniş sayfa (A4/PDF) → .print-pdf-doc (index.css).
 */
export function printDocument(dosyaAdi?: string) {
  /*
   * PDF olarak kaydedince tarayici dosya adini sekme basligindan alir.
   * Ekstrede "Musteri Ekstre - Shenzhen Market" cikiyordu; kullanici her
   * seferinde musteri adini elle yaziyordu (16 Eylul 2026). Yazdirma
   * suresince baslik gecici olarak istenen ada cevrilir, sonra geri alinir.
   */
  if (!dosyaAdi) {
    window.print();
    return;
  }
  const eski = document.title;
  document.title = dosyaAdi;
  const geriAl = () => {
    document.title = eski;
    window.removeEventListener('afterprint', geriAl);
  };
  window.addEventListener('afterprint', geriAl);
  window.print();
  // afterprint bazi tarayicilarda gelmez; kisa sure sonra yine de geri al
  window.setTimeout(geriAl, 2000);
}

/**
 * Müşteriyle ilgili çıktının PDF dosya adı — müşteri isteği (17 Eylül 2026):
 * "bir müşteriyle ilgili bir şey yazdırıyorsam firmanın adı ve fatura
 * numarası yazsın". Ekstre için aynı kalıp 16 Eylül'de kurulmuştu.
 *
 *     ERSA ANKARA - Satış - 260916132625
 *     ERSA ANKARA - Tahsilat - TAH-0012
 *
 * Firma adı boşsa yalnızca tür ve numara; numara da yoksa undefined döner
 * ve tarayıcı sekme başlığını kullanır. Dosya adında geçersiz karakterler
 * (/ \ : * ? " < > |) tire olur.
 */
export function musteriDosyaAdi(
  firma: string | null | undefined,
  tur: string,
  no: string | null | undefined
): string | undefined {
  const temiz = (s: string) => s.replace(/[\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  const parcalar = [firma, tur, no].map((p) => (p ? temiz(String(p)) : '')).filter(Boolean);
  if (parcalar.length < 2) return undefined;
  return parcalar.join(' - ');
}
