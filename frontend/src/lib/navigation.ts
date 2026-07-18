import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  FileInput,
  FileText,
  Home,
  Layers,
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
  | 'report-stock-value'
  | 'report-cash-flow'
  | 'report-customer-statement'
  | 'def-products'
  | 'def-categories'
  | 'def-brands'
  | 'def-models'
  | 'def-safes'
  | 'def-users'
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
  | 'sales'
  | 'purchase'
  | 'stock'
  | 'customer'
  | 'reports'
  | 'definitions'
  | 'invoices';

export type MenuItem = {
  id: PageId;
  label: string;
  badge?: string;
};

export type MenuCategory = {
  id: MenuCategoryId;
  label: string;
  icon: LucideIcon;
  items: MenuItem[];
};

export const menuCategories: MenuCategory[] = [
  {
    id: 'sales',
    label: 'Satış İşlemleri',
    icon: ShoppingCart,
    items: [
      { id: 'sales', label: 'Satış Yap', badge: 'F2' },
      { id: 'sales-return', label: 'Satış İade' },
      { id: 'pre-orders', label: 'Ön Siparişler' },
    ],
  },
  {
    id: 'purchase',
    label: 'Alış İşlemleri',
    icon: FileInput,
    items: [{ id: 'invoice-purchase', label: 'Alış Faturası' }],
  },
  {
    id: 'stock',
    label: 'Stok İşlemleri',
    icon: Layers,
    items: [
      { id: 'stock-list', label: 'Stok Listesi' },
      { id: 'stock-transfer', label: 'Depo Transfer' },
      { id: 'stock-movements', label: 'Stok Hareketleri' },
      { id: 'product-create', label: 'Stok Kartı Oluştur' },
      { id: 'barcode-label', label: 'Barkod Etiket' },
    ],
  },
  {
    id: 'customer',
    label: 'Müşteri İşlemleri',
    icon: Users,
    items: [
      { id: 'customer-list', label: 'Müşteri Listesi' },
      { id: 'customer-create', label: 'Yeni Müşteri Kartı' },
      { id: 'customer-payments', label: 'Tahsilat / Ödeme', badge: 'F2' },
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
      { id: 'report-sales', label: 'Kâr-Zarar Raporu' },
      { id: 'report-stock-value', label: 'Stok Değeri' },
      { id: 'report-cash-flow', label: 'Kasa Raporu' },
    ],
  },
  {
    id: 'definitions',
    label: 'Tanımlar',
    icon: Settings,
    items: [
      { id: 'def-products', label: 'Ürün Tanımları' },
      { id: 'def-categories', label: 'Kategoriler' },
      { id: 'def-brands', label: 'Markalar' },
      { id: 'def-models', label: 'Modeller' },
      { id: 'def-safes', label: 'Kasa Tanımları' },
      { id: 'def-users', label: 'Personel Tanımları' },
    ],
  },
  {
    id: 'invoices',
    label: 'Faturalar',
    icon: FileText,
    items: [
      { id: 'invoices', label: 'Fatura Listesi' },
      { id: 'deleted-invoices', label: 'Silinen İşlemler' },
    ],
  },
];

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

/** Ana Sayfa altında sol menü hızlı işlemler */
export const dashboardQuickLinks: MenuItem[] = [
  { id: 'sales', label: 'Satış Yap', badge: 'F2' },
  { id: 'invoice-purchase', label: 'Alış Yap' },
  { id: 'sales-return', label: 'İade Al' },
  { id: 'product-create', label: 'Stok Kartı Oluştur' },
  { id: 'invoices', label: 'Faturalar' },
];

const VALID_PAGES = new Set<PageId>([
  'dashboard',
  'sales',
  'sales-return',
  'invoice-purchase',
  'stock-list',
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
  'report-stock-value',
  'report-cash-flow',
  'report-customer-statement',
  'def-products',
  'def-categories',
  'def-brands',
  'def-models',
  'def-safes',
  'def-users',
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
  for (const category of menuCategories) {
    const item = category.items.find((entry) => entry.id === page);
    if (item) return item.label;
  }
  return dashboardItem.label;
}

export const APP_DOCUMENT_TITLE = 'Akgün Teknik ERP';

export type DocumentTitleOptions = {
  invoiceFilter?: InvoiceFilter;
  preOrderOnly?: boolean;
  editInvoiceId?: number;
  customerName?: string;
};

function getDocumentTitleLabel(
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

  if (options?.editInvoiceId) {
    if (page === 'sales' || page === 'dashboard' || page === 'pre-orders') {
      return 'Satış Faturası Düzenle';
    }
    if (page === 'invoice-purchase') return 'Alış Faturası Düzenle';
    if (page === 'sales-return') return 'İade Faturası Düzenle';
    return 'Fatura Düzenle';
  }

  return getPageLabel(page);
}

export function formatDocumentTitle(pageTitle: string): string {
  const label = pageTitle.trim();
  return label ? `${label} · ${APP_DOCUMENT_TITLE}` : APP_DOCUMENT_TITLE;
}

export function getDocumentTitle(
  page: PageId,
  options?: DocumentTitleOptions
): string {
  return formatDocumentTitle(getDocumentTitleLabel(page, options));
}
