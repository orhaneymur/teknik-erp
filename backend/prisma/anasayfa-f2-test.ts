/**
 * 15 Eylul 2026 musteri istekleri — YALNIZCA yerel denemede kullanilir.
 *
 *   A. F2 urun listesi: kategori sirasi (ekran, batarya, digerleri,
 *      kategorisiz) ve kategori icinde DOGAL alfabetik (IPH-8 < IPH-11)
 *   B. Anasayfa "Bugun satis": yerel gune (Europe/Istanbul) gore. Eskiden
 *      UTC gunle sayiliyordu ve bugunun satislari dunde gorunuyordu.
 *      Haftalik toplam: son 7 gun / onceki 7 gun.
 *
 * Kosucu TZ=Europe/Istanbul verir (canliyla ayni); bu betik de ayni TZ ile
 * kosar, tarihler yerel saatle kurulur.
 *
 * Calistirma:
 *   TZ=Europe/Istanbul DATABASE_URL=... npx tsx prisma/anasayfa-f2-test.ts
 */
import { prisma } from '../src/lib/prisma';

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
const yakin = (a: number, b: number, tol = 0.005) => Math.abs(a - b) < tol;

async function main() {
  // Git Bash TZ degiskenini Windows sureclerine gecirmez; olculecek olan
  // saat dilimi farkidir: Istanbul UTC+3, yaz saati yok -> offset -180
  kontrol('saat dilimi UTC+3 (Istanbul)', new Date().getTimezoneOffset() === -180, `offset=${new Date().getTimezoneOffset()} TZ=${process.env.TZ}`);

  const merkez =
    (await prisma.branch.findFirst({ where: { name: 'MERKEZ_DEPO' } })) ??
    (await prisma.branch.create({ data: { name: 'MERKEZ_DEPO', type: 'WAREHOUSE' } }));
  if (!(await prisma.branch.findFirst({ where: { name: 'CIN_IADE_DEPO' } }))) {
    await prisma.branch.create({ data: { name: 'CIN_IADE_DEPO', type: 'WAREHOUSE' } });
  }
  const magaza =
    (await prisma.branch.findFirst({ where: { type: 'STORE' } })) ??
    (await prisma.branch.create({ data: { name: 'Merkez Sube', type: 'STORE' } }));
  const kasa = await prisma.safe.create({
    data: { branchId: magaza.id, name: 'Dolar Kasasi', currency: 'USD', balance: 0 },
  });
  const musteri = await prisma.customer.create({
    data: { code: 'ANA001', name: 'Anasayfa Denemesi', balance: 0 },
  });

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { Authorization: `Bearer ${token}` };

  // ── A. F2 siralamasi ─────────────────────────────────────────────────
  console.log('\n[A] F2 listesi — kategori sirasi ve dogal alfabetik');
  const kat = async (name: string) => prisma.category.create({ data: { name } });
  const ekran = await kat('EKRAN & LCD');
  const pil = await kat('BATARYA');
  const kapak = await kat('KASA & KAPAK');
  const aksesuar = await kat('AKSESUAR');

  const urunler: Array<[string, string, number | null]> = [
    ['KAS00001', 'IPH-11 ARKA KAPAK BLACK', kapak.id],
    ['BAT00002', 'IPH-12 PIL (2815mAh)', pil.id],
    ['EKR00003', 'IPH-12 LCD HD+', ekran.id],
    ['GEN00004', 'IPH-11 KILIF SEFFAF', null],
    ['BAT00005', 'IPH-11 PIL (3110mAh)', pil.id],
    ['EKR00006', 'IPH-8 LCD HD+', ekran.id],
    ['EKR00007', 'IPH-11 LCD HD+', ekran.id],
    ['AKS00008', 'IPH-11 SARJ KABLOSU', aksesuar.id],
    ['BAT00009', 'IPH-8 PIL (1821mAh)', pil.id],
  ];
  for (const [sku, name, categoryId] of urunler) {
    await prisma.product.create({ data: { sku, name, categoryId, priceUsd: 10, priceUsd2: 12 } });
  }

  const ara = async (q: string) => {
    const r = await fetch(
      `${API}/api/sales/products?search=${encodeURIComponent(q)}&context=sales&exchangeRate=1&limit=50`,
      { headers: H }
    );
    const j = (await r.json()) as { data: Array<{ name: string }> };
    return j.data.map((p) => p.name);
  };

  const s1 = await ara('IPH-11');
  kontrol(
    '"IPH-11": ekran, batarya, kapak, aksesuar, kategorisiz',
    JSON.stringify(s1) ===
      JSON.stringify([
        'IPH-11 LCD HD+',
        'IPH-11 PIL (3110mAh)',
        'IPH-11 SARJ KABLOSU',
        'IPH-11 ARKA KAPAK BLACK',
        'IPH-11 KILIF SEFFAF',
      ]),
    s1.join(' | ')
  );

  const s2 = await ara('IPH');
  const ekranlar = s2.filter((n) => n.includes('LCD'));
  const piller = s2.filter((n) => n.includes('PIL'));
  kontrol(
    '"IPH": once BUTUN ekranlar, sonra BUTUN piller',
    s2.slice(0, 3).every((n) => n.includes('LCD')) && s2.slice(3, 6).every((n) => n.includes('PIL')),
    s2.join(' | ')
  );
  kontrol(
    'ekranlar dogal sirada: 8 < 11 < 12',
    JSON.stringify(ekranlar) === JSON.stringify(['IPH-8 LCD HD+', 'IPH-11 LCD HD+', 'IPH-12 LCD HD+']),
    ekranlar.join(' | ')
  );
  kontrol(
    'piller dogal sirada: 8 < 11 < 12',
    JSON.stringify(piller) === JSON.stringify(['IPH-8 PIL (1821mAh)', 'IPH-11 PIL (3110mAh)', 'IPH-12 PIL (2815mAh)']),
    piller.join(' | ')
  );
  kontrol('kategorisiz urun en sonda', s2[s2.length - 1] === 'IPH-11 KILIF SEFFAF', s2[s2.length - 1]);

  // ── B. Anasayfa gunluk / haftalik ────────────────────────────────────
  console.log('\n[B] Anasayfa — bugun / bu hafta yerel gune gore');
  const simdi = new Date();
  const bugun0030 = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate(), 0, 30);
  const dun2330 = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate() - 1, 23, 30);
  const altiGunOnce = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate() - 6, 12, 0);
  const sekizGunOnce = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate() - 8, 12, 0);
  const onbesGunOnce = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate() - 15, 12, 0);

  let sira = 0;
  const fatura = async (tutar: number, createdAt: Date) =>
    prisma.invoice.create({
      data: {
        invoiceNo: `ANA-${++sira}`,
        type: 'SATIS',
        customerId: musteri.id,
        safeId: kasa.id,
        branchId: magaza.id,
        paymentMethod: 'Nakit',
        exchangeRate: 1,
        totalAmountTl: tutar,
        totalAmountUsd: tutar,
        createdAt,
      },
    });
  await fatura(100, bugun0030);   // bugun, gece yarisindan hemen sonra (UTC'de DUN)
  await fatura(200, dun2330);     // dun
  await fatura(40, altiGunOnce);  // bu haftanin ilk gunu
  await fatura(500, sekizGunOnce); // gecen hafta
  await fatura(999, onbesGunOnce); // 14 gunun disinda

  const dRes = await fetch(`${API}/api/sales/dashboard`, { headers: H });
  const d = (await dRes.json()) as {
    data: {
      insights: {
        dailySales: Array<{ date: string; total: number }>;
        weeklySales: { thisWeek: number; lastWeek: number };
      };
    };
  };
  const gunler = d.data.insights.dailySales;
  const hafta = d.data.insights.weeklySales;
  const yerelBugun = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}-${String(simdi.getDate()).padStart(2, '0')}`;

  kontrol('7 gun var', gunler.length === 7, `${gunler.length} gun`);
  kontrol('son gun BUGUN (yerel tarih)', gunler.at(-1)?.date === yerelBugun, `${gunler.at(-1)?.date} vs ${yerelBugun}`);
  kontrol('bugun satis = 100 (00:30 satisi bugune yazildi)', yakin(gunler.at(-1)?.total ?? -1, 100), `bugun=${gunler.at(-1)?.total}`);
  kontrol('dun satis = 200', yakin(gunler.at(-2)?.total ?? -1, 200), `dun=${gunler.at(-2)?.total}`);
  kontrol('bu hafta = 100 + 200 + 40', yakin(hafta.thisWeek, 340), `thisWeek=${hafta.thisWeek}`);
  kontrol('gecen hafta = 500 (15 gun onceki sayilmadi)', yakin(hafta.lastWeek, 500), `lastWeek=${hafta.lastWeek}`);

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
