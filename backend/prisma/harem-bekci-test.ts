/**
 * Harem bekcisi + yedek kaynak testi — YALNIZCA yerel denemede kullanilir.
 *
 * 15 ve 29 Ekim 2026: canli kur saatlerce eski kaldi; soket acik gorunuyor
 * ama hicbir sey gelmiyordu. Bu test Harem'i SAHTE bir sunucuyla taklit
 * eder ve o durumu bilerek yaratir:
 *
 *   A. Akis canli                -> kaynak Harem, uyari yok
 *   B. Hat sessizce olur         -> bekci baglantiyi tazeler; kur Truncgil'e gecer
 *   C. Akis geri gelir           -> kendiliginden Harem'e donulur
 *   D. Hat canli, fiyat yok      -> fiyat bekcisi tazeler; Truncgil
 *   E. Truncgil son Harem kurundan cok uzak -> reddedilir, eski Harem kuru
 *      "ESKI" uyarisiyla kalir (bozuk veri fise basilmaz)
 *   F. Sunucu bizi atar ("41")   -> tazelenir
 *
 * Kendi backend'ini ayri portta acar (HAREM_URL sahte sunucuya,
 * HAREM_SURE_CARPANI=0.01: bayatlik 5 dk -> 3 sn). Truncgil GERCEK — internet
 * gerekir.
 *
 * Calistirma:  cd backend && SADECE=bekci npm test
 */
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { WebSocketServer, type WebSocket } from 'ws';

const SAHTE_PORT = 3398;
const API_PORT = 3011;
const API = `http://127.0.0.1:${API_PORT}`;
const FARK = 0.2;

let hata = 0;
function kontrol(baslik: string, kosul: boolean, ayrinti: string) {
  if (kosul) console.log(`  GECTI  ${baslik}  (${ayrinti})`);
  else {
    hata += 1;
    console.error(`  KALDI  ${baslik}  (${ayrinti})`);
  }
}
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Sahte Harem ──────────────────────────────────────────────────────────
type Kip = 'canli' | 'sessiz' | 'olu' | 'at';
let kip: Kip = 'canli';
let fiyat = 49.8;
let baglantiSayisi = 0;

const sahte = new WebSocketServer({ port: SAHTE_PORT });
sahte.on('connection', (ws: WebSocket) => {
  baglantiSayisi += 1;
  const fiyatGonder = () =>
    ws.send(
      `42${JSON.stringify([
        'price_changed',
        { data: { USDTRY: { satis: fiyat.toFixed(4), tarih: 'sahte' }, EURTRY: { satis: '55.0000' } } },
      ])}`
    );
  ws.send('0{"sid":"x","upgrades":[],"pingInterval":1000,"pingTimeout":500}');
  ws.on('message', (ham) => {
    if (ham.toString() !== '40') return;
    if (kip === 'at') {
      ws.send('41');
      return;
    }
    ws.send('40{"sid":"y"}');
    if (kip === 'canli') fiyatGonder();
  });
  const saat = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return clearInterval(saat);
    if (kip === 'olu') return; // hicbir sey gonderme, kapatma da — yari acik hat
    ws.send('2');
    if (kip === 'canli') fiyatGonder();
  }, 500);
  ws.on('close', () => clearInterval(saat));
});

// ── Backend ──────────────────────────────────────────────────────────────
let backend: ChildProcess | null = null;
function backendKapat() {
  if (!backend?.pid) return;
  try {
    if (process.platform === 'win32') execSync(`taskkill /PID ${backend.pid} /T /F`, { stdio: 'ignore' });
    else process.kill(-backend.pid);
  } catch {
    /* zaten kapali */
  }
}

async function backendAc() {
  backend = spawn('npx', ['tsx', 'src/index.ts'], {
    env: {
      ...process.env,
      PORT: String(API_PORT),
      HAREM_URL: `ws://127.0.0.1:${SAHTE_PORT}/socket.io/?EIO=4&transport=websocket`,
      HAREM_SURE_CARPANI: '0.01',
      KUR_FARKI: String(FARK),
    },
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stdout?.on('data', (d) => process.env.AYRINTI && process.stdout.write(d));
  backend.stderr?.on('data', (d) => {
    const s = d.toString();
    if (s.includes('[harem]') || s.includes('[kur]')) process.stdout.write(`    · ${s.trim()}\n`);
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      await fetch(`${API}/api/auth/login`);
      return;
    } catch {
      await bekle(1000);
    }
  }
  throw new Error('Test backend acilmadi');
}

type KurYaniti = {
  usd: number;
  source: string;
  uyari: string | null;
  harem: { bagli: boolean; tazelemeSayisi: number; sonTazelemeNedeni: string | null };
};
let token = '';
async function kur(): Promise<KurYaniti> {
  const r = await fetch(`${API}/api/exchange-rates`, { headers: { Authorization: `Bearer ${token}` } });
  return ((await r.json()) as { data: KurYaniti }).data;
}
async function truncgilHam(): Promise<number> {
  const r = await fetch('https://finans.truncgil.com/v4/today.json');
  return Number(((await r.json()) as { USD: { Selling: number } }).USD.Selling);
}

async function main() {
  await backendAc();
  const giris = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME ?? 'admin',
      password: process.env.ADMIN_PASSWORD ?? 'test',
    }),
  });
  token = ((await giris.json()) as { data?: { token?: string } }).data?.token ?? '';
  if (!token) throw new Error('Giris basarisiz');

  console.log('\n[A] Akis canli');
  await bekle(2000);
  let k = await kur();
  kontrol('kaynak Harem', k.source.startsWith('Harem'), k.source);
  kontrol('kur = sahte fiyat + fark', Math.abs(k.usd - (49.8 + FARK)) < 0.0001, String(k.usd));
  kontrol('uyari yok', k.uyari === null, String(k.uyari));

  console.log('\n[B] Hat sessizce olur (ne ping ne fiyat, soket kapanmaz)');
  const oncekiBaglanti = baglantiSayisi;
  kip = 'olu';
  await bekle(4500);
  k = await kur();
  const tg = await truncgilHam();
  kontrol('bekci tazeledi', k.harem.tazelemeSayisi >= 1, `${k.harem.tazelemeSayisi} kez`);
  kontrol(
    'neden: kalp atisi',
    (k.harem.sonTazelemeNedeni ?? '').includes('hicbir sey gelmedi'),
    String(k.harem.sonTazelemeNedeni)
  );
  kontrol('yeniden baglandi', baglantiSayisi > oncekiBaglanti, `${oncekiBaglanti} -> ${baglantiSayisi}`);
  kontrol('kaynak Truncgil', k.source.startsWith('Truncgil'), k.source);
  kontrol('kur = Truncgil + fark', Math.abs(k.usd - (tg + FARK)) < 0.05, `${k.usd} ~ ${tg} + ${FARK}`);
  kontrol('uyari gecisi soyluyor', (k.uyari ?? '').includes('Truncgil kuru kullanılıyor'), String(k.uyari));

  console.log('\n[C] Akis geri gelir');
  kip = 'canli';
  fiyat = 49.85;
  await bekle(4000);
  k = await kur();
  kontrol('Harem\'e donuldu', k.source.startsWith('Harem'), k.source);
  kontrol('kur yeni fiyat', Math.abs(k.usd - (49.85 + FARK)) < 0.0001, String(k.usd));
  kontrol('uyari kalkti', k.uyari === null, String(k.uyari));

  console.log('\n[D] Hat canli (ping var) ama fiyat yok');
  const oncekiTazeleme = k.harem.tazelemeSayisi;
  kip = 'sessiz';
  await bekle(4000);
  k = await kur();
  kontrol('fiyat bekcisi tazeledi', k.harem.tazelemeSayisi > oncekiTazeleme, `${k.harem.tazelemeSayisi} kez`);
  kontrol(
    'neden: fiyat gelmedi',
    (k.harem.sonTazelemeNedeni ?? '').includes('fiyat gelmedi'),
    String(k.harem.sonTazelemeNedeni)
  );
  kontrol('kaynak Truncgil', k.source.startsWith('Truncgil'), k.source);

  console.log('\n[E] Truncgil son Harem kurundan %5\'ten uzak');
  kip = 'canli';
  fiyat = 30;
  await bekle(3000);
  k = await kur();
  kontrol('once Harem 30', Math.abs(k.usd - (30 + FARK)) < 0.0001, `${k.source} ${k.usd}`);
  kip = 'sessiz';
  await bekle(4000);
  k = await kur();
  kontrol('Truncgil reddedildi, Harem kaldi', k.source.startsWith('Harem') && Math.abs(k.usd - 30.2) < 0.0001, `${k.source} ${k.usd}`);
  kontrol('uyari "ESKİ" diyor', (k.uyari ?? '').includes('ESKİ'), String(k.uyari));

  console.log('\n[F] Sunucu bizi isim alanindan atar ("41")');
  kip = 'at';
  await bekle(3000);
  k = await kur();
  kontrol(
    'neden: sunucu birakti',
    (k.harem.sonTazelemeNedeni ?? '').includes('birakti'),
    String(k.harem.sonTazelemeNedeni)
  );

  console.log(hata === 0 ? '\nTUM KONTROLLER GECTI' : `\n${hata} KONTROL KALDI`);
  process.exitCode = hata === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    backendKapat();
    sahte.close();
    setTimeout(() => process.exit(), 500).unref();
  });
