/**
 * PROVA ORTAMINI SIFIRLAR — hareket geçmişini siler, kartları korur.
 *
 * Neden: FIFO stok katmanlarına geçerken eski faturaların maliyeti göç
 * sırasında yaklaşık değerlerle dolduruluyor (geçmiş alış fiyatları tek
 * tek tutulmuyordu). Provada bu yaklaşık değerlerle test etmek yanıltır;
 * temiz bir başlangıç gerekiyor.
 *
 * SİLİNİR
 *   Fatura ve kalemleri (ALIS / SATIS / IADE)
 *   Kasa ve cari hareketleri (Transaction)
 *   Stok katmanları (StockLot) — mevcut stoktan yeniden üretilir
 *   Cari bakiyeler ve kasa bakiyeleri sıfırlanır
 *
 * KORUNUR
 *   Ürün kartları, müşteriler, kategoriler, marka/modeller
 *   Depolar, kasalar, kullanıcılar
 *   MEVCUT STOK MİKTARLARI (ProductStock) — elde ne varsa kalır
 *
 * Kullanım (sunucuda, prova pod'unun içinde):
 *   npx tsx src/scripts/provaSifirla.ts --uygula
 *
 * Parametresiz çalıştırılırsa yalnızca ne silineceğini RAPORLAR.
 */
import { prisma } from '../lib/prisma.js';

/**
 * Bu betiğin çalışmasına izin verilen ortamlar.
 *
 * Canlı müşteri verisini silmek geri alınamaz; bu yüzden tenant adı
 * beyaz listede değilse betik hiç başlamaz. Listeye "shenzhen" (canlı)
 * ASLA eklenmemeli.
 */
const IZINLI_ORTAMLAR = ['shenzhen-test', 'demo', 'local', 'test'];

async function main() {
  const uygula = process.argv.includes('--uygula');
  const tenant = (process.env.TENANT_ID ?? 'local').trim();

  console.log(`Ortam: ${tenant}`);

  if (!IZINLI_ORTAMLAR.includes(tenant)) {
    console.error('');
    console.error('DURDURULDU: bu ortamda çalıştırılamaz.');
    console.error(`  TENANT_ID = "${tenant}"`);
    console.error(`  İzinli    : ${IZINLI_ORTAMLAR.join(', ')}`);
    console.error('');
    console.error('Bu betik hareket geçmişini SİLER. Canlı ortamda çalıştırılamaz.');
    process.exit(1);
  }

  const [faturaSayisi, kalemSayisi, hareketSayisi, katmanSayisi, stokSayisi] =
    await Promise.all([
      prisma.invoice.count(),
      prisma.invoiceItem.count(),
      prisma.transaction.count(),
      prisma.stockLot.count(),
      prisma.productStock.count({ where: { quantity: { gt: 0 } } }),
    ]);

  console.log('');
  console.log('Silinecek:');
  console.log(`  ${faturaSayisi} fatura, ${kalemSayisi} kalem`);
  console.log(`  ${hareketSayisi} kasa/cari hareketi`);
  console.log(`  ${katmanSayisi} stok katmanı  (mevcut stoktan yeniden üretilecek)`);
  console.log('');
  console.log('Korunacak:');
  console.log(`  ${stokSayisi} üründe mevcut stok miktarı`);
  console.log('  ürün kartları, müşteriler, kategoriler, kasalar');
  console.log('');

  if (!uygula) {
    console.log('Bu bir ÖNİZLEME. Uygulamak için: --uygula');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Sıra önemli: kalemler faturalara, katmanlar kalemlere bağlı
    await tx.stockLot.deleteMany({});
    await tx.invoiceItem.deleteMany({});
    await tx.invoice.deleteMany({});
    await tx.transaction.deleteMany({});

    await tx.customer.updateMany({ data: { balance: 0 } });
    await tx.safe.updateMany({ data: { balance: 0 } });

    /*
     * Elde kalan stok için yeniden açılış katmanı üret: ürünün kendi
     * varsayılan maliyetiyle. Bundan sonraki her alış kendi katmanını
     * açacak.
     */
    const stoklar = await tx.productStock.findMany({
      where: { quantity: { gt: 0 } },
      include: { product: { select: { costPrice: true } } },
    });

    for (const stok of stoklar) {
      await tx.stockLot.create({
        data: {
          productId: stok.productId,
          branchId: stok.branchId,
          quantity: stok.quantity,
          unitCost: stok.product.costPrice,
          isOpening: true,
        },
      });
    }

    console.log(`${stoklar.length} ürün için açılış katmanı üretildi.`);
  });

  console.log('');
  console.log('Tamam. Prova ortamı temiz bir başlangıçta.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (hata) => {
    console.error(hata);
    await prisma.$disconnect();
    process.exit(1);
  });
