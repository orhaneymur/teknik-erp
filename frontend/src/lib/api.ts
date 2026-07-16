import axios from 'axios';

const envBase = import.meta.env.VITE_API_BASE as string | undefined;
export const API_BASE =
  typeof envBase === 'string' && envBase.trim().length > 0
    ? envBase.replace(/\/$/, '')
    : import.meta.env.DEV
      ? 'http://localhost:3000'
      : '';
export const DEFAULT_USD = 46.39;
export const DEFAULT_EUR = 53.628;
/** @deprecated fetchExchangeRates veya useExchangeRates kullanın */
export const EXCHANGE_RATE = DEFAULT_USD;
/** @deprecated fetchExchangeRates veya useExchangeRates kullanın */
export const EUR_RATE = DEFAULT_EUR;
export const AUTH_STORAGE_KEY = 'isLoggedIn';
export const AUTH_TOKEN_KEY = 'authToken';
export const LIST_PAGE_SIZE = 50;

export type ExchangeRates = {
  usd: number;
  eur: number;
  source: string;
  updatedAt: string;
};

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  try {
    const response = await axios.get<{
      success: boolean;
      data: ExchangeRates;
    }>(`${API_BASE}/api/exchange-rates`);
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
  } catch {
    /* varsayılan */
  }
  return {
    usd: DEFAULT_USD,
    eur: DEFAULT_EUR,
    source: 'varsayılan',
    updatedAt: new Date().toISOString(),
  };
}

/** Login sonrası JWT'yi tüm axios isteklerine ekler */
export function setupAuthInterceptor() {
  axios.interceptors.request.use((config) => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
}

export type PaginatedListResponse<T> = {
  success: boolean;
  data: T[];
  totalCount: number;
  limit: number;
  page: number;
  message: string;
};

/** @deprecated Eski meta yapısı — PaginatedListResponse kullanın */
export type PaginatedResponse<T> = PaginatedListResponse<T>;

/** API'den gelmeyen veya eksik dizi alanlarını güvenli şekilde normalize eder */
export function ensureArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function getTotalPages(totalCount: number, limit: number): number {
  if (totalCount <= 0 || limit <= 0) return 0;
  return Math.ceil(totalCount / limit);
}

export function buildVisiblePages(
  currentPage: number,
  totalPages: number
): (number | 'ellipsis')[] {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const result: (number | 'ellipsis')[] = [];
  const addEllipsis = () => {
    if (result[result.length - 1] !== 'ellipsis') {
      result.push('ellipsis');
    }
  };

  result.push(1);

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) addEllipsis();
  for (let p = start; p <= end; p += 1) {
    result.push(p);
  }
  if (end < totalPages - 1) addEllipsis();

  if (totalPages > 1) {
    result.push(totalPages);
  }

  return result;
}

export function roundPrice(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** Ürün adedi — yalnızca tam sayı (0, 1, 2, …) */
export function toIntegerQty(value: unknown, fallback = 0): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export const APP_CURRENCY = 'USD';

/** Tüm tutarlar USD endeksli — fatura gösterimi */
export function invoiceAmountUsd(invoice: {
  totalAmountUsd?: number | null;
  totalAmountTl: number;
  exchangeRate?: number | null;
}): number {
  const usd = invoice.totalAmountUsd;
  if (usd != null && usd > 0) return roundPrice(usd);
  const rate = invoice.exchangeRate && invoice.exchangeRate > 0 ? invoice.exchangeRate : 1;
  return roundPrice(invoice.totalAmountTl / rate);
}

/** USD fiyat — tr-TR: 18,50 $ */
export function formatUsd(value: number) {
  return `${new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundPrice(value))} $`;
}

export function formatMoney(value: number, _currency?: string) {
  return formatUsd(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(value));
}

export type InvoiceType = 'SATIS' | 'ALIS' | 'IADE';

export type Customer = {
  id: number;
  code: string;
  name: string;
  creditLimit: number;
  balance: number;
  contactPerson?: string | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
  taxOffice?: string | null;
  taxNumber?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Safe = {
  id: number;
  branchId: number;
  name: string;
  currency: string;
  balance: number;
};

export type Branch = {
  id: number;
  name: string;
  type: string;
};

export type ProductStock = {
  id: number;
  productId: number;
  branchId: number;
  quantity: number;
  branch: Branch;
};

export type Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  appearance?: string | null;
  quality?: string | null;
  description?: string | null;
  categoryId?: number | null;
  category?: { id: number; name: string } | null;
  costPrice: number;
  priceTl: number;
  priceUsd: number;
  stocks: ProductStock[];
  createdAt?: string;
  updatedAt?: string;
};

export function balanceStyles(balance: number) {
  if (balance > 0) {
    return {
      text: 'text-red-700',
      bg: 'bg-red-50 ring-red-200',
      label: 'Borçlu',
    };
  }
  if (balance < 0) {
    return {
      text: 'text-emerald-700',
      bg: 'bg-emerald-50 ring-emerald-200',
      label: 'Alacaklı',
    };
  }
  return {
    text: 'text-slate-600',
    bg: 'bg-slate-50 ring-slate-200',
    label: 'Dengede',
  };
}

export function invoiceTypeLabel(type: string) {
  switch (type) {
    case 'SATIS':
      return 'Satış';
    case 'ALIS':
      return 'Alış';
    case 'IADE':
      return 'İade';
    default:
      return type;
  }
}

export function invoiceTypeStyles(type: string) {
  switch (type) {
    case 'SATIS':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'ALIS':
      return 'bg-red-50 text-red-700 ring-red-200';
    case 'IADE':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-200';
  }
}
