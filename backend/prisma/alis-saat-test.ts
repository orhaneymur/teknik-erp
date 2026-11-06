/**
 * Alış fişi saati testi — YALNIZCA yerel denemede kullanılır.
 *
 * Neyi doğruluyor:
 *
 *   1. Alış fişi kaydedilirken saat GERÇEK saat oluyor. Önceden
 *      `new Date("2026-11-06")` yazılıyordu; tarih-saatsiz metin UTC gece
 *      yarısı olarak çözülür ve Fatura Listesi'nde her alış fişi İstanbul
 *      saatiyle 03:00 görünürdü (canlıda 417 fişin tamamı).
 *
 *   2. Seçilen TARİH korunuyor. Geçmiş tarihli (geriye dönük) alış
 *      girildiğinde fiş o güne yazılmalı — saat o anki saat olsa bile.
 *
 * Çalıştırma (CLAUDE.md'deki yerel kap kurulduktan sonra):
 *   npx tsx prisma/alis-saat-test.ts
 *
 * Sunucu ayrı bir terminalde ayakta olmalı:
 *   DATABASE_URL=... JWT_SECRET=test ADMIN_PASSWORD=test npm start
 */
import { prisma } from '../src/lib/prisma';

const API = process.env.TEST_API ?? 'http://127.0.0.1:3000';
const ADMIN_USER = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? 'test';
const ISTANBUL = 'Europe/Istanbul';

let hata = 0;
function kontrol(baslik: string, kosul: boolean, ayrinti: string) {
  if (kosul) console.log(`  GECTI  ${baslik}  (${ayrinti})`);
  else {
    hata += 1;
    console.error(`  KALDI  ${baslik}  (${ayrinti})`);
  }
}

/** Kaydın İstanbul saatiyle tarihi — "2026-11-06" */
const istanbulTarih = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ISTANBUL }).format(d);

/** Kaydın İstanbul saatiyle saati — "10:54:42" */
const istanbulSaat = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: ISTANBUL,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);

/**
 * Kayıt UTC gece yarısına mı sabitlenmiş — HATANIN TA KENDİSİ.
 *
 * `new Date("2026-11-06")` UTC gece yarısı üretir; ekranda İstanbul
 * saatiyle 03:00 görünür. "Saat 00:00 değil" diye bakmak YETMEZ, çünkü
 * 03:00 da sıfır değildir — testin ilk hali bu yüzden bozuk kodda da
 * geçiyordu. Doğru ölçü: saklanan an UTC'de tam gece yarısı mı?
 */
const utcGeceYarisi = (d: Date) =>
  d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;

/** Gün içindeki saniye — iki saati karşılaştırmak için */
const saniye = (hhmmss: string) => {
  const [s, d, sn] = hhmmss.split(':').map(Number);
  return s * 3600 + d * 60 + sn;
};

async function main() {
  // ── Kurulum ───────────────────────────────────────────────────────────
  const merkez =
    (await prisma.branch.findFirst({ where: { name: 'MERKEZ_DEPO' } })) ??
    (await prisma.branch.create({ data: { name: 'MERKEZ_DEPO', type: 'WAREHOUSE' } }));
  if (!(await prisma.branch.findFirst({ where: { name: 'CIN_IADE_DEPO' } }))) {
    await prisma.branch.create({ data: { name: 'CIN_IADE_DEPO', type: 'WAREHOUSE' } });
  }
  const magaza =
    (await prisma.branch.findFirst({ where: { type: 'STORE' } })) ??
    (await prisma.branch.create({ data: { name: 'Merkez Sube', type: 'STORE' } }));
  const kasa =
    (await prisma.safe.findFirst({ where: { branchId: magaza.id } })) ??
    (await prisma.safe.create({
      data: { branchId: magaza.id, name: 'Merkez Kasa', currency: 'TRY', balance: 0 },
    }));

  const tedarikci = await prisma.customer.upsert({
    where: { code: 'AST001' },
    update: { balance: 0 },
    create: { code: 'AST001', name: 'Alis Saat Denemesi', balance: 0 },
  });

  const urun = await prisma.product.upsert({
    where: { sku: 'AST00001' },
    update: { costPrice: 0 },
    create: { sku: 'AST00001', name: 'SAAT DENEMESI LCD', costPrice: 0, priceUsd: 10 },
  });

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const alisKaydet = async (invoiceDate: string) => {
    const res = await fetch(`${API}/api/purchases/store`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        customerId: tedarikci.id,
        branchId: magaza.id,
        safeId: kasa.id,
        paymentMethod: 'Cari',
        exchangeRate: 1,
        invoiceDate,
        items: [{ productId: urun.id, quantity: 1, unitPrice: 5 }],
      }),
    });
    const govde = (await res.json()) as {
      success: boolean;
      data?: { id: number };
      message?: string;
    };
    if (!govde.success || !govde.data) throw new Error(`Alis basarisiz: ${govde.message}`);
    return prisma.invoice.findUniqueOrThrow({ where: { id: govde.data.id } });
  };

  // ── 1. BUGUN tarihli alis — saat gece yarisi OLMAMALI ─────────────────
  const bugun = istanbulTarih(new Date());
  console.log(`\n[1] Alis — tarih ${bugun} (bugun)`);
  const fis = await alisKaydet(bugun);
  const fisSaat = istanbulSaat(fis.createdAt);
  const simdiSaat = istanbulSaat(new Date());

  kontrol(
    'alis fisi UTC gece yarisina (ekranda 03:00) sabitlenmiyor',
    !utcGeceYarisi(fis.createdAt),
    `saat=${fisSaat} utc=${fis.createdAt.toISOString()}`
  );
  kontrol(
    'alis fisinin saati o anki saat',
    Math.abs(saniye(fisSaat) - saniye(simdiSaat)) < 120,
    `fis=${fisSaat} simdi=${simdiSaat}`
  );
  kontrol('alis fisi secilen gune yazildi', istanbulTarih(fis.createdAt) === bugun, `tarih=${istanbulTarih(fis.createdAt)}`);

  // ── 2. GECMIS tarihli alis — tarih korunur, saat gercek saat ──────────
  //
  // Geriye donuk fis girisi: kullanici gecen haftanin irsaliyesini bugun
  // isliyor. Fis O GUNE yazilmali ki ekstre ve raporlar dogru olsun.
  const gecmis = istanbulTarih(new Date(Date.now() - 7 * 24 * 3600 * 1000));
  console.log(`\n[2] Alis — tarih ${gecmis} (7 gun once)`);
  const eski = await alisKaydet(gecmis);
  const eskiSaat = istanbulSaat(eski.createdAt);

  kontrol('gecmis tarihli alis o gune yazildi', istanbulTarih(eski.createdAt) === gecmis, `tarih=${istanbulTarih(eski.createdAt)}`);
  kontrol(
    'gecmis tarihli alisin saati de gerceki',
    !utcGeceYarisi(eski.createdAt),
    `saat=${eskiSaat} utc=${eski.createdAt.toISOString()}`
  );

  // ── 3. Satis ucu ile ayni davraniyor mu ──────────────────────────────
  //
  // Hata zaten "alis ucu satistan ayri kod yazmis" olmasiydi; ikisi ayni
  // yardimciyi kullandigindan saat farki 2 dakikadan buyuk olmamali.
  console.log('\n[3] Satis fisiyle karsilastirma');
  const satisRes = await fetch(`${API}/api/sales/store`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: tedarikci.id,
      branchId: magaza.id,
      safeId: kasa.id,
      paymentMethod: 'Cari',
      exchangeRate: 1,
      invoiceDate: bugun,
      items: [{ productId: urun.id, quantity: 1, unitPrice: 10 }],
    }),
  });
  const satis = (await satisRes.json()) as { success: boolean; data?: { id: number } };
  if (satis.success && satis.data) {
    const satisFis = await prisma.invoice.findUniqueOrThrow({ where: { id: satis.data.id } });
    const satisSaat = istanbulSaat(satisFis.createdAt);
    kontrol(
      'alis ve satis ayni saat mantigini kullaniyor',
      Math.abs(saniye(fisSaat) - saniye(satisSaat)) < 120,
      `alis=${fisSaat} satis=${satisSaat}`
    );
  } else {
    console.log('  ATLANDI  satis ucu yanit vermedi (bu testin konusu degil)');
  }

  console.log(hata === 0 ? '\nTUMU GECTI' : `\n${hata} KONTROL KALDI`);
  await prisma.$disconnect();
  process.exit(hata === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
