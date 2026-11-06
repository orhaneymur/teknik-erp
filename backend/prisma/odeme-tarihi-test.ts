/**
 * Tahsilat / tediye TARİHİ testi — YALNIZCA yerel denemede kullanılır.
 *
 * Neyi doğruluyor (6 Kasım 2026, müşteri isteği):
 *
 *   1. Seçilen tarih kayda geçiyor; saat "o anki saat" oluyor — gece
 *      yarısına sabitlenmiyor. (Alış fişindeki 03:00 hatasının aynısı
 *      burada tekrarlanmasın: bkz. alis-saat-test.)
 *
 *   2. ASIL MESELE — tarih PARAYA BULAŞMIYOR. Cari bakiye ve kasa, tarih
 *      ne olursa olsun aynı tutarda değişiyor.
 *
 *   3. Geçersiz tarih (2026-02-31 gibi, biçime uyar ama gün yoktur)
 *      REDDEDİLİYOR. Sessizce bugüne düşerse yanlış güne yazılmış bir
 *      para kaydı fark edilmeden kalır.
 *
 *   4. "Kaydet"e tekrar basmak (PUT) tarihi taşıyor — ekran kutuları
 *      temizlemediği için bu akış gerçek kullanımda sık. Tarih PUT'ta
 *      kabul edilmezse değişiklik sessizce kaybolur.
 *
 *   5. Tarih verilmezse bugün — eski davranış bozulmuyor.
 *
 * Çalıştırma (CLAUDE.md'deki yerel kap kurulduktan sonra):
 *   npx tsx prisma/odeme-tarihi-test.ts
 */
import { prisma } from '../src/lib/prisma';

const API = process.env.TEST_API ?? 'http://127.0.0.1:3000';
const ADMIN_USER = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? 'test';
const ISTANBUL = 'Europe/Istanbul';

let hata = 0;
function kontrol(baslik: string, kosul: boolean, ayrinti: string) {
  if (kosul) console.log(`  GECTI  ${baslik}  (${ayrinti})`);
  else {
    hata += 1;
    console.error(`  KALDI  ${baslik}  (${ayrinti})`);
  }
}
const yakin = (a: number, b: number, tol = 0.005) => Math.abs(a - b) < tol;

const istanbulTarih = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ISTANBUL }).format(d);

const istanbulSaat = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: ISTANBUL,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);

/**
 * Kayıt UTC gece yarısına sabitlenmiş mi — alış fişindeki hatanın imzası.
 * "Saat 00:00 değil" diye bakmak yetmez: UTC gece yarısı ekranda 03:00'tür.
 */
const utcGeceYarisi = (d: Date) =>
  d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;

const saniye = (hhmmss: string) => {
  const [s, d, sn] = hhmmss.split(':').map(Number);
  return s * 3600 + d * 60 + sn;
};

const gunOnce = (n: number) =>
  istanbulTarih(new Date(Date.now() - n * 24 * 3600 * 1000));

async function main() {
  // ── Kurulum ───────────────────────────────────────────────────────────
  const magaza =
    (await prisma.branch.findFirst({ where: { type: 'STORE' } })) ??
    (await prisma.branch.create({ data: { name: 'Merkez Sube', type: 'STORE' } }));
  const kasa =
    (await prisma.safe.findFirst({ where: { branchId: magaza.id } })) ??
    (await prisma.safe.create({
      data: { branchId: magaza.id, name: 'Merkez Kasa', currency: 'TRY', balance: 0 },
    }));
  await prisma.safe.update({ where: { id: kasa.id }, data: { balance: 1000 } });

  const musteri = await prisma.customer.upsert({
    where: { code: 'ODT001' },
    update: { balance: 500 },
    create: { code: 'ODT001', name: 'Odeme Tarihi Denemesi', balance: 500 },
  });

  const girisRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const token = ((await girisRes.json()) as { data?: { token?: string } }).data?.token;
  if (!token) throw new Error('Giris basarisiz');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  type OdemeYanit = {
    success: boolean;
    data?: { id: number; createdAt: string; receiptNo: string | null };
    message?: string;
  };

  const odemeKaydet = async (govde: Record<string, unknown>) => {
    const res = await fetch(`${API}/api/customers/payment`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        customerId: musteri.id,
        safeId: kasa.id,
        amount: 100,
        type: 'GIRIS',
        method: 'Nakit',
        ...govde,
      }),
    });
    return { durum: res.status, govde: (await res.json()) as OdemeYanit };
  };

  // ── 1. Gecmis tarihli tahsilat ───────────────────────────────────────
  const dunDegil = gunOnce(5);
  console.log(`\n[1] Tahsilat — tarih ${dunDegil} (5 gun once), 100 $`);

  const kasaOnce = (await prisma.safe.findUniqueOrThrow({ where: { id: kasa.id } })).balance;
  const cariOnce = (await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } })).balance;

  const { durum, govde } = await odemeKaydet({ paymentDate: dunDegil });
  if (!govde.success || !govde.data) throw new Error(`Tahsilat basarisiz (${durum}): ${govde.message}`);

  const kayit = await prisma.transaction.findUniqueOrThrow({ where: { id: govde.data.id } });
  const kayitSaat = istanbulSaat(kayit.createdAt);
  const simdiSaat = istanbulSaat(new Date());

  kontrol(
    'secilen gune yazildi',
    istanbulTarih(kayit.createdAt) === dunDegil,
    `tarih=${istanbulTarih(kayit.createdAt)} beklenen=${dunDegil}`
  );
  kontrol(
    'UTC gece yarisina (ekranda 03:00) sabitlenmedi',
    !utcGeceYarisi(kayit.createdAt),
    `saat=${kayitSaat} utc=${kayit.createdAt.toISOString()}`
  );
  kontrol(
    'saat o anki saat',
    Math.abs(saniye(kayitSaat) - saniye(simdiSaat)) < 120,
    `kayit=${kayitSaat} simdi=${simdiSaat}`
  );
  kontrol('fis no uretildi', !!kayit.receiptNo, `receiptNo=${kayit.receiptNo}`);

  // ── 2. Tarih paraya bulasmiyor ───────────────────────────────────────
  console.log('\n[2] Para etkisi — tarih ne olursa olsun ayni');
  const kasaSonra = (await prisma.safe.findUniqueOrThrow({ where: { id: kasa.id } })).balance;
  const cariSonra = (await prisma.customer.findUniqueOrThrow({ where: { id: musteri.id } })).balance;

  kontrol('kasa 100 $ artti', yakin(kasaSonra - kasaOnce, 100), `${kasaOnce} -> ${kasaSonra}`);
  kontrol('cari borcu 100 $ azaldi', yakin(cariOnce - cariSonra, 100), `${cariOnce} -> ${cariSonra}`);

  // ── 3. Gecersiz tarih reddedilir ─────────────────────────────────────
  //
  // "2026-02-31" bicime uyar ama gun yoktur; JavaScript onu sessizce
  // 3 Mart'a kaydirir. Sessiz kayma = yanlis gune yazilmis para kaydi.
  console.log('\n[3] Gecersiz tarih — 2026-02-31 ve "bugun" metni');
  const sayimOnce = await prisma.transaction.count();

  const olmayanGun = await odemeKaydet({ paymentDate: '2026-02-31' });
  kontrol('olmayan gun reddedildi', olmayanGun.durum === 400, `HTTP ${olmayanGun.durum}`);

  const sacma = await odemeKaydet({ paymentDate: 'bugun' });
  kontrol('bicimsiz tarih reddedildi', sacma.durum === 400, `HTTP ${sacma.durum}`);

  const sayimSonra = await prisma.transaction.count();
  kontrol('reddedilen istek kayit acmadi', sayimOnce === sayimSonra, `${sayimOnce} -> ${sayimSonra}`);

  // ── 4. Tekrar kaydet (PUT) tarihi tasiyor ────────────────────────────
  //
  // Ekran kaydettikten sonra kutulari temizlemiyor; "Kaydet"e tekrar
  // basmak ayni kaydi gunceller. Tarih PUT'ta da islenmeli.
  const yeniGun = gunOnce(2);
  console.log(`\n[4] Tekrar kaydet — tarih ${dunDegil} -> ${yeniGun}`);

  const oncekiSaat = istanbulSaat(kayit.createdAt);
  const putRes = await fetch(`${API}/api/customers/payment/${kayit.id}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({
      customerId: musteri.id,
      safeId: kasa.id,
      amount: 100,
      type: 'GIRIS',
      method: 'Nakit',
      paymentDate: yeniGun,
    }),
  });
  const put = (await putRes.json()) as OdemeYanit;
  kontrol('guncelleme basarili', put.success, `HTTP ${putRes.status} ${put.message ?? ''}`);

  const tasinan = await prisma.transaction.findUniqueOrThrow({ where: { id: kayit.id } });
  kontrol(
    'kayit yeni gune tasindi',
    istanbulTarih(tasinan.createdAt) === yeniGun,
    `tarih=${istanbulTarih(tasinan.createdAt)} beklenen=${yeniGun}`
  );
  kontrol(
    'kaydin kendi saati korundu',
    istanbulSaat(tasinan.createdAt) === oncekiSaat,
    `saat=${istanbulSaat(tasinan.createdAt)} onceki=${oncekiSaat}`
  );

  const kasaPut = (await prisma.safe.findUniqueOrThrow({ where: { id: kasa.id } })).balance;
  kontrol(
    'tekrar kaydet parayi katlamadi',
    yakin(kasaPut, kasaSonra),
    `kasa=${kasaPut} beklenen=${kasaSonra}`
  );

  // ── 5. Tarih verilmezse bugun ────────────────────────────────────────
  console.log('\n[5] Tarih verilmeden — eski davranis');
  const bugun = istanbulTarih(new Date());
  const tarihsiz = await odemeKaydet({});
  if (!tarihsiz.govde.success || !tarihsiz.govde.data) {
    throw new Error(`Tarihsiz tahsilat basarisiz: ${tarihsiz.govde.message}`);
  }
  const tarihsizKayit = await prisma.transaction.findUniqueOrThrow({
    where: { id: tarihsiz.govde.data.id },
  });
  kontrol(
    'tarih verilmezse bugune yazildi',
    istanbulTarih(tarihsizKayit.createdAt) === bugun,
    `tarih=${istanbulTarih(tarihsizKayit.createdAt)}`
  );

  console.log(hata === 0 ? '\nTUMU GECTI' : `\n${hata} KONTROL KALDI`);
  await prisma.$disconnect();
  process.exit(hata === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
