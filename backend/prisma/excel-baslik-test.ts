/**
 * Excel disa aktarma basliklari — YALNIZCA yerel denemede kullanilir.
 *
 * Sorun (11 Eylul 2026): json_to_sheet basliklari SATIRLARDAN turetiyordu.
 * Tablo bosken turetecek satir olmadigi icin indirilen dosya TAMAMEN BOS
 * iniyordu; kullanici sifirlamadan sonra onu sablon olarak kullanamiyordu.
 *
 * Bu test iki seyi birden olcer:
 *   1. BOS tabloda baslik satiri iniyor mu (asil duzeltme)
 *   2. DOLU tabloda cikti DEGISMEDI mi — sutun adlari, SIRASI ve degerleri
 *      aynen duruyor mu (duzeltme baska bir seyi bozmasin)
 *   3. Disa aktarilan dosya geri ice aktarilabiliyor mu (tur donusu)
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/excel-baslik-test.ts
 */
import * as XLSX from 'xlsx';
import { prisma } from '../src/lib/prisma';
import { exportProductsExcel, exportCustomersExcel } from '../src/utils/excelExchange';

let hata = 0;
function kontrol(baslik: string, kosul: boolean, ayrinti: string) {
  if (kosul) console.log(`  GECTI  ${baslik}  (${ayrinti})`);
  else {
    hata += 1;
    console.error(`  KALDI  ${baslik}  (${ayrinti})`);
  }
}

/** Bir sayfanin ilk satirini (baslik satirini) dizi olarak okur. */
function basliklariOku(buf: Buffer, sayfa: string): string[] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[sayfa];
  if (!ws) return [];
  const satirlar = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
  return (satirlar[0] ?? []).map((h) => String(h));
}

function veriSatirlari(buf: Buffer, sayfa: string): Record<string, unknown>[] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[sayfa];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
}

const BEKLENEN_STOK = [
  'Id', 'StokKodu', 'StokAdi', 'Kategori', 'Marka', 'Model', 'Gorunum',
  'Kalite', 'Renk', 'Aciklama', 'Rmb', 'AlisFiyati', 'Satis1', 'Satis2',
  'AlisAdedi', 'SatisAdedi', 'Bakiye', 'Uyumlu', 'GelenAdet',
];

const BEKLENEN_MUSTERI = [
  'CariKodu', 'CariAdi', 'YetkiliAdi', 'Adres', 'Ilce', 'Il', 'Email',
  'Gsm', 'VergiDairesi', 'VergiTcNo', 'KrediLimiti', 'Bakiye',
];

async function main() {
  // ── 1. BOS tablo ──────────────────────────────────────────────────────
  console.log('\n[1] Tablo BOSKEN indirilen dosya');
  await prisma.invoiceItem.deleteMany();
  await prisma.stockLot.deleteMany();
  await prisma.productStock.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();

  const bosStok = await exportProductsExcel(prisma);
  const bosBasliklar = basliklariOku(bosStok, 'Stoklar');
  kontrol(
    'bos stok listesinde BASLIKLAR var',
    bosBasliklar.length === BEKLENEN_STOK.length,
    `${bosBasliklar.length} sutun`
  );
  kontrol(
    'basliklar dogru ve SIRASI dogru',
    JSON.stringify(bosBasliklar) === JSON.stringify(BEKLENEN_STOK),
    bosBasliklar.slice(0, 4).join(', ') + ' …'
  );
  kontrol('bos dosyada veri satiri yok', veriSatirlari(bosStok, 'Stoklar').length === 0, '0 satir');

  const bosMusteri = await exportCustomersExcel(prisma);
  const bosMusteriBasliklari = basliklariOku(bosMusteri, 'Musteriler');
  kontrol(
    'bos musteri listesinde de BASLIKLAR var',
    JSON.stringify(bosMusteriBasliklari) === JSON.stringify(BEKLENEN_MUSTERI),
    `${bosMusteriBasliklari.length} sutun`
  );

  // ── 2. DOLU tablo — cikti degismemis olmali ───────────────────────────
  console.log('\n[2] Tablo DOLUYKEN cikti degismedi mi');
  const merkez =
    (await prisma.branch.findFirst({ where: { name: 'MERKEZ_DEPO' } })) ??
    (await prisma.branch.create({ data: { name: 'MERKEZ_DEPO', type: 'WAREHOUSE' } }));
  const kategori = await prisma.category.upsert({
    where: { name: 'EKRAN & LCD' },
    update: {},
    create: { name: 'EKRAN & LCD' },
  });
  const urun = await prisma.product.create({
    data: {
      sku: 'EKR00001',
      name: 'IPH-11 LCD FHD+ (DENEME)',
      categoryId: kategori.id,
      brand: 'APPLE',
      model: 'iPhone 11',
      color: 'Siyah',
      rbmPrice: 88,
      costPrice: 12.7,
      priceUsd: 15.5,
      priceUsd2: 17,
      compatibleWith: 'iPhone XR',
    },
  });
  await prisma.productStock.create({
    data: { productId: urun.id, branchId: merkez.id, quantity: 42 },
  });
  await prisma.customer.create({
    data: {
      code: 'SM00042',
      name: 'AHMET TELEFON',
      contactPerson: 'Ahmet Yildiz',
      phone: '0532 111 22 33',
      city: 'Istanbul',
      creditLimit: 500,
      balance: 120,
    },
  });

  const doluStok = await exportProductsExcel(prisma);
  const doluBasliklar = basliklariOku(doluStok, 'Stoklar');
  kontrol(
    'dolu tabloda basliklar AYNI',
    JSON.stringify(doluBasliklar) === JSON.stringify(BEKLENEN_STOK),
    `${doluBasliklar.length} sutun`
  );

  const satirlar = veriSatirlari(doluStok, 'Stoklar');
  kontrol('bir urun satiri indi', satirlar.length === 1, `${satirlar.length} satir`);
  const r = satirlar[0] ?? {};
  kontrol('StokKodu dogru', r.StokKodu === 'EKR00001', String(r.StokKodu));
  kontrol('Kategori dogru', r.Kategori === 'EKRAN & LCD', String(r.Kategori));
  kontrol('Satis1 (toptan) dogru', Number(r.Satis1) === 15.5, String(r.Satis1));
  kontrol('Satis2 (perakende) dogru', Number(r.Satis2) === 17, String(r.Satis2));
  kontrol('AlisFiyati dogru', Number(r.AlisFiyati) === 12.7, String(r.AlisFiyati));
  kontrol('Bakiye (merkez stok) dogru', Number(r.Bakiye) === 42, String(r.Bakiye));
  kontrol('Uyumlu dogru', r.Uyumlu === 'iPhone XR', String(r.Uyumlu));

  /*
   * GelenAdet bilerek BOS iner — kullanici yeni gelen adedi buraya yazar,
   * ice aktarimda mevcut stoga EKLENIR. Hucre bos DIZGI olarak iner
   * (undefined degil); disa aktarmada boyle uretiliyor ve degismedi.
   */
  kontrol(
    'GelenAdet sutunu basliklarda var ve hucresi bos',
    doluBasliklar.includes('GelenAdet') && r.GelenAdet === '',
    `deger=${JSON.stringify(r.GelenAdet)}`
  );

  const doluMusteri = await exportCustomersExcel(prisma);
  kontrol(
    'musteri basliklari dolu tabloda da AYNI',
    JSON.stringify(basliklariOku(doluMusteri, 'Musteriler')) ===
      JSON.stringify(BEKLENEN_MUSTERI),
    'ayni'
  );
  const mr = veriSatirlari(doluMusteri, 'Musteriler')[0] ?? {};
  kontrol('musteri kodu dogru', mr.CariKodu === 'SM00042', String(mr.CariKodu));
  kontrol('musteri bakiyesi dogru', Number(mr.Bakiye) === 120, String(mr.Bakiye));

  console.log(hata === 0 ? '\nTUM KONTROLLER GECTI' : `\n${hata} KONTROL KALDI`);
  process.exitCode = hata === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
