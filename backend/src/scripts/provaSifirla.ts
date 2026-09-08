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
 *   node dist/scripts/provaSifirla.js --uygula
 *
 * --stok-sifirla eklenirse stok adetleri de SIFIRLANIR. Güncel Excel'i
 * yükleyip sıfırdan başlamak için: dosyada olmayan ürünler eski
 * stoklarını korumasın diye.
 *
 * --urunleri-sil eklenirse ÜRÜN KARTLARI da silinir; Excel yüklemesi
 * kartları sıfırdan oluşturur. Bu durumda yüklenecek dosyadan Id
 * sütunu ÇIKARILMALI: o değerler silinmiş kartlara işaret eder,
 * eşleştirme StokKodu üzerinden yapılır.
 *
 * --tanimlari-sil ayrıca KATEGORİLERİ ve MARKA/MODEL kayıtlarını siler.
 * Üçü de Excel'deki Kategori, Marka ve Model sütunlarından yeniden
 * kurulur; boşta kalmış hatalı kategoriler de böylece temizlenir.
 * Tanımlar ekranından elle eklenmiş ve Excel'de karşılığı olmayan bir
 * kayıt varsa o da gider.
 *
 * Parametresiz çalıştırılırsa yalnızca ne yapılacağını RAPORLAR.
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
  const stokSifirla = process.argv.includes('--stok-sifirla');
  const urunleriSil = process.argv.includes('--urunleri-sil');
  const tanimlariSil = process.argv.includes('--tanimlari-sil');
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
  if (stokSifirla) {
    console.log(`  ${stokSayisi} üründeki stok adetleri de SIFIRLANACAK (--stok-sifirla)`);
    console.log('  Güncel Excel yüklenince stok yalnızca dosyadaki ürünlerde olacak.');
  }
  if (urunleriSil) {
    const urunSayisi = await prisma.product.count();
    console.log('');
    console.log(`  ${urunSayisi} URUN KARTI SILINECEK (--urunleri-sil)`);
    console.log('  Yuklenecek Excel dosyasindan Id sutunu CIKARILMALI.');
  }

  if (tanimlariSil) {
    const [kategoriSayisi, markaModelSayisi] = await Promise.all([
      prisma.category.count(),
      prisma.brandModel.count(),
    ]);
    console.log('');
    console.log(`  ${kategoriSayisi} kategori ve ${markaModelSayisi} marka/model SILINECEK (--tanimlari-sil)`);
    console.log('  Excel yuklemesi bunlari yeniden olusturur.');
  }

  console.log('');
  console.log('Korunacak:');
  if (!stokSifirla && !urunleriSil) {
    console.log(`  ${stokSayisi} üründe mevcut stok miktarı`);
  }
  console.log(
    urunleriSil
      ? '  müşteriler, kategoriler, marka/modeller, kasalar'
      : '  ürün kartları, müşteriler, kategoriler, kasalar'
  );
  console.log('');

  if (!uygula) {
    console.log('Bu bir ÖNİZLEME. Uygulamak için: --uygula');
    console.log('Stok adetleri de sıfırlansın : --uygula --stok-sifirla');
    console.log('Ürün kartları da silinsin    : --uygula --urunleri-sil');
    console.log('Kategori/marka da silinsin   : --uygula --urunleri-sil --tanimlari-sil');
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

    if (urunleriSil) {
      /*
       * Urun kartlari siliniyor: Excel yuklemesi kartlari sifirdan
       * olusturacak. ProductStock ve StockLot kayitlari sema geregi
       * (onDelete: Cascade) birlikte gider.
       *
       * Bu ancak fatura kalemleri silindikten SONRA yapilabilir —
       * yukarida siliniyorlar.
       */
      const sonuc = await tx.product.deleteMany({});
      console.log(`${sonuc.count} urun karti silindi.`);

      if (tanimlariSil) {
        /*
         * Kategoriler ve marka/modeller de siliniyor.
         *
         * Urunler silindigi icin ikisi de sahipsiz kaldi; Excel'deki
         * Kategori, Marka ve Model sutunlarindan yeniden kurulacaklar.
         * Bostakalmis hatali kategoriler de boylece temizlenir.
         *
         * Sira onemli: marka/model kayitlari kategoriye bagli.
         */
        const markaModel = await tx.brandModel.deleteMany({});
        const kategori = await tx.category.deleteMany({});
        console.log(
          `${markaModel.count} marka/model ve ${kategori.count} kategori silindi.`
        );
      }

      console.log('Excel yuklerken Id sutununu CIKARMAYI unutmayin.');
      return;
    }

    if (stokSifirla) {
      /*
       * Stok adetleri de sıfırlanıyor: güncel Excel yüklendiğinde
       * yalnızca dosyadaki ürünlerde stok olsun, dosyada olmayanlar eski
       * adetleriyle kalmasın. Katmanlar zaten silindi; Excel yüklemesi
       * kendi katmanlarını açacak.
       */
      const sonuc = await tx.productStock.updateMany({ data: { quantity: 0 } });
      console.log(`${sonuc.count} stok kaydı sıfırlandı. Katman üretilmedi.`);
      return;
    }

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
