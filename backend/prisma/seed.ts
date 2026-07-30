import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { BranchType, PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL ortam değişkeni tanımlı değil.');
}

const adapter = new PrismaMariaDb(connectionString);
const prisma = new PrismaClient({ adapter });

const products = [
  {
    sku: 'IPH11-ARK-KAM',
    barcode: '8690000000001',
    name: 'APPLE İPHONE 11 ARKA KAMERA',
    costPrice: 950,
    priceTl: 1500,
    priceUsd: 32.5,
  },
  {
    sku: 'IPH11-AK-BLK',
    barcode: '8690000000002',
    name: 'APPLE İPHONE 11 ARKA KAPAK BLACK',
    costPrice: 280,
    priceTl: 450,
    priceUsd: 10.0,
  },
  {
    sku: 'IPH11-AK-GRN',
    barcode: '8690000000003',
    name: 'APPLE İPHONE 11 ARKA KAPAK GREEN',
    costPrice: 280,
    priceTl: 450,
    priceUsd: 10.0,
  },
  {
    sku: 'IPH11-AK-RED',
    barcode: '8690000000004',
    name: 'APPLE İPHONE 11 ARKA KAPAK RED',
    costPrice: 280,
    priceTl: 450,
    priceUsd: 10.0,
  },
];

async function main() {
  const branch = await prisma.branch.upsert({
    where: { id: 1 },
    update: {
      name: 'Merkez Şube',
      type: BranchType.STORE,
    },
    create: {
      name: 'Merkez Şube',
      type: BranchType.STORE,
    },
  });

  const merkezDepo = await prisma.branch.upsert({
    where: { id: 2 },
    update: {
      name: 'MERKEZ_DEPO',
      type: BranchType.WAREHOUSE,
    },
    create: {
      name: 'MERKEZ_DEPO',
      type: BranchType.WAREHOUSE,
    },
  });

  const cinIadeDepo = await prisma.branch.upsert({
    where: { id: 3 },
    update: {
      name: 'CIN_IADE_DEPO',
      type: BranchType.WAREHOUSE,
    },
    create: {
      name: 'CIN_IADE_DEPO',
      type: BranchType.WAREHOUSE,
    },
  });

  const merkezKasa = await prisma.safe.upsert({
    where: { id: 1 },
    update: {
      branchId: branch.id,
      name: 'Merkez Kasa',
      currency: 'TRY',
      balance: 25000,
    },
    create: {
      branchId: branch.id,
      name: 'Merkez Kasa',
      currency: 'TRY',
      balance: 25000,
    },
  });

  const dolarKasasi = await prisma.safe.upsert({
    where: { id: 2 },
    update: {
      branchId: branch.id,
      name: 'Dolar Kasası',
      currency: 'USD',
      balance: 1500,
    },
    create: {
      branchId: branch.id,
      name: 'Dolar Kasası',
      currency: 'USD',
      balance: 1500,
    },
  });

  const customer = await prisma.customer.upsert({
    where: { code: '247' },
    update: {
      name: 'KADRİOĞLU BİLİŞİM - İSTANBUL',
      creditLimit: 50000,
      balance: 0,
    },
    create: {
      code: '247',
      name: 'KADRİOĞLU BİLİŞİM - İSTANBUL',
      creditLimit: 50000,
      balance: 0,
    },
  });

  const staffUser = await prisma.user.upsert({
    where: { email: 'yusuf@akgunteknik.com' },
    update: {
      name: 'YUSUF AKGÜN',
      password: 'hashed-password',
      role: 'staff',
    },
    create: {
      name: 'YUSUF AKGÜN',
      email: 'yusuf@akgunteknik.com',
      password: 'hashed-password',
      role: 'staff',
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: 'kadir@akgunteknik.com' },
    update: {
      name: 'KADİR AKGÜN',
      password: 'hashed-password',
      role: 'admin',
    },
    create: {
      name: 'KADİR AKGÜN',
      email: 'kadir@akgunteknik.com',
      password: 'hashed-password',
      role: 'admin',
    },
  });

  const iphoneCategory = await prisma.category.upsert({
    where: { name: 'iPhone Yedek Parça' },
    update: {},
    create: { name: 'iPhone Yedek Parça' },
  });

  const appleBrand = await prisma.brandModel.upsert({
    where: {
      name_categoryId: {
        name: 'Apple iPhone 11',
        categoryId: iphoneCategory.id,
      },
    },
    update: {},
    create: {
      name: 'Apple iPhone 11',
      categoryId: iphoneCategory.id,
    },
  });

  const seededProducts = [];
  for (const item of products) {
    const product = await prisma.product.upsert({
      where: { sku: item.sku },
      update: {
        name: item.name,
        barcode: item.barcode,
        costPrice: item.costPrice,
        priceTl: item.priceTl,
        priceUsd: item.priceUsd,
        priceUsd2: item.priceUsd,
        categoryId: iphoneCategory.id,
        brandModelId: appleBrand.id,
      },
      create: {
        sku: item.sku,
        barcode: item.barcode,
        name: item.name,
        costPrice: item.costPrice,
        priceTl: item.priceTl,
        priceUsd: item.priceUsd,
        priceUsd2: item.priceUsd,
        categoryId: iphoneCategory.id,
        brandModelId: appleBrand.id,
      },
    });

    seededProducts.push(product);

    await prisma.productStock.upsert({
      where: {
        productId_branchId: {
          productId: product.id,
          branchId: merkezDepo.id,
        },
      },
      update: { quantity: 50 },
      create: {
        productId: product.id,
        branchId: merkezDepo.id,
        quantity: 50,
      },
    });

    await prisma.productStock.upsert({
      where: {
        productId_branchId: {
          productId: product.id,
          branchId: cinIadeDepo.id,
        },
      },
      update: { quantity: 0 },
      create: {
        productId: product.id,
        branchId: cinIadeDepo.id,
        quantity: 0,
      },
    });
  }

  const sampleInvoices = [
    {
      invoiceNo: 'SF20260001',
      type: 'SATIS',
      userId: staffUser.id,
      totalAmountTl: 2850,
      totalAmountUsd: 61.46,
      paymentMethod: 'Nakit',
      daysAgo: 0,
    },
    {
      invoiceNo: 'SF20260002',
      type: 'SATIS',
      userId: adminUser.id,
      totalAmountTl: 1500,
      totalAmountUsd: 32.35,
      paymentMethod: 'Cari',
      daysAgo: 1,
    },
    {
      invoiceNo: 'SF20260003',
      type: 'SATIS',
      userId: staffUser.id,
      totalAmountTl: 900,
      totalAmountUsd: 19.41,
      paymentMethod: 'Nakit',
      daysAgo: 3,
    },
    {
      invoiceNo: 'SF20260004',
      type: 'ALIS',
      userId: adminUser.id,
      totalAmountTl: 5000,
      totalAmountUsd: 107.83,
      paymentMethod: 'Nakit',
      daysAgo: 15,
    },
    {
      invoiceNo: 'SF20260005',
      type: 'IADE',
      userId: staffUser.id,
      totalAmountTl: 450,
      totalAmountUsd: 9.7,
      paymentMethod: 'Nakit',
      daysAgo: 45,
    },
  ];

  for (const sample of sampleInvoices) {
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - sample.daysAgo);

    const existing = await prisma.invoice.findUnique({
      where: { invoiceNo: sample.invoiceNo },
    });

    if (!existing) {
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNo: sample.invoiceNo,
          type: sample.type,
          customerId: customer.id,
          safeId: merkezKasa.id,
          branchId: branch.id,
          userId: sample.userId,
          paymentMethod: sample.paymentMethod,
          exchangeRate: 46.37,
          deliveryType: 'Mağazadan Teslim',
          totalAmountTl: sample.totalAmountTl,
          totalAmountUsd: sample.totalAmountUsd,
          createdAt,
          items: {
            create: [
              {
                productId: seededProducts[0].id,
                quantity: 1,
                unitPrice: sample.totalAmountTl,
                totalPrice: sample.totalAmountTl,
              },
            ],
          },
        },
      });

      if (sample.paymentMethod === 'Nakit' && sample.type === 'SATIS') {
        await prisma.transaction.create({
          data: {
            safeId: merkezKasa.id,
            customerId: customer.id,
            type: 'GIRIS',
            amount: sample.totalAmountTl,
            description: `${sample.invoiceNo} satış tahsilatı`,
            createdAt: invoice.createdAt,
          },
        });
      }
    }
  }

  const sampleTransactions = [
    {
      safeId: merkezKasa.id,
      customerId: customer.id,
      type: 'GIRIS' as const,
      amount: 12000,
      description: 'Cari tahsilat - KADRİOĞLU BİLİŞİM',
      daysAgo: 2,
    },
    {
      safeId: merkezKasa.id,
      customerId: null,
      type: 'CIKIS' as const,
      amount: 3500,
      description: 'Ofis giderleri ödemesi',
      daysAgo: 5,
    },
    {
      safeId: dolarKasasi.id,
      customerId: null,
      type: 'GIRIS' as const,
      amount: 250,
      description: 'Döviz kasası girişi',
      daysAgo: 7,
    },
  ];

  for (const tx of sampleTransactions) {
    const existing = await prisma.transaction.findFirst({
      where: { description: tx.description },
    });

    if (!existing) {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - tx.daysAgo);

      await prisma.transaction.create({
        data: {
          safeId: tx.safeId,
          customerId: tx.customerId,
          type: tx.type,
          amount: tx.amount,
          description: tx.description,
          createdAt,
        },
      });
    }
  }

  console.log(
    'Seed tamamlandı: şube, MERKEZ_DEPO, CIN_IADE_DEPO, kasalar, müşteri, personel, ürünler, faturalar ve kasa hareketleri yüklendi.'
  );
}

main()
  .catch((error) => {
    console.error('Seed hatası:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
