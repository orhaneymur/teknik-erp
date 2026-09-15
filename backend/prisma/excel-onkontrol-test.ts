/**
 * Excel on kontrolu — YALNIZCA yerel denemede kullanilir.
 *
 * 9 ve 11 Eylul 2026'daki olayi birebir kurar: sistemde urunler varken
 * Id ve StokKodu sutunlari BOS bir dosya yuklenmek isteniyor. On kontrol
 * bunu yuklemeden once yakalamali; sistemden indirilmis (Id dolu) dosyada
 * ise uyari vermemeli.
 *
 * Kontroller:
 *   1. Id/StokKodu bos, adlar mevcut -> hepsi "yeni acilacak" ve
 *      "adi mevcut" sayilir, ornekler dolu
 *   2. Sistemden indirilmis dosya (Id dolu) -> hepsi "guncellenecek", uyari yok
 *   3. Karisik dosya: 2 mevcut (Id ile), 1 gercekten yeni, 1 adi mevcut
 *   4. Dosya icinde ayni ad iki kez -> dosyaIciMukerrerAd = 1
 *   5. Ad karsilastirmasi buyuk/kucuk harf ve bosluga takilmiyor
 *   6. On kontrol veritabanina YAZMIYOR (urun sayisi degismedi)
 *   7. Gercek uc (/api/products/import/excel/kontrol) ayni sonucu veriyor
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/excel-onkontrol-test.ts
 */
import * as XLSX from 'xlsx';
import { prisma } from '../src/lib/prisma';
import { excelOnKontrol, importProductsExcel } from '../src/utils/excelExchange';

const API = process.env.TEST_API ?? 'http://127.0.0.1:3000';
const ADMIN_USER = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? 'test';

let hata = 0;
function kontrol(baslik: string, kosul: boolean, ayrinti: string) {
  if (kosul) console.log(`  GECTI  ${baslik}  (${ayrinti})`);
  else {
    hata += 1;
    console.error(`  KALDI  ${baslik}  (${ayrinti})`);
  }
}

function excelUret(satirlar: Record<string, unknown>[]): Buffer {
  const sayfa = XLSX.utils.json_to_sheet(satirlar);
  const kitap = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(kitap, sayfa, 'Stoklar');
  return XLSX.write(kitap, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

async function main() {
  for (const ad of ['MERKEZ_DEPO', 'CIN_IADE_DEPO']) {
    const mevcut = await prisma.branch.findFirst({ where: { name: ad } });
    if (!mevcut) await prisma.branch.create({ data: { name: ad, type: 'WAREHOUSE' } });
  }

  // Sistemde 3 urun var — musterinin ilk yuklemesi gibi (bos tabloya, kod bos)
  console.log('\n[kurulum] Bos tabloya 3 urun yukleniyor');
  const ilk = await importProductsExcel(
    prisma,
    excelUret([
      { StokAdi: 'IPH-11 LCD FHD+ (ALKINDUS)', Kategori: 'EKRAN & LCD', Satis1: 15, Bakiye: 10 },
      { StokAdi: 'IPH-12 PIL (2815mAh)', Kategori: 'BATARYA', Satis1: 8, Bakiye: 5 },
      { StokAdi: 'SM-A125 A12 ARKA KAPAK BLACK', Kategori: 'KASA & KAPAK', Satis1: 3, Bakiye: 20 },
    ])
  );
  const urunler = await prisma.product.findMany({ orderBy: { id: 'asc' } });
  kontrol('kurulum: 3 urun acildi', ilk.created === 3 && urunler.length === 3, `created=${ilk.created}`);
  const sayimOnce = urunler.length;

  // ── 1. 11 Eylul senaryosu: Id/StokKodu bos, adlar ayni ─────────────
  console.log('\n[1] Id ve StokKodu BOS, adlar mevcut (11 Eylul senaryosu)');
  const k1 = await excelOnKontrol(
    prisma,
    excelUret([
      { StokAdi: 'IPH-11 LCD FHD+ (ALKINDUS)', Kategori: 'EKRAN & LCD', Satis1: 15, Bakiye: 12 },
      { StokAdi: 'IPH-12 PIL (2815mAh)', Kategori: 'BATARYA', Satis1: 8, Bakiye: 5 },
      { StokAdi: 'SM-A125 A12 ARKA KAPAK BLACK', Kategori: 'KASA & KAPAK', Satis1: 3, Bakiye: 20 },
    ])
  );
  kontrol('3 satirin 3u yeni acilacak', k1.yeniAcilacak === 3 && k1.guncellenecek === 0, `yeni=${k1.yeniAcilacak} guncel=${k1.guncellenecek}`);
  kontrol('3unun de adi mevcut — UYARI', k1.adiMevcutOlanYeni === 3, `adiMevcut=${k1.adiMevcutOlanYeni}`);
  kontrol('ornekler dolu', k1.ornekler.length === 3 && k1.ornekler[0] === 'IPH-11 LCD FHD+ (ALKINDUS)', k1.ornekler.join(' · '));

  // ── 2. Sistemden indirilmis dosya: Id dolu ─────────────────────────
  console.log('\n[2] Sistemden indirilmis dosya (Id ve StokKodu dolu)');
  const k2 = await excelOnKontrol(
    prisma,
    excelUret(urunler.map((u) => ({ Id: u.id, StokKodu: u.sku, StokAdi: u.name, Satis1: 9 })))
  );
  kontrol('hepsi guncellenecek, uyari yok', k2.guncellenecek === 3 && k2.yeniAcilacak === 0 && k2.adiMevcutOlanYeni === 0, `guncel=${k2.guncellenecek} yeni=${k2.yeniAcilacak} adiMevcut=${k2.adiMevcutOlanYeni}`);

  // Yalnizca StokKodu dolu (Id silinmis) — kod ile eslesmeli
  const k2b = await excelOnKontrol(
    prisma,
    excelUret(urunler.map((u) => ({ StokKodu: u.sku, StokAdi: u.name })))
  );
  kontrol('Id silinmis ama StokKodu dolu -> yine eslesiyor', k2b.guncellenecek === 3 && k2b.adiMevcutOlanYeni === 0, `guncel=${k2b.guncellenecek}`);

  // ── 3. Karisik dosya ───────────────────────────────────────────────
  console.log('\n[3] Karisik: 2 mevcut (Id), 1 gercekten yeni, 1 adi mevcut ama kodsuz');
  const k3 = await excelOnKontrol(
    prisma,
    excelUret([
      { Id: urunler[0].id, StokAdi: urunler[0].name },
      { Id: urunler[1].id, StokAdi: urunler[1].name },
      { StokAdi: 'REDMI NOTE 13 LCD (YENI URUN)', Kategori: 'EKRAN & LCD' },
      { StokAdi: 'SM-A125 A12 ARKA KAPAK BLACK', Kategori: 'KASA & KAPAK' },
    ])
  );
  kontrol('2 guncellenecek, 2 yeni, 1 adi mevcut', k3.guncellenecek === 2 && k3.yeniAcilacak === 2 && k3.adiMevcutOlanYeni === 1, `guncel=${k3.guncellenecek} yeni=${k3.yeniAcilacak} adiMevcut=${k3.adiMevcutOlanYeni}`);
  kontrol('ornek dogru satiri gosteriyor', k3.ornekler.length === 1 && k3.ornekler[0] === 'SM-A125 A12 ARKA KAPAK BLACK', k3.ornekler.join(' · '));

  // ── 4. Dosya ici mukerrer ad ───────────────────────────────────────
  console.log('\n[4] Dosyanin icinde ayni ad iki kez');
  const k4 = await excelOnKontrol(
    prisma,
    excelUret([
      { StokAdi: 'TECNO SPARK 10 LCD HD+' },
      { StokAdi: 'TECNO SPARK 10 LCD HD+' },
      { StokAdi: 'TECNO SPARK 20 LCD HD+' },
    ])
  );
  kontrol('dosyaIciMukerrerAd = 1', k4.dosyaIciMukerrerAd === 1, `mukerrer=${k4.dosyaIciMukerrerAd}`);
  kontrol('sistemde olmayan adlar uyari vermiyor', k4.adiMevcutOlanYeni === 0, `adiMevcut=${k4.adiMevcutOlanYeni}`);

  // ── 5. Buyuk/kucuk harf ve bosluk ──────────────────────────────────
  console.log('\n[5] Ad karsilastirmasi harf buyuklugune ve kenar bosluga takilmiyor');
  const k5 = await excelOnKontrol(
    prisma,
    excelUret([{ StokAdi: '  iph-12 pil (2815mAh) ' }])
  );
  kontrol('kucuk harfli, boslukli ad da yakalandi', k5.adiMevcutOlanYeni === 1, `adiMevcut=${k5.adiMevcutOlanYeni}`);

  // ── 6. Yazmiyor ────────────────────────────────────────────────────
  const sayimSonra = await prisma.product.count();
  kontrol('on kontrol veritabanina YAZMADI', sayimSonra === sayimOnce, `${sayimOnce} -> ${sayimSonra}`);

  // ── 7. Gercek uc ───────────────────────────────────────────────────
  console.log('\n[7] Gercek uc: POST /api/products/import/excel/kontrol');
  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');

  const form = new FormData();
  form.append(
    'file',
    new Blob([excelUret([{ StokAdi: 'IPH-11 LCD FHD+ (ALKINDUS)' }])]),
    'deneme.xlsx'
  );
  const ucRes = await fetch(`${API}/api/products/import/excel/kontrol`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uc = (await ucRes.json()) as { success: boolean; data?: { adiMevcutOlanYeni: number; yeniAcilacak: number } };
  kontrol('uc calisiyor ve ayni sonucu veriyor', uc.success && uc.data?.adiMevcutOlanYeni === 1 && uc.data?.yeniAcilacak === 1, JSON.stringify(uc.data));
  kontrol('uc da yazmadi', (await prisma.product.count()) === sayimOnce, `urun=${await prisma.product.count()}`);

  console.log(hata === 0 ? '\nHEPSI GECTI' : `\n${hata} KONTROL KALDI`);
  process.exitCode = hata === 0 ? 0 : 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
