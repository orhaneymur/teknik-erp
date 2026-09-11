/**
 * Müşteri (tenant) yapılandırması — ÇALIŞMA ANINDA yüklenir.
 *
 * SaaS modelinde tek bir Docker imajı tüm müşterilere hizmet eder. Firma adı
 * build sırasında gömülseydi her yeni müşteri için imaj derlemek gerekirdi.
 * Bunun yerine değerler `/config.json` üzerinden okunur; bu dosya Kubernetes
 * tarafında ConfigMap olarak nginx'e mount edilir.
 *
 * Yeni müşteri açmak = ConfigMap'te birkaç satır. İmaj derlenmez.
 */

export type TenantConfig = {
  /** Namespace kısa adı — ör. "akgunteknik", "demo" */
  tenantId: string;
  /** Ekranlarda ve fişlerde görünen firma adı */
  companyName: string;
  /** Tarayıcı sekmesi başlığı */
  documentTitle: string;
  /** Fiş/etiket altında görünen iletişim satırı (boş olabilir) */
  companyContact: string;
  /**
   * Fişin en üstüne basılan logo. Boş bırakılırsa logo alanı hiç çizilmez,
   * fiş kısalır — eksik logo boşluk bırakmaz.
   *
   * İki biçim de çalışır:
   *   · `data:image/png;base64,...`  ConfigMap'e gömülü (ek mount gerekmez)
   *   · `/logo.png`                  nginx'e mount edilmiş dosya
   *
   * Termal kafa 1 bit basar: gri tonlu logo lekeli çıkar. Saf siyah-beyaz,
   * ~512 piksel genişlikte PNG verilmelidir.
   */
  logoUrl: string;
  /** Varsayılan para birimi kodu */
  currency: string;
  /**
   * İndirilen dosya adlarındaki firma kısaltması — ör. "SM".
   * Boş bırakılırsa firma adından türetilir (bkz. lib/exportFilename.ts).
   */
  fileTag: string;
};

const FALLBACK: TenantConfig = {
  tenantId: 'local',
  companyName: 'TeknikERP',
  documentTitle: 'TeknikERP',
  companyContact: '',
  logoUrl: '',
  currency: 'TRY',
  fileTag: '',
};

let current: TenantConfig = FALLBACK;

/**
 * Uygulama açılmadan önce bir kez çağrılır. Ağ hatası veya eksik dosya
 * durumunda varsayılana düşer — yapılandırma yüzünden uygulama açılmaz olmaz.
 */
export async function loadTenantConfig(): Promise<TenantConfig> {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`config.json ${response.status}`);

    const raw = (await response.json()) as Partial<TenantConfig>;
    const companyName = raw.companyName?.trim() || FALLBACK.companyName;

    current = {
      tenantId: raw.tenantId?.trim() || FALLBACK.tenantId,
      companyName,
      documentTitle: raw.documentTitle?.trim() || `${companyName} ERP`,
      companyContact: raw.companyContact?.trim() || '',
      logoUrl: raw.logoUrl?.trim() || '',
      currency: raw.currency?.trim() || FALLBACK.currency,
      fileTag: raw.fileTag?.trim() || '',
    };
  } catch {
    console.warn('config.json okunamadi — varsayilan marka kullaniliyor.');
    current = FALLBACK;
  }

  document.title = current.documentTitle;
  return current;
}

/** Yüklenmiş yapılandırmayı döndürür. loadTenantConfig() sonrası kullanılır. */
export function getTenantConfig(): TenantConfig {
  return current;
}
