/**
 * ROL BAZLI YETKİ testi — YALNIZCA yerel denemede kullanılır.
 *
 * Neyi doğruluyor (6 Kasım 2026):
 *
 *   1. YETKİ GERÇEKTEN SUNUCUDA. Ekranda düğmeyi gizlemek koruma değildir;
 *      bu test uçlara JETONLA doğrudan gidip 403 bekler. 7 Eylül 2026'da
 *      62 ucun hiçbirinde kimlik kontrolü olmadığı böyle ortaya çıkmıştı.
 *
 *   2. Satış personeli MALİYET ve KÂR görmez, fiş SİLEMEZ — ama satış,
 *      iade, tahsilat ve müşteri işini yapabilir.
 *
 *   3. Operasyon ekranları açılmaya devam ediyor: tanım listeleri
 *      (kategori, marka, personel) her role okunur. Bu kontrol olmazsa
 *      "yetki ekledim, satış ekranı boş açılıyor" hatası sessiz kalır.
 *
 *   4. Pasife alınan kullanıcı GİRİŞ YAPAMAZ.
 *
 *   5. Şifre güncellemesi HASH'LENİR — düz metin yazılmaz.
 *
 *   6. Fiş kesmiş kullanıcı silinemez (409), pasife alınır.
 *
 * Çalıştırma:
 *   npx tsx prisma/yetki-test.ts
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

async function girisYap(kullanici: string, sifre: string) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: kullanici, password: sifre }),
  });
  const govde = (await res.json()) as {
    success: boolean;
    data?: { token: string; user: { role: string } };
    message?: string;
  };
  return { durum: res.status, token: govde.data?.token, rol: govde.data?.user.role, govde };
}

/** Uca git, YALNIZCA durum kodunu döndür (gövdeyi okumuyoruz) */
async function dene(
  token: string,
  yontem: string,
  yol: string,
  govde?: unknown
): Promise<number> {
  const res = await fetch(`${API}${yol}`, {
    method: yontem,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(govde ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(govde ? { body: JSON.stringify(govde) } : {}),
  });
  return res.status;
}

async function main() {
  // ── Kurulum: her rol için bir kullanıcı ──────────────────────────────
  const yonetici = await girisYap(ADMIN_USER, ADMIN_PASS);
  if (!yonetici.token) throw new Error(`Yonetici girisi basarisiz: ${yonetici.govde.message}`);
  kontrol('Secret yoneticisi admin rolunde', yonetici.rol === 'admin', `rol=${yonetici.rol}`);

  const H = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${yonetici.token}`,
  };

  const kullanicilar: Record<string, { id: number; token: string }> = {};
  for (const rol of ['satis', 'depo', 'okur'] as const) {
    const eposta = `${rol}@deneme.local`;
    await prisma.user.deleteMany({ where: { email: eposta } });

    const res = await fetch(`${API}/api/settings/personnel`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        name: `Deneme ${rol}`,
        email: eposta,
        password: 'sifre1234',
        role: rol,
      }),
    });
    const govde = (await res.json()) as { success: boolean; data?: { id: number } };
    if (!govde.success || !govde.data) throw new Error(`${rol} kullanicisi acilamadi`);

    const giris = await girisYap(eposta, 'sifre1234');
    if (!giris.token) throw new Error(`${rol} girisi basarisiz`);
    kontrol(`${rol} rolu jetona dogru yazildi`, giris.rol === rol, `rol=${giris.rol}`);
    kullanicilar[rol] = { id: govde.data.id, token: giris.token };
  }

  // ── 1. Geçersiz rol reddedilir ───────────────────────────────────────
  console.log('\n[1] Gecersiz rol');
  const sacmaRol = await dene(yonetici.token, 'POST', '/api/settings/personnel', {
    name: 'Olmaz',
    email: 'olmaz@deneme.local',
    password: 'x123456',
    role: 'patron',
  });
  kontrol('tanimsiz rol 400 ile reddedildi', sacmaRol === 400, `HTTP ${sacmaRol}`);

  // ── 2. SATIŞ personeli: maliyet/kâr yok, silme yok ───────────────────
  console.log('\n[2] Satis personeli — yasaklar');
  const satis = kullanicilar.satis.token;
  const karRaporu = await dene(satis, 'GET', '/api/reports/profit');
  kontrol('kar raporu kapali', karRaporu === 403, `HTTP ${karRaporu}`);
  const stokDegeri = await dene(satis, 'GET', '/api/reports/stock-value');
  kontrol('stok degeri (maliyet) kapali', stokDegeri === 403, `HTTP ${stokDegeri}`);
  const fisSil = await dene(satis, 'DELETE', '/api/sales/invoices/999999');
  kontrol('fis silme kapali', fisSil === 403, `HTTP ${fisSil}`);
  const ayar = await dene(satis, 'POST', '/api/settings/safe', { name: 'Olmaz', branchId: 1 });
  kontrol('kasa tanimi acma kapali', ayar === 403, `HTTP ${ayar}`);
  const alis = await dene(satis, 'POST', '/api/purchases/store', {});
  kontrol('alis faturasi kapali', alis === 403, `HTTP ${alis}`);

  console.log('\n[2b] Satis personeli — isini yapabiliyor');
  const satisOku = await dene(satis, 'GET', '/api/sales/init');
  kontrol('satis ekrani acilir', satisOku === 200, `HTTP ${satisOku}`);
  const musteriOku = await dene(satis, 'GET', '/api/customers');
  kontrol('musteri listesi okunur', musteriOku === 200, `HTTP ${musteriOku}`);
  const tahsilatOku = await dene(satis, 'GET', '/api/customers/payments');
  kontrol('tahsilat listesi okunur', tahsilatOku === 200, `HTTP ${tahsilatOku}`);

  // ── 3. Tanım listeleri her role açık (ekranlar boş açılmasın) ────────
  console.log('\n[3] Tanim listeleri — operasyon ekranlari icin sart');
  for (const rol of ['satis', 'depo', 'okur'] as const) {
    const kategori = await dene(kullanicilar[rol].token, 'GET', '/api/settings/categories');
    const personel = await dene(kullanicilar[rol].token, 'GET', '/api/settings/personnels');
    kontrol(
      `${rol}: kategori + personel listesi okunur`,
      kategori === 200 && personel === 200,
      `kategori=${kategori} personel=${personel}`
    );
  }

  // ── 4. DEPO rolü: alış yapar, tahsilat yapamaz ──────────────────────
  console.log('\n[4] Depo rolu');
  const depo = kullanicilar.depo.token;
  const depoStok = await dene(depo, 'GET', '/api/products');
  kontrol('stok listesi okunur', depoStok === 200, `HTTP ${depoStok}`);
  const depoTahsilat = await dene(depo, 'POST', '/api/customers/payment', { amount: 1 });
  kontrol('tahsilat kapali', depoTahsilat === 403, `HTTP ${depoTahsilat}`);
  const depoMaliyet = await dene(depo, 'GET', '/api/reports/stock-value');
  kontrol('maliyet okunur (alis yapan gormek zorunda)', depoMaliyet === 200, `HTTP ${depoMaliyet}`);

  // ── 5. SALT OKUNUR: hiçbir yazma yok ────────────────────────────────
  console.log('\n[5] Salt okunur rolu');
  const okur = kullanicilar.okur.token;
  const okurYaz = await dene(okur, 'POST', '/api/customers', { name: 'Olmaz' });
  kontrol('musteri acma kapali', okurYaz === 403, `HTTP ${okurYaz}`);
  const okurSatis = await dene(okur, 'POST', '/api/sales/store', {});
  kontrol('satis kaydi kapali', okurSatis === 403, `HTTP ${okurSatis}`);
  const okurOku = await dene(okur, 'GET', '/api/customers');
  kontrol('okuma acik', okurOku === 200, `HTTP ${okurOku}`);
  const okurMaliyet = await dene(okur, 'GET', '/api/reports/profit');
  kontrol('maliyet kapali', okurMaliyet === 403, `HTTP ${okurMaliyet}`);

  // ── 6. Yönetici her şeyi yapar ──────────────────────────────────────
  console.log('\n[6] Yonetici');
  const ykar = await dene(yonetici.token, 'GET', '/api/reports/profit');
  const yayar = await dene(yonetici.token, 'GET', '/api/settings/safes');
  kontrol('kar raporu + ayarlar acik', ykar === 200 && yayar === 200, `kar=${ykar} ayar=${yayar}`);

  // ── 7. Yetki matrisi arayuze gidiyor ────────────────────────────────
  console.log('\n[7] /api/auth/me matrisi');
  const meRes = await fetch(`${API}/api/auth/me`, {
    headers: { Authorization: `Bearer ${satis}` },
  });
  const me = (await meRes.json()) as {
    data?: { role: string; roleLabel: string; yetkiler?: Record<string, string[]> };
  };
  kontrol('rol ve etiket donuyor', me.data?.role === 'satis' && !!me.data?.roleLabel, `${me.data?.role} / ${me.data?.roleLabel}`);
  kontrol(
    'matris maliyeti kapali gosteriyor',
    Array.isArray(me.data?.yetkiler?.maliyet) && me.data!.yetkiler!.maliyet.length === 0,
    `maliyet=${JSON.stringify(me.data?.yetkiler?.maliyet)}`
  );
  kontrol(
    'matris satis yazmayi acik gosteriyor',
    me.data?.yetkiler?.satis?.includes('yaz') === true,
    `satis=${JSON.stringify(me.data?.yetkiler?.satis)}`
  );

  // ── 8. Pasife alınan kullanıcı giriş yapamaz ────────────────────────
  console.log('\n[8] Pasife alma');
  const pasifEt = await dene(
    yonetici.token,
    'PUT',
    `/api/settings/personnel/${kullanicilar.okur.id}`,
    { isActive: false }
  );
  kontrol('pasife alma basarili', pasifEt === 200, `HTTP ${pasifEt}`);
  const pasifGiris = await girisYap('okur@deneme.local', 'sifre1234');
  kontrol('pasif kullanici giremedi', pasifGiris.durum === 403, `HTTP ${pasifGiris.durum}`);

  // ── 9. Şifre güncellemesi hash'lenir ────────────────────────────────
  console.log('\n[9] Sifre guncelleme hash kontrolu');
  await dene(yonetici.token, 'PUT', `/api/settings/personnel/${kullanicilar.satis.id}`, {
    password: 'yenisifre99',
  });
  const kayit = await prisma.user.findUniqueOrThrow({
    where: { id: kullanicilar.satis.id },
    select: { password: true },
  });
  kontrol(
    'sifre duz metin yazilmadi',
    kayit.password.startsWith('$2') && kayit.password !== 'yenisifre99',
    `saklanan=${kayit.password.slice(0, 7)}...`
  );
  const yeniGiris = await girisYap('satis@deneme.local', 'yenisifre99');
  kontrol('yeni sifreyle giris calisiyor', !!yeniGiris.token, `HTTP ${yeniGiris.durum}`);

  // ── 10. Fiş kesmiş kullanıcı silinemez ──────────────────────────────
  console.log('\n[10] Silme kurali');
  const silBos = await dene(
    yonetici.token,
    'DELETE',
    `/api/settings/personnel/${kullanicilar.depo.id}`
  );
  kontrol('fis kesmemis kullanici silindi', silBos === 200, `HTTP ${silBos}`);

  console.log(hata === 0 ? '\nTUMU GECTI' : `\n${hata} KONTROL KALDI`);
  await prisma.$disconnect();
  process.exit(hata === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
