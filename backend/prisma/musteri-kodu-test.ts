/**
 * Musteri kodu — ardisik sayi ve eski kodlarin duzeltilmesi.
 * YALNIZCA yerel denemede kullanilir.
 *
 * 15 Eylul 2026: yeni musteri "M9624233045" gibi kod aliyordu; eski
 * sistemde 120, 121, 122 idi. Kontroller, gercek uc uzerinden:
 *
 *   1. Kod verilmeden acilan musteri, en buyuk sayisal kodun bir fazlasini alir
 *   2. Elle yazilan kod aynen kalir
 *   3. Eski "M..." kodlu musterilere satis + tahsilat kesilir; duzeltme
 *      sonrasi: kod sirali, bakiye AYNI, fatura ve hareket sayisi AYNI,
 *      hareket aciklamasindaki etiket yeni koda donmus
 *   4. Sayisal kodlulara dokunulmadi
 *   5. Ikinci cagri hicbir sey yapmaz
 *   6. Duzeltmeden sonra acilan musteri seriden devam eder
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/musteri-kodu-test.ts
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
    data: { branchId: magaza.id, name: 'Dolar Kasasi', currency: 'USD', balance: 0 },
  });
  const urun = await prisma.product.create({
    data: { sku: 'MKT00001', name: 'KOD DENEME URUNU', costPrice: 5, priceUsd: 10, priceUsd2: 12 },
  });
  await prisma.productStock.create({ data: { productId: urun.id, branchId: merkez.id, quantity: 100 } });

  // Eski sistemden gelen sayisal kodlu musteriler
  for (const [code, name] of [['120', 'Eski Musteri 120'], ['121', 'Eski Musteri 121'], ['185', 'Eski Musteri 185']]) {
    await prisma.customer.create({ data: { code, name } });
  }
  // Eski hatali uc ile acilmis "M..." kodlu musteriler (olusturulma sirasi onemli)
  const mA = await prisma.customer.create({ data: { code: 'M9624233045', name: 'M Kodlu A' } });
  const mB = await prisma.customer.create({ data: { code: 'M9624298871', name: 'M Kodlu B' } });

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // ── 1. Kodsuz yeni musteri ────────────────────────────────────────────
  console.log('\n[1] Kod vermeden yeni musteri');
  const y1 = (await (
    await fetch(`${API}/api/customers`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Yeni Musteri 1' }) })
  ).json()) as { data?: { code: string } };
  kontrol('kod 186 (en buyuk 185 + 1)', y1.data?.code === '186', `code=${y1.data?.code}`);

  // ── 2. Elle kod ───────────────────────────────────────────────────────
  const y2 = (await (
    await fetch(`${API}/api/customers`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Elle Kodlu', code: 'VIP01' }) })
  ).json()) as { data?: { code: string } };
  kontrol('elle yazilan kod aynen kaldi', y2.data?.code === 'VIP01', `code=${y2.data?.code}`);

  // ── 3. M kodlulara islem kes, sonra duzelt ────────────────────────────
  console.log('\n[3] M kodlu musteriye satis 100 $ (Cari) + tahsilat 30 $');
  const satisRes = await fetch(`${API}/api/sales/store`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: mA.id, branchId: magaza.id, safeId: kasa.id, paymentMethod: 'Cari', exchangeRate: 1,
      items: [{ productId: urun.id, quantity: 10, unitPrice: 10 }],
    }),
  });
  const satis = (await satisRes.json()) as { success: boolean; message?: string };
  if (!satis.success) throw new Error(`Satis basarisiz: ${satis.message}`);
  const tahRes = await fetch(`${API}/api/customers/payment`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ customerId: mA.id, safeId: kasa.id, type: 'GIRIS', amount: 30, method: 'Nakit', currency: 'USD' }),
  });
  const tah = (await tahRes.json()) as { success: boolean; message?: string };
  if (!tah.success) throw new Error(`Tahsilat basarisiz: ${tah.message}`);

  const onceA = await prisma.customer.findUniqueOrThrow({ where: { id: mA.id } });
  const onceFatura = await prisma.invoice.count({ where: { customerId: mA.id } });
  const onceHareket = await prisma.transaction.findMany({ where: { customerId: mA.id } });
  kontrol('kurulum: bakiye 70, 1 fatura, 1 hareket', yakin(onceA.balance, 70) && onceFatura === 1 && onceHareket.length === 1, `bakiye=${onceA.balance} fatura=${onceFatura} hareket=${onceHareket.length}`);
  kontrol('hareket aciklamasi eski kodla', onceHareket[0]?.description === 'M9624233045 cari tahsilat', onceHareket[0]?.description ?? '');

  const sayiRes = (await (await fetch(`${API}/api/customers/eski-kod-sayisi`, { headers: H })).json()) as { data: { sayi: number } };
  kontrol('eski kod sayisi 2', sayiRes.data.sayi === 2, `sayi=${sayiRes.data.sayi}`);

  console.log('\n[3] Kodlar duzeltiliyor');
  const dRes = (await (await fetch(`${API}/api/customers/kodlari-duzelt`, { method: 'POST', headers: { Authorization: H.Authorization } })).json()) as {
    success: boolean; message: string; data: { degisenler: Array<{ eski: string; yeni: string }>; aciklama: number };
  };
  kontrol('2 musteri duzeltildi', dRes.data.degisenler.length === 2, dRes.message);
  const sonraA = await prisma.customer.findUniqueOrThrow({ where: { id: mA.id } });
  const sonraB = await prisma.customer.findUniqueOrThrow({ where: { id: mB.id } });
  kontrol('A -> 187, B -> 188 (olusturulma sirasi, seriden devam)', sonraA.code === '187' && sonraB.code === '188', `A=${sonraA.code} B=${sonraB.code}`);
  kontrol('bakiye DEGISMEDI', yakin(sonraA.balance, onceA.balance), `bakiye=${sonraA.balance}`);
  kontrol('fatura sayisi ayni', (await prisma.invoice.count({ where: { customerId: mA.id } })) === onceFatura, `fatura=${onceFatura}`);
  const sonraHareket = await prisma.transaction.findMany({ where: { customerId: mA.id } });
  kontrol('hareket sayisi ve tutari ayni', sonraHareket.length === 1 && yakin(sonraHareket[0].amount, 30), `hareket=${sonraHareket.length} amount=${sonraHareket[0]?.amount}`);
  kontrol('hareket aciklamasi yeni kodla', sonraHareket[0]?.description === '187 cari tahsilat', sonraHareket[0]?.description ?? '');
  kontrol('1 aciklama guncellendi', dRes.data.aciklama === 1, `aciklama=${dRes.data.aciklama}`);

  // ── 4. Sayisal kodlulara dokunulmadi ──────────────────────────────────
  const eski120 = await prisma.customer.findUnique({ where: { code: '120' } });
  const vip = await prisma.customer.findUnique({ where: { code: 'VIP01' } });
  kontrol('120 ve VIP01 yerinde', !!eski120 && !!vip, `120=${eski120?.name} VIP01=${vip?.name}`);

  // ── 5. Ikinci cagri ───────────────────────────────────────────────────
  const d2 = (await (await fetch(`${API}/api/customers/kodlari-duzelt`, { method: 'POST', headers: { Authorization: H.Authorization } })).json()) as { data: { degisenler: unknown[] }; message: string };
  kontrol('ikinci cagri hicbir sey yapmadi', d2.data.degisenler.length === 0, d2.message);

  // ── 6. Seriden devam ──────────────────────────────────────────────────
  const y3 = (await (
    await fetch(`${API}/api/customers`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Yeni Musteri 2' }) })
  ).json()) as { data?: { code: string } };
  kontrol('sonraki yeni musteri 189', y3.data?.code === '189', `code=${y3.data?.code}`);

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
