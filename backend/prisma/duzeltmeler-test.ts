/**
 * 11 Eylul 2026 duzeltmeleri — YALNIZCA yerel denemede kullanilir.
 *
 * Musterinin bildirdigi yedi sorunun para ve veri tarafini olcer. Her
 * kontrol GERCEK UC uzerinden yapilir; prisma'ya dogrudan yazip "calisiyor"
 * demek yeterli degil, hatalarin hepsi uc katmanindaydi.
 *
 *   1. Alis, urunun SATIS fiyatini ezmiyor (toptan ve perakende)
 *   2. Alis faturasi duzenlenince de ezmiyor
 *   3. Iade cariye isliyor (Cari) — bakiye dusuyor
 *   4. Iade nakit secilince kasadan cikiyor ve kasa hareketi yaziliyor
 *   5. Fatura duzenlemek createdAt'i oynatmiyor (ekstre sirasi sabit)
 *   6. Ayni faturayi tekrar kaydetmek kalemleri katlamiyor
 *   7. Insiyatif iade faturasina otomatik aciklama yazilmiyor
 *   8. Tahsilat guncellemek bakiyeyi katlamiyor
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/duzeltmeler-test.ts
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
  await prisma.safe.update({ where: { id: kasa.id }, data: { balance: 10000 } });

  const musteri = await prisma.customer.upsert({
    where: { code: 'DZT001' },
    update: { balance: 0 },
    create: { code: 'DZT001', name: 'Duzeltme Denemesi', balance: 0 },
  });

  /*
   * Musterinin anlattigi urun: Excel'de Alis 12,70 / Satis1 15,50 /
   * Satis2 17,00 girilmis. Alis yapinca satis fiyatlari 12,70 oluyordu.
   */
  const urun = await prisma.product.upsert({
    where: { sku: 'DZT00001' },
    update: { costPrice: 0, priceUsd: 15.5, priceUsd2: 17 },
    create: {
      sku: 'DZT00001',
      name: 'IPH-11 LCD FHD+ (DENEME)',
      costPrice: 0,
      priceUsd: 15.5,
      priceUsd2: 17,
    },
  });
  await prisma.stockLot.deleteMany({ where: { productId: urun.id } });
  await prisma.productStock.deleteMany({ where: { productId: urun.id } });

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // ── 1. Alis satis fiyatini ezmiyor ────────────────────────────────────
  console.log('\n[1] Alis — 1 adet x 12,70 USD');
  const alisRes = await fetch(`${API}/api/purchases/store`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      branchId: magaza.id,
      safeId: kasa.id,
      paymentMethod: 'Cari',
      exchangeRate: 1,
      items: [{ productId: urun.id, quantity: 1, unitPrice: 12.7 }],
    }),
  });
  const alis = (await alisRes.json()) as {
    success: boolean;
    data?: { id: number; items?: Array<{ id: number; productId: number }> };
    message?: string;
  };
  if (!alis.success || !alis.data) throw new Error(`Alis basarisiz: ${alis.message}`);

  let u = await prisma.product.findUniqueOrThrow({ where: { id: urun.id } });
  kontrol('alis TOPTAN satis fiyatini ezmedi', yakin(u.priceUsd, 15.5), `priceUsd=${u.priceUsd}`);
  kontrol('alis PERAKENDE satis fiyatini ezmedi', yakin(u.priceUsd2, 17), `priceUsd2=${u.priceUsd2}`);
  kontrol('alis varsayilan maliyeti ezmedi', yakin(u.costPrice, 0), `costPrice=${u.costPrice}`);

  const katman = await prisma.stockLot.findFirst({ where: { productId: urun.id } });
  kontrol('FIFO katmani gercek maliyetle acildi', !!katman && yakin(katman.unitCost, 12.7), `unitCost=${katman?.unitCost}`);

  // ── 2. Alis faturasi duzenlenince de ezmiyor ──────────────────────────
  console.log('\n[2] Alis faturasi duzenleniyor — birim fiyat 13,50');
  const alisKalem = alis.data.items?.[0];
  await fetch(`${API}/api/sales/invoices/${alis.data.id}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      exchangeRate: 1,
      items: [{ id: alisKalem?.id, quantity: 1, unitPrice: 13.5, discountPercent: 0 }],
    }),
  });
  u = await prisma.product.findUniqueOrThrow({ where: { id: urun.id } });
  kontrol('duzenleme de satis fiyatini ezmedi', yakin(u.priceUsd, 15.5) && yakin(u.priceUsd2, 17), `${u.priceUsd} / ${u.priceUsd2}`);

  // ── 3. Satis, sonra iade — cari bakiye ────────────────────────────────
  console.log('\n[3] Satis 100 $ (Cari), ardindan 40 $ iade (Cari)');
  await prisma.customer.update({ where: { id: musteri.id }, data: { balance: 0 } });
  await prisma.productStock.upsert({
    where: { productId_branchId: { productId: urun.id, branchId: merkez.id } },
    update: { quantity: 50 },
    create: { productId: urun.id, branchId: merkez.id, quantity: 50 },
  });

  const satisRes = await fetch(`${API}/api/sales/store`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      branchId: magaza.id,
      safeId: kasa.id,
      paymentMethod: 'Cari',
      exchangeRate: 1,
      deliveryType: 'Magazadan Teslim',
      items: [{ productId: urun.id, quantity: 4, unitPrice: 25, discountPercent: 0 }],
    }),
  });
  const satis = (await satisRes.json()) as {
    success: boolean;
    data?: { id: number; createdAt: string; items?: Array<{ id: number; productId: number }> };
    message?: string;
  };
  if (!satis.success || !satis.data) throw new Error(`Satis basarisiz: ${satis.message}`);
  let m = await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } });
  kontrol('satis bakiyeyi 100 yapti', yakin(m.balance, 100), `bakiye=${m.balance}`);

  const iadeRes = await fetch(`${API}/api/sales/return-discretionary`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      branchId: magaza.id,
      safeId: kasa.id,
      paymentMethod: 'Cari',
      exchangeRate: 1,
      items: [{ productId: urun.id, quantity: 2, unitPrice: 20, isChinaReturn: false }],
    }),
  });
  const iade = (await iadeRes.json()) as {
    success: boolean;
    data?: { id: number; orderNotes: string | null };
    message?: string;
  };
  if (!iade.success || !iade.data) throw new Error(`Iade basarisiz: ${iade.message}`);
  m = await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } });
  kontrol('IADE CARIYE ISLEDI (100 - 40 = 60)', yakin(m.balance, 60), `bakiye=${m.balance}`);

  // ── 7. Insiyatif iade aciklamasi ──────────────────────────────────────
  kontrol(
    'insiyatif iade otomatik aciklama YAZMIYOR',
    !iade.data.orderNotes,
    `orderNotes=${JSON.stringify(iade.data.orderNotes)}`
  );

  // ── 4. Nakit iade kasadan cikiyor ─────────────────────────────────────
  console.log('\n[4] Nakit iade — 30 $');
  const kasaOnce = (await prisma.safe.findUniqueOrThrow({ where: { id: kasa.id } })).balance;
  const hareketOnce = await prisma.transaction.count();
  const nakitRes = await fetch(`${API}/api/sales/return-discretionary`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      branchId: magaza.id,
      safeId: kasa.id,
      paymentMethod: 'Nakit',
      exchangeRate: 1,
      items: [{ productId: urun.id, quantity: 1, unitPrice: 30, isChinaReturn: false }],
    }),
  });
  const nakit = (await nakitRes.json()) as { success: boolean; message?: string };
  if (!nakit.success) throw new Error(`Nakit iade basarisiz: ${nakit.message}`);
  const kasaSonra = (await prisma.safe.findUniqueOrThrow({ where: { id: kasa.id } })).balance;
  kontrol('nakit iade kasadan 30 dusurdu', yakin(kasaOnce - kasaSonra, 30), `${kasaOnce} -> ${kasaSonra}`);
  kontrol('nakit iade kasa hareketi yazdi', (await prisma.transaction.count()) === hareketOnce + 1, 'Transaction +1');
  const bakiyeNakitSonra = (await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } })).balance;
  kontrol('nakit iade cariye DOKUNMADI', yakin(bakiyeNakitSonra, 60), `bakiye=${bakiyeNakitSonra}`);

  // ── 5. Duzenleme createdAt'i oynatmiyor ───────────────────────────────
  console.log('\n[5] Satis faturasi duzenleniyor — tarih ayni');
  const oncekiFatura = await prisma.invoice.findUniqueOrThrow({ where: { id: satis.data.id } });
  const oncekiZaman = oncekiFatura.createdAt.getTime();
  const tarihStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(
    oncekiFatura.createdAt
  );
  await new Promise((r) => setTimeout(r, 1200));
  await fetch(`${API}/api/sales/invoices/${satis.data.id}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      invoiceDate: tarihStr,
      exchangeRate: 1,
      items: (satis.data.items ?? []).map((k) => ({
        id: k.id,
        quantity: 4,
        unitPrice: 25,
        discountPercent: 0,
      })),
    }),
  });
  const sonrakiFatura = await prisma.invoice.findUniqueOrThrow({ where: { id: satis.data.id } });
  kontrol(
    'duzenleme createdAt\'i OYNATMADI (ekstre sirasi sabit)',
    sonrakiFatura.createdAt.getTime() === oncekiZaman,
    `${oncekiFatura.createdAt.toISOString()} -> ${sonrakiFatura.createdAt.toISOString()}`
  );

  // ── 6. Tekrar kaydetmek kalemleri katlamiyor ──────────────────────────
  console.log('\n[6] Ayni fatura ucuncu kez kaydediliyor');
  const kalemOnce = await prisma.invoiceItem.count({ where: { invoiceId: satis.data.id } });
  await fetch(`${API}/api/sales/invoices/${satis.data.id}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      invoiceDate: tarihStr,
      exchangeRate: 1,
      items: (satis.data.items ?? []).map((k) => ({
        id: k.id,
        quantity: 4,
        unitPrice: 25,
        discountPercent: 0,
      })),
    }),
  });
  const kalemSonra = await prisma.invoiceItem.count({ where: { invoiceId: satis.data.id } });
  kontrol('kalemler katlanmadi', kalemOnce === kalemSonra, `${kalemOnce} -> ${kalemSonra}`);
  const faturaSayisi = await prisma.invoice.count({ where: { type: 'SATIS', customerId: musteri.id } });
  kontrol('ikinci bir SATIS faturasi acilmadi', faturaSayisi === 1, `satis faturasi=${faturaSayisi}`);

  // ── 8. Tahsilat guncellemek bakiyeyi katlamiyor ───────────────────────
  console.log('\n[8] Tahsilat 20 $, sonra ayni kayit 20 -> 50 guncelleniyor');
  const bakiyeOnce = (await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } })).balance;
  const tahsRes = await fetch(`${API}/api/customers/payment`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      safeId: kasa.id,
      type: 'GIRIS',
      amount: 20,
      method: 'Nakit',
      description: 'Duzeltme denemesi',
    }),
  });
  const tahs = (await tahsRes.json()) as { success: boolean; data?: { id: number } };
  if (!tahs.success || !tahs.data) throw new Error('Tahsilat basarisiz');
  let b = (await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } })).balance;
  kontrol('tahsilat bakiyeyi 20 dusurdu', yakin(b, bakiyeOnce - 20), `${bakiyeOnce} -> ${b}`);

  // Ayni tutarla tekrar "kaydet" — bakiye DEGISMEMELI
  await fetch(`${API}/api/customers/payment/${tahs.data.id}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({
      amount: 20,
      type: 'GIRIS',
      method: 'Nakit',
      safeId: kasa.id,
      customerId: musteri.id,
    }),
  });
  b = (await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } })).balance;
  kontrol('ayni tutarla tekrar kaydetmek bakiyeyi DEGISTIRMEDI', yakin(b, bakiyeOnce - 20), `bakiye=${b}`);

  // 20 -> 50
  await fetch(`${API}/api/customers/payment/${tahs.data.id}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({
      amount: 50,
      type: 'GIRIS',
      method: 'Nakit',
      safeId: kasa.id,
      customerId: musteri.id,
    }),
  });
  b = (await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } })).balance;
  kontrol('20 -> 50 guncellemesi dogru islendi', yakin(b, bakiyeOnce - 50), `bakiye=${b}`);
  const tahsSayisi = await prisma.transaction.count({
    where: { customerId: musteri.id, receiptNo: { not: null } },
  });
  kontrol('ikinci bir tahsilat kaydi acilmadi', tahsSayisi === 1, `tahsilat=${tahsSayisi}`);

  console.log(hata === 0 ? '\nTUM KONTROLLER GECTI' : `\n${hata} KONTROL KALDI`);
  process.exitCode = hata === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
