/**
 * Harem Altin canli kur akisi.
 *
 * NEDEN SOCKET: Harem'in belgelenmis bir REST API'si YOK. Eski acik ucu
 * (/dashboard/ajax/doviz) artik 404 donuyor ve Harem'in kendi kodunda
 * "// connect_ajax();" diye yorum satirina alinmis. Sitenin kendisi
 * fiyatlari bu socket.io akisindan cekiyor; biz de ayni akisi dinliyoruz.
 *
 * BUNUN RISKI ACIKTIR: belgelenmemis, sozlesmesiz bir akistir. Harem
 * bicimi degistirirse veya baglantiyi keserse veri durur. Bu yuzden
 * modul HICBIR ZAMAN hata firlatmaz, son bilinen kuru saklar ve kurun
 * kac saniyedir guncellenmedigini disari acar — cagiran taraf bayat
 * veriyle calistigini bilir ve kullaniciya soyler.
 *
 * Protokol (Engine.IO v4 / socket.io parser 5), elle konusulur:
 *   "0{...}"  sunucu el sikismasi   -> "40" gonder (varsayilan isim alani)
 *   "40{...}" isim alani onayi
 *   "2"       sunucu ping           -> "3" gonder (pong)
 *   "42[...]" olay                  -> ["price_changed", {data: {KOD: {...}}}]
 *
 * USDTRY kaydinin bicimi:
 *   {"code":"USDTRY","alis":"48.4400","satis":"48.4990",
 *    "tarih":"11-09-2026 15:15:00", ...}
 */
import WebSocket from 'ws';

const HAREM_URL =
  'wss://hrmsocketonly.haremaltin.com/socket.io/?EIO=4&transport=websocket';

/** Bu sureden eski veri "bayat" sayilir ve uyari olarak disari verilir. */
const BAYAT_ESIGI_MS = 10 * 60 * 1000;

/** Yeniden baglanma bekleme sureleri; sonuncusunda kalinir. */
const BEKLEME_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];

type HaremVerisi = {
  /** USDTRY satis kuru — HAM, fark eklenmemis */
  usd: number;
  /** EURTRY satis kuru — HAM, fark eklenmemis */
  eur: number;
  /** Bizim aldigimiz an */
  alindiAt: number;
  /** Harem'in kendi zaman damgasi, ornek: "11-09-2026 15:15:00" */
  haremTarih: string;
};

let son: HaremVerisi | null = null;
let soket: WebSocket | null = null;
let denemeSayisi = 0;
let kapatiliyor = false;
let zamanlayici: ReturnType<typeof setTimeout> | null = null;
let baglanti = false;

function sayiyaCevir(deger: unknown): number | null {
  if (typeof deger === 'number') return Number.isFinite(deger) ? deger : null;
  if (typeof deger !== 'string') return null;
  const n = Number.parseFloat(deger);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fiyatlariIsle(govde: unknown) {
  const data = (govde as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data !== 'object') return;

  const usdKaydi = data.USDTRY as { satis?: unknown; tarih?: unknown } | undefined;
  const eurKaydi = data.EURTRY as { satis?: unknown } | undefined;

  const usd = sayiyaCevir(usdKaydi?.satis);
  const eur = sayiyaCevir(eurKaydi?.satis);

  /*
   * Her olay her sembolu tasimaz — akis yalnizca DEGISEN kodlari yollar.
   * Bu yuzden gelmeyen deger eskisiyle korunur, sifirlanmaz.
   */
  if (usd === null && eur === null) return;

  son = {
    usd: usd ?? son?.usd ?? 0,
    eur: eur ?? son?.eur ?? 0,
    alindiAt: Date.now(),
    haremTarih:
      typeof usdKaydi?.tarih === 'string' ? usdKaydi.tarih : (son?.haremTarih ?? ''),
  };
}

function yenidenBagla() {
  if (kapatiliyor) return;
  const bekle = BEKLEME_MS[Math.min(denemeSayisi, BEKLEME_MS.length - 1)];
  denemeSayisi += 1;
  if (zamanlayici) clearTimeout(zamanlayici);
  zamanlayici = setTimeout(baglan, bekle);
  // unref: bu zamanlayici surecin kapanmasini engellemesin
  zamanlayici.unref?.();
}

function baglan() {
  if (kapatiliyor) return;

  try {
    soket = new WebSocket(HAREM_URL, {
      headers: {
        Origin: 'https://www.haremaltin.com',
        'User-Agent': 'Mozilla/5.0 (compatible; TeknikERP)',
      },
      handshakeTimeout: 15_000,
    });
  } catch (err) {
    console.warn('[harem] soket kurulamadi:', err instanceof Error ? err.message : err);
    yenidenBagla();
    return;
  }

  soket.on('open', () => {
    console.log('[harem] soket acildi, el sikisma bekleniyor');
  });

  soket.on('message', (ham: WebSocket.RawData) => {
    const m = ham.toString();

    if (m.startsWith('0') && !m.startsWith('40')) {
      soket?.send('40'); // varsayilan isim alanina baglan
      return;
    }
    if (m === '2') {
      soket?.send('3'); // ping -> pong
      return;
    }
    if (m.startsWith('40')) {
      baglanti = true;
      denemeSayisi = 0;
      console.log('[harem] baglanti kuruldu, fiyat bekleniyor');
      return;
    }
    if (m.startsWith('42')) {
      try {
        const [ad, govde] = JSON.parse(m.slice(2)) as [string, unknown];
        if (ad === 'price_changed') fiyatlariIsle(govde);
      } catch {
        /* bozuk cerceve atlanir — akis devam eder */
      }
    }
  });

  soket.on('error', (err) => {
    console.warn('[harem] soket hatasi:', err instanceof Error ? err.message : err);
  });

  soket.on('close', (kod) => {
    baglanti = false;
    console.warn(`[harem] baglanti kapandi (kod ${kod}), yeniden denenecek`);
    yenidenBagla();
  });
}

/** Sunucu acilisinda BIR KEZ cagrilir. */
export function haremBaslat() {
  if (soket || zamanlayici) return;
  kapatiliyor = false;
  baglan();
}

/** Testlerde ve kapanista — surecin asili kalmasini onler. */
export function haremDurdur() {
  kapatiliyor = true;
  if (zamanlayici) clearTimeout(zamanlayici);
  zamanlayici = null;
  try {
    soket?.close();
  } catch {
    /* zaten kapali */
  }
  soket = null;
  baglanti = false;
}

export type HaremDurum = {
  /** Hic veri alinabildi mi */
  veriVar: boolean;
  /** Soket su an bagli mi (veri bayat olsa da bagli olabilir) */
  bagli: boolean;
  /** HAM satis kurlari — fark EKLENMEMIS */
  usd: number | null;
  eur: number | null;
  /** Son verinin yasi, saniye */
  yasSn: number | null;
  /** BAYAT_ESIGI_MS asildi mi */
  bayat: boolean;
  haremTarih: string | null;
};

export function haremDurum(): HaremDurum {
  if (!son || son.usd <= 0) {
    return {
      veriVar: false,
      bagli: baglanti,
      usd: null,
      eur: null,
      yasSn: null,
      bayat: true,
      haremTarih: null,
    };
  }
  const yasMs = Date.now() - son.alindiAt;
  return {
    veriVar: true,
    bagli: baglanti,
    usd: son.usd,
    eur: son.eur > 0 ? son.eur : null,
    yasSn: Math.round(yasMs / 1000),
    bayat: yasMs > BAYAT_ESIGI_MS,
    haremTarih: son.haremTarih || null,
  };
}
