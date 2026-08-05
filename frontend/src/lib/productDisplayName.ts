/**
 * Satış / alış / iade ekranlarında ve fişte görünecek ürün adı.
 *
 * Ad neyse o gösterilir — kırpma yapılmaz. Marka/model ada dahilse görünür,
 * değilse görünmez; ikisi de kullanıcının stok kartına yazdığı şeyin sonucudur.
 *
 * Eskiden buradaki mantık adın başındaki marka/model ön ekini siliyordu; çünkü
 * stok kartı oluştururken ad `[marka, model, yazılan ad]` şeklinde birleşiyordu.
 * ProductCreate artık adı yazıldığı gibi kaydediyor (marka/model kendi
 * kolonlarında), dolayısıyla kırpma eski kayıtlarda bilgi kaybına yol açıyordu.
 */

export type NamedProduct = {
  name: string;
};

export function productDisplayName(
  product: NamedProduct | null | undefined
): string {
  return product?.name?.trim() ?? '';
}
