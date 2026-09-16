/**
 * 17 Eylul 2026 — "iadeye urun ekleyip kaydettikce onceki eklemeler
 * tekrar yaziliyor" olayi. YALNIZCA yerel denemede kullanilir.
 *
 * Personelin yaptigi tur: fisi kaydet -> urun ekle -> Kaydet -> bir urun
 * daha ekle -> Kaydet. Ekran, guncelleme (PUT) yanitindaki kalem id'lerini
 * satirlara yazmiyordu; duzenlemede eklenen satir her Kaydet'te yine
 * "yeni kalem" diye gidiyor ve fis her turda katlaniyordu.
 *
 * Duzeltme ekranda (frontend/src/lib/kalemEsleme.ts). Bu betik ayni
 * yardimciyi kullanarak ekranin gonderdigi govdeyi birebir uretir ve
 * GERCEK UC uzerinden olcer:
 *   1. iade kaydi -> 1 kalem
 *   2. urun ekle, kaydet -> 2 kalem, stok dogru
 *   3. bir urun daha ekle, kaydet -> 3 kalem (4 degil), stok dogru
 *   4. degistirmeden tekrar kaydet -> 3 kalem
 *   5. ayni tur alis faturasinda -> 3 kalem
 *   6. eski ekran davranisi (id yazilmadan) gercekten katliyor mu — evet;
 *      hata sunucuda degil ekrandaydi, bunu belgeler
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/tekrar-kaydet-test.ts
 */
import { prisma } from '../src/lib/prisma';
import { kalemIdleriniEsle } from '../../frontend/src/lib/kalemEsleme';

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

/** Ekrandaki satir: sunucu id'si varsa `id`, yoksa `productId` ile gider */
type Satir = { id?: number; productId: number; quantity: number; unitPrice: number };
type Kalem = { id: number; productId: number };

const govde = (satirlar: Satir[]) =>
  satirlar.map((s) => ({
    ...(s.id ? { id: s.id } : { productId: s.productId }),
    quantity: s.quantity,
    unitPrice: s.unitPrice,
    discountPercent: 0,
  }));

const esle = (satirlar: Satir[], kalemler: Kalem[] | undefined) =>
  kalemIdleriniEsle(
    satirlar,
    kalemler,
    (s) => s.id,
    (s) => s.productId,
    (s, id) => ({ ...s, id })
  );

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
  const kasa =
    (await prisma.safe.findFirst({ where: { branchId: magaza.id } })) ??
    (await prisma.safe.create({
      data: { branchId: magaza.id, name: 'Merkez Kasa', currency: 'TRY', balance: 0 },
    }));
  const musteri = await prisma.customer.upsert({
    where: { code: 'TKR001' },
    update: { balance: 0 },
    create: { code: 'TKR001', name: 'Tekrar Kaydet Denemesi', balance: 0 },
  });
  const urunler: Array<{ id: number }> = [];
  for (const n of ['A', 'B', 'C']) {
    urunler.push(
      await prisma.product.upsert({
        where: { sku: `TKR0000${n}` },
        update: {},
        create: { sku: `TKR0000${n}`, name: `Tekrar ${n}`, costPrice: 5, priceUsd: 10 },
      })
    );
  }
  const [A, B, C] = urunler;
  const stok = async (productId: number) =>
    (await prisma.productStock.findFirst({ where: { productId, branchId: merkez.id } }))
      ?.quantity ?? 0;

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const put = async (id: number, satirlar: Satir[]) => {
    const res = await fetch(`${API}/api/sales/invoices/${id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ customerId: musteri.id, exchangeRate: 1, items: govde(satirlar) }),
    });
    const j = (await res.json()) as {
      success: boolean;
      data?: { items: Kalem[] };
      message?: string;
    };
    if (!j.success) throw new Error(`PUT basarisiz: ${j.message}`);
    return j.data?.items;
  };
  const kalemSayisi = (id: number) => prisma.invoiceItem.count({ where: { invoiceId: id } });

  // ── IADE ──────────────────────────────────────────────────────────────
  console.log('\n[iade] kaydet -> A');
  const stokA0 = await stok(A.id);
  const stokB0 = await stok(B.id);
  const stokC0 = await stok(C.id);
  const iadeRes = await fetch(`${API}/api/sales/return-discretionary`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      branchId: magaza.id,
      safeId: kasa.id,
      paymentMethod: 'Cari',
      exchangeRate: 1,
      items: [{ productId: A.id, quantity: 2, unitPrice: 20, isChinaReturn: false }],
    }),
  });
  const iade = (await iadeRes.json()) as {
    success: boolean;
    data?: { id: number; items: Kalem[] };
    message?: string;
  };
  if (!iade.success || !iade.data) throw new Error(`Iade basarisiz: ${iade.message}`);
  const iadeId = iade.data.id;
  // Iade ekrani kayittan sonra faturayi yeniden yukler: satirlar id'li gelir
  let satirlar: Satir[] = iade.data.items.map((k) => ({
    id: k.id,
    productId: k.productId,
    quantity: 2,
    unitPrice: 20,
  }));
  kontrol('ilk kayit 1 kalem', (await kalemSayisi(iadeId)) === 1, `kalem=${await kalemSayisi(iadeId)}`);

  console.log('[iade] B ekle -> Kaydet');
  satirlar = [...satirlar, { productId: B.id, quantity: 1, unitPrice: 15 }];
  satirlar = esle(satirlar, await put(iadeId, satirlar));
  kontrol('ikinci kayit 2 kalem', (await kalemSayisi(iadeId)) === 2, `kalem=${await kalemSayisi(iadeId)}`);
  kontrol(
    'B satiri sunucu id-sini aldi',
    satirlar.every((s) => s.id),
    JSON.stringify(satirlar.map((s) => s.id))
  );

  console.log('[iade] C ekle -> Kaydet  (musterinin gordugu an)');
  satirlar = [...satirlar, { productId: C.id, quantity: 1, unitPrice: 12 }];
  satirlar = esle(satirlar, await put(iadeId, satirlar));
  kontrol(
    'ucuncu kayit 3 kalem — B KATLANMADI',
    (await kalemSayisi(iadeId)) === 3,
    `kalem=${await kalemSayisi(iadeId)}`
  );
  kontrol('B stogu bir kez artti', (await stok(B.id)) - stokB0 === 1, `${stokB0} -> ${await stok(B.id)}`);

  console.log('[iade] degistirmeden Kaydet');
  satirlar = esle(satirlar, await put(iadeId, satirlar));
  kontrol('dorduncu kayit hala 3 kalem', (await kalemSayisi(iadeId)) === 3, `kalem=${await kalemSayisi(iadeId)}`);
  kontrol(
    'A stogu +2, C stogu +1',
    (await stok(A.id)) - stokA0 === 2 && (await stok(C.id)) - stokC0 === 1,
    `A ${stokA0}->${await stok(A.id)}, C ${stokC0}->${await stok(C.id)}`
  );

  // ── ALIS: ayni tur ─────────────────────────────────────────────────────
  console.log('\n[alis] kaydet -> A, B ekle -> Kaydet, C ekle -> Kaydet, Kaydet');
  const alisRes = await fetch(`${API}/api/purchases/store`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      branchId: magaza.id,
      safeId: kasa.id,
      paymentMethod: 'Cari',
      exchangeRate: 1,
      items: [{ productId: A.id, quantity: 3, unitPrice: 8 }],
    }),
  });
  const alis = (await alisRes.json()) as {
    success: boolean;
    data?: { id: number; items: Kalem[] };
    message?: string;
  };
  if (!alis.success || !alis.data) throw new Error(`Alis basarisiz: ${alis.message}`);
  const alisId = alis.data.id;
  // Alis ekrani yeniden yuklemez, kayit yanitindan esler
  let sepet: Satir[] = esle([{ productId: A.id, quantity: 3, unitPrice: 8 }], alis.data.items);
  kontrol('alis: kayit yanitindan eslendi', Boolean(sepet[0].id), `id=${sepet[0].id}`);
  sepet = [...sepet, { productId: B.id, quantity: 1, unitPrice: 7 }];
  sepet = esle(sepet, await put(alisId, sepet));
  sepet = [...sepet, { productId: C.id, quantity: 1, unitPrice: 6 }];
  sepet = esle(sepet, await put(alisId, sepet));
  sepet = esle(sepet, await put(alisId, sepet));
  kontrol('alis: uc turda 3 kalem', (await kalemSayisi(alisId)) === 3, `kalem=${await kalemSayisi(alisId)}`);

  // ── Eski ekran davranisi: id yazilmadan tekrar gonder ─────────────────
  console.log('\n[eski] B satiri id-siz tekrar gonderiliyor (eski ekranin yaptigi)');
  const eski = sepet.map((s) => (s.productId === B.id ? { ...s, id: undefined } : s));
  await put(alisId, eski);
  kontrol(
    'eski davranis gercekten katliyor (4 kalem) — hata ekrandaydi',
    (await kalemSayisi(alisId)) === 4,
    `kalem=${await kalemSayisi(alisId)}`
  );

  console.log(hata === 0 ? '\nTUM KONTROLLER GECTI' : `\n${hata} KONTROL KALDI`);
  process.exitCode = hata === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
