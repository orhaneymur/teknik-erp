/**
 * TÜM ÜRÜNLERİN STOK KODLARINI YENİDEN ÜRETİR.
 *
 * Eski biçim ~16 karakterdi (SKM2K4X9P001ABC); yeni biçim kategoriye göre
 * 8 karakter (TEL00001). Bu script mevcut ürünleri yeni biçime geçirir.
 *
 * VARSAYILAN: SADECE RAPOR VERİR, HİÇBİR ŞEY DEĞİŞTİRMEZ.
 * Uygulamak için `--uygula` parametresi gerekir.
 *
 * Kullanım (pod içinde):
 *   node dist/scripts/renumberSkus.js
 *   node dist/scripts/renumberSkus.js --uygula
 *
 * GÜVENLİK NOTU: Stok kodu yalnızca görüntüleme/arama alanıdır. Faturalar
 * ürüne `productId` ile bağlıdır, barkod ayrı bir alandır. Bu yüzden kod
 * değişimi fatura geçmişini veya basılı barkodları etkilemez.
 *
 * Eski→yeni eşleşme listesi ekrana basılır. Elinde eski kodla basılmış
 * liste varsa bu çıktıyı saklayın.
 */
import { PrismaClient } from '@prisma/client';
import { buildSku, uniqueCategoryPrefix } from '../utils/sku.js';

const prisma = new PrismaClient();

async function main() {
  const uygula = process.argv.includes('--uygula');

  console.log('='.repeat(70));
  console.log(uygula ? ' MOD: UYGULA — kodlar DEĞİŞTİRİLECEK' : ' MOD: RAPOR — hiçbir şey değişmeyecek');
  console.log('='.repeat(70));

  const categories = await prisma.category.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  });

  // Kategori → önek eşlemesi. Çakışanlar uniqueCategoryPrefix ile ayrışır.
  const used = new Set<string>();
  const prefixByCategoryId = new Map<number | null, string>();
  for (const category of categories) {
    prefixByCategoryId.set(category.id, uniqueCategoryPrefix(category.name, used));
  }
  // Kategorisiz ürünler
  prefixByCategoryId.set(null, uniqueCategoryPrefix(null, used));

  console.log('\n--- KATEGORİ ÖNEKLERİ ---');
  for (const category of categories) {
    console.log(
      `  ${String(prefixByCategoryId.get(category.id)).padEnd(4)} ${category.name}`
    );
  }
  console.log(`  ${String(prefixByCategoryId.get(null)).padEnd(4)} (kategorisiz)`);

  const products = await prisma.product.findMany({
    orderBy: [{ categoryId: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    select: { id: true, sku: true, name: true, categoryId: true },
  });

  // Her önek için 1'den başlayarak sıra ver
  const counters = new Map<string, number>();
  const plan: Array<{ id: number; eski: string; yeni: string; ad: string }> = [];

  for (const product of products) {
    const prefix = prefixByCategoryId.get(product.categoryId ?? null)
      ?? prefixByCategoryId.get(null)!;
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    const yeni = buildSku(prefix, next);
    if (yeni !== product.sku) {
      plan.push({ id: product.id, eski: product.sku, yeni, ad: product.name });
    }
  }

  console.log('\n--- ÖZET ---');
  console.log(`  Toplam ürün          : ${products.length}`);
  console.log(`  Kodu değişecek       : ${plan.length}`);
  console.log(`  Zaten doğru biçimde  : ${products.length - plan.length}`);
  console.log('\n  Önek başına adet:');
  for (const [prefix, count] of [...counters.entries()].sort()) {
    console.log(`    ${prefix.padEnd(4)} ${count}`);
  }

  // Çakışma kontrolü — olmamalı ama yazmadan önce doğrula
  const yeniKodlar = new Set(plan.map((p) => p.yeni));
  if (yeniKodlar.size !== plan.length) {
    console.error('\n!!! DURDURULDU: üretilen kodlarda çakışma var. Hiçbir şey yazılmadı.');
    process.exit(1);
  }

  console.log('\n--- İLK 20 ÖRNEK ---');
  for (const row of plan.slice(0, 20)) {
    console.log(`  ${row.eski.padEnd(18)} -> ${row.yeni}   ${row.ad.slice(0, 40)}`);
  }

  if (!uygula) {
    console.log('\n' + '='.repeat(70));
    console.log(' RAPOR BİTTİ. Hiçbir şey değişmedi.');
    console.log(' Uygulamak için: node dist/scripts/renumberSkus.js --uygula');
    console.log('='.repeat(70));
    return;
  }

  console.log('\n--- ESKİ -> YENİ TAM LİSTE (saklayın) ---');
  for (const row of plan) {
    console.log(`  ${row.eski}\t${row.yeni}\t${row.ad}`);
  }

  /*
   * İki aşamalı yazım. Doğrudan hedef koda geçilirse, henüz sırası gelmemiş
   * bir ürünün kodu ile çakışma olabilir (A'nın yeni kodu B'nin eski kodu
   * olabilir). Önce herkese geçici kod verilir, sonra hedef koda geçilir.
   */
  console.log('\n--- YAZILIYOR (1/2: geçici kodlar) ---');
  let done = 0;
  for (const row of plan) {
    await prisma.product.update({
      where: { id: row.id },
      data: { sku: `TMP-${row.id}` },
    });
    done += 1;
    if (done % 500 === 0) console.log(`    ${done}/${plan.length}`);
  }

  console.log('--- YAZILIYOR (2/2: hedef kodlar) ---');
  done = 0;
  for (const row of plan) {
    await prisma.product.update({
      where: { id: row.id },
      data: { sku: row.yeni },
    });
    done += 1;
    if (done % 500 === 0) console.log(`    ${done}/${plan.length}`);
  }

  const kalanGecici = await prisma.product.count({
    where: { sku: { startsWith: 'TMP-' } },
  });

  console.log('\n' + '='.repeat(70));
  console.log(` TAMAM. ${plan.length} ürünün kodu yenilendi.`);
  console.log(` Geçici kodda kalan: ${kalanGecici} (0 olmalı)`);
  console.log('='.repeat(70));
}

main()
  .catch((error) => {
    console.error('HATA:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
