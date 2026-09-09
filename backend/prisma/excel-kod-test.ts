/**
 * Excel yuklemesinin OKUNUR stok kodu urettigini dogrular.
 * YALNIZCA yerel denemede kullanilir.
 *
 * Senaryo Shenzhen'in Cumartesi yuklemesini birebir taklit eder:
 *   - bazi satirlarda eski sistemden gelen 7 haneli kod dolu
 *   - bazi satirlarda kod BOS  -> sistem uretecek
 *   - bir satirda elle yazilmis yeni bicim kod var (cakisma testi)
 *
 * Beklenen: uretilen kodlar EKR00001 tarzinda olur, dolu kodlara
 * dokunulmaz ve elle yazilmis EKR00007 ile cakisma olmaz.
 */
import * as XLSX from 'xlsx';
import { prisma } from '../src/lib/prisma';
import { importProductsExcel } from '../src/utils/excelExchange';

function excelUret(satirlar: Record<string, unknown>[]): Buffer {
  const sayfa = XLSX.utils.json_to_sheet(satirlar);
  const kitap = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(kitap, sayfa, 'Stoklar');
  return XLSX.write(kitap, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

async function durum(baslik: string) {
  const urunler = await prisma.product.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, sku: true, name: true, category: { select: { name: true } } },
  });
  console.log(`\n--- ${baslik} ---`);
  console.log(`  urun sayisi: ${urunler.length}`);
  for (const u of urunler) {
    console.log(
      `  ${String(u.id).padStart(3)}  ${u.sku.padEnd(12)}  ${(u.category?.name ?? '-').padEnd(12)}  ${u.name}`
    );
  }
}

const satir = (
  kod: string,
  ad: string,
  kategori: string,
  bakiye: number
) => ({
  StokKodu: kod,
  StokAdi: ad,
  Kategori: kategori,
  Marka: 'APPLE',
  Model: 'IPHONE 11',
  Gorunum: '',
  Kalite: '',
  Renk: '',
  Aciklama: '',
  Rmb: 0,
  AlisFiyati: 1,
  Satis1: 2,
  Satis2: 2.5,
  Bakiye: bakiye,
});

async function main() {
  // Depolar acilista backend tarafindan kuruluyor; testte elle kuruyoruz
  for (const ad of ['MERKEZ_DEPO', 'CIN_IADE_DEPO']) {
    const mevcut = await prisma.branch.findFirst({ where: { name: ad } });
    if (!mevcut) await prisma.branch.create({ data: { name: ad, type: 'WAREHOUSE' } });
  }

  const dosya = [
    satir('3013375', 'IPHONE 11 LCD CITASIZ BLACK', 'EKRAN & LCD', 5),
    satir('', 'IPHONE 11 LCD CITALI WHITE', 'EKRAN & LCD', 3),
    satir('', 'IPHONE 11 BATARYA', 'BATARYA', 8),
    satir('EKR00007', 'IPHONE 11 LCD SERVIS ORJINAL', 'EKRAN & LCD', 2),
    satir('', 'IPHONE 11 ON CAM', 'EKRAN & LCD', 1),
    satir('', 'IPHONE 11 BATARYA A KALITE', 'BATARYA', 4),
  ];

  console.log('\n>>> 1. YUKLEME — 3 satirda kod bos, 1 satirda elle EKR00007');
  const sonuc1 = await importProductsExcel(prisma, excelUret(dosya));
  console.log(`    olusturuldu: ${sonuc1.created}  guncellendi: ${sonuc1.updated}  atlandi: ${sonuc1.skipped}`);
  if (sonuc1.errors.length) console.log('    notlar:', sonuc1.errors);
  await durum('1. YUKLEME SONRASI');

  /*
   * Saglikli dongu: kullanici dosyayi SISTEMDEN indirip tekrar yukler.
   * Kodlar artik dolu oldugu icin mukerrer kart ACILMAMALI.
   */
  const indirilen = await prisma.product.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, sku: true, name: true, category: { select: { name: true } } },
  });
  const ikinciDosya = indirilen.map((u) =>
    satir(u.sku, u.name, u.category?.name ?? '', 10)
  );

  console.log('\n>>> 2. YUKLEME — sistemden inen dosya (kodlar dolu)');
  const sonuc2 = await importProductsExcel(prisma, excelUret(ikinciDosya));
  console.log(`    olusturuldu: ${sonuc2.created}  guncellendi: ${sonuc2.updated}  atlandi: ${sonuc2.skipped}`);
  await durum('2. YUKLEME SONRASI  (mukerrer OLMAMALI)');

  /*
   * Tehlikeli dongu: kullanici AYNI eski dosyayi (kodlar hala bos)
   * ikinci kez yukler. Bu durumda mukerrer kart acilir — kullaniciya
   * anlatilmasi gereken davranis budur.
   */
  console.log('\n>>> 3. YUKLEME — ILK dosya tekrar (kodlar hala bos)');
  const sonuc3 = await importProductsExcel(prisma, excelUret(dosya));
  console.log(`    olusturuldu: ${sonuc3.created}  guncellendi: ${sonuc3.updated}  atlandi: ${sonuc3.skipped}`);
  await durum('3. YUKLEME SONRASI  (mukerrer BEKLENIYOR)');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (hata) => {
    console.error(hata);
    await prisma.$disconnect();
    process.exit(1);
  });
