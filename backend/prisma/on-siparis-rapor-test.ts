/**
 * Teslim bekleyen on siparis HICBIR satis rakamina girmez; tamamlaninca girer.
 * Silinen fis Kar-Zarar'dan duser. Iskontolu satis Kar-Zarar'da iskontolu.
 *
 * 15 Eylul 2026, musteri sordu: "on siparis bugunun satisina ekleniyor mu?"
 * Ekleniyordu — anasayfa, Kar-Zarar ve personel cirosu isPreOrder'a
 * bakmiyordu; Satis Kirilimi bakiyordu. Ayrica teslim edilmemis on
 * siparis IADE edilebiliyordu (stok hic dusmemisken iadeyle artardi).
 *
 * Kontroller, hepsi gercek uc uzerinden:
 *   1. Nakit satis 10 x 10 $, %10 iskonto -> bugun 90, Kar-Zarar ciro 90 kar 40
 *   2. On siparis 10 x 30 $ (Cari)    -> bugun HALA 90, Kar-Zarar HALA 90,
 *                                        Satis Kirilimi 90, en iyi musteri 90
 *   3. On siparis urunu iade ekraninda "hic alinmamis" gorunur
 *   4. On siparis kalemine dogrudan iade POST -> reddedilir
 *   5. Tamamla (Stok Dus)               -> bugun 390, Kar-Zarar 390
 *   6. Ilk satis silinir                -> Kar-Zarar 300 (silinen haric)
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/on-siparis-rapor-test.ts
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
const gun = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function main() {
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
    data: { branchId: magaza.id, name: 'Dolar Kasasi', currency: 'USD', balance: 1000 },
  });
  const musteri = await prisma.customer.create({
    data: { code: 'OSR001', name: 'On Siparis Rapor', balance: 0 },
  });
  const urunA = await prisma.product.create({
    data: { sku: 'OSR00001', name: 'OSR URUN A', costPrice: 5, priceUsd: 10, priceUsd2: 12 },
  });
  const urunB = await prisma.product.create({
    data: { sku: 'OSR00002', name: 'OSR URUN B', costPrice: 20, priceUsd: 30, priceUsd2: 35 },
  });
  for (const u of [urunA, urunB]) {
    await prisma.productStock.create({ data: { productId: u.id, branchId: merkez.id, quantity: 100 } });
  }

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const satisKes = async (
    items: Array<{ productId: number; quantity: number; unitPrice: number; discountPercent?: number }>,
    paymentMethod = 'Nakit',
    isPreOrder = false
  ) => {
    const res = await fetch(`${API}/api/sales/store`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        customerId: musteri.id, branchId: magaza.id, safeId: kasa.id,
        paymentMethod, exchangeRate: 1, isPreOrder, items,
      }),
    });
    const j = (await res.json()) as { success: boolean; data?: { id: number; invoiceNo: string }; message?: string };
    if (!j.success || !j.data) throw new Error(`Satis basarisiz: ${j.message}`);
    return j.data;
  };

  const bugunSatis = async () => {
    const r = await fetch(`${API}/api/sales/dashboard`, { headers: H });
    const d = (await r.json()) as {
      data: { bugun: { fisSayisi: number; urunAdedi: number }; insights: { dailySales: Array<{ date: string; total: number }>; topCustomers: Array<{ customerId: number; amount: number }> } };
    };
    const g = d.data.insights.dailySales.find((x) => x.date === gun(new Date()));
    const m = d.data.insights.topCustomers.find((x) => x.customerId === musteri.id);
    return { bugun: g?.total ?? -1, musteri: m?.amount ?? 0, fis: d.data.bugun.fisSayisi, adet: d.data.bugun.urunAdedi };
  };
  const karZarar = async () => {
    const r = await fetch(`${API}/api/reports/profit`, { headers: H });
    const d = (await r.json()) as { data: { thisMonth: { totalRevenue: number; totalProfit: number }; allTime: { totalRevenue: number } } };
    return d.data;
  };
  const kirilim = async () => {
    const b = gun(new Date());
    const r = await fetch(`${API}/api/reports/sales-breakdown?from=${b}&to=${b}`, { headers: H });
    return ((await r.json()) as { data: { toplam: { ciro: number }; fisSayisi: number } }).data;
  };

  // ── 1. Iskontolu nakit satis ──────────────────────────────────────────
  console.log('\n[1] Nakit satis 10 x 10 $, %10 iskonto = 90 $');
  const f1 = await satisKes([{ productId: urunA.id, quantity: 10, unitPrice: 10, discountPercent: 10 }]);
  let d = await bugunSatis();
  let k = await karZarar();
  kontrol('anasayfa bugun 90', yakin(d.bugun, 90), `bugun=${d.bugun}`);
  kontrol('bugun 1 fis, 10 adet', d.fis === 1 && d.adet === 10, `fis=${d.fis} adet=${d.adet}`);
  kontrol('Kar-Zarar ciro 90 (ISKONTOLU), kar 40', yakin(k.thisMonth.totalRevenue, 90) && yakin(k.thisMonth.totalProfit, 40), `ciro=${k.thisMonth.totalRevenue} kar=${k.thisMonth.totalProfit}`);

  // ── 2. On siparis ─────────────────────────────────────────────────────
  console.log('\n[2] On siparis 10 x 30 $ (Cari, teslim bekliyor)');
  const ons = await satisKes([{ productId: urunB.id, quantity: 10, unitPrice: 30 }], 'Cari', true);
  d = await bugunSatis();
  k = await karZarar();
  const kr = await kirilim();
  kontrol('anasayfa bugun HALA 90', yakin(d.bugun, 90), `bugun=${d.bugun}`);
  kontrol('bugun HALA 1 fis, 10 adet', d.fis === 1 && d.adet === 10, `fis=${d.fis} adet=${d.adet}`);
  kontrol('en iyi musteri HALA 90', yakin(d.musteri, 90), `musteri=${d.musteri}`);
  kontrol('Kar-Zarar HALA 90', yakin(k.thisMonth.totalRevenue, 90), `ciro=${k.thisMonth.totalRevenue}`);
  kontrol('Satis Kirilimi 90, 1 fis', yakin(kr.toplam.ciro, 90) && kr.fisSayisi === 1, `ciro=${kr.toplam.ciro} fis=${kr.fisSayisi}`);

  // ── 3-4. Iade edilemez ────────────────────────────────────────────────
  console.log('\n[3] On siparis urunu iade ekraninda');
  const lrRes = await fetch(`${API}/api/sales/returnable-item?customerId=${musteri.id}&productId=${urunB.id}`, { headers: H });
  const lr = ((await lrRes.json()) as { data: { status: string } }).data;
  kontrol('iade ekrani: "hic alinmamis"', lr.status === 'never_purchased', `status=${lr.status}`);

  console.log('\n[4] On siparis kalemine dogrudan iade POST');
  const onsKalem = await prisma.invoiceItem.findFirstOrThrow({ where: { invoiceId: ons.id } });
  const iadeRes = await fetch(`${API}/api/sales/return`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      customerId: musteri.id, branchId: magaza.id, safeId: kasa.id, paymentMethod: 'Cari', exchangeRate: 1,
      originalInvoiceId: ons.id,
      items: [{ productId: urunB.id, quantity: 1, unitPrice: 30, sourceInvoiceItemId: onsKalem.id }],
    }),
  });
  const iade = (await iadeRes.json()) as { success: boolean; message?: string };
  kontrol('iade REDDEDILDI', !iade.success && /ön sipariş/i.test(iade.message ?? ''), iade.message ?? 'basarili?!');
  const stokB = await prisma.productStock.findFirstOrThrow({ where: { productId: urunB.id, branchId: merkez.id } });
  kontrol('B stogu 100 kaldi', stokB.quantity === 100, `stok=${stokB.quantity}`);

  // ── 5. Tamamla ────────────────────────────────────────────────────────
  console.log('\n[5] Stok Dus (tamamla)');
  const fRes = await fetch(`${API}/api/sales/invoices/${ons.id}/fulfill`, { method: 'POST', headers: { Authorization: H.Authorization } });
  kontrol('tamamlandi', ((await fRes.json()) as { success: boolean }).success, 'ok');
  d = await bugunSatis();
  k = await karZarar();
  kontrol('anasayfa bugun 390', yakin(d.bugun, 390), `bugun=${d.bugun}`);
  kontrol('bugun 2 fis, 20 adet', d.fis === 2 && d.adet === 20, `fis=${d.fis} adet=${d.adet}`);
  kontrol('Kar-Zarar 390, kar 40 + 100 = 140', yakin(k.thisMonth.totalRevenue, 390) && yakin(k.thisMonth.totalProfit, 140), `ciro=${k.thisMonth.totalRevenue} kar=${k.thisMonth.totalProfit}`);
  kontrol('Satis Kirilimi 390, 2 fis', yakin((await kirilim()).toplam.ciro, 390), `ciro=${(await kirilim()).toplam.ciro}`);

  // ── 6. Silinen fis ────────────────────────────────────────────────────
  console.log('\n[6] Ilk satis siliniyor');
  await fetch(`${API}/api/sales/invoices/${f1.id}/trash`, { method: 'POST', headers: { Authorization: H.Authorization } });
  d = await bugunSatis();
  k = await karZarar();
  kontrol('anasayfa bugun 300', yakin(d.bugun, 300), `bugun=${d.bugun}`);
  kontrol('bugun 1 fis, 10 adet (silinen dustu)', d.fis === 1 && d.adet === 10, `fis=${d.fis} adet=${d.adet}`);
  kontrol('Kar-Zarar 300 (SILINEN HARIC)', yakin(k.thisMonth.totalRevenue, 300) && yakin(k.allTime.totalRevenue, 300), `ay=${k.thisMonth.totalRevenue} tum=${k.allTime.totalRevenue}`);

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
