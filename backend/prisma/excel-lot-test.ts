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
}

async function main() {
  await durum('BASLANGIC');

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
  await durum('EXCEL SONRASI (stok artti)');

  console.log('\n>>> Excel yukleniyor: Bakiye = 20');
  await importProductsExcel(
    prisma,
    excelUret([{ ...ortak, AlisFiyati: 1.5, Bakiye: 20 }])
  );
  await durum('EXCEL SONRASI (stok dustu)');

  console.log('\n>>> Excel yukleniyor: GelenAdet = 5 (mevcuda eklenir)');
  await importProductsExcel(
    prisma,
    excelUret([{ ...ortak, AlisFiyati: 2, Bakiye: 20, GelenAdet: 5 }])
  );
  await durum('EXCEL SONRASI (5 adet geldi)');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (hata) => {
    console.error(hata);
    await prisma.$disconnect();
    process.exit(1);
  });
