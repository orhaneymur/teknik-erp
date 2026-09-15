/**
 * Elle stok girisi katman acsin — YALNIZCA yerel denemede kullanilir.
 *
 * 14 Eylul 2026: canlida 30'dan fazla urunde stok ile FIFO katmani
 * ayrismisti. Sebep: "Stok Karti Olustur" (POST /api/products) ve urun
 * kartindaki stok duzenleme (PUT /api/products/:id/stock) stogu yaziyor
 * ama katman acmiyordu. O urunler satilinca maliyet urun kartindaki
 * varsayilana dusuyor, kar raporu yaklasik cikiyordu.
 *
 * Kontroller, hepsi GERCEK UC uzerinden:
 *
 *   1. Stok karti 20 adet / maliyet 12,70 ile acilinca 20'lik katman var
 *   2. Stok elle 20 -> 35 yapilinca 15'lik ikinci katman aciliyor
 *   3. Stok elle 35 -> 30 yapilinca EN YENI katmandan dusuyor (ilk katman
 *      dokunulmuyor — gercek alislar korunur)
 *   4. Satista birim maliyet katmandan geliyor (12,70), sifir degil
 *   5. Satis sonrasi stok = katman toplami (ayrisma yok)
 *   6. Stok 0 yazilinca butun katmanlar kapaniyor
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/elle-stok-katman-test.ts
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

async function katmanlar(productId: number, branchId: number) {
  const lotlar = await prisma.stockLot.findMany({
    where: { productId, branchId, quantity: { gt: 0 } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const toplam = lotlar.reduce((t, l) => t + l.quantity, 0);
  return { lotlar, toplam, ozet: lotlar.map((l) => `${l.quantity}@${l.unitCost}`).join(' + ') || 'yok' };
}

async function stok(productId: number, branchId: number) {
  const s = await prisma.productStock.findUnique({
    where: { productId_branchId: { productId, branchId } },
  });
  return s?.quantity ?? 0;
}

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
  const musteri = await prisma.customer.upsert({
    where: { code: 'ESK001' },
    update: { balance: 0 },
    create: { code: 'ESK001', name: 'Elle Stok Denemesi', balance: 0 },
  });

  // Onceki kosudan kalan urunu temizle
  const eski = await prisma.product.findUnique({ where: { sku: 'ESK00001' } });
  if (eski) {
    await prisma.invoiceItem.deleteMany({ where: { productId: eski.id } });
    await prisma.stockLot.deleteMany({ where: { productId: eski.id } });
    await prisma.productStock.deleteMany({ where: { productId: eski.id } });
    await prisma.product.delete({ where: { id: eski.id } });
  }

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // ── 1. Stok karti baslangic adediyle ──────────────────────────────────
  console.log('\n[1] Stok Karti Olustur — 20 adet, maliyet 12,70');
  const olusturRes = await fetch(`${API}/api/products`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      sku: 'ESK00001',
      name: 'IPH-12 LCD HD+ (ELLE STOK DENEME)',
      costPrice: 12.7,
      priceUsd: 15.5,
      priceUsd2: 17,
      initialQuantity: 20,
    }),
  });
  const olustur = (await olusturRes.json()) as {
    success: boolean;
    data?: { id: number };
    message?: string;
  };
  if (!olustur.success || !olustur.data) throw new Error(`Urun acilamadi: ${olustur.message}`);
  const urunId = olustur.data.id;

  let k = await katmanlar(urunId, merkez.id);
  kontrol('baslangic adedi katman acti', k.lotlar.length === 1 && yakin(k.toplam, 20), `katman: ${k.ozet}`);
  kontrol('katman maliyeti urun kartindan geldi', !!k.lotlar[0] && yakin(k.lotlar[0].unitCost, 12.7), `unitCost=${k.lotlar[0]?.unitCost}`);
  kontrol('katman sayimdan (isOpening) isaretli', k.lotlar[0]?.isOpening === true, `isOpening=${k.lotlar[0]?.isOpening}`);

  // ── 2. Stok elle artiriliyor ─────────────────────────────────────────
  console.log('\n[2] Stok duzenle — 20 -> 35');
  await fetch(`${API}/api/products/${urunId}/stock`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ stocks: [{ branchId: merkez.id, quantity: 35 }] }),
  });
  k = await katmanlar(urunId, merkez.id);
  kontrol('artis kadar ikinci katman acildi', k.lotlar.length === 2 && yakin(k.toplam, 35), `katman: ${k.ozet}`);
  kontrol('stok = katman toplami', yakin(await stok(urunId, merkez.id), k.toplam), `stok=${await stok(urunId, merkez.id)} katman=${k.toplam}`);

  // ── 3. Stok elle azaltiliyor ─────────────────────────────────────────
  console.log('\n[3] Stok duzenle — 35 -> 30 (en yeni katmandan dusmeli)');
  await fetch(`${API}/api/products/${urunId}/stock`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ stocks: [{ branchId: merkez.id, quantity: 30 }] }),
  });
  k = await katmanlar(urunId, merkez.id);
  kontrol('katman toplami 30', yakin(k.toplam, 30), `katman: ${k.ozet}`);
  kontrol('ilk katman (20) dokunulmadi', !!k.lotlar[0] && yakin(k.lotlar[0].quantity, 20), `ilk=${k.lotlar[0]?.quantity}`);
  kontrol('ikinci katman 15 -> 10', !!k.lotlar[1] && yakin(k.lotlar[1].quantity, 10), `ikinci=${k.lotlar[1]?.quantity}`);

  // ── 4. Satista maliyet katmandan ─────────────────────────────────────
  console.log('\n[4] Satis — 3 adet x 15,50 (Cari)');
  const satisRes = await fetch(`${API}/api/sales/store`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      branchId: magaza.id,
      safeId: kasa.id,
      paymentMethod: 'Cari',
      exchangeRate: 1,
      items: [{ productId: urunId, quantity: 3, unitPrice: 15.5 }],
    }),
  });
  const satis = (await satisRes.json()) as { success: boolean; data?: { id: number }; message?: string };
  if (!satis.success || !satis.data) throw new Error(`Satis basarisiz: ${satis.message}`);

  const kalem = await prisma.invoiceItem.findFirst({ where: { invoiceId: satis.data.id } });
  kontrol('satis maliyeti katmandan geldi (12,70)', !!kalem && kalem.unitCost != null && yakin(kalem.unitCost, 12.7), `unitCost=${kalem?.unitCost}`);
  k = await katmanlar(urunId, merkez.id);
  const s = await stok(urunId, merkez.id);
  kontrol('satis sonrasi stok 27', yakin(s, 27), `stok=${s}`);
  kontrol('satis sonrasi stok = katman toplami', yakin(s, k.toplam), `stok=${s} katman=${k.toplam} (${k.ozet})`);

  // ── 5. Stok sifirlaniyor ─────────────────────────────────────────────
  console.log('\n[5] Stok duzenle — 0');
  await fetch(`${API}/api/products/${urunId}/stock`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ stocks: [{ branchId: merkez.id, quantity: 0 }] }),
  });
  k = await katmanlar(urunId, merkez.id);
  kontrol('butun katmanlar kapandi', k.lotlar.length === 0 && yakin(k.toplam, 0), `katman: ${k.ozet}`);

  console.log(hata === 0 ? '\nHEPSI GECTI' : `\n${hata} KONTROL KALDI`);
  process.exit(hata === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
