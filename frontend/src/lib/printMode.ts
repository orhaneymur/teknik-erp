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
