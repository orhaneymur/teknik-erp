import type { LucideIcon } from 'lucide-react';
import { getTenantConfig } from './tenantConfig';
import { yetkiVar, type Alan, type Yetki } from './yetki';
import {
  BarChart3,
  ClipboardList,
  FileInput,
  FileText,
  HandCoins,
  Home,
  Layers,
  RotateCcw,
  Settings,
  ShoppingCart,
  Users,
} from 'lucide-react';
import type { InvoiceType } from './api';

/** Sidebar ve routing — yalnızca canlı ekranlar */
export type PageId =
  | 'dashboard'
  | 'sales'
  | 'sales-return'
  | 'invoice-purchase'
  | 'stock-list'
  | 'deleted-products'
  | 'stock-transfer'
  | 'stock-movements'
  | 'product-create'
  | 'barcode-label'
  | 'customer-list'
  | 'customer-create'
  | 'customer-payments'
  | 'customer-detail'
  | 'customer-balance'
  | 'report-sales'
  | 'report-analytics'
  | 'report-sales-breakdown'
  | 'report-stock-value'
  | 'report-cash-flow'
  | 'report-customer-statement'
  | 'def-products'
  | 'def-categories'
  | 'def-brands'
  | 'def-models'
  | 'def-safes'
  | 'def-users'
  | 'settings-company'
  | 'invoices'
  | 'deleted-invoices'
  | 'pre-orders';

export type InvoiceFilter = 'ALL' | InvoiceType;

export type NavigateOptions = {
  invoiceFilter?: InvoiceFilter;
  preOrderOnly?: boolean;
  customerId?: number;
  editInvoiceId?: number;
  /** true ise geçmişe yeni kayıt eklenmez (popstate senkronu, çıkış vb.) */
  replace?: boolean;
};

export type NavigateFn = (page: PageId, options?: NavigateOptions) => void;

export type MenuCategoryId =
  // 'purchase' kaldırıldı: alış faturası artık 'sales' başlığının altında
  | 'sales'
  | 'stock'
  | 'customer'
  | 'reports'
  | 'definitions'
  | 'invoices';

export type MenuItem = {
  id: PageId;
  label: string;
  badge?: string;
  /**
   * Bu ekranı açmak için gereken yetki. Verilmezse herkese görünür.
   *
   * Yalnızca MENÜDE gizlemek için; gerçek kapı sunucudaki yetki kancası.
   * Burada işaretlenmemiş bir ekran yine 403 alır, sadece kullanıcı
   * gidip boş ekranla karşılaşır.
   */
  izin?: { alan: Alan; yetki: Yetki };
};

export type MenuCategory = {
  id: MenuCategoryId;
  label: string;
  icon: LucideIcon;
  items: MenuItem[];
};

export const menuCategories: MenuCategory[] = [
  /*
   * Satış ve alış tek başlıkta toplandı. İkisi de günlük fiş işlemleri;
   * ayrı iki kategori olunca menü uzuyor ve "alış faturası neredeydi?"
   * diye aranıyordu. Sıra iş akışını izler: önce satış, sonra iade,
   * sonra alış.
   */
  {
    id: 'sales',
    label: 'Satış ve Alış',
    icon: ShoppingCart,
    items: [
      { id: 'sales', label: 'Satış Yap', badge: 'F2', izin: { alan: 'satis', yetki: 'yaz' } },
      { id: 'sales-return', label: 'Satış İade', izin: { alan: 'iade', yetki: 'yaz' } },
      { id: 'invoice-purchase', label: 'Alış Faturası', izin: { alan: 'alis', yetki: 'yaz' } },
      { id: 'pre-orders', label: 'Ön Siparişler' },
    ],
  },
  {
    id: 'stock',
    label: 'Stok İşlemleri',
    icon: Layers,
    items: [
      { id: 'stock-list', label: 'Stok Listesi' },
      { id: 'deleted-products', label: 'Silinen Ürünler', izin: { alan: 'stok', yetki: 'sil' } },
      { id: 'stock-transfer', label: 'Depo Transfer', izin: { alan: 'stok', yetki: 'guncelle' } },
      { id: 'stock-movements', label: 'Stok Hareketleri' },
      { id: 'product-create', label: 'Stok Kartı Oluştur', izin: { alan: 'stok', yetki: 'yaz' } },
      { id: 'barcode-label', label: 'Barkod Etiket' },
    ],
  },
  {
    id: 'customer',
    label: 'Müşteri İşlemleri',
    icon: Users,
    items: [
      { id: 'customer-list', label: 'Müşteri Listesi' },
      { id: 'customer-create', label: 'Yeni Müşteri Kartı', izin: { alan: 'musteri', yetki: 'yaz' } },
      { id: 'customer-payments', label: 'Tahsilat / Ödeme', badge: 'F2', izin: { alan: 'tahsilat', yetki: 'yaz' } },
      { id: 'report-customer-statement', label: 'Müşteri Ekstre' },
      { id: 'customer-balance', label: 'Müşteri Borç / Alacak' },
    ],
  },
  {
    id: 'reports',
    label: 'Raporlar',
    icon: BarChart3,
    items: [
      { id: 'report-analytics', label: 'İşletme Özeti' },
      { id: 'report-sales-breakdown', label: 'Satış Kırılımı' },
      { id: 'report-sales', label: 'Kâr-Zarar Raporu', izin: { alan: 'maliyet', yetki: 'oku' } },
      { id: 'report-stock-value', label: 'Stok Değeri', izin: { alan: 'maliyet', yetki: 'oku' } },
      { id: 'report-cash-flow', label: 'Kasa Raporu', izin: { alan: 'kasa', yetki: 'oku' } },
    ],
  },
  /*
   * SITE AYARLARI — eskiden "Tanimlar".
   *
   * Sistem ayarlari dort ayri basliga dagilmisti; "kasa nereden tanimlaniyor,
   * personel nereden ekleniyor" diye araniyordu. Tek basligin altinda
   * toplandi (musteri istegi, 6 Kasim 2026). Sira gunluk kullanim
   * sikligina gore degil, YONETIM sirasina gore: firma -> kullanici ->
   * kasa -> urun siniflandirmasi.
   */
  {
    id: 'definitions',
    label: 'Site Ayarları',
    icon: Settings,
    items: [
      { id: 'settings-company', label: 'Firma Bilgileri', izin: { alan: 'ayarlar', yetki: 'guncelle' } },
      { id: 'def-users', label: 'Kullanıcı Yönetimi', izin: { alan: 'ayarlar', yetki: 'guncelle' } },
      { id: 'def-safes', label: 'Kasa Tanımları', izin: { alan: 'ayarlar', yetki: 'guncelle' } },
      { id: 'def-categories', label: 'Kategoriler', izin: { alan: 'ayarlar', yetki: 'guncelle' } },
      { id: 'def-brands', label: 'Markalar', izin: { alan: 'ayarlar', yetki: 'guncelle' } },
      { id: 'def-models', label: 'Modeller', izin: { alan: 'ayarlar', yetki: 'guncelle' } },
      { id: 'def-products', label: 'Ürün Tanımları', izin: { alan: 'ayarlar', yetki: 'guncelle' } },
    ],
  },
  {
    id: 'invoices',
    label: 'Faturalar',
    icon: FileText,
    items: [
      { id: 'invoices', label: 'Fatura Listesi' },
      { id: 'deleted-invoices', label: 'Silinen İşlemler', izin: { alan: 'satis', yetki: 'sil' } },
    ],
  },
];

/**
 * Rolün görebileceği kalemler. Kalem kalmayan başlık hiç çizilmez.
 *
 * Menüyü gizlemek koruma değil; sunucu zaten 403 veriyor. Amaç kullanıcıya
 * yapamayacağı işi göstermemek.
 */
export function gorunurKategoriler(): MenuCategory[] {
  return menuCategories
    .map((kategori) => ({
      ...kategori,
      items: kategori.items.filter(
        (kalem) => !kalem.izin || yetkiVar(kalem.izin.alan, kalem.izin.yetki)
      ),
    }))
    .filter((kategori) => kategori.items.length > 0);
}

export function getCategoryForPage(pageId: PageId): MenuCategoryId | null {
  if (pageId === 'pre-orders') return 'sales';
  if (pageId === 'customer-detail') return 'customer';
  if (pageId === 'report-customer-statement' || pageId === 'customer-balance') {
    return 'customer';
  }
  for (const category of menuCategories) {
    if (category.items.some((item) => item.id === pageId)) {
      return category.id;
    }
  }
  return null;
}

export const dashboardItem = {
  id: 'dashboard' as const,
  label: 'Ana Sayfa',
  icon: Home,
};

/** Sol menü ve Ana Sayfa kartları aynı listeden beslenir */
export type QuickLink = MenuItem & {
  icon: LucideIcon;
  /** Ana Sayfa kartında etiketin altında görünen açıklama */
  description: string;
  options?: NavigateOptions;
};

export const dashboardQuickLinks: QuickLink[] = [
  {
    id: 'sales',
    label: 'Satış Yap',
    badge: 'F2',
    icon: ShoppingCart,
    description: 'Yeni satış faturası',
  },
  {
    id: 'invoice-purchase',
    label: 'Alış Yap',
    icon: FileInput,
    description: 'Yeni alış faturası',
  },
  {
    id: 'sales-return',
    label: 'İade Al',
    icon: RotateCcw,
    description: 'Satış iadesi işle',
  },
  {
    id: 'customer-payments',
    label: 'Ödeme Al',
    badge: 'F2',
    icon: HandCoins,
    description: 'Cari tahsilat / ödeme',
  },
  {
    id: 'pre-orders',
    label: 'Ön Siparişler',
    icon: ClipboardList,
    description: 'Teslim bekleyenler',
    options: { preOrderOnly: true },
  },
];

const VALID_PAGES = new Set<PageId>([
  'dashboard',
  'sales',
  'sales-return',
  'invoice-purchase',
  'stock-list',
  'deleted-products',
  'stock-transfer',
  'stock-movements',
  'product-create',
  'barcode-label',
  'customer-list',
  'customer-create',
  'customer-payments',
  'customer-detail',
  'customer-balance',
  'report-sales',
  'report-analytics',
  'report-sales-breakdown',
  'report-stock-value',
  'report-cash-flow',
  'report-customer-statement',
  'def-products',
  'def-categories',
  'def-brands',
  'def-models',
  'def-safes',
  'def-users',
  'settings-company',
  'invoices',
  'deleted-invoices',
  'pre-orders',
]);

export function buildPageUrl(page: PageId, options?: NavigateOptions): string {
  const url = new URL(window.location.href);
  url.searchParams.set('page', page);
  if (options?.invoiceFilter && options.invoiceFilter !== 'ALL') {
    url.searchParams.set('filter', options.invoiceFilter);
  } else {
    url.searchParams.delete('filter');
  }
  if (options?.preOrderOnly) {
    url.searchParams.set('preOrder', '1');
  } else {
    url.searchParams.delete('preOrder');
  }
  if (options?.customerId && options.customerId > 0) {
    url.searchParams.set('customerId', String(options.customerId));
  } else {
    url.searchParams.delete('customerId');
  }
  if (options?.editInvoiceId && options.editInvoiceId > 0) {
    url.searchParams.set('invoiceId', String(options.editInvoiceId));
  } else {
    url.searchParams.delete('invoiceId');
  }
  return url.toString();
}

/**
 * Kayıtlı fişi düzenleme ekranında YENİ SEKMEDE açar (Fatura Listesi ile
 * aynı gömülü düzenleyici). Stok geçmişi penceresi satış/alış ekranının
 * üstünde açıldığı için aynı sekmede gitmek eldeki sepeti kaybettirirdi.
 */
export function openInvoiceEditorInNewTab(invoiceId: number): void {
  window.open(buildPageUrl('invoices', { editInvoiceId: invoiceId }), '_blank', 'noopener');
}

export function parsePageFromUrl(): {
  page: PageId;
  invoiceFilter: InvoiceFilter;
  preOrderOnly: boolean;
  customerId?: number;
  editInvoiceId?: number;
} {
  const params = new URLSearchParams(window.location.search);
  const rawPage = params.get('page') ?? 'dashboard';
  const page = VALID_PAGES.has(rawPage as PageId) ? (rawPage as PageId) : 'dashboard';
  const filterRaw = params.get('filter');
  const invoiceFilter: InvoiceFilter =
    filterRaw === 'SATIS' || filterRaw === 'ALIS' || filterRaw === 'IADE'
      ? filterRaw
      : 'ALL';
  const preOrderOnly = params.get('preOrder') === '1' || page === 'pre-orders';
  const customerIdRaw = params.get('customerId');
  const parsedCustomerId = customerIdRaw ? Number(customerIdRaw) : NaN;
  const customerId =
    Number.isFinite(parsedCustomerId) && parsedCustomerId > 0 ? parsedCustomerId : undefined;
  const invoiceIdRaw = params.get('invoiceId');
  const parsedInvoiceId = invoiceIdRaw ? Number(invoiceIdRaw) : NaN;
  const editInvoiceId =
    Number.isFinite(parsedInvoiceId) && parsedInvoiceId > 0 ? parsedInvoiceId : undefined;
  return { page, invoiceFilter, preOrderOnly, customerId, editInvoiceId };
}

export function getPageLabel(page: PageId): string {
  if (page === 'dashboard') return dashboardItem.label;
  if (page === 'customer-detail') return 'Müşteri Kartı';
  if (page === 'pre-orders') return 'Ön Siparişler';
  if (page === 'deleted-invoices') return 'Silinen İşlemler';
  if (page === 'deleted-products') return 'Silinen Ürünler';
  for (const category of menuCategories) {
    const item = category.items.find((entry) => entry.id === page);
    if (item) return item.label;
  }
  return dashboardItem.label;
}

/** Sekme başlığı ConfigMap'ten gelir — müşteriye göre değişir. */
export function appDocumentTitle(): string {
  return getTenantConfig().documentTitle;
}

export type DocumentTitleOptions = {
  invoiceFilter?: InvoiceFilter;
  preOrderOnly?: boolean;
  editInvoiceId?: number;
  customerName?: string;
};

/**
 * Sekmedeki SOL parca — sayfanin adi ("Satis Yap", "Alis Faturasi Duzenle").
 *
 * Disa aciktir cunku satis/alis/iade ekranlari sekme basligini kendileri
 * tazeliyor (secilen musteri adini yazmak icin) ve ayni etiketi yeniden
 * uretmek zorunda kalmasinlar — iki yerde ayri mantik olursa duzenleme
 * basligi ("... Duzenle") bir tarafta eskir.
 */
export function getDocumentTitleLabel(
  page: PageId,
  options?: DocumentTitleOptions
): string {
  if (page === 'invoices') {
    if (options?.preOrderOnly) return 'Ön Siparişler';
    if (options?.invoiceFilter === 'SATIS') return 'Satış Faturaları';
    if (options?.invoiceFilter === 'ALIS') return 'Alış Faturaları';
    if (options?.invoiceFilter === 'IADE') return 'İade Faturaları';
    return 'Fatura Listesi';
  }

  if (page === 'customer-detail') {
    const name = options?.customerName?.trim();
    return name || 'Müşteri Kartı';
  }

  /*
   * Fis ekranlarinda KISALTMA (musteri istegi, 18 Kasim 2026): bircok
   * sekme acikken sekmede musteri adi okunabilsin.
   *   SF = satis faturasi · OS = on siparis · AF = alis · IF = iade
   * Kayitli fis duzenleniyorsa sonuna kalem isareti gelir: "SF ✎".
   */
  const duzenle = options?.editInvoiceId ? ' ✎' : '';
  if (page === 'sales' || ((page === 'pre-orders' || page === 'dashboard') && duzenle)) {
    return `${options?.preOrderOnly ? 'ÖS' : 'SF'}${duzenle}`;
  }
  if (page === 'invoice-purchase') return `AF${duzenle}`;
  if (page === 'sales-return') return `İF${duzenle}`;
  if (duzenle) return 'Fatura ✎';

  return getPageLabel(page);
}

/**
 * Sekme basligi: "<sayfa> · <firma>".
 *
 * `firma` verilirse ConfigMap'teki firma adinin YERINE yazilir. Satis, alis
 * ve iade ekranlari buraya secilen musterinin adini gecirer: ayni anda bes
 * sekme acikken hangisinin hangi musteriye ait oldugu sekmeden okunur
 * (musteri istegi, 6 Kasim 2026). Bos/secilmemisse firma adina doner.
 */
export function formatDocumentTitle(pageTitle: string, firma?: string): string {
  const label = pageTitle.trim();
  const appTitle = firma?.trim() || appDocumentTitle();
  return label ? `${label} · ${appTitle}` : appTitle;
}

export function getDocumentTitle(
  page: PageId,
  options?: DocumentTitleOptions
): string {
  return formatDocumentTitle(getDocumentTitleLabel(page, options));
}
