/**
 * Kalabalik on siparis fisi — YALNIZCA yerel denemede kullanilir.
 *
 * Neden: 249 kalemlik bir on siparisi ("260915094213") satisa cevirmek
 * 18 Eylul 2026'da "A query cannot be executed on an expired transaction"
 * hatasi verdi. Kalem basina ~6 sorgu atiliyordu, Prisma'nin 5 saniyelik
 * varsayilan islem zaman asimi doluyor ve HER SEY GERI ALINIYORDU.
 *
 * Kontroller:
 *   1. 250 kalemlik on siparis kaydi stok/katman/cariyi degistirmez
 *   2. Duzenleme ucuyle on siparisten CIKARMA hatasiz biter
 *   3. Stok, katman, kalem maliyeti ve cari dogru isler
 *   4. Geri on siparise almak her seyi eski haline dondurur
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/kalabalik-fis-test.ts
 */
import { prisma } from '../src/lib/prisma';

const API = process.env.TEST_API ?? 'http://127.0.0.1:3000';
const ADMIN_USER = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? 'test';
const KALEM = Number(process.env.KALEM_SAYISI ?? 250);
/** Her kosu kendi kodlarini uretir; veritabani sifirlamaya gerek kalmaz */
const EK = Date.now().toString(36).slice(-5).toUpperCase();

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
    data: { branchId: magaza.id, name: `Kalabalik Kasa ${EK}`, currency: 'USD', balance: 0 },
  });
  const musteri = await prisma.customer.create({
    data: { code: `KLB${EK}`, name: `Kalabalik Fis Denemesi ${EK}`, balance: 0 },
  });

  console.log(`\n[0] ${KALEM} urun hazirlaniyor (stok 10, katman 10 x 5,00 $)`);
  const urunler = [];
  for (let i = 0; i < KALEM; i += 1) {
    const u = await prisma.product.create({
      data: {
        sku: `K${EK}${String(i).padStart(4, '0')}`,
        name: `KALABALIK URUN ${i}`,
        costPrice: 4,
        priceUsd: 10,
        priceUsd2: 12,
      },
    });
    await prisma.productStock.create({
      data: { productId: u.id, branchId: merkez.id, quantity: 10 },
    });
    await prisma.stockLot.create({
      data: { productId: u.id, branchId: merkez.id, quantity: 10, unitCost: 5, isOpening: true },
    });
    urunler.push(u);
  }

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const ids = urunler.map((u) => u.id);
  const durum = async () => {
    const stoklar = await prisma.productStock.findMany({
      where: { productId: { in: ids }, branchId: merkez.id },
    });
    const lotlar = await prisma.stockLot.findMany({
      where: { productId: { in: ids }, quantity: { gt: 0 } },
    });
    const m = await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } });
    return {
      stok: stoklar.reduce((t, s) => t + s.quantity, 0),
      katman: lotlar.reduce((t, l) => t + l.quantity, 0),
      cari: m.balance,
    };
  };

  // ── 1. On siparis kaydi ───────────────────────────────────────────────
  console.log(`\n[1] ${KALEM} kalemlik on siparis (her biri 1 adet x 10 $, Cari)`);
  const t1 = Date.now();
  const onsRes = await fetch(`${API}/api/sales/store`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      branchId: magaza.id,
      safeId: kasa.id,
      paymentMethod: 'Cari',
      exchangeRate: 1,
      isPreOrder: true,
      items: urunler.map((u) => ({ productId: u.id, quantity: 1, unitPrice: 10 })),
    }),
  });
  const ons = (await onsRes.json()) as {
    success: boolean;
    data?: { id: number; isPreOrder: boolean };
    message?: string;
  };
  kontrol('on siparis kaydedildi', ons.success === true, `${ons.message ?? ''} ${Date.now() - t1} ms`);
  if (!ons.data) throw new Error(`On siparis basarisiz: ${ons.message}`);
  let d = await durum();
  kontrol('stok DEGISMEDI', d.stok === KALEM * 10, `stok=${d.stok}`);
  kontrol('katman DEGISMEDI', d.katman === KALEM * 10, `katman=${d.katman}`);
  kontrol('cari DEGISMEDI', yakin(d.cari, 0), `cari=${d.cari}`);

  // ── 2. On siparisten cikar (duzenleme ucu) ────────────────────────────
  console.log('\n[2] Duzenleme ucuyle on siparisten cikar — ASIL DENEME');
  const t2 = Date.now();
  const cikarRes = await fetch(`${API}/api/sales/invoices/${ons.data.id}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ isPreOrder: false }),
  });
  const cikar = (await cikarRes.json()) as { success: boolean; message?: string };
  const sure = Date.now() - t2;
  kontrol(
    'on siparisten cikarildi (zaman asimi YOK)',
    cikar.success === true,
    `${cikar.message ?? ''} ${sure} ms`
  );

  d = await durum();
  kontrol('stok dustu', d.stok === KALEM * 9, `stok=${d.stok} beklenen=${KALEM * 9}`);
  kontrol('katman tuketildi', d.katman === KALEM * 9, `katman=${d.katman}`);
  kontrol('cari yazildi', yakin(d.cari, KALEM * 10), `cari=${d.cari}`);
  const maliyetsiz = await prisma.invoiceItem.count({
    where: { invoiceId: ons.data.id, unitCost: null },
  });
  const yanlisMaliyet = await prisma.invoiceItem.count({
    where: { invoiceId: ons.data.id, NOT: { unitCost: 5 } },
  });
  kontrol('her kalemin maliyeti yazildi', maliyetsiz === 0, `maliyetsiz=${maliyetsiz}`);
  kontrol('maliyet katmandan geldi (5,00)', yanlisMaliyet === 0, `sapan=${yanlisMaliyet}`);
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: ons.data.id } });
  kontrol('fis artik normal satis', inv.isPreOrder === false, `isPreOrder=${inv.isPreOrder}`);

  // ── 3. Geri on siparise al ────────────────────────────────────────────
  console.log('\n[3] Geri on siparise al');
  const t3 = Date.now();
  const geriRes = await fetch(`${API}/api/sales/invoices/${ons.data.id}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ isPreOrder: true }),
  });
  const geri = (await geriRes.json()) as { success: boolean; message?: string };
  kontrol('geri alindi', geri.success === true, `${geri.message ?? ''} ${Date.now() - t3} ms`);
  d = await durum();
  kontrol('stok eski haline dondu', d.stok === KALEM * 10, `stok=${d.stok}`);
  kontrol('katman eski haline dondu', d.katman === KALEM * 10, `katman=${d.katman}`);
  kontrol('cari sifirlandi', yakin(d.cari, 0), `cari=${d.cari}`);

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
