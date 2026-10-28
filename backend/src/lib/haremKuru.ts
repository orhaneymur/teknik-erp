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

/** Ortam degiskeni yalnizca testte sahte sunucuya yonlendirmek icin. */
const HAREM_URL =
  process.env.HAREM_URL ||
  'wss://hrmsocketonly.haremaltin.com/socket.io/?EIO=4&transport=websocket';

/**
 * YALNIZCA TEST: bayatlik ve fiyat bekcisi surelerini olcekler
 * (harem-bekci-test 0.01 verir: 5 dk -> 3 sn). Canlida tanimli degil.
 */
const SURE_CARPANI = (() => {
  const c = Number.parseFloat(process.env.HAREM_SURE_CARPANI ?? '');
  return Number.isFinite(c) && c > 0 ? c : 1;
})();

/**
 * Bu sureden eski veri "bayat" sayilir ve uyari olarak disari verilir.
 * Bayat olunca cagiran taraf yedek kaynaga gecer (index.ts cozulmusKur).
 */
const BAYAT_ESIGI_MS = 5 * 60 * 1000 * SURE_CARPANI;

/** Yeniden baglanma bekleme sureleri; sonuncusunda kalinir. */
const BEKLEME_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];

/*
 * BEKCI — 15 ve 29 Ekim 2026'da kur saatlerce eski kaldi: soket "acik"
 * gorunuyor ama hicbir sey gelmiyordu, yalnizca pod yeniden baslayinca
 * duzeliyordu. Elle yazilan istemci yalnizca soket KAPANINCA yeniden
 * baglaniyordu; sessizce olen hat (yari acik TCP) hic kapanmaz.
 *
 * socket.io istemcisinin yaptigini yapiyoruz: sunucu el sikismada
 * pingInterval + pingTimeout bildirir, bu surede HIC cerceve gelmezse hat
 * olu sayilir. Ek olarak hat canli ama fiyat gelmiyorsa da (Harem tarafinda
 * yayin takilmasi) FIYAT_SESSIZLIK_MS sonra baglanti tazelenir. Her ikisinde
 * soket terminate() ile kapatilir -> 'close' -> yeniden baglan.
 */
const VARSAYILAN_KALP_ATISI_MS = 25_000 + 20_000;
const EL_SIKISMA_SURESI_MS = 20_000;
const FIYAT_SESSIZLIK_MS = 3 * 60 * 1000 * SURE_CARPANI;

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

let kalpAtisiMs = VARSAYILAN_KALP_ATISI_MS;
let kalpZamanlayici: ReturnType<typeof setTimeout> | null = null;
let fiyatZamanlayici: ReturnType<typeof setTimeout> | null = null;
/** Bekci kac kez baglantiyi tazeledi — durum ekraninda ve logda */
let bekciTazelemeSayisi = 0;
let sonTazelemeNedeni: string | null = null;

function zamanlayicilariTemizle() {
  if (kalpZamanlayici) clearTimeout(kalpZamanlayici);
  if (fiyatZamanlayici) clearTimeout(fiyatZamanlayici);
  kalpZamanlayici = null;
  fiyatZamanlayici = null;
}

/** Hat olu: soketi zorla kapat, 'close' olayi yeniden baglanmayi baslatir. */
function tazele(hedef: WebSocket, neden: string) {
  if (hedef !== soket || kapatiliyor) return;
  bekciTazelemeSayisi += 1;
  sonTazelemeNedeni = neden;
  console.warn(`[harem] ${neden} — baglanti tazeleniyor (${bekciTazelemeSayisi}. kez)`);
  zamanlayicilariTemizle();
  try {
    hedef.terminate();
  } catch {
    /* zaten kapali */
  }
}

/** Sunucudan HERHANGI bir cerceve gelince cagrilir. */
function kalpAtisiKur(hedef: WebSocket, sureMs: number, neden: string) {
  if (kalpZamanlayici) clearTimeout(kalpZamanlayici);
  kalpZamanlayici = setTimeout(() => tazele(hedef, neden), sureMs);
  kalpZamanlayici.unref?.();
}

/** Fiyat gelince (ve baglanti kurulunca) cagrilir. */
function fiyatBekcisiKur(hedef: WebSocket) {
  if (fiyatZamanlayici) clearTimeout(fiyatZamanlayici);
  fiyatZamanlayici = setTimeout(
    () => tazele(hedef, `${Math.round(FIYAT_SESSIZLIK_MS / 1000)} sn fiyat gelmedi`),
    FIYAT_SESSIZLIK_MS
  );
  fiyatZamanlayici.unref?.();
}

function sayiyaCevir(deger: unknown): number | null {
  if (typeof deger === 'number') return Number.isFinite(deger) ? deger : null;
  if (typeof deger !== 'string') return null;
  const n = Number.parseFloat(deger);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** USD veya EUR guncellendiyse true. */
function fiyatlariIsle(govde: unknown): boolean {
  const data = (govde as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data !== 'object') return false;

  const usdKaydi = data.USDTRY as { satis?: unknown; tarih?: unknown } | undefined;
  const eurKaydi = data.EURTRY as { satis?: unknown } | undefined;

  const usd = sayiyaCevir(usdKaydi?.satis);
  const eur = sayiyaCevir(eurKaydi?.satis);

  /*
   * Her olay her sembolu tasimaz — akis yalnizca DEGISEN kodlari yollar.
   * Bu yuzden gelmeyen deger eskisiyle korunur, sifirlanmaz.
   */
  if (usd === null && eur === null) return false;

  son = {
    usd: usd ?? son?.usd ?? 0,
    eur: eur ?? son?.eur ?? 0,
    alindiAt: Date.now(),
    haremTarih:
      typeof usdKaydi?.tarih === 'string' ? usdKaydi.tarih : (son?.haremTarih ?? ''),
  };
  return true;
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

  let yeni: WebSocket;
  try {
    yeni = new WebSocket(HAREM_URL, {
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
  soket = yeni;

  /*
   * Her olay dinleyicisi KENDI soketine bakar (`yeni`), modul degiskenine
   * degil: tazelenmis eski soketin gec gelen 'close'u yeni baglantiyi
   * bozmasin.
   */
  kalpAtisiKur(yeni, EL_SIKISMA_SURESI_MS, 'el sikisma zaman asimi');

  yeni.on('open', () => {
    console.log('[harem] soket acildi, el sikisma bekleniyor');
  });

  yeni.on('message', (ham: WebSocket.RawData) => {
    if (yeni !== soket) return;
    const m = ham.toString();

    // Hat canli: her cerceve kalp atisi sayilir.
    kalpAtisiKur(yeni, kalpAtisiMs, `${Math.round(kalpAtisiMs / 1000)} sn hicbir sey gelmedi`);

    if (m.startsWith('0') && !m.startsWith('40')) {
      try {
        const el = JSON.parse(m.slice(1)) as { pingInterval?: number; pingTimeout?: number };
        if (el.pingInterval && el.pingTimeout) {
          kalpAtisiMs = el.pingInterval + el.pingTimeout;
          kalpAtisiKur(yeni, kalpAtisiMs, `${Math.round(kalpAtisiMs / 1000)} sn hicbir sey gelmedi`);
        }
      } catch {
        /* varsayilan sure kalir */
      }
      yeni.send('40'); // varsayilan isim alanina baglan
      return;
    }
    if (m === '2') {
      yeni.send('3'); // ping -> pong
      return;
    }
    if (m.startsWith('40')) {
      baglanti = true;
      denemeSayisi = 0;
      fiyatBekcisiKur(yeni);
      console.log('[harem] baglanti kuruldu, fiyat bekleniyor');
      return;
    }
    if (m.startsWith('41') || m === '1' || m.startsWith('44')) {
      // isim alanindan atildik / sunucu kapatiyor / baglanti reddedildi
      tazele(yeni, `sunucu baglantiyi birakti (${m.slice(0, 40)})`);
      return;
    }
    if (m.startsWith('42')) {
      try {
        const [ad, govde] = JSON.parse(m.slice(2)) as [string, unknown];
        if (ad === 'price_changed' && fiyatlariIsle(govde)) fiyatBekcisiKur(yeni);
      } catch {
        /* bozuk cerceve atlanir — akis devam eder */
      }
    }
  });

  yeni.on('error', (err) => {
    console.warn('[harem] soket hatasi:', err instanceof Error ? err.message : err);
  });

  yeni.on('close', (kod) => {
    if (yeni !== soket) return;
    baglanti = false;
    zamanlayicilariTemizle();
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
  zamanlayicilariTemizle();
  try {
    soket?.terminate();
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
  /** Bekci baglantiyi kac kez tazeledi (pod acildigindan beri) */
  tazelemeSayisi: number;
  sonTazelemeNedeni: string | null;
};

export function haremDurum(): HaremDurum {
  const bekci = { tazelemeSayisi: bekciTazelemeSayisi, sonTazelemeNedeni };
  if (!son || son.usd <= 0) {
    return {
      veriVar: false,
      bagli: baglanti,
      usd: null,
      eur: null,
      yasSn: null,
      bayat: true,
      haremTarih: null,
      ...bekci,
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
    ...bekci,
  };
}
