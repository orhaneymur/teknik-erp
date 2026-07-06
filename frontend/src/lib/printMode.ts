/**
 * Tek yazdırma akışı — kullanıcı yazdırma diyaloğunda PDF veya fiş yazıcısını seçer.
 * Dar sayfa (termal) → .receipt-slip, geniş sayfa (A4/PDF) → .print-pdf-doc (index.css).
 */
export function printDocument() {
  window.print();
}
