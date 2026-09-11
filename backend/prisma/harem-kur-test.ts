/**
 * Harem kuru + fark testi — YALNIZCA yerel denemede kullanilir.
 *
 * Neyi dogruluyor:
 *
 *   1. /api/exchange-rates gercekten HAREM'den besleniyor (TCMB'ye
 *      dusmuyor) ve kaynak yazisi bunu soyluyor.
 *
 *   2. Fark DOGRU EKLENIYOR. Test kendi socket baglantisini acip Harem'in
 *      ham USDTRY satis kurunu bagimsiz olarak okur, sonra ucun donduğu
 *      rakamla karsilastirir: aradaki fark KUR_FARKI kadar olmali.
 *
 *   3. Fis uzerindeki kur (Invoice.tryRate) ile tahsilatta kullanilan kur
 *      AYNI. Farkli olsalardi musteri fiste bir kur gorup baska bir kurdan
 *      borclandirilirdi.
 *
 *   4. Kur farki cari bakiyeye ne kadar dokunuyor — rakamla gosterilir.
 *
 * Calistirma:
 *   DATABASE_URL=... KUR_FARKI=0.20 npx tsx prisma/harem-kur-test.ts
 *
 * Sunucu ayri terminalde ayakta olmali ve AYNI KUR_FARKI ile acilmis
 * olmali; fark sunucu tarafinda uygulanir.
 */
import { prisma } from '../src/lib/prisma';

const API = process.env.TEST_API ?? 'http://127.0.0.1:3000';
const ADMIN_USER = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? 'test';
const FARK = Number.parseFloat(process.env.KUR_FARKI ?? '0.20');

let hata = 0;

function kontrol(baslik: string, kosul: boolean, ayrinti: string) {
  if (kosul) console.log(`  GECTI  ${baslik}  (${ayrinti})`);
  else {
    hata += 1;
    console.error(`  KALDI  ${baslik}  (${ayrinti})`);
  }
}

const yakin = (a: number, b: number, tol = 0.005) => Math.abs(a - b) < tol;

/** Harem'in HAM USDTRY satis kurunu bagimsiz olarak okur. */
function haremHamKur(sureMs = 25000): Promise<number | null> {
  return new Promise((resolve) => {
    const ws = new WebSocket(
      'wss://hrmsocketonly.haremaltin.com/socket.io/?EIO=4&transport=websocket'
    );
    let bitti = false;
    const bitir = (deger: number | null) => {
      if (bitti) return;
      bitti = true;
      try { ws.close(); } catch { /* kapali */ }
      resolve(deger);
    };
    const zaman = setTimeout(() => bitir(null), sureMs);
    ws.onmessage = (olay: MessageEvent) => {
      const m = String(olay.data);
      if (m.startsWith('0') && !m.startsWith('40')) { ws.send('40'); return; }
      if (m === '2') { ws.send('3'); return; }
      if (!m.startsWith('42')) return;
      try {
        const [ad, govde] = JSON.parse(m.slice(2)) as [string, { data?: Record<string, { satis?: string }> }];
        if (ad !== 'price_changed') return;
        const satis = govde?.data?.USDTRY?.satis;
        if (satis) {
          clearTimeout(zaman);
          bitir(Number.parseFloat(satis));
        }
      } catch { /* bozuk cerceve */ }
    };
    ws.onerror = () => bitir(null);
  });
}

async function main() {
  console.log(`\nKUR_FARKI = ${FARK}\n`);

  // ── 0. Giris — tum uclar kimlik dogrulamasi istiyor ───────────────────
  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const basliklar = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // ── 1. Ucun donduğu kur ───────────────────────────────────────────────
  const kurRes = await fetch(`${API}/api/exchange-rates`, { headers: basliklar });
  const kurJson = (await kurRes.json()) as {
    data?: { usd: number; eur: number; source: string; uyari: string | null };
  };
  const kur = kurJson.data;
  if (!kur) throw new Error('Kur ucu yanit vermedi');

  console.log('[1] /api/exchange-rates');
  console.log(`    kaynak: ${kur.source} · usd: ${kur.usd} · uyari: ${kur.uyari ?? 'yok'}`);

  kontrol(
    'kaynak Harem (TCMB\'ye dusulmedi)',
    kur.source.startsWith('Harem'),
    `source="${kur.source}"`
  );
  kontrol('bayatlik uyarisi yok', kur.uyari === null, `uyari=${kur.uyari ?? 'null'}`);

  // ── 2. Fark dogru mu — Harem'i bagimsiz oku ───────────────────────────
  console.log('\n[2] Harem ham kuru bagimsiz okunuyor...');
  const ham = await haremHamKur();
  if (ham === null) {
    console.error('  ATLANDI  Harem socketinden ham kur alinamadi');
    hata += 1;
  } else {
    console.log(`    ham satis: ${ham}  ·  ucun donduğu: ${kur.usd}`);
    kontrol(
      'fark tam olarak KUR_FARKI kadar',
      // Kur saniyeler icinde oynayabilir; tolerans genis tutuldu.
      yakin(kur.usd - ham, FARK, 0.05),
      `${(kur.usd - ham).toFixed(4)} ~ ${FARK}`
    );
    kontrol('ham kura fark EKLENDI (cikarilmadi)', kur.usd > ham, `${kur.usd} > ${ham}`);
  }

  // ── 3. Fisteki kur ile tahsilattaki kur ayni mi ───────────────────────
  console.log('\n[3] Fis kuru ile tahsilat kuru ayni mi');
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
    where: { code: 'HRM001' },
    update: { balance: 0 },
    create: { code: 'HRM001', name: 'Harem Kuru Deneme', balance: 0 },
  });
  const urun = await prisma.product.upsert({
    where: { sku: 'HRM00001' },
    update: { priceUsd: 50, priceUsd2: 50, costPrice: 20 },
    create: { sku: 'HRM00001', name: 'Harem Deneme Urunu', costPrice: 20, priceUsd: 50, priceUsd2: 50 },
  });
  await prisma.productStock.upsert({
    where: { productId_branchId: { productId: urun.id, branchId: merkez.id } },
    update: { quantity: 50 },
    create: { productId: urun.id, branchId: merkez.id, quantity: 50 },
  });
  await prisma.stockLot.deleteMany({ where: { productId: urun.id } });
  await prisma.stockLot.create({
    data: { productId: urun.id, branchId: merkez.id, quantity: 50, unitCost: 20, isOpening: true },
  });

  const satisRes = await fetch(`${API}/api/sales/store`, {
    method: 'POST',
    headers: basliklar,
    body: JSON.stringify({
      customerId: musteri.id,
      branchId: magaza.id,
      safeId: kasa.id,
      paymentMethod: 'Cari',
      exchangeRate: 1,
      deliveryType: 'Magazadan Teslim',
      items: [{ productId: urun.id, quantity: 2, unitPrice: 50, discountPercent: 0 }],
    }),
  });
  const satis = (await satisRes.json()) as { success: boolean; data?: { id: number }; message?: string };
  if (!satis.success || !satis.data) throw new Error(`Satis basarisiz: ${satis.message}`);
  const fatura = await prisma.invoice.findUniqueOrThrow({ where: { id: satis.data.id } });

  kontrol(
    'faturaya yazilan kur = ucun donduğu kur',
    fatura.tryRate != null && yakin(fatura.tryRate, kur.usd, 0.05),
    `fatura=${fatura.tryRate} uc=${kur.usd}`
  );
  kontrol(
    'tutar ve bakiye USD kaldi (kur bulasmadi)',
    yakin(fatura.totalAmountUsd, 100) && yakin(fatura.totalAmountTl, 100),
    `usd=${fatura.totalAmountUsd} tl=${fatura.totalAmountTl}`
  );
  const musteriSon = await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } });
  kontrol('cari bakiye 100 $', yakin(musteriSon.balance, 100), `bakiye=${musteriSon.balance}`);

  // ── 4. Farkin cari bakiyeye etkisi ────────────────────────────────────
  console.log('\n[4] Farkin TL tahsilata etkisi (frontend amountToStoredUsd ile ayni hesap)');
  const tlTutar = 10000;
  const farksiz = ham ? Math.round((tlTutar / ham) * 100) / 100 : null;
  const farkli = Math.round((tlTutar / kur.usd) * 100) / 100;
  if (farksiz !== null) {
    console.log(`    ${tlTutar} TL odeme:`);
    console.log(`      farksiz kur ${ham}  -> ${farksiz} $ cariye`);
    console.log(`      farkli  kur ${kur.usd} -> ${farkli} $ cariye`);
    console.log(`      musteri lehine fark : ${(farksiz - farkli).toFixed(2)} $ daha AZ dusuluyor`);
    kontrol(
      'fark cariye yazilan dolari AZALTIYOR (marj yonu dogru)',
      farkli < farksiz,
      `${farkli} < ${farksiz}`
    );
  }

  console.log(hata === 0 ? '\nTUM KONTROLLER GECTI' : `\n${hata} KONTROL KALDI`);
  process.exitCode = hata === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
