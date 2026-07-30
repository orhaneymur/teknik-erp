/**
 * Stok kodu üretimi.
 *
 * Stok kodu olmadan ürün kartı kalmaması gerekir: kod boşsa Excel içe aktarımı
 * satırı atlıyor, tam senkron da o ürünü "Excel'de yok" sayıp siliyordu.
 * Bu yüzden kart oluşturma / Excel / toplu aktarım yollarının hepsi kod boş
 * geldiğinde buradan otomatik kod alır.
 */

/** Aynı milisaniyede üretilen kodların çakışmaması için süreç içi sayaç */
let sequence = 0;

export function generateSku(): string {
  sequence = (sequence + 1) % 46_656; // 36^3
  const stamp = Date.now().toString(36).toUpperCase();
  const seq = sequence.toString(36).toUpperCase().padStart(3, '0');
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `SK${stamp}${seq}${random}`;
}

/** Girilen kod boşsa otomatik kod üretir */
export function resolveSku(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  return trimmed || generateSku();
}
