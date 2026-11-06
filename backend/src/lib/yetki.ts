/**
 * ROL BAZLI YETKİ — tek doğru kaynak.
 *
 * Neden gerekti: `User.role` alanı 13 Haziran 2026'dan beri var ve JWT'ye
 * yazılıyordu ama kodda TEK BİR kontrol yoktu. Giriş yapan her personel
 * fatura silebiliyor, maliyet ve kâr raporunu görebiliyor, toplu fiyat
 * değiştirebiliyordu (DURUM.md §4, açık güvenlik maddesi).
 *
 * TASARIM KARARI (6 Kasım 2026): roller SABİT ve yetki matrisi KODDA.
 * Ekrandan rol uydurulup yetki işaretlenen dinamik bir motor yazılmadı;
 * dükkânda gerçekten dört iş bölümü var ve sabit matris hem okunabilir hem
 * de yanlış yapılandırmayla kendini kilitlemeye kapalı.
 *
 * ZORLAMA NOKTASI TEK: uçların hepsi `index.ts`teki kök `onRequest`
 * kancasından geçiyor; yetki kontrolü de orada yapılır. Yeni bir uç
 * eklendiğinde buradaki yol tablosuna girmesi yeterlidir — uç dosyasına
 * dokunulmaz. Tabloda karşılığı olmayan yol VARSAYILAN OLARAK yalnızca
 * yöneticiye açıktır (sessizce herkese açılmasın).
 */

/** İşlem türü — kullanıcının istediği hak */
export type Yetki = 'oku' | 'yaz' | 'guncelle' | 'sil' | 'aktar';

/**
 * Yetki alanı. Ekran değil İŞ bölümü: aynı ekran birkaç alana dokunabilir
 * (ör. satış ekranı `satis` + `musteri` okur).
 */
export type Alan =
  | 'satis'
  | 'alis'
  | 'iade'
  | 'stok'
  | 'musteri'
  | 'tahsilat'
  | 'kasa'
  | 'rapor'
  /** Maliyet, kâr marjı ve alış fiyatı — ayrı tutulur, satış personeli görmez */
  | 'maliyet'
  /** Site Ayarları'nda DEĞİŞİKLİK: kullanıcı, kasa tanımı, kategori, marka/model */
  | 'ayarlar'
  /**
   * Tanım listelerini OKUMA — kategori, marka/model, kasa adı, personel
   * adı, renk ve kalite önerileri.
   *
   * Ayarlardan ayrı tutulmak zorunda: satış ekranı personel listesini,
   * stok kartı ekranı kategori ve marka listesini okumadan AÇILMIYOR.
   * Bu okumaları `ayarlar` yetkisine bağlamak satış personelinin ekranını
   * boş bırakırdı.
   */
  | 'tanim';

export type Rol = 'admin' | 'satis' | 'depo' | 'okur';

export const ROLLER: Array<{ kod: Rol; ad: string; aciklama: string }> = [
  { kod: 'admin', ad: 'Yönetici', aciklama: 'Tüm yetkiler — ayarlar ve silme dahil' },
  {
    kod: 'satis',
    ad: 'Satış',
    aciklama: 'Satış, iade, tahsilat ve müşteri. Maliyet/kâr görmez, fiş silemez.',
  },
  {
    kod: 'depo',
    ad: 'Depo',
    aciklama: 'Stok, alış ve depo transferi. Maliyeti görür, fiş silemez.',
  },
  { kod: 'okur', ad: 'Salt Okunur', aciklama: 'Yalnızca görüntüleme ve dışa aktarma' },
];

const HEPSI: Yetki[] = ['oku', 'yaz', 'guncelle', 'sil', 'aktar'];
/** Kayıt açar ve düzenler ama SİLEMEZ — silme yalnızca yöneticide */
const SILMESIZ: Yetki[] = ['oku', 'yaz', 'guncelle', 'aktar'];
const SADECE_OKU: Yetki[] = ['oku', 'aktar'];
const YOK: Yetki[] = [];

/**
 * YETKİ MATRİSİ.
 *
 * Silme bilerek yalnızca yöneticide: silinen fiş stoğu, kasayı ve cari
 * bakiyeyi geri alıyor — yanlış silme sessiz para kaybıdır. Personelin
 * yanlış girdiği fişi düzeltmesi için `guncelle` yetiyor.
 */
const MATRIS: Record<Rol, Record<Alan, Yetki[]>> = {
  admin: {
    satis: HEPSI,
    alis: HEPSI,
    iade: HEPSI,
    stok: HEPSI,
    musteri: HEPSI,
    tahsilat: HEPSI,
    kasa: HEPSI,
    rapor: HEPSI,
    maliyet: HEPSI,
    ayarlar: HEPSI,
    tanim: HEPSI,
  },
  satis: {
    satis: SILMESIZ,
    alis: YOK,
    iade: SILMESIZ,
    stok: SADECE_OKU,
    musteri: SILMESIZ,
    tahsilat: SILMESIZ,
    kasa: SADECE_OKU,
    rapor: SADECE_OKU,
    /* Maliyet ve kâr: satış personeli alış fiyatını görmemeli */
    maliyet: YOK,
    ayarlar: YOK,
    tanim: SADECE_OKU,
  },
  depo: {
    satis: SADECE_OKU,
    alis: SILMESIZ,
    iade: SADECE_OKU,
    stok: SILMESIZ,
    musteri: SADECE_OKU,
    tahsilat: YOK,
    kasa: YOK,
    rapor: SADECE_OKU,
    /* Alış yapan kişi maliyeti görmek zorunda */
    maliyet: SADECE_OKU,
    ayarlar: YOK,
    tanim: SADECE_OKU,
  },
  okur: {
    satis: SADECE_OKU,
    alis: SADECE_OKU,
    iade: SADECE_OKU,
    stok: SADECE_OKU,
    musteri: SADECE_OKU,
    tahsilat: SADECE_OKU,
    kasa: SADECE_OKU,
    rapor: SADECE_OKU,
    maliyet: YOK,
    ayarlar: YOK,
    tanim: SADECE_OKU,
  },
};

/**
 * Eski rol adlarını karşılığına çevirir.
 *
 * Veritabanındaki personeller bugüne dek `staff` rolüyle duruyordu ve bu rol
 * fiilen SINIRSIZDI. Artık `satis` sayılır — zaten amaç buydu. Elinde eski
 * jeton olan personel oturumu kopmadan sınırlı yetkiye geçer.
 *
 * Tanınmayan bir değer gelirse en KISITLI role düşer; "bilinmeyen rol" asla
 * geniş yetki anlamına gelmemeli.
 */
export function rolCoz(raw: string | null | undefined): Rol {
  const r = (raw ?? '').trim().toLowerCase();
  if (r === 'admin' || r === 'yonetici' || r === 'yönetici') return 'admin';
  if (r === 'satis' || r === 'satış' || r === 'staff' || r === 'personel') return 'satis';
  if (r === 'depo' || r === 'warehouse') return 'depo';
  if (r === 'okur' || r === 'readonly' || r === 'salt-okunur') return 'okur';
  return 'okur';
}

/** Rol kodu geçerli mi — personel kaydederken girdi doğrulaması için */
export function gecerliRolMu(raw: string | null | undefined): boolean {
  const r = (raw ?? '').trim().toLowerCase();
  return ROLLER.some((rol) => rol.kod === r);
}

export function yetkiliMi(rol: Rol, alan: Alan, yetki: Yetki): boolean {
  return MATRIS[rol][alan].includes(yetki);
}

/**
 * Arayüzün kullandığı matris — `/api/auth/me` ile gönderilir.
 *
 * Arayüz matrisin KENDİ kopyasını TUTMAZ: iki kopya olursa biri eskir ve
 * ekran "yapabilirsin" derken sunucu 403 döner. Ekran yalnızca sunucunun
 * söylediğini uygular.
 */
export function rolMatrisi(rol: Rol): Record<Alan, Yetki[]> {
  return MATRIS[rol];
}

/* ─────────────────────────── Yol tablosu ─────────────────────────── */

type Kural = {
  /** Yol bu önekle başlıyorsa kural uygulanır */
  onek: string;
  /** Verilirse kural YALNIZCA bu yöntemlerde geçerli (ör. okuma/yazma ayrımı) */
  yontemler?: string[];
  alan: Alan;
  /** Verilmezse yöntemden türetilir (GET=oku, POST=yaz, PUT/PATCH=guncelle, DELETE=sil) */
  yetki?: Yetki;
};

/**
 * Yöntemden hak türet. Dışa aktarma uçları `aktar` olarak işaretlenir
 * (aşağıdaki tabloda açıkça yazılı).
 */
function yontemdenYetki(method: string): Yetki {
  switch (method.toUpperCase()) {
    case 'GET':
    case 'HEAD':
      return 'oku';
    case 'POST':
      return 'yaz';
    case 'PUT':
    case 'PATCH':
      return 'guncelle';
    case 'DELETE':
      return 'sil';
    default:
      return 'guncelle';
  }
}

/**
 * SIRA ÖNEMLİ: ilk eşleşen kural kazanır, bu yüzden özel yollar genel
 * öneklerden ÖNCE yazılır (ör. `/api/reports/profit` → maliyet,
 * `/api/reports/` → rapor).
 */
const KURALLAR: Kural[] = [
  /* Dışa aktarma — yöntemi POST olanlar da var (içe aktarım hariç) */
  { onek: '/api/customers/export', alan: 'musteri', yetki: 'aktar' },
  { onek: '/api/products/export', alan: 'stok', yetki: 'aktar' },
  { onek: '/api/sales/invoices/export', alan: 'satis', yetki: 'aktar' },

  /* İçe aktarım yazma sayılır — toplu veri değiştirir */
  { onek: '/api/customers/import', alan: 'musteri', yetki: 'yaz' },
  { onek: '/api/products/import', alan: 'stok', yetki: 'yaz' },
  { onek: '/api/sales/invoices/import', alan: 'satis', yetki: 'yaz' },

  /* Maliyet ve kâr — ayrı alan, satış personeli göremez */
  { onek: '/api/reports/profit', alan: 'maliyet' },
  { onek: '/api/reports/stock-value', alan: 'maliyet' },

  /* Raporlar */
  { onek: '/api/reports/cash-flow', alan: 'kasa' },
  { onek: '/api/reports/balances', alan: 'musteri' },
  { onek: '/api/reports/', alan: 'rapor' },

  /* Fiş uçları — tip ayrımı gövdede olduğu için `satis` alanına bağlanır;
     silme yetkisi yalnızca yöneticide olduğundan iade/alış silme de kapalı */
  { onek: '/api/sales/', alan: 'satis' },
  { onek: '/api/purchases/', alan: 'alis' },
  { onek: '/api/returns/', alan: 'iade' },

  /* Tahsilat / tediye — kasaya ve cariye dokunur */
  { onek: '/api/customers/payment', alan: 'tahsilat' },
  { onek: '/api/customers/payments', alan: 'tahsilat', yetki: 'oku' },

  /* Müşteri kartları */
  { onek: '/api/customers', alan: 'musteri' },

  /* Stok ve ürün */
  { onek: '/api/products', alan: 'stok' },
  { onek: '/api/stock', alan: 'stok' },

  /* Site Ayarları — OKUMA tanım listesi, DEĞİŞİKLİK yönetici işi */
  { onek: '/api/settings/', yontemler: ['GET', 'HEAD'], alan: 'tanim', yetki: 'oku' },
  { onek: '/api/settings/', alan: 'ayarlar' },

  /* Kur ve denetim kaydı */
  { onek: '/api/exchange-rates', alan: 'rapor', yetki: 'oku' },
  { onek: '/api/audit', alan: 'ayarlar', yetki: 'oku' },
];

/**
 * Yol + yöntem için gereken yetkiyi döndürür.
 *
 * `null` = tabloda karşılığı yok. Çağıran taraf bunu YÖNETİCİ-ONLY sayar:
 * yeni bir uç eklenip buraya yazılmazsa sessizce herkese açılmaz, yalnızca
 * yönetici kullanabilir ve eksik fark edilir.
 */
export function yolYetkisi(
  method: string,
  yol: string
): { alan: Alan; yetki: Yetki } | null {
  const m = method.toUpperCase();
  for (const kural of KURALLAR) {
    if (!yol.startsWith(kural.onek)) continue;
    if (kural.yontemler && !kural.yontemler.includes(m)) continue;
    return { alan: kural.alan, yetki: kural.yetki ?? yontemdenYetki(m) };
  }
  return null;
}
