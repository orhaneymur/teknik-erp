/**
 * Excel yuklemesinin FIFO katmanlarini dogru esitledigini dogrular.
 * YALNIZCA yerel denemede kullanilir.
 *
 * Senaryo:
 *   baslangic      stok  1, katman 1 @ 1,00
 *   Excel Bakiye=50, AlisFiyati=1,50
 *                  stok 50, katman 1 @ 1,00 + 49 @ 1,50   (fark eklendi)
 *   Excel Bakiye=20
 *                  stok 20, katman 1 @ 1,00 + 19 @ 1,50   (fazlalik EN
 *                  YENI katmandan dusuldu, gercek eski alis korundu)
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

let hata = 0;
function kontrol(baslik: string, kosul: boolean, ayrinti: string) {
  if (kosul) console.log(`  GECTI  ${baslik}  (${ayrinti})`);
  else {
    hata += 1;
    console.error(`  KALDI  ${baslik}  (${ayrinti})`);
  }
}

async function durum(baslik: string) {
  const stok = await prisma.productStock.findFirst({
    where: { product: { sku: 'TEST-001' } },
    select: { quantity: true },
  });
  const lotlar = await prisma.stockLot.findMany({
    where: { product: { sku: 'TEST-001' }, quantity: { gt: 0 } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { quantity: true, unitCost: true },
  });
  const katmanToplam = lotlar.reduce((t, l) => t + l.quantity, 0);
  const deger = lotlar.reduce((t, l) => t + l.quantity * l.unitCost, 0);

  console.log(`\n--- ${baslik} ---`);
  console.log(`  stok           : ${stok?.quantity ?? 0}`);
  console.log(`  katman toplami : ${katmanToplam}   ${katmanToplam === (stok?.quantity ?? 0) ? '(UYUMLU)' : '*** AYRISMA ***'}`);
  console.log(`  katmanlar      : ${lotlar.map((l) => `${l.quantity} @ ${l.unitCost}`).join('  |  ') || '(yok)'}`);
  console.log(`  stok degeri    : ${deger.toFixed(2)} $`);
  return { stok: stok?.quantity ?? 0, katmanToplam, lotlar };
}

async function main() {
  // Bos veritabaninda kosar (npm test): depolari ve baslangic durumunu kur
  for (const ad of ['MERKEZ_DEPO', 'CIN_IADE_DEPO']) {
    const mevcut = await prisma.branch.findFirst({ where: { name: ad } });
    if (!mevcut) await prisma.branch.create({ data: { name: ad, type: 'WAREHOUSE' } });
  }
  const merkez = await prisma.branch.findFirstOrThrow({ where: { name: 'MERKEZ_DEPO' } });
  const urun = await prisma.product.upsert({
    where: { sku: 'TEST-001' },
    update: {},
    create: { sku: 'TEST-001', name: 'FIFO Deneme Urunu', costPrice: 1 },
  });
  await prisma.stockLot.deleteMany({ where: { productId: urun.id } });
  await prisma.productStock.upsert({
    where: { productId_branchId: { productId: urun.id, branchId: merkez.id } },
    update: { quantity: 1 },
    create: { productId: urun.id, branchId: merkez.id, quantity: 1 },
  });
  await prisma.stockLot.create({
    data: { productId: urun.id, branchId: merkez.id, quantity: 1, unitCost: 1, isOpening: true },
  });

  let d = await durum('BASLANGIC');
  kontrol('baslangic: stok 1, katman 1 @ 1,00', d.stok === 1 && d.katmanToplam === 1, `stok=${d.stok}`);

  const ortak = {
    StokKodu: 'TEST-001',
    StokAdi: 'FIFO Deneme Urunu',
    Kategori: 'TEST',
    Marka: 'TEST',
    Model: 'TEST',
    Gorunum: '',
    Kalite: '',
    Renk: '',
    Aciklama: '',
    Rmb: 0,
    Satis1: 2,
    Satis2: 2.5,
  };

  console.log('\n>>> Excel yukleniyor: Bakiye = 50, AlisFiyati = 1,50');
  await importProductsExcel(
    prisma,
    excelUret([{ ...ortak, AlisFiyati: 1.5, Bakiye: 50 }])
  );
  d = await durum('EXCEL SONRASI (stok artti)');
  kontrol('stok 50 ve katman toplami 50', d.stok === 50 && d.katmanToplam === 50, `stok=${d.stok} katman=${d.katmanToplam}`);
  kontrol('fark 49 adet 1,50 ile acildi', d.lotlar.length === 2 && d.lotlar[1].quantity === 49 && d.lotlar[1].unitCost === 1.5, d.lotlar.map((l) => `${l.quantity}@${l.unitCost}`).join(' + '));

  console.log('\n>>> Excel yukleniyor: Bakiye = 20');
  await importProductsExcel(
    prisma,
    excelUret([{ ...ortak, AlisFiyati: 1.5, Bakiye: 20 }])
  );
  d = await durum('EXCEL SONRASI (stok dustu)');
  kontrol('stok 20 ve katman toplami 20', d.stok === 20 && d.katmanToplam === 20, `stok=${d.stok} katman=${d.katmanToplam}`);
  kontrol('eski 1,00 katmani korundu, yeni katman 49 -> 19', d.lotlar[0]?.quantity === 1 && d.lotlar[1]?.quantity === 19, d.lotlar.map((l) => `${l.quantity}@${l.unitCost}`).join(' + '));

  console.log('\n>>> Excel yukleniyor: GelenAdet = 5 (mevcuda eklenir)');
  await importProductsExcel(
    prisma,
    excelUret([{ ...ortak, AlisFiyati: 2, Bakiye: 20, GelenAdet: 5 }])
  );
  d = await durum('EXCEL SONRASI (5 adet geldi)');
  kontrol('stok 25 ve katman toplami 25', d.stok === 25 && d.katmanToplam === 25, `stok=${d.stok} katman=${d.katmanToplam}`);
  kontrol('gelen 5 adet 2,00 ile ayri katman', d.lotlar.length === 3 && d.lotlar[2].quantity === 5 && d.lotlar[2].unitCost === 2, d.lotlar.map((l) => `${l.quantity}@${l.unitCost}`).join(' + '));

  console.log(hata === 0 ? '\nHEPSI GECTI' : `\n${hata} KONTROL KALDI`);
  process.exitCode = hata === 0 ? 0 : 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (hata) => {
    console.error(hata);
    await prisma.$disconnect();
    process.exit(1);
  });
