/**
 * Kasa bakiyesi = kasa hareketleri toplami — YALNIZCA yerel denemede.
 *
 * 15 Eylul 2026: canlida Dolar Kasasi bakiyesi 1.051,91 $, hareketlerin
 * toplami -139,34 $ idi. Fatura duzenlenince (ozellikle "tekrar Kaydet ayni
 * fisi gunceller" akisinda kalem eklenince) bakiye degisiyor ama hareket
 * yazilmiyordu. Bu betik her adimdan sonra iki rakamin esit kaldigini olcer.
 *
 * Kontroller, hepsi gercek uc uzerinden:
 *   1. Nakit satis 100 $        -> bakiye +100, hareket +100
 *   2. Ayni fis 150 $'a cikti   -> bakiye +50,  "duzenleme farki" GIRIS 50
 *   3. Ayni fis 120 $'a indi    -> bakiye -30,  "duzenleme farki" CIKIS 30
 *   4. Tutar degismeden kaydet  -> hareket YAZILMAZ
 *   5. Nakit -> Cari cevrildi   -> kasadan 120 cikar, cariye 120 yazilir
 *   6. Cari -> Nakit geri       -> kasaya 120 girer
 *   7. Fatura silindi           -> kasadan 120 cikar (mevcut davranis)
 *   Her adimda: Safe.balance == SUM(GIRIS) - SUM(CIKIS)
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/kasa-hareket-test.ts
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
    data: { branchId: magaza.id, name: 'Dolar Kasasi', currency: 'USD', balance: 1000 },
  });
  const musteri = await prisma.customer.create({
    data: { code: 'KSA001', name: 'Kasa Denemesi', balance: 0 },
  });
  const urun = await prisma.product.create({
    data: { sku: 'KSA00001', name: 'KASA DENEME URUNU', costPrice: 5, priceUsd: 10, priceUsd2: 12 },
  });
  await prisma.productStock.create({ data: { productId: urun.id, branchId: merkez.id, quantity: 100 } });

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  /** Kasa bakiyesi, hareket toplami ve hareket sayisi */
  const kasaDurumu = async () => {
    const s = await prisma.safe.findUniqueOrThrow({ where: { id: kasa.id } });
    const h = await prisma.transaction.findMany({ where: { safeId: kasa.id } });
    const toplam = h.reduce((t, x) => t + (x.type === 'GIRIS' ? x.amount : -x.amount), 0);
    return { bakiye: s.balance, hareketToplami: 1000 + toplam, adet: h.length, son: h[h.length - 1] };
  };
  const esitMi = async (etiket: string) => {
    const d = await kasaDurumu();
    kontrol(`${etiket}: bakiye = hareket toplami`, yakin(d.bakiye, d.hareketToplami), `bakiye=${d.bakiye} hareket=${d.hareketToplami}`);
    return d;
  };

  // ── 1. Nakit satis ────────────────────────────────────────────────────
  console.log('\n[1] Nakit satis 10 x 10 $ = 100 $');
  const satisRes = await fetch(`${API}/api/sales/store`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      branchId: magaza.id,
      safeId: kasa.id,
      paymentMethod: 'Nakit',
      exchangeRate: 1,
      items: [{ productId: urun.id, quantity: 10, unitPrice: 10 }],
    }),
  });
  const satis = (await satisRes.json()) as {
    success: boolean;
    data?: { id: number; invoiceNo: string; items?: Array<{ id: number }> };
    message?: string;
  };
  if (!satis.success || !satis.data) throw new Error(`Satis basarisiz: ${satis.message}`);
  const kalemId = satis.data.items?.[0]?.id;
  let d = await esitMi('satis');
  kontrol('kasa 1000 -> 1100', yakin(d.bakiye, 1100), `bakiye=${d.bakiye}`);

  const duzenle = async (adet: number, fiyat: number, paymentMethod = 'Nakit') =>
    fetch(`${API}/api/sales/invoices/${satis.data!.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({
        customerId: musteri.id,
        paymentMethod,
        exchangeRate: 1,
        items: [{ id: kalemId, quantity: adet, unitPrice: fiyat, discountPercent: 0 }],
      }),
    });

  // ── 2. Tutar artti ────────────────────────────────────────────────────
  console.log('\n[2] Ayni fis tekrar kaydediliyor: 15 x 10 $ = 150 $');
  await duzenle(15, 10);
  d = await esitMi('tutar artinca');
  kontrol('kasa 1100 -> 1150', yakin(d.bakiye, 1150), `bakiye=${d.bakiye}`);
  kontrol('duzenleme farki GIRIS 50 yazildi', d.son?.type === 'GIRIS' && yakin(d.son.amount, 50) && d.son.description.includes('düzenleme farkı'), `${d.son?.type} ${d.son?.amount} "${d.son?.description}"`);

  // ── 3. Tutar dustu ────────────────────────────────────────────────────
  console.log('\n[3] Ayni fis: 12 x 10 $ = 120 $');
  await duzenle(12, 10);
  d = await esitMi('tutar dusunce');
  kontrol('kasa 1150 -> 1120', yakin(d.bakiye, 1120), `bakiye=${d.bakiye}`);
  kontrol('duzenleme farki CIKIS 30 yazildi', d.son?.type === 'CIKIS' && yakin(d.son.amount, 30), `${d.son?.type} ${d.son?.amount}`);

  // ── 4. Degismeden kaydet ──────────────────────────────────────────────
  console.log('\n[4] Ayni tutarla tekrar kaydet');
  const adetOnce = (await kasaDurumu()).adet;
  await duzenle(12, 10);
  d = await esitMi('degismeyince');
  kontrol('hareket yazilmadi', d.adet === adetOnce, `${adetOnce} -> ${d.adet}`);

  // ── 5. Nakit -> Cari ──────────────────────────────────────────────────
  console.log('\n[5] Odeme Nakit -> Cari');
  await duzenle(12, 10, 'Cari');
  d = await esitMi('cariye cevrilince');
  kontrol('kasa 1120 -> 1000 (para kasadan cikti)', yakin(d.bakiye, 1000), `bakiye=${d.bakiye}`);
  const m1 = await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } });
  kontrol('cari bakiye 120', yakin(m1.balance, 120), `bakiye=${m1.balance}`);

  // ── 6. Cari -> Nakit ──────────────────────────────────────────────────
  console.log('\n[6] Odeme Cari -> Nakit');
  await duzenle(12, 10, 'Nakit');
  d = await esitMi('nakde cevrilince');
  kontrol('kasa 1000 -> 1120', yakin(d.bakiye, 1120), `bakiye=${d.bakiye}`);
  const m2 = await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } });
  kontrol('cari bakiye 0', yakin(m2.balance, 0), `bakiye=${m2.balance}`);

  // ── 6b. Musteri degisince hareket etiketi fisi izler (17 Eylul 2026) ──
  console.log('\n[6b] Fisin musterisi degisiyor');
  const musteri2 = await prisma.customer.create({ data: { code: 'KSA002', name: 'Ikinci Musteri', balance: 0 } });
  await fetch(`${API}/api/sales/invoices/${satis.data.id}`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ customerId: musteri2.id, paymentMethod: 'Nakit', exchangeRate: 1, items: [{ id: kalemId, quantity: 12, unitPrice: 10, discountPercent: 0 }] }),
  });
  const fisHareketleri = await prisma.transaction.findMany({ where: { receiptNo: null, description: { startsWith: `${satis.data.invoiceNo} ` } } });
  kontrol('fisin TUM hareketleri yeni musteride', fisHareketleri.length > 0 && fisHareketleri.every((t) => t.customerId === musteri2.id), `${fisHareketleri.filter((t) => t.customerId === musteri2.id).length}/${fisHareketleri.length}`);
  d = await esitMi('musteri degisince');
  kontrol('kasa 1120 kaldi', yakin(d.bakiye, 1120), `bakiye=${d.bakiye}`);

  // ── 7. Sil ────────────────────────────────────────────────────────────
  console.log('\n[7] Fatura siliniyor');
  const silRes = await fetch(`${API}/api/sales/invoices/${satis.data.id}/trash`, {
    method: 'POST',
    headers: { Authorization: H.Authorization },
  });
  const sil = (await silRes.json()) as { success: boolean; message?: string };
  kontrol('fatura silindi', sil.success, sil.message ?? 'ok');
  d = await esitMi('silinince');
  kontrol('kasa 1120 -> 1000', yakin(d.bakiye, 1000), `bakiye=${d.bakiye}`);

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
