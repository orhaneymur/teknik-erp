/**
 * On siparis akisi — YALNIZCA yerel denemede kullanilir.
 *
 * Kontroller, gercek uc uzerinden:
 *   1. On siparis kaydi: stok, cari, kasa, katman DEGISMEZ; ekstrede yok
 *   2. "Stok Dus (On Siparisi Tamamla)": stok duser, cariye yazilir,
 *      KATMAN TUKETILIR ve kalemin maliyeti yazilir (15 Eylul 2026'ya kadar
 *      son ikisi eksikti — kar raporu maliyetsiz, stok/katman ayrik)
 *   3. Tamamlanan fis ekstrede gorunur
 *   4. Nakit on siparis tamamlaninca kasaya girer + hareket yazilir
 *   5. Tamamlanmis fis tekrar tamamlanamaz
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/on-siparis-test.ts
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
    data: { branchId: magaza.id, name: 'Dolar Kasasi', currency: 'USD', balance: 500 },
  });
  const musteri = await prisma.customer.create({ data: { code: 'ONS001', name: 'On Siparis Denemesi', balance: 0 } });
  const urun = await prisma.product.create({
    data: { sku: 'ONS00001', name: 'ON SIPARIS URUNU', costPrice: 4, priceUsd: 10, priceUsd2: 12 },
  });
  await prisma.productStock.create({ data: { productId: urun.id, branchId: merkez.id, quantity: 20 } });
  // Gercek alis maliyetiyle katman: 20 adet @ 6,50
  await prisma.stockLot.create({ data: { productId: urun.id, branchId: merkez.id, quantity: 20, unitCost: 6.5, isOpening: true } });

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const durum = async () => {
    const s = await prisma.productStock.findUniqueOrThrow({ where: { productId_branchId: { productId: urun.id, branchId: merkez.id } } });
    const lotlar = await prisma.stockLot.findMany({ where: { productId: urun.id, quantity: { gt: 0 } } });
    const m = await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } });
    const k = await prisma.safe.findUniqueOrThrow({ where: { id: kasa.id } });
    return { stok: s.quantity, katman: lotlar.reduce((t, l) => t + l.quantity, 0), cari: m.balance, kasa: k.balance };
  };
  /** Ekstredeki satis satirlari (tahsilat satirlari haric) */
  const ekstreFisleri = async () => {
    const r = await fetch(`${API}/api/reports/customer-statement?customerId=${musteri.id}`, { headers: H });
    const j = (await r.json()) as { data?: { lines?: Array<{ type?: string; invoiceNo?: string | null }> } };
    return (j.data?.lines ?? []).filter((l) => l.invoiceNo).length;
  };

  // ── 1. On siparis kaydi ───────────────────────────────────────────────
  console.log('\n[1] On siparis: 5 adet x 10 $ (Cari)');
  const onsRes = await fetch(`${API}/api/sales/store`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id, branchId: magaza.id, safeId: kasa.id, paymentMethod: 'Cari', exchangeRate: 1, isPreOrder: true,
      items: [{ productId: urun.id, quantity: 5, unitPrice: 10 }],
    }),
  });
  const ons = (await onsRes.json()) as { success: boolean; data?: { id: number; isPreOrder: boolean }; message?: string };
  if (!ons.success || !ons.data) throw new Error(`On siparis basarisiz: ${ons.message}`);
  let d = await durum();
  kontrol('isPreOrder=true kaydedildi', ons.data.isPreOrder === true, `isPreOrder=${ons.data.isPreOrder}`);
  kontrol('stok DEGISMEDI (20)', d.stok === 20, `stok=${d.stok}`);
  kontrol('katman DEGISMEDI (20)', d.katman === 20, `katman=${d.katman}`);
  kontrol('cari DEGISMEDI (0)', yakin(d.cari, 0), `cari=${d.cari}`);
  kontrol('kasa DEGISMEDI (500)', yakin(d.kasa, 500), `kasa=${d.kasa}`);
  const e1 = await ekstreFisleri();
  kontrol('ekstrede gorunmuyor', e1 === 0, `ekstre fis=${e1}`);

  // ── 2. Tamamla ────────────────────────────────────────────────────────
  console.log('\n[2] Stok Dus (On Siparisi Tamamla)');
  const fRes = await fetch(`${API}/api/sales/invoices/${ons.data.id}/fulfill`, { method: 'POST', headers: { Authorization: H.Authorization } });
  const f = (await fRes.json()) as { success: boolean; message?: string };
  kontrol('tamamlandi', f.success, f.message ?? '');
  d = await durum();
  kontrol('stok 20 -> 15', d.stok === 15, `stok=${d.stok}`);
  kontrol('KATMAN 20 -> 15 (tuketildi)', d.katman === 15, `katman=${d.katman}`);
  kontrol('cari 0 -> 50', yakin(d.cari, 50), `cari=${d.cari}`);
  kontrol('kasa degismedi (Cari odeme)', yakin(d.kasa, 500), `kasa=${d.kasa}`);
  const kalem = await prisma.invoiceItem.findFirst({ where: { invoiceId: ons.data.id } });
  kontrol('kalem MALIYETI yazildi (6,50, katmandan)', kalem?.unitCost != null && yakin(kalem.unitCost, 6.5), `unitCost=${kalem?.unitCost}`);
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: ons.data.id } });
  kontrol('fis artik normal satis', inv.isPreOrder === false, `isPreOrder=${inv.isPreOrder}`);

  // ── 3. Ekstre ─────────────────────────────────────────────────────────
  const e2 = await ekstreFisleri();
  kontrol('tamamlanan fis ekstrede', e2 === 1, `ekstre fis=${e2}`);

  // ── 4. Nakit on siparis ───────────────────────────────────────────────
  console.log('\n[4] Nakit on siparis 2 x 10 $, tamamla');
  const n = (await (
    await fetch(`${API}/api/sales/store`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        customerId: musteri.id, branchId: magaza.id, safeId: kasa.id, paymentMethod: 'Nakit', exchangeRate: 1, isPreOrder: true,
        items: [{ productId: urun.id, quantity: 2, unitPrice: 10 }],
      }),
    })
  ).json()) as { data?: { id: number } };
  d = await durum();
  kontrol('nakit on siparis kasaya girmedi (500)', yakin(d.kasa, 500), `kasa=${d.kasa}`);
  const hOnce = await prisma.transaction.count({ where: { safeId: kasa.id } });
  await fetch(`${API}/api/sales/invoices/${n.data!.id}/fulfill`, { method: 'POST', headers: { Authorization: H.Authorization } });
  d = await durum();
  kontrol('tamamlaninca kasa 500 -> 520', yakin(d.kasa, 520), `kasa=${d.kasa}`);
  kontrol('kasa hareketi yazildi', (await prisma.transaction.count({ where: { safeId: kasa.id } })) === hOnce + 1, `hareket +1`);
  kontrol('stok 15 -> 13, katman 13', d.stok === 13 && d.katman === 13, `stok=${d.stok} katman=${d.katman}`);

  // ── 5. Tekrar tamamlanamaz ────────────────────────────────────────────
  const t2 = await fetch(`${API}/api/sales/invoices/${ons.data.id}/fulfill`, { method: 'POST', headers: { Authorization: H.Authorization } });
  const t2j = (await t2.json()) as { success: boolean };
  kontrol('tamamlanmis fis tekrar tamamlanamaz', !t2j.success, `success=${t2j.success}`);
  d = await durum();
  kontrol('ikinci deneme hicbir seyi degistirmedi', d.stok === 13 && yakin(d.cari, 50), `stok=${d.stok} cari=${d.cari}`);

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
