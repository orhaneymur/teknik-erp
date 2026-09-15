/**
 * Kalite onerileri: Excel'den gelen serbest metin kaliteler stok kartinda
 * secilebilmeli (musteri bildirdi, 16 Eylul 2026 — "Cof Orijinal",
 * "Soft Oled", "New Orijinal" sistemde vardi ama listede yoktu).
 *
 *   1. Kodlu kalite (A_KALITE) etiketiyle doner: "A Kalite"
 *   2. Serbest metin kalite oldugu gibi doner: "Cof Orijinal"
 *   3. Ayni kalite farkli buyuk/kucuk harfle bir kez doner
 *   4. Silinmis (cop kutusu) urunun kalitesi donmez
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/kalite-test.ts
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

async function main() {
  if (!(await prisma.branch.findFirst({ where: { name: 'MERKEZ_DEPO' } }))) {
    await prisma.branch.create({ data: { name: 'MERKEZ_DEPO', type: 'WAREHOUSE' } });
  }
  await prisma.product.createMany({
    data: [
      { sku: 'KAL00001', name: 'KALITE A', costPrice: 1, priceUsd: 2, priceUsd2: 2, quality: 'A_KALITE' },
      { sku: 'KAL00002', name: 'KALITE COF', costPrice: 1, priceUsd: 2, priceUsd2: 2, quality: 'Cof Orijinal' },
      { sku: 'KAL00003', name: 'KALITE COF 2', costPrice: 1, priceUsd: 2, priceUsd2: 2, quality: 'COF ORİJİNAL' },
      { sku: 'KAL00004', name: 'KALITE SOFT', costPrice: 1, priceUsd: 2, priceUsd2: 2, quality: 'Soft Oled' },
      { sku: 'KAL00005', name: 'KALITE SILINMIS', costPrice: 1, priceUsd: 2, priceUsd2: 2, quality: 'Silinmis Kalite', deletedAt: new Date() },
    ],
  });

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');

  const res = await fetch(`${API}/api/settings/quality-suggestions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const liste = ((await res.json()) as { data: string[] }).data;
  console.log('  oneriler:', liste.join(' | '));

  kontrol('kodlu kalite etiketiyle: "A Kalite"', liste.includes('A Kalite'), '');
  kontrol('serbest metin: "Cof Orijinal"', liste.includes('Cof Orijinal'), '');
  kontrol('serbest metin: "Soft Oled"', liste.includes('Soft Oled'), '');
  const cofSayisi = liste.filter((k) => k.toLocaleLowerCase('tr-TR') === 'cof orijinal').length;
  kontrol('buyuk/kucuk harf farki tek satir', cofSayisi === 1, `${cofSayisi} adet`);
  kontrol('silinmis urunun kalitesi yok', !liste.includes('Silinmis Kalite'), '');

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
