/**
 * Satis Kirilimi (urun + fis listesi) ve Kasa Raporu (kaynak + kasa ozeti).
 *
 * 15 Eylul 2026, musteri istegi: "tarih araliginda satilan tum urunler,
 * yapilan satislar, satilan urunler sirayla" ve "kasa giris/cikis neye gore?".
 *
 * Kontroller, hepsi gercek uc uzerinden:
 *   Satis kirilimi
 *     1. Iki nakit satis + bir cari satis -> fis listesi 3 fis, kayit sirasi
 *     2. Urun bazli: A 2 fiste 7 adet, B 1 fiste 2 adet; ciroya gore sirali
 *     3. Fisin kalemleri girildigi sirada (once A sonra B)
 *     4. Iade: urun sekmesinde iadeAdet dolar, fis listesine GIRMEZ
 *     5. Teslim bekleyen on siparis rapora GIRMEZ (ciro, urun, fis)
 *     6. Tarih penceresi yerel gun: from=bugun ile tum fisler var,
 *        from=yarin ile hicbiri yok
 *   Kasa raporu
 *     7. Kaynak siniflandirmasi: satis tahsilati, cari tahsilat, cari odeme,
 *        alis odemesi, iade odemesi, eski sistem aktarimi
 *     8. Kasa ozeti: giris - cikis = net, bakiye = kasanin gercek bakiyesi
 *     9. Cari satis kasaya GIRMEZ (satis tahsilati kaynagi yalnizca nakit)
 *    10. safeId suzgeci yalnizca o kasayi verir
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/rapor-test.ts
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

type Kirilim = { id: number; ad: string; ek: string | null; adet: number; ciro: number; kar: number; faturaSayisi: number; iadeAdet?: number };
type Satis = { id: number; fisNo: string; odeme: string; adet: number; tutar: number; kalemler: Array<{ sku: string; adet: number }> };
type Rapor = {
  toplam: { ciro: number; iade: number };
  urunler: Kirilim[];
  satislar: Satis[];
  fisSayisi: number;
};
type KasaRaporu = {
  summary: { totalIn: number; totalOut: number; net: number };
  kaynaklar: Array<{ kaynak: string; giris: number; cikis: number; adet: number }>;
  kasalar: Array<{ id: number; giris: number; cikis: number; net: number; bakiye: number }>;
  transactions: Array<{ kaynak: string; type: string; amount: number; safe: { id: number } }>;
};

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
  const kasa2 = await prisma.safe.create({
    data: { branchId: magaza.id, name: 'Ikinci Kasa', currency: 'USD', balance: 0 },
  });
  const musteri = await prisma.customer.create({
    data: { code: 'RPR001', name: 'Rapor Denemesi', balance: 0 },
  });
  const urunA = await prisma.product.create({
    data: { sku: 'RPR00001', name: 'RAPOR URUN A', costPrice: 5, priceUsd: 10, priceUsd2: 12 },
  });
  const urunB = await prisma.product.create({
    data: { sku: 'RPR00002', name: 'RAPOR URUN B', costPrice: 20, priceUsd: 30, priceUsd2: 35 },
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
    items: Array<{ productId: number; quantity: number; unitPrice: number }>,
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
  const rapor = async (from: string, to: string) => {
    const r = await fetch(`${API}/api/reports/sales-breakdown?from=${from}&to=${to}`, { headers: H });
    return ((await r.json()) as { data: Rapor }).data;
  };
  const kasaRaporu = async (from: string, to: string, safeId?: number) => {
    const r = await fetch(
      `${API}/api/reports/cash-flow?from=${from}&to=${to}${safeId ? `&safeId=${safeId}` : ''}`,
      { headers: H }
    );
    return ((await r.json()) as { data: KasaRaporu }).data;
  };

  const bugun = gun(new Date());
  const yarin = gun(new Date(Date.now() + 86_400_000));

  // ── 1-3. Uc satis ─────────────────────────────────────────────────────
  console.log('\n[1] Nakit: A 5 x 10 + B 2 x 30 · Nakit: A 2 x 10 · Cari: A 1 x 10 (on siparis)');
  const f1 = await satisKes([
    { productId: urunA.id, quantity: 5, unitPrice: 10 },
    { productId: urunB.id, quantity: 2, unitPrice: 30 },
  ]);
  const f2 = await satisKes([{ productId: urunA.id, quantity: 2, unitPrice: 10 }]);
  const f3 = await satisKes([{ productId: urunA.id, quantity: 3, unitPrice: 10 }], 'Cari');
  const ons = await satisKes([{ productId: urunB.id, quantity: 9, unitPrice: 30 }], 'Cari', true);

  let r = await rapor(bugun, bugun);
  kontrol('fis listesi 3 fis (on siparis haric)', r.fisSayisi === 3 && r.satislar.length === 3, `fisSayisi=${r.fisSayisi}`);
  kontrol('fisler kayit sirasinda', r.satislar.map((s) => s.id).join(',') === `${f1.id},${f2.id},${f3.id}`, r.satislar.map((s) => s.fisNo).join(' '));
  kontrol('ciro 110 + 20 + 30 = 160 (on siparis 270 yok)', yakin(r.toplam.ciro, 160), `ciro=${r.toplam.ciro}`);
  const ilkFis = r.satislar[0];
  kontrol('ilk fisin kalemleri girildigi sirada: A, B', ilkFis.kalemler.map((k) => k.sku).join(',') === 'RPR00001,RPR00002', ilkFis.kalemler.map((k) => k.sku).join(','));
  kontrol('ilk fis 7 adet 110 $', ilkFis.adet === 7 && yakin(ilkFis.tutar, 110), `adet=${ilkFis.adet} tutar=${ilkFis.tutar}`);

  const uA = r.urunler.find((u) => u.id === urunA.id);
  const uB = r.urunler.find((u) => u.id === urunB.id);
  kontrol('urun A: 3 fiste 10 adet, ciro 100, kar 50', !!uA && uA.faturaSayisi === 3 && uA.adet === 10 && yakin(uA.ciro, 100) && yakin(uA.kar, 50), `${JSON.stringify(uA)}`);
  kontrol('urun B: 1 fiste 2 adet, ciro 60 (on siparisin 9 adedi yok)', !!uB && uB.faturaSayisi === 1 && uB.adet === 2 && yakin(uB.ciro, 60), `${JSON.stringify(uB)}`);
  kontrol('urunler ciroya gore sirali (A once)', r.urunler[0]?.id === urunA.id, r.urunler.map((u) => u.ek).join(','));
  kontrol('ek alaninda stok kodu', uA?.ek === 'RPR00001', `ek=${uA?.ek}`);

  // ── 4. Iade ───────────────────────────────────────────────────────────
  console.log('\n[4] f2 iadesi: A 2 adet');
  const f2Kalem = await prisma.invoiceItem.findFirst({ where: { invoiceId: f2.id } });
  const iadeRes = await fetch(`${API}/api/sales/return`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id, branchId: magaza.id, safeId: kasa.id, paymentMethod: 'Nakit',
      exchangeRate: 1, originalInvoiceId: f2.id,
      items: [{ productId: urunA.id, quantity: 2, unitPrice: 10, sourceInvoiceItemId: f2Kalem?.id }],
    }),
  });
  const iade = (await iadeRes.json()) as { success: boolean; message?: string };
  kontrol('iade kesildi', iade.success, iade.message ?? 'ok');
  r = await rapor(bugun, bugun);
  kontrol('iade fis listesine girmedi', r.satislar.length === 3, `fis=${r.satislar.length}`);
  kontrol('urun A iadeAdet 2', r.urunler.find((u) => u.id === urunA.id)?.iadeAdet === 2, `iadeAdet=${r.urunler.find((u) => u.id === urunA.id)?.iadeAdet}`);
  kontrol('toplam iade 20', yakin(r.toplam.iade, 20), `iade=${r.toplam.iade}`);

  // ── 5. On siparis tamamlaninca rapora girer ───────────────────────────
  console.log('\n[5] On siparis tamamlaniyor');
  await fetch(`${API}/api/sales/invoices/${ons.id}/fulfill`, { method: 'POST', headers: { Authorization: H.Authorization } });
  r = await rapor(bugun, bugun);
  kontrol('tamamlanan on siparis fis listesinde (4 fis)', r.satislar.length === 4 && r.satislar[3]?.id === ons.id, `fis=${r.satislar.length}`);
  kontrol('urun B artik 11 adet', r.urunler.find((u) => u.id === urunB.id)?.adet === 11, `adet=${r.urunler.find((u) => u.id === urunB.id)?.adet}`);

  // ── 6. Tarih penceresi ────────────────────────────────────────────────
  console.log('\n[6] Tarih penceresi');
  const bos = await rapor(yarin, yarin);
  kontrol('from=yarin -> hicbir fis yok', bos.fisSayisi === 0 && bos.urunler.length === 0, `fis=${bos.fisSayisi}`);
  const genis = await rapor('2020-01-01', yarin);
  kontrol('genis aralik ayni sonucu verir', genis.fisSayisi === 4, `fis=${genis.fisSayisi}`);

  // ── 7-9. Kasa raporu ──────────────────────────────────────────────────
  console.log('\n[7] Kasa hareketleri: cari tahsilat 25, cari odeme 5, alis 40, eski sistem aktarimi 15 (kasa2)');
  const odeme = async (type: 'GIRIS' | 'CIKIS', amount: number, safeId = kasa.id, description?: string) =>
    fetch(`${API}/api/customers/payment`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ customerId: musteri.id, safeId, amount, type, method: 'Nakit', description }),
    });
  await odeme('GIRIS', 25);
  await odeme('CIKIS', 5);
  await odeme('CIKIS', 15, kasa2.id, 'ESKİ SİSTEMDEN AKTARILDI');
  const alisRes = await fetch(`${API}/api/purchases/store`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      customerId: musteri.id, branchId: merkez.id, safeId: kasa.id, paymentMethod: 'Nakit', exchangeRate: 1,
      items: [{ productId: urunA.id, quantity: 8, unitPrice: 5 }],
    }),
  });
  const alis = (await alisRes.json()) as { success: boolean; message?: string };
  kontrol('alis kesildi', alis.success, alis.message ?? 'ok');

  const k = await kasaRaporu(bugun, bugun);
  const kaynak = (ad: string) => k.kaynaklar.find((x) => x.kaynak === ad);
  kontrol('satis tahsilati: 2 nakit fis, 130 $ giris (cari satis YOK)', kaynak('SATIS_TAHSILAT')?.adet === 2 && yakin(kaynak('SATIS_TAHSILAT')?.giris ?? 0, 130), JSON.stringify(kaynak('SATIS_TAHSILAT')));
  kontrol('iade odemesi 20 cikis', yakin(kaynak('IADE_ODEME')?.cikis ?? 0, 20), JSON.stringify(kaynak('IADE_ODEME')));
  kontrol('cari tahsilat 25 giris', yakin(kaynak('CARI_TAHSILAT')?.giris ?? 0, 25), JSON.stringify(kaynak('CARI_TAHSILAT')));
  kontrol('cari odeme 5 cikis', yakin(kaynak('CARI_ODEME')?.cikis ?? 0, 5), JSON.stringify(kaynak('CARI_ODEME')));
  kontrol('alis odemesi 40 cikis', yakin(kaynak('ALIS_ODEME')?.cikis ?? 0, 40), JSON.stringify(kaynak('ALIS_ODEME')));
  kontrol('eski sistem aktarimi ayri grupta 15', yakin(kaynak('ACILIS')?.cikis ?? 0, 15), JSON.stringify(kaynak('ACILIS')));
  kontrol('toplam giris 155, cikis 80', yakin(k.summary.totalIn, 155) && yakin(k.summary.totalOut, 80), `in=${k.summary.totalIn} out=${k.summary.totalOut}`);

  const k1 = k.kasalar.find((x) => x.id === kasa.id);
  const k2 = k.kasalar.find((x) => x.id === kasa2.id);
  const gercek1 = await prisma.safe.findUniqueOrThrow({ where: { id: kasa.id } });
  kontrol('kasa1: giris 155, cikis 65, net 90', !!k1 && yakin(k1.giris, 155) && yakin(k1.cikis, 65) && yakin(k1.net, 90), JSON.stringify(k1));
  kontrol('kasa1 bakiye = gercek bakiye (1090)', !!k1 && yakin(k1.bakiye, gercek1.balance) && yakin(k1.bakiye, 1090), `rapor=${k1?.bakiye} gercek=${gercek1.balance}`);
  kontrol('kasa2: cikis 15, bakiye -15', !!k2 && yakin(k2.cikis, 15) && yakin(k2.bakiye, -15), JSON.stringify(k2));

  // ── 10. Kasa suzgeci ──────────────────────────────────────────────────
  const k2r = await kasaRaporu(bugun, bugun, kasa2.id);
  kontrol('safeId suzgeci: yalnizca kasa2', k2r.transactions.length === 1 && k2r.kasalar.length === 1 && k2r.transactions.every((t) => t.safe.id === kasa2.id), `hareket=${k2r.transactions.length} kasa=${k2r.kasalar.length}`);

  // ── 11. Urun stok gecmisi toplamlari (16 Eylul 2026) ────────────────
  // A: satis 5+2+3=10 cikis; iade 2 + alis 8 = 10 giris; mevcut 100-10+2+8 = 100
  const shRes = await fetch(`${API}/api/reports/stock-history?productId=${urunA.id}&page=1&limit=5`, { headers: H });
  const sh = ((await shRes.json()) as { urunToplam: { giris: number; cikis: number; mevcut: number } | null }).urunToplam;
  kontrol('urun toplam: giris 10, cikis 10, mevcut 100 (sayfalamadan bagimsiz)', !!sh && sh.giris === 10 && sh.cikis === 10 && sh.mevcut === 100, JSON.stringify(sh));

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
