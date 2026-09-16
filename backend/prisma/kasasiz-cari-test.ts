/**
 * Kasasiz cari kaydi (16 Eylul 2026): kasaya dokunmadan musteri lehine /
 * aleyhine yazma.
 *
 *   1. Kasasiz GIRIS 40  -> musteri bakiyesi -40 (alacakli), kasa DEGISMEDI
 *   2. Kasasiz CIKIS 15  -> musteri bakiyesi -25, kasa DEGISMEDI
 *   3. Kasa raporu: kasasiz kayitlar listede YOK, giris/cikis toplaminda YOK
 *   4. Anasayfa kasa toplami degismedi
 *   5. Ekstre: iki satir gorunur, safeId null; ekstre toplami = bakiye
 *   6. Duzenleme: kasasiz kayit kasaya baglaninca kasa artar; geri kasasiz
 *      yapilinca kasa eski degerine doner
 *   7. Normal tahsilat 10 hala kasaya girer (eski davranis bozulmadi)
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/kasasiz-cari-test.ts
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
  const magaza =
    (await prisma.branch.findFirst({ where: { type: 'STORE' } })) ??
    (await prisma.branch.create({ data: { name: 'Merkez Sube', type: 'STORE' } }));
  const kasa = await prisma.safe.create({
    data: { branchId: magaza.id, name: 'Dolar Kasasi', currency: 'USD', balance: 500 },
  });
  const musteri = await prisma.customer.create({
    data: { code: 'KSZ001', name: 'Kasasiz Deneme', balance: 0 },
  });

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const durum = async () => {
    const m = await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } });
    const k = await prisma.safe.findUniqueOrThrow({ where: { id: kasa.id } });
    return { bakiye: m.balance, kasa: k.balance };
  };
  const odeme = async (body: Record<string, unknown>) => {
    const r = await fetch(`${API}/api/customers/payment`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    return (await r.json()) as { success: boolean; data?: { id: number; safeId: number | null; description: string }; message?: string };
  };

  // ── 1. Kasasiz alacak ─────────────────────────────────────────────────
  console.log('\n[1] Kasasiz GIRIS 40 (musteri lehine alacak)');
  const a = await odeme({ customerId: musteri.id, amount: 40, type: 'GIRIS', kasasiz: true });
  kontrol('kaydedildi', a.success, a.message ?? a.data?.description ?? '');
  kontrol('safeId NULL', a.data?.safeId === null, `safeId=${a.data?.safeId}`);
  let d = await durum();
  kontrol('musteri bakiyesi 0 -> -40', yakin(d.bakiye, -40), `bakiye=${d.bakiye}`);
  kontrol('kasa DEGISMEDI (500)', yakin(d.kasa, 500), `kasa=${d.kasa}`);

  // ── 2. Kasasiz borc ───────────────────────────────────────────────────
  console.log('\n[2] Kasasiz CIKIS 15 (musteri aleyhine borc)');
  const b = await odeme({ customerId: musteri.id, amount: 15, type: 'CIKIS', kasasiz: true });
  kontrol('kaydedildi', b.success, b.message ?? '');
  d = await durum();
  kontrol('musteri bakiyesi -40 -> -25', yakin(d.bakiye, -25), `bakiye=${d.bakiye}`);
  kontrol('kasa DEGISMEDI (500)', yakin(d.kasa, 500), `kasa=${d.kasa}`);

  // ── 7. Normal tahsilat hala kasaya girer ──────────────────────────────
  console.log('\n[7] Normal tahsilat 10 (kasali)');
  const c = await odeme({ customerId: musteri.id, amount: 10, type: 'GIRIS', safeId: kasa.id, method: 'Nakit' });
  kontrol('kaydedildi', c.success, c.message ?? '');
  d = await durum();
  kontrol('musteri -25 -> -35, kasa 500 -> 510', yakin(d.bakiye, -35) && yakin(d.kasa, 510), `bakiye=${d.bakiye} kasa=${d.kasa}`);

  // ── 3. Kasa raporu ────────────────────────────────────────────────────
  console.log('\n[3] Kasa raporu');
  const bugun = gun(new Date());
  const krRes = await fetch(`${API}/api/reports/cash-flow?from=${bugun}&to=${bugun}`, { headers: H });
  const kr = ((await krRes.json()) as { data: { summary: { totalIn: number; totalOut: number }; transactions: Array<{ id: number; safe: unknown }>; kasalar: Array<{ id: number; bakiye: number }> } }).data;
  kontrol('kasasiz kayitlar listede YOK (yalnizca 1 hareket: tahsilat 10)', kr.transactions.length === 1, `${kr.transactions.length} hareket`);
  kontrol('giris toplami 10 (40 sayilmadi), cikis 0 (15 sayilmadi)', yakin(kr.summary.totalIn, 10) && yakin(kr.summary.totalOut, 0), `in=${kr.summary.totalIn} out=${kr.summary.totalOut}`);
  kontrol('kasa bakiyesi 510', yakin(kr.kasalar.find((k) => k.id === kasa.id)?.bakiye ?? -1, 510), '');

  // ── 4. Anasayfa ───────────────────────────────────────────────────────
  const dashRes = await fetch(`${API}/api/sales/dashboard`, { headers: H });
  const dash = ((await dashRes.json()) as { data: { safeBalances: Array<{ id: number; balance: number }>; recentPayments: Array<{ safe: unknown }> } }).data;
  kontrol('anasayfa kasa 510', yakin(dash.safeBalances.find((s) => s.id === kasa.id)?.balance ?? -1, 510), '');
  kontrol('anasayfa son hareketlerde kasasiz kayit safe=null ile gorunur', dash.recentPayments.some((p) => p.safe === null), `${dash.recentPayments.filter((p) => p.safe === null).length} kasasiz`);

  // ── 5. Ekstre ─────────────────────────────────────────────────────────
  console.log('\n[5] Ekstre');
  const ekRes = await fetch(`${API}/api/reports/customer-statement?customerId=${musteri.id}`, { headers: H });
  const ek = ((await ekRes.json()) as { data: { lines: Array<{ kind: string; safeId?: number | null; debit: number; credit: number }> } }).data.lines;
  kontrol('ekstrede 3 satir (2 kasasiz + 1 tahsilat)', ek.length === 3 && ek.filter((l) => l.safeId == null).length === 2, `${ek.length} satir, ${ek.filter((l) => l.safeId == null).length} kasasiz`);
  const toplam = ek.reduce((t, l) => t + l.debit - l.credit, 0);
  kontrol('ekstre toplami = bakiye (-35)', yakin(toplam, -35), `toplam=${toplam}`);

  // ── 6. Duzenleme: kasasiz <-> kasali ──────────────────────────────────
  console.log('\n[6] Duzenleme');
  const put = async (id: number, body: Record<string, unknown>) =>
    fetch(`${API}/api/customers/payment/${id}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  await put(a.data!.id, { safeId: kasa.id, kasasiz: false, method: 'Nakit' });
  d = await durum();
  kontrol('kasasiz 40 kasaya baglaninca: kasa 510 -> 550, bakiye ayni -35', yakin(d.kasa, 550) && yakin(d.bakiye, -35), `kasa=${d.kasa} bakiye=${d.bakiye}`);
  await put(a.data!.id, { kasasiz: true });
  d = await durum();
  const kayit = await prisma.transaction.findUniqueOrThrow({ where: { id: a.data!.id } });
  kontrol('geri kasasiz: kasa 550 -> 510, safeId NULL, method NULL', yakin(d.kasa, 510) && kayit.safeId === null && kayit.method === null, `kasa=${d.kasa} safeId=${kayit.safeId}`);

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
