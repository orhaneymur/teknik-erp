/**
 * FIFO testi icin en kucuk kurulum — YALNIZCA yerel denemede kullanilir.
 *
 * Kullanicinin anlattigi senaryoyu kurar:
 *   stokta 1 adet 1,00 dolardan
 *   sonra 2 adet 1,20 dolardan alinir
 *   3 adet satilir  ->  maliyet 3,40 olmali (eski yapida 3,60 cikiyordu)
 */
import { prisma } from '../src/lib/prisma';

async function main() {
  // Depolar ADIYLA bulunur — id'leri ortama gore degisir
  const merkez =
    (await prisma.branch.findFirst({ where: { name: 'MERKEZ_DEPO' } })) ??
    (await prisma.branch.create({ data: { name: 'MERKEZ_DEPO', type: 'WAREHOUSE' } }));

  const mevcutCin = await prisma.branch.findFirst({ where: { name: 'CIN_IADE_DEPO' } });
  if (!mevcutCin) {
    await prisma.branch.create({ data: { name: 'CIN_IADE_DEPO', type: 'WAREHOUSE' } });
  }

  const safe = await prisma.safe.upsert({
    where: { id: 1 },
    update: {},
    create: { branchId: merkez.id, name: 'Merkez Kasa', currency: 'TRY', balance: 100000 },
  });

  const musteri = await prisma.customer.upsert({
    where: { code: 'M001' },
    update: {},
    create: { code: 'M001', name: 'Deneme Musteri' },
  });

  const tedarikci = await prisma.customer.upsert({
    where: { code: 'T001' },
    update: {},
    create: { code: 'T001', name: 'Deneme Tedarikci' },
  });

  const kategori = await prisma.category.upsert({
    where: { name: 'TEST' },
    update: {},
    create: { name: 'TEST' },
  });

  /*
   * Baslangic durumu: elde 1 adet var ve 1,00 dolara alinmis.
   * Surume gecis migration'i bunu bir ACILIS KATMANI yapmisti; burada
   * ayni durumu elle kuruyoruz.
   */
  const urun = await prisma.product.upsert({
    where: { sku: 'TEST-001' },
    update: {},
    create: {
      sku: 'TEST-001',
      name: 'FIFO Deneme Urunu',
      categoryId: kategori.id,
      costPrice: 1.0,
      priceUsd: 2.0,
      priceUsd2: 2.5,
    },
  });

  await prisma.productStock.upsert({
    where: { productId_branchId: { productId: urun.id, branchId: merkez.id } },
    update: { quantity: 1 },
    create: { productId: urun.id, branchId: merkez.id, quantity: 1 },
  });

  await prisma.stockLot.deleteMany({ where: { productId: urun.id } });
  await prisma.stockLot.create({
    data: {
      productId: urun.id,
      branchId: merkez.id,
      quantity: 1,
      unitCost: 1.0,
      isOpening: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        merkezDepoId: merkez.id,
        safeId: safe.id,
        musteriId: musteri.id,
        tedarikciId: tedarikci.id,
        urunId: urun.id,
      },
      null,
      2
    )
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
