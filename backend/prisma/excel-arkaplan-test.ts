/**
 * Stok Excel yuklemesi ARKA PLANDA — YALNIZCA yerel denemede kullanilir.
 *
 * 15 Eylul 2026: 5.439 satirlik yukleme Cloudflare'in 100 saniyelik
 * sinirina takilip tarayiciya hic "bitti" diyemedi. Yukleme artik is
 * numarasi donuyor, ekran /durum/:id ile ilerlemeyi soruyor.
 *
 * Kontroller, gercek uc uzerinden:
 *   1. POST hemen 202 + jobId doner (dosya buyuk olsa da beklemez)
 *   2. Is surerken ikinci yukleme 409 ile reddedilir
 *   3. Durum ucu ilerleme verir, sonunda "bitti" + sonuc + mesaj
 *   4. Satirlar gercekten yazildi (urun sayisi = dosyadaki satir)
 *   5. Bilinmeyen is numarasi 404
 *   6. Is bitince yeni yukleme kabul edilir (409 kalkti)
 *
 * Calistirma:
 *   DATABASE_URL=... npx tsx prisma/excel-arkaplan-test.ts
 */
import * as XLSX from 'xlsx';
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

function excelUret(satirlar: Record<string, unknown>[]): Buffer {
  const sayfa = XLSX.utils.json_to_sheet(satirlar);
  const kitap = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(kitap, sayfa, 'Stoklar');
  return XLSX.write(kitap, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

type Durum = {
  success: boolean;
  data?: {
    durum: 'calisiyor' | 'bitti' | 'hata';
    asama: string;
    islenen: number;
    toplam: number;
    sureSn: number;
    sonuc: { created: number; updated: number } | null;
  };
  message: string | null;
};

async function main() {
  for (const ad of ['MERKEZ_DEPO', 'CIN_IADE_DEPO']) {
    const mevcut = await prisma.branch.findFirst({ where: { name: ad } });
    if (!mevcut) await prisma.branch.create({ data: { name: ad, type: 'WAREHOUSE' } });
  }
  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { Authorization: `Bearer ${token}` };

  const SATIR = 400;
  const dosya = excelUret(
    Array.from({ length: SATIR }, (_, i) => ({
      StokAdi: `ARKAPLAN DENEME URUNU ${String(i + 1).padStart(4, '0')}`,
      Kategori: i % 2 ? 'EKRAN & LCD' : 'BATARYA',
      Marka: 'DENEME',
      Model: `M${i % 20}`,
      AlisFiyati: 1.5,
      Satis1: 2,
      Bakiye: 3,
    }))
  );
  const yukle = async (icerik: Buffer = dosya) => {
    const form = new FormData();
    form.append('file', new Blob([icerik]), 'arkaplan.xlsx');
    const t0 = Date.now();
    const r = await fetch(`${API}/api/products/import/excel`, { method: 'POST', headers: H, body: form });
    const j = (await r.json()) as { success: boolean; data?: { jobId?: string }; message?: string };
    return { status: r.status, jobId: j.data?.jobId, mesaj: j.message, ms: Date.now() - t0 };
  };
  const durum = async (id: string) => {
    const r = await fetch(`${API}/api/products/import/excel/durum/${id}`, { headers: H });
    return { status: r.status, body: (await r.json()) as Durum };
  };

  // ── 1. Hemen doner ────────────────────────────────────────────────────
  console.log(`\n[1] ${SATIR} satirlik dosya yukleniyor`);
  const a = await yukle();
  kontrol('202 + jobId hemen dondu', a.status === 202 && !!a.jobId && a.ms < 5000, `status=${a.status} jobId=${a.jobId} ${a.ms} ms`);
  if (!a.jobId) throw new Error('jobId yok');

  // ── 2. Ikinci yukleme reddedilir ──────────────────────────────────────
  const b = await yukle();
  kontrol('is surerken ikinci yukleme 409', b.status === 409, `status=${b.status} "${b.mesaj}"`);

  // ── 3. Ilerleme ve bitis ──────────────────────────────────────────────
  console.log('\n[3] Durum sorgulaniyor');
  let ilerlemeGoruldu = false;
  let son: Durum | null = null;
  for (let i = 0; i < 120; i += 1) {
    const d = await durum(a.jobId);
    son = d.body;
    if (d.body.data?.durum === 'calisiyor' && d.body.data.toplam > 0) ilerlemeGoruldu = true;
    if (d.body.data?.durum !== 'calisiyor') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  kontrol('is bitti', son?.data?.durum === 'bitti', `durum=${son?.data?.durum} mesaj="${son?.message}"`);
  kontrol('ilerleme gorundu (asama/toplam)', ilerlemeGoruldu || (son?.data?.toplam ?? 0) > 0, `toplam=${son?.data?.toplam} asama=${son?.data?.asama}`);
  kontrol('sonuc dogru: 400 yeni', son?.data?.sonuc?.created === SATIR, `created=${son?.data?.sonuc?.created}`);
  kontrol('mesaj Excel senkron ile basliyor', (son?.message ?? '').startsWith('Excel senkron:'), son?.message ?? '');

  // ── 4. Gercekten yazildi ──────────────────────────────────────────────
  const sayi = await prisma.product.count({ where: { name: { startsWith: 'ARKAPLAN DENEME' } } });
  kontrol('urunler veritabaninda', sayi === SATIR, `urun=${sayi}`);

  // ── 5. Bilinmeyen is ──────────────────────────────────────────────────
  const yok = await durum('yok-boyle-bir-is');
  kontrol('bilinmeyen is numarasi 404', yok.status === 404, `status=${yok.status}`);

  // ── 6. Yeni yukleme kabul — sistemden INDIRILMIS dosya (Id dolu) ──────
  // Ayni Id'siz dosya tekrar yuklenirse 400 urun ikinci kez acilir; bu
  // beklenen davranistir (ad ile eslestirme yok) ve on kontrol bunun icin
  // var. Burada dogru yol denenir: indir -> geri yukle -> hepsi guncellenir.
  const indirRes = await fetch(`${API}/api/products/export/excel`, { headers: H });
  const indirilen = Buffer.from(await indirRes.arrayBuffer());
  kontrol('sistemden Excel indi', indirRes.status === 200 && indirilen.length > 1000, `${indirilen.length} bayt`);
  const c = await yukle(indirilen);
  kontrol('is bitince yeni yukleme kabul (202)', c.status === 202, `status=${c.status}`);
  if (c.jobId) {
    for (let i = 0; i < 120; i += 1) {
      const d = await durum(c.jobId);
      if (d.body.data?.durum !== 'calisiyor') {
        kontrol('ikinci yukleme guncelledi, yeni acmadi', d.body.data?.sonuc?.updated === SATIR && d.body.data?.sonuc?.created === 0, `updated=${d.body.data?.sonuc?.updated} created=${d.body.data?.sonuc?.created}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

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
