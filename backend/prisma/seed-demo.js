/**
 * TeknikERP — DEMO test verisi.
 *
 * 10 musteri, 500 telefon aksesuar urunu, stok, kasa hareketleri ve gecmis
 * satis faturalari olusturur; boylece raporlar bos degil gercekci gorunur.
 *
 * DUZ JAVASCRIPT: uretim imajinda tsx/typescript yoktur, bu yuzden seed.ts
 * gibi TypeScript yazilamaz. Bu dosya backend imajinda dogrudan calisir:
 *
 *   kubectl exec -n tenant-demo deploy/teknikerp-backend -- node prisma/seed-demo.js
 *
 * GUVENLIK: yalnizca bos bir veritabaninda calisir. Zaten urun varsa hicbir
 * sey yapmadan cikar — yanlislikla canli bir musteride calistirilirsa veri
 * bozulmasin diye. Zorlamak icin: FORCE_SEED=1
 */

const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { PrismaClient } = require('@prisma/client');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL ortam degiskeni tanimli degil.');
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(connectionString),
});

// USD/TL kuru — urun fiyatlarinin doviz karsiligini hesaplamak icin.
const RATE = 40;

/**
 * Tekrarlanabilir rastgelelik. Math.random() kullansaydik her calistirmada
 * farkli veri olusurdu; demo "altin kopya"si icin ayni veri daha iyi.
 */
let seed = 20260817;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (min, max) => Math.round(min + rnd() * (max - min));

// ── Katalog tanimlari ──────────────────────────────────────────────────────
const CATEGORIES = [
  { name: 'Kılıf', min: 45, max: 180 },
  { name: 'Ekran Koruyucu', min: 25, max: 120 },
  { name: 'Şarj Aleti', min: 90, max: 450 },
  { name: 'Kablo', min: 35, max: 200 },
  { name: 'Kulaklık', min: 150, max: 2500 },
  { name: 'Powerbank', min: 250, max: 1200 },
  { name: 'Telefon Tutucu', min: 60, max: 300 },
  { name: 'Yedek Parça', min: 300, max: 4500 },
];

const BRANDS = {
  APPLE: ['iPhone 13', 'iPhone 14', 'iPhone 15', 'iPhone 16', 'iPhone SE'],
  SAMSUNG: ['Galaxy S23', 'Galaxy S24', 'Galaxy A54', 'Galaxy A34', 'Galaxy M14'],
  XIAOMI: ['Redmi Note 12', 'Redmi Note 13', 'Poco X6', 'Mi 13', 'Redmi 12C'],
  HUAWEI: ['P60 Pro', 'Nova 11', 'Mate 50'],
  OPPO: ['Reno 10', 'A78', 'A98'],
  REALME: ['C55', 'GT Neo 5', '11 Pro'],
  VIVO: ['Y36', 'V29'],
  'GENERAL MOBILE': ['GM 23', 'GM 22 Pro'],
};

const COLORS = ['SİYAH', 'BEYAZ', 'MAVİ', 'KIRMIZI', 'ŞEFFAF', 'YEŞİL', 'MOR', 'GRİ'];
const QUALITY = ['A KALİTE', 'ORİJİNAL', 'İTHAL', 'STANDART'];

const CUSTOMERS = [
  { name: 'MERT İLETİŞİM LTD. ŞTİ.', city: 'İstanbul', district: 'Fatih' },
  { name: 'ANADOLU TELEKOM A.Ş.', city: 'Ankara', district: 'Çankaya' },
  { name: 'EGE MOBİL AKSESUAR', city: 'İzmir', district: 'Konak' },
  { name: 'YILDIZ BİLİŞİM', city: 'Bursa', district: 'Osmangazi' },
  { name: 'DENİZ TEKNOLOJİ MARKET', city: 'Antalya', district: 'Muratpaşa' },
  { name: 'KARADENİZ GSM', city: 'Trabzon', district: 'Ortahisar' },
  { name: 'ÇUKUROVA TELEFON', city: 'Adana', district: 'Seyhan' },
  { name: 'BAŞKENT AKSESUAR', city: 'Ankara', district: 'Keçiören' },
  { name: 'MARMARA MOBİL', city: 'Kocaeli', district: 'İzmit' },
  { name: 'GÜNEY ELEKTRONİK', city: 'Gaziantep', district: 'Şahinbey' },
];

async function main() {
  const existingProducts = await prisma.product.count();
  if (existingProducts > 0 && process.env.FORCE_SEED !== '1') {
    console.log(
      `Veritabaninda zaten ${existingProducts} urun var — hicbir sey yapilmadi.`
    );
    console.log('Yine de doldurmak icin: FORCE_SEED=1 node prisma/seed-demo.js');
    return;
  }

  // ── Sube ve depolar ──────────────────────────────────────────────────────
  console.log('==> Sube ve depolar...');
  let magaza = await prisma.branch.findFirst({ where: { name: 'MERKEZ MAĞAZA' } });
  if (!magaza) {
    magaza = await prisma.branch.create({
      data: { name: 'MERKEZ MAĞAZA', type: 'STORE' },
    });
  }

  // ensureDepots() uygulama acilirken bunu zaten olusturur.
  let depo = await prisma.branch.findFirst({ where: { name: 'MERKEZ_DEPO' } });
  if (!depo) {
    depo = await prisma.branch.create({
      data: { name: 'MERKEZ_DEPO', type: 'WAREHOUSE' },
    });
  }

  // ── Kasalar ──────────────────────────────────────────────────────────────
  console.log('==> Kasalar...');
  let tlKasa = await prisma.safe.findFirst({ where: { name: 'MERKEZ KASA (TL)' } });
  if (!tlKasa) {
    tlKasa = await prisma.safe.create({
      data: { branchId: magaza.id, name: 'MERKEZ KASA (TL)', currency: 'TRY', balance: 0 },
    });
  }
  let usdKasa = await prisma.safe.findFirst({ where: { name: 'DÖVİZ KASA (USD)' } });
  if (!usdKasa) {
    usdKasa = await prisma.safe.create({
      data: { branchId: magaza.id, name: 'DÖVİZ KASA (USD)', currency: 'USD', balance: 0 },
    });
  }

  // ── Personel ─────────────────────────────────────────────────────────────
  console.log('==> Personel...');
  const staff = [
    { name: 'DEMO YÖNETİCİ', email: 'yonetici@demo.local', role: 'admin' },
    { name: 'AHMET SATIŞ', email: 'ahmet@demo.local', role: 'staff' },
    { name: 'ELİF DEPO', email: 'elif@demo.local', role: 'staff' },
  ];
  const users = [];
  for (const s of staff) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      // Demo ortami — bu hesaplar arayuzden giris icin degil, fatura
      // uzerinde "islemi yapan" bilgisini doldurmak icin var.
      create: { ...s, password: 'demo1234' },
    });
    users.push(user);
  }

  // ── Kategoriler, marka ve modeller ───────────────────────────────────────
  console.log('==> Kategoriler, markalar, modeller...');
  const categoryMap = {};
  for (const c of CATEGORIES) {
    categoryMap[c.name] = await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: { name: c.name },
    });
  }

  // upsert KULLANILAMAZ: BrandModel'in benzersiz anahtari
  // [name, categoryId, kind] ve categoryId burada null. Prisma bilesik
  // benzersiz anahtarda null kabul etmez ("Argument categoryId must not be
  // null"). Bu yuzden ara-yoksa-olustur yapiyoruz.
  async function ensureBrandModel(name, kind) {
    const found = await prisma.brandModel.findFirst({
      where: { name, kind, categoryId: null },
    });
    if (found) return found;
    return prisma.brandModel.create({ data: { name, kind } });
  }

  const modelMap = {};
  for (const [brand, models] of Object.entries(BRANDS)) {
    await ensureBrandModel(brand, 'MARKA');
    for (const model of models) {
      modelMap[`${brand}|${model}`] = await ensureBrandModel(model, 'MODEL');
    }
  }

  // ── 500 urun + stok ──────────────────────────────────────────────────────
  console.log('==> 500 urun olusturuluyor...');
  const brandNames = Object.keys(BRANDS);
  const products = [];

  for (let i = 1; i <= 500; i++) {
    const brand = pick(brandNames);
    const model = pick(BRANDS[brand]);
    const category = pick(CATEGORIES);
    const color = pick(COLORS);

    const costPrice = between(category.min, category.max);
    const priceTl = Math.round(costPrice * (1.3 + rnd() * 0.35));
    const priceUsd = Math.round((priceTl / RATE) * 100) / 100;   // Satis 1 (toptan)
    const priceUsd2 = Math.round(priceUsd * 1.18 * 100) / 100;   // Satis 2 (perakende)

    const sku = `TEL-${String(i).padStart(4, '0')}`;
    const product = await prisma.product.create({
      data: {
        sku,
        barcode: `868${String(1000000 + i).padStart(10, '0')}`,
        name: `${brand} ${model} ${category.name.toUpperCase()} ${color}`,
        brand,
        model,
        color,
        quality: pick(QUALITY),
        appearance: 'SIFIR',
        description: `${brand} ${model} uyumlu ${category.name.toLowerCase()}.`,
        costPrice,
        priceTl,
        priceUsd,
        priceUsd2,
        rbmPrice: priceTl,
        categoryId: categoryMap[category.name].id,
        brandModelId: modelMap[`${brand}|${model}`]?.id ?? null,
      },
    });
    products.push(product);

    // Stok: cogu urunde var, bir kismi bilerek sifir/dusuk (kritik stok
    // raporlarinin da anlamli calismasi icin).
    const qty = rnd() < 0.1 ? 0 : between(3, 140);
    await prisma.productStock.create({
      data: { productId: product.id, branchId: depo.id, quantity: qty },
    });

    if (i % 100 === 0) console.log(`    ${i}/500 urun`);
  }

  // ── 10 musteri ───────────────────────────────────────────────────────────
  console.log('==> 10 musteri...');
  const customers = [];
  for (let i = 0; i < CUSTOMERS.length; i++) {
    const c = CUSTOMERS[i];
    const customer = await prisma.customer.create({
      data: {
        code: `MUS${String(i + 1).padStart(3, '0')}`,
        name: c.name,
        contactPerson: pick(['Mehmet Yılmaz', 'Ayşe Demir', 'Can Öztürk', 'Zeynep Kaya']),
        address: `${c.district} Mah. ${between(1, 200)}. Sokak No:${between(1, 90)}`,
        district: c.district,
        city: c.city,
        email: `info@${c.name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}.com.tr`,
        phone: `05${between(30, 55)}${between(1000000, 9999999)}`,
        taxOffice: `${c.city} Vergi Dairesi`,
        taxNumber: String(between(1000000000, 9999999999)),
        creditLimit: between(10, 150) * 1000,
        balance: 0,
      },
    });
    customers.push(customer);
  }

  // ── Gecmis satis faturalari ──────────────────────────────────────────────
  // Raporlarin (kar-zarar, isletme ozeti, musteri ekstresi) dolu gorunmesi
  // icin son 90 gune yayilmis faturalar uretiyoruz.
  console.log('==> Gecmis satis faturalari...');
  let invoiceNo = 1;
  let tlKasaBakiye = 0;

  for (let d = 90; d >= 0; d--) {
    const daily = between(0, 3); // gunde 0-3 fatura
    for (let k = 0; k < daily; k++) {
      const customer = pick(customers);
      const user = pick(users);
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - d);
      createdAt.setHours(between(9, 19), between(0, 59), 0, 0);

      const lineCount = between(1, 5);
      const items = [];
      let totalTl = 0;

      for (let l = 0; l < lineCount; l++) {
        const product = pick(products);
        const quantity = between(1, 12);
        const unitPrice = product.priceTl;
        const discountPercent = rnd() < 0.25 ? pick([5, 10, 15]) : 0;
        const totalPrice =
          Math.round(unitPrice * quantity * (1 - discountPercent / 100) * 100) / 100;

        totalTl += totalPrice;
        items.push({ productId: product.id, quantity, unitPrice, discountPercent, totalPrice });
      }

      totalTl = Math.round(totalTl * 100) / 100;
      const paymentMethod = pick(['Nakit', 'Kredi Kartı', 'Havale', 'Açık Hesap']);

      await prisma.invoice.create({
        data: {
          invoiceNo: `SAT-2026-${String(invoiceNo++).padStart(5, '0')}`,
          type: 'SATIS',
          customerId: customer.id,
          safeId: tlKasa.id,
          branchId: magaza.id,
          userId: user.id,
          paymentMethod,
          exchangeRate: RATE,
          deliveryType: 'Mağazadan Teslim',
          processedBy: user.name,
          totalAmountTl: totalTl,
          totalAmountUsd: Math.round((totalTl / RATE) * 100) / 100,
          createdAt,
          items: { create: items },
        },
      });

      // Acik hesap satisi musteri borcunu artirir; digerleri kasaya girer.
      if (paymentMethod === 'Açık Hesap') {
        await prisma.customer.update({
          where: { id: customer.id },
          data: { balance: { increment: totalTl } },
        });
      } else {
        tlKasaBakiye += totalTl;
        await prisma.transaction.create({
          data: {
            safeId: tlKasa.id,
            customerId: customer.id,
            type: 'GIRIS',
            amount: totalTl,
            method: paymentMethod,
            description: `Satış tahsilatı - ${customer.name}`,
            createdAt,
          },
        });
      }
    }
  }

  // ── Cari tahsilatlar ─────────────────────────────────────────────────────
  console.log('==> Cari tahsilatlar...');
  let receiptNo = 1;
  for (const customer of customers) {
    const fresh = await prisma.customer.findUnique({ where: { id: customer.id } });
    if (!fresh || fresh.balance <= 0) continue;

    // Borcun bir kismi tahsil edilmis olsun — bakiyeler sifir olmasin.
    const amount = Math.round(fresh.balance * (0.3 + rnd() * 0.5) * 100) / 100;
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - between(1, 30));

    await prisma.transaction.create({
      data: {
        safeId: tlKasa.id,
        customerId: customer.id,
        type: 'GIRIS',
        amount,
        method: 'Nakit',
        receiptNo: `ÖDM-2026-${String(receiptNo++).padStart(4, '0')}`,
        description: `Cari tahsilat - ${customer.name}`,
        createdAt,
      },
    });

    await prisma.customer.update({
      where: { id: customer.id },
      data: { balance: { decrement: amount } },
    });
    tlKasaBakiye += amount;
  }

  // ── Gider hareketleri ────────────────────────────────────────────────────
  console.log('==> Giderler...');
  const expenses = ['Kira ödemesi', 'Elektrik faturası', 'Kargo gideri', 'Personel avansı'];
  for (const desc of expenses) {
    const amount = between(1500, 18000);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - between(1, 60));
    await prisma.transaction.create({
      data: {
        safeId: tlKasa.id,
        type: 'CIKIS',
        amount,
        method: 'Nakit',
        description: desc,
        createdAt,
      },
    });
    tlKasaBakiye -= amount;
  }

  await prisma.safe.update({
    where: { id: tlKasa.id },
    data: { balance: Math.round(tlKasaBakiye * 100) / 100 },
  });

  // ── Ozet ─────────────────────────────────────────────────────────────────
  const counts = {
    urun: await prisma.product.count(),
    musteri: await prisma.customer.count(),
    fatura: await prisma.invoice.count(),
    faturaSatiri: await prisma.invoiceItem.count(),
    kasaHareketi: await prisma.transaction.count(),
    kategori: await prisma.category.count(),
    markaModel: await prisma.brandModel.count(),
  };

  console.log('');
  console.log('==> DEMO VERISI HAZIR');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`    ${k.padEnd(14)}: ${v}`);
  }
  console.log(`    kasa bakiye   : ${Math.round(tlKasaBakiye).toLocaleString('tr-TR')} TL`);
}

main()
  .catch((error) => {
    console.error('Seed hatasi:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
