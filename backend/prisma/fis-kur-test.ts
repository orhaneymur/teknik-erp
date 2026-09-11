/**
 * Fiş TL kuru testi — YALNIZCA yerel denemede kullanılır.
 *
 * Neyi doğruluyor:
 *
 *   1. Satış ve tahsilat kaydedilirken `tryRate` alanına gerçek kur yazılıyor
 *      (fiş yeniden basıldığında o günün rakamı çıksın diye).
 *
 *   2. ASIL MESELE — kur PARAYA BULAŞMIYOR. `totalAmountTl` alanı adına
 *      rağmen USD tutar taşır ve cari bakiye bu alandan işler. Kuru
 *      `exchangeRate`e yazsaydık `totalAmountUsd = totalAmountTl / kur`
 *      hesabı 41 kat küçülür, kâr ve ciro raporları sessizce bozulurdu.
 *      Bu test onu yakalar: exchangeRate 1 kalmalı, iki tutar eşit olmalı,
 *      bakiye USD tutarı kadar değişmeli.
 *
 * Çalıştırma (CLAUDE.md'deki yerel kap kurulduktan sonra):
 *   npx tsx prisma/fis-kur-test.ts
 *
 * Sunucu ayrı bir terminalde ayakta olmalı:
 *   DATABASE_URL=... JWT_SECRET=test ADMIN_PASSWORD=test npm start
 */
import { prisma } from '../src/lib/prisma';

const API = process.env.TEST_API ?? 'http://127.0.0.1:3000';
const ADMIN_USER = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? 'test';

let hata = 0;

function kontrol(baslik: string, kosul: boolean, ayrinti: string) {
  if (kosul) {
    console.log(`  GECTI  ${baslik}  (${ayrinti})`);
  } else {
    hata += 1;
    console.error(`  KALDI  ${baslik}  (${ayrinti})`);
  }
}

function yakin(a: number, b: number) {
  return Math.abs(a - b) < 0.005;
}

async function main() {
  // ── Asgari kurulum ───────────────────────────────────────────────────
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
    where: { code: 'FIS001' },
    update: { balance: 0 },
    create: { code: 'FIS001', name: 'Fis Kuru Deneme', balance: 0 },
  });

  const urun = await prisma.product.upsert({
    where: { sku: 'FIS00001' },
    update: { priceUsd: 45, priceUsd2: 45, costPrice: 20 },
    create: {
      sku: 'FIS00001',
      name: 'Fis Deneme Urunu',
      costPrice: 20,
      priceUsd: 45,
      priceUsd2: 45,
    },
  });

  // Satis stoktan duser; acilis katmani acalim
  await prisma.productStock.upsert({
    where: { productId_branchId: { productId: urun.id, branchId: merkez.id } },
    update: { quantity: 100 },
    create: { productId: urun.id, branchId: merkez.id, quantity: 100 },
  });
  await prisma.stockLot.deleteMany({ where: { productId: urun.id } });
  await prisma.stockLot.create({
    data: {
      productId: urun.id,
      branchId: merkez.id,
      quantity: 100,
      unitCost: 20,
      isOpening: true,
    },
  });

  // ── Giris ────────────────────────────────────────────────────────────
  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const giris = (await girisRes.json()) as { data?: { token?: string } };
  const token = giris.data?.token;
  if (!token) throw new Error(`Giris basarisiz: ${JSON.stringify(giris)}`);
  const basliklar = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // ── 1. Satis ─────────────────────────────────────────────────────────
  console.log('\n[1] Satis — 2 adet x 45,00 USD = 90,00 USD, CARI');
  // Kur onbellegi bos: bu ilk satis aga cikan yolu kullanir. Sure olculur
  // cunku kur cekimi satisi bekletmemeli (bkz. receiptTryRate).
  const satisBaslangic = Date.now();
  const satisRes = await fetch(`${API}/api/sales/store`, {
    method: 'POST',
    headers: basliklar,
    body: JSON.stringify({
      customerId: musteri.id,
      branchId: magaza.id,
      safeId: kasa.id,
      paymentMethod: 'Cari',
      paymentType: 'Vadeli',
      exchangeRate: 1,
      deliveryType: 'Magazadan Teslim',
      processedBy: 'Test Personeli',
      orderNotes: 'Fis aciklama denemesi',
      items: [{ productId: urun.id, quantity: 2, unitPrice: 45, discountPercent: 0 }],
    }),
  });
  const satis = (await satisRes.json()) as {
    success: boolean;
    data?: { id: number };
    message?: string;
  };
  if (!satis.success || !satis.data) throw new Error(`Satis basarisiz: ${satis.message}`);

  const satisSuresi = Date.now() - satisBaslangic;

  const fatura = await prisma.invoice.findUniqueOrThrow({ where: { id: satis.data.id } });

  kontrol(
    'kur cekimi satisi bekletmedi (onbellek bosken bile)',
    satisSuresi < 5000,
    `${satisSuresi} ms`
  );

  kontrol('tryRate yazildi', (fatura.tryRate ?? 0) > 0, `tryRate=${fatura.tryRate}`);
  kontrol(
    'exchangeRate 1 kaldi',
    fatura.exchangeRate === 1,
    `exchangeRate=${fatura.exchangeRate}`
  );
  kontrol(
    'totalAmountTl ile totalAmountUsd esit (tutarlar USD)',
    yakin(fatura.totalAmountTl, fatura.totalAmountUsd),
    `tl=${fatura.totalAmountTl} usd=${fatura.totalAmountUsd}`
  );
  kontrol('tutar 90,00', yakin(fatura.totalAmountUsd, 90), `usd=${fatura.totalAmountUsd}`);

  const musteriSonrasi = await prisma.customer.findUniqueOrThrow({
    where: { id: musteri.id },
  });
  kontrol(
    'cari bakiye USD tutari kadar arti (kur bulasmadi)',
    yakin(musteriSonrasi.balance, 90),
    `bakiye=${musteriSonrasi.balance} — kur bulassaydi ~${(
      90 * (fatura.tryRate ?? 1)
    ).toFixed(0)} olurdu`
  );

  // ── 2. Tahsilat ──────────────────────────────────────────────────────
  console.log('\n[2] Tahsilat — 30,00 USD');
  const tahsilatRes = await fetch(`${API}/api/customers/payment`, {
    method: 'POST',
    headers: basliklar,
    body: JSON.stringify({
      customerId: musteri.id,
      safeId: kasa.id,
      type: 'GIRIS',
      amount: 30,
      method: 'Nakit',
      description: 'Fis kuru denemesi',
    }),
  });
  const tahsilat = (await tahsilatRes.json()) as {
    success: boolean;
    data?: { id: number };
    message?: string;
  };
  if (!tahsilat.success || !tahsilat.data) {
    throw new Error(`Tahsilat basarisiz: ${tahsilat.message}`);
  }

  const hareket = await prisma.transaction.findUniqueOrThrow({
    where: { id: tahsilat.data.id },
  });
  kontrol('tahsilat tryRate yazildi', (hareket.tryRate ?? 0) > 0, `tryRate=${hareket.tryRate}`);
  kontrol('tahsilat tutari USD kaldi', yakin(hareket.amount, 30), `amount=${hareket.amount}`);

  const musteriSon = await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } });
  kontrol('bakiye 90 - 30 = 60', yakin(musteriSon.balance, 60), `bakiye=${musteriSon.balance}`);

  // ── 3. Eski kayit — kuru olmayan fatura ──────────────────────────────
  console.log('\n[3] Surum oncesi kayit taklidi — tryRate NULL');
  await prisma.invoice.update({ where: { id: fatura.id }, data: { tryRate: null } });
  const eski = await prisma.invoice.findUniqueOrThrow({ where: { id: fatura.id } });
  kontrol(
    'kuru olmayan kayit okunabiliyor (fis TL satirini basmaz)',
    eski.tryRate === null && yakin(eski.totalAmountUsd, 90),
    `tryRate=${eski.tryRate} usd=${eski.totalAmountUsd}`
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
