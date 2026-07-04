import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  Package,
  Pencil,
  Save,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  API_BASE,
  ensureArray,
  formatDate,
  formatMoney,
  invoiceAmountUsd,
  invoiceTypeLabel,
  invoiceTypeStyles,
  type Customer,
  type PaginatedListResponse,
} from '../lib/api';
import CustomerNameLink from '../components/CustomerNameLink';
import SimpleBarChart from '../components/SimpleBarChart';
import { useInvoiceEditorFromUrl } from '../hooks/useInvoiceEditorFromUrl';
import { buildPageUrl } from '../lib/navigation';
import SalesCreate from './SalesCreate';
import PurchaseCreate from './PurchaseCreate';
import SalesReturn from './SalesReturn';

type SafeBalance = {
  id: number;
  name: string;
  currency: string;
  balance: number;
  branch: { id: number; name: string };
};

type RecentInvoice = {
  id: number;
  invoiceNo: string;
  type: string;
  isPreOrder?: boolean;
  totalAmountTl: number;
  totalAmountUsd?: number;
  exchangeRate?: number;
  createdAt: string;
  customer: { id: number; code: string; name: string };
};

type DashboardProps = {
  refreshKey?: number;
  f2Trigger?: number;
  initialEditInvoiceId?: number;
  onNotify?: (type: 'success' | 'error', message: string) => void;
  onDataChange?: () => void;
  onF2ContextActive?: (active: boolean) => void;
};

type RecentPayment = {
  id: number;
  type: 'GIRIS' | 'CIKIS';
  amount: number;
  description: string;
  createdAt: string;
  safe: { id: number; name: string; currency: string };
  customer: { id: number; code: string; name: string } | null;
};

type DashboardInsights = {
  dailySales: { label: string; total: number }[];
  topProducts: { name: string; quantity: number; sku?: string }[];
  topCustomers: {
    customerId: number;
    code: string;
    name: string;
    amount: number;
    invoiceCount: number;
  }[];
  lowStock: { id: number; sku: string; name: string; quantity: number }[];
};

type DashboardData = {
  safeBalances: SafeBalance[];
  recentInvoices: RecentInvoice[];
  recentPayments: RecentPayment[];
  insights: DashboardInsights;
};

export default function Dashboard({
  refreshKey = 0,
  f2Trigger = 0,
  initialEditInvoiceId,
  onNotify,
  onDataChange,
  onF2ContextActive,
}: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<RecentPayment | null>(null);
  const [editCustomer, setEditCustomer] = useState<{
    id: number;
    code: string;
    name: string;
  } | null>(null);
  const [editCustomerSearch, setEditCustomerSearch] = useState('');
  const [editCustomerResults, setEditCustomerResults] = useState<Customer[]>([]);
  const [editCustomerDropdownOpen, setEditCustomerDropdownOpen] = useState(false);
  const [editCustomerSearchLoading, setEditCustomerSearchLoading] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState<'GIRIS' | 'CIKIS'>('GIRIS');
  const [editSafeId, setEditSafeId] = useState<number | ''>('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const editCustomerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { editingInvoice, openEditor, closeEditor, setEditingInvoice } = useInvoiceEditorFromUrl(
    'dashboard',
    undefined,
    initialEditInvoiceId
  );

  const notify = useCallback(
    (type: 'success' | 'error', message: string) => onNotify?.(type, message),
    [onNotify]
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<{
        success: boolean;
        data: DashboardData;
      }>(`${API_BASE}/api/sales/dashboard`);
      if (response.data.success) {
        const payload = response.data.data;
        const insights = payload.insights ?? {
          dailySales: [],
          topProducts: [],
          topCustomers: [],
          lowStock: [],
        };
        setData({
          safeBalances: ensureArray(payload.safeBalances),
          recentInvoices: ensureArray(payload.recentInvoices).slice(0, 10),
          recentPayments: ensureArray(payload.recentPayments).slice(0, 10),
          insights: {
            dailySales: ensureArray(insights.dailySales),
            topProducts: ensureArray(insights.topProducts),
            topCustomers: ensureArray(insights.topCustomers),
            lowStock: ensureArray(insights.lowStock),
          },
        });
      }
    } catch {
      setError('Ana sayfa verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setEditingInvoice(null);
  }, [refreshKey, setEditingInvoice]);

  useEffect(() => {
    if (editingInvoice === null) {
      void loadDashboard();
    }
  }, [refreshKey, editingInvoice, loadDashboard]);

  const tryOpenEditor = useCallback(
    (inv: RecentInvoice) => {
      if (!['SATIS', 'ALIS', 'IADE'].includes(inv.type)) {
        notify('error', 'Bu fatura türü düzenlenemez.');
        return;
      }
      openEditor({ id: inv.id, type: inv.type });
    },
    [notify, openEditor]
  );

  const handleSaved = useCallback(() => {
    closeEditor();
    onDataChange?.();
  }, [closeEditor, onDataChange]);

  const openPaymentEdit = useCallback((payment: RecentPayment) => {
    if (!payment.customer) {
      notify('error', 'Bu kasa hareketi cari kaydı olmadığı için düzenlenemez.');
      return;
    }
    setEditingPayment(payment);
    setEditCustomer(payment.customer);
    setEditCustomerSearch(`${payment.customer.code} — ${payment.customer.name}`);
    setEditCustomerResults([]);
    setEditCustomerDropdownOpen(false);
    setEditAmount(String(payment.amount));
    setEditDescription(payment.description);
    setEditType(payment.type);
    setEditSafeId(payment.safe.id);
  }, [notify]);

  const closePaymentEdit = useCallback(() => {
    setEditingPayment(null);
    setEditCustomer(null);
    setEditCustomerSearch('');
    setEditCustomerResults([]);
    setEditCustomerDropdownOpen(false);
  }, []);

  useEffect(() => {
    if (!editingPayment || !editCustomerDropdownOpen) {
      setEditCustomerResults([]);
      return;
    }
    const query = editCustomerSearch.trim();
    if (query.length < 1) {
      setEditCustomerResults([]);
      return;
    }

    if (editCustomerDebounceRef.current) clearTimeout(editCustomerDebounceRef.current);

    editCustomerDebounceRef.current = setTimeout(async () => {
      setEditCustomerSearchLoading(true);
      try {
        const response = await axios.get<PaginatedListResponse<Customer>>(
          `${API_BASE}/api/customers`,
          { params: { search: query, limit: 20, page: 1 } }
        );
        if (response.data.success) {
          setEditCustomerResults(ensureArray(response.data.data));
        }
      } catch {
        setEditCustomerResults([]);
      } finally {
        setEditCustomerSearchLoading(false);
      }
    }, 300);

    return () => {
      if (editCustomerDebounceRef.current) clearTimeout(editCustomerDebounceRef.current);
    };
  }, [editingPayment, editCustomerSearch, editCustomerDropdownOpen]);

  const selectEditCustomer = useCallback((customer: Customer) => {
    setEditCustomer({ id: customer.id, code: customer.code, name: customer.name });
    setEditCustomerSearch(`${customer.code} — ${customer.name}`);
    setEditCustomerDropdownOpen(false);
  }, []);

  const handleSavePaymentEdit = async () => {
    if (!editingPayment) return;
    if (!editCustomer) {
      notify('error', 'Müşteri seçin.');
      return;
    }
    const parsedAmount = Number(editAmount.replace(',', '.'));
    if (!parsedAmount || parsedAmount <= 0) {
      notify('error', 'Geçerli bir tutar girin.');
      return;
    }
    if (editSafeId === '') {
      notify('error', 'Kasa seçin.');
      return;
    }

    setEditSubmitting(true);
    try {
      const response = await axios.put(
        `${API_BASE}/api/customers/payment/${editingPayment.id}`,
        {
          amount: parsedAmount,
          type: editType,
          description: editDescription.trim() || undefined,
          safeId: Number(editSafeId),
          customerId: editCustomer.id,
        }
      );
      if (response.data.success) {
        notify('success', 'Kasa hareketi güncellendi.');
        closePaymentEdit();
        await loadDashboard();
        onDataChange?.();
      }
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'Güncelleme başarısız.';
      notify('error', message);
    } finally {
      setEditSubmitting(false);
    }
  };

  if (loading && editingInvoice === null) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-slate-400">Yükleniyor...</p>
      </div>
    );
  }

  if (editingInvoice) {
    if (editingInvoice.type === 'ALIS') {
      return (
        <PurchaseCreate
          key={editingInvoice.id}
          editInvoiceId={editingInvoice.id}
          f2Trigger={f2Trigger}
          onNotify={onNotify}
          onDataChange={onDataChange}
          onCancelEdit={closeEditor}
          onSaved={handleSaved}
        />
      );
    }
    if (editingInvoice.type === 'IADE') {
      return (
        <SalesReturn
          key={editingInvoice.id}
          editInvoiceId={editingInvoice.id}
          f2Trigger={f2Trigger}
          onNotify={onNotify}
          onDataChange={onDataChange}
          onCancelEdit={closeEditor}
          onSaved={handleSaved}
        />
      );
    }
    return (
      <SalesCreate
        key={editingInvoice.id}
        editInvoiceId={editingInvoice.id}
        f2Trigger={f2Trigger}
        onNotify={onNotify}
        onDataChange={onDataChange}
        onCancelEdit={closeEditor}
        onSaved={handleSaved}
        onF2ContextActive={onF2ContextActive}
      />
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        {error ?? 'Veri bulunamadı.'}
      </div>
    );
  }

  const { insights } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Ana Sayfa</h1>
          <p className="page-subtitle mt-1">
            Son 30 gün özet raporları · hızlı işlemler sol menüde
          </p>
        </div>
        <a
          href={buildPageUrl('report-analytics')}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          Tüm işletme özeti →
        </a>
      </div>

      <section className="flex gap-3 overflow-x-auto pb-1">
        {data.safeBalances.map((safe) => (
          <div
            key={safe.id}
            className="min-w-[140px] shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex items-center gap-1.5 text-slate-500">
              <Wallet className="h-3.5 w-3.5" />
              <span className="truncate text-xs">{safe.name}</span>
            </div>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {formatMoney(safe.balance, safe.currency)}
            </p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-800">Son 7 Gün Satış</h2>
          </div>
          <SimpleBarChart
            items={insights.dailySales.map((row) => ({
              label: row.label,
              value: row.total,
              color: 'bg-indigo-500',
            }))}
            valueFormatter={(v) => formatMoney(v)}
            emptyLabel="Satış verisi yok"
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-800">
              En Çok Satan Ürünler
            </h2>
            <span className="text-caption text-slate-400">30 gün</span>
          </div>
          <SimpleBarChart
            items={insights.topProducts.slice(0, 8).map((row) => ({
              label: row.name,
              value: row.quantity,
              color: 'bg-emerald-500',
            }))}
            valueFormatter={(v) => `${Math.round(v)} adet`}
            emptyLabel="Ürün satışı yok"
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-sky-600" />
            <h2 className="text-sm font-semibold text-slate-800">
              En Çok Alış Yapan Müşteriler
            </h2>
            <span className="text-caption text-slate-400">30 gün</span>
          </div>
          {insights.topCustomers.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Müşteri satışı yok</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {insights.topCustomers.slice(0, 8).map((row, index) => (
                <li
                  key={row.customerId}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      <span className="mr-1.5 text-caption text-slate-400">
                        {index + 1}.
                      </span>
                      <CustomerNameLink customerId={row.customerId}>
                        {row.name}
                      </CustomerNameLink>
                    </p>
                    <p className="text-caption text-slate-400">
                      {row.code} · {row.invoiceCount} fiş
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                    {formatMoney(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-slate-800">Düşük Stok</h2>
            <span className="text-caption text-slate-400">MERKEZ_DEPO ≤ 5</span>
          </div>
          {insights.lowStock.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Kritik stok yok</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {insights.lowStock.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {row.name}
                    </p>
                    <p className="font-mono text-caption text-slate-400">{row.sku}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
                    {row.quantity} adet
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Son Faturalar</h2>
            <a
              href={buildPageUrl('invoices')}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              Tümünü gör
            </a>
          </div>
          <ul className="divide-y divide-slate-50">
            {data.recentInvoices.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50/80"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-caption font-semibold ring-1 ring-inset ${invoiceTypeStyles(inv.type)}`}
                    >
                      {invoiceTypeLabel(inv.type)}
                    </span>
                    {inv.isPreOrder && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-caption font-semibold text-amber-800">
                        Ön Sipariş
                      </span>
                    )}
                    {['SATIS', 'ALIS', 'IADE'].includes(inv.type) ? (
                      <button
                        type="button"
                        onClick={() => tryOpenEditor(inv)}
                        className="truncate text-sm font-medium text-violet-700 hover:text-violet-900 hover:underline"
                      >
                        {inv.invoiceNo}
                      </button>
                    ) : (
                      <span className="truncate text-sm font-medium text-slate-800">
                        {inv.invoiceNo}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-400">
                    <CustomerNameLink
                      customerId={inv.customer.id}
                      className="text-xs font-normal"
                    >
                      {inv.customer.name}
                    </CustomerNameLink>
                    {' · '}
                    {formatDate(inv.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {formatMoney(invoiceAmountUsd(inv))}
                  </span>
                  {['SATIS', 'ALIS', 'IADE'].includes(inv.type) && (
                    <button
                      type="button"
                      onClick={() => tryOpenEditor(inv)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-600"
                      title="Düzenle"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
            {data.recentInvoices.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-slate-400">Kayıt yok</li>
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Son Kasa Hareketleri</h2>
            <a
              href={buildPageUrl('customer-payments')}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              Tümünü gör
            </a>
          </div>
          <ul className="divide-y divide-slate-50">
            {data.recentPayments.map((payment) => {
              const receiptNo = `KH-${payment.id}`;
              const canOpen = Boolean(payment.customer);
              return (
                <li
                  key={payment.id}
                  role={canOpen ? 'button' : undefined}
                  tabIndex={canOpen ? 0 : undefined}
                  onClick={() => {
                    if (canOpen) openPaymentEdit(payment);
                  }}
                  onKeyDown={(event) => {
                    if (!canOpen) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openPaymentEdit(payment);
                    }
                  }}
                  className={`flex items-center justify-between gap-2 px-4 py-3 ${
                    canOpen
                      ? 'cursor-pointer hover:bg-slate-50/80'
                      : ''
                  }`}
                  title={canOpen ? 'Detay ve açıklama için tıklayın' : undefined}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`shrink-0 rounded p-1 ${
                        payment.type === 'GIRIS'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-red-50 text-red-600'
                      }`}
                    >
                      {payment.type === 'GIRIS' ? (
                        <ArrowDownLeft className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {payment.customer ? payment.customer.name : 'Müşterisiz hareket'}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {payment.customer ? (
                          <span>Cari: {payment.customer.code}</span>
                        ) : null}
                        {payment.customer ? ' · ' : null}
                        <span className="font-mono">Fiş: {receiptNo}</span>
                        {' · '}
                        {payment.safe.name} · {formatDate(payment.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        payment.type === 'GIRIS' ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {payment.type === 'GIRIS' ? '+' : '-'}
                      {formatMoney(payment.amount, payment.safe.currency)}
                    </span>
                    {canOpen && (
                      <span className="rounded-lg p-1.5 text-slate-400">
                        <Pencil className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
            {data.recentPayments.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-slate-400">Kayıt yok</li>
            )}
          </ul>
        </section>
      </div>

      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Kasa Hareketi</h3>
                <p className="mt-0.5 font-mono text-sm text-slate-500">
                  Fiş: KH-{editingPayment.id}
                </p>
              </div>
              <button
                type="button"
                onClick={closePaymentEdit}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Müşteri
                </label>
                <input
                  type="text"
                  value={editCustomerSearch}
                  onChange={(e) => {
                    setEditCustomerSearch(e.target.value);
                    setEditCustomerDropdownOpen(true);
                    if (!e.target.value.trim()) setEditCustomer(null);
                  }}
                  onFocus={() => setEditCustomerDropdownOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setEditCustomerDropdownOpen(false), 150);
                  }}
                  placeholder="Kod veya isim ile ara..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  autoComplete="off"
                />
                {editCustomer && (
                  <p className="mt-1.5 text-xs font-semibold text-emerald-800">
                    Seçili: {editCustomer.code} — {editCustomer.name}
                  </p>
                )}
                {editCustomerDropdownOpen &&
                  (editCustomerSearch.trim() || editCustomerResults.length > 0) && (
                    <ul className="absolute z-30 left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg divide-y divide-slate-100">
                      {editCustomerSearchLoading && (
                        <li className="px-3 py-2 text-sm text-slate-400">Aranıyor...</li>
                      )}
                      {!editCustomerSearchLoading &&
                        editCustomerResults.map((customer) => (
                          <li
                            key={customer.id}
                            onMouseDown={() => selectEditCustomer(customer)}
                            className="cursor-pointer px-3 py-2 text-sm hover:bg-emerald-50"
                          >
                            <span className="font-medium">{customer.code}</span>
                            <span className="text-slate-500"> — {customer.name}</span>
                          </li>
                        ))}
                      {!editCustomerSearchLoading &&
                        editCustomerSearch.trim() &&
                        editCustomerResults.length === 0 && (
                          <li className="px-3 py-2 text-sm text-slate-400">Sonuç yok</li>
                        )}
                    </ul>
                  )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  İşlem Tipi
                </label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as 'GIRIS' | 'CIKIS')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="GIRIS">Tahsilat (Giriş)</option>
                  <option value="CIKIS">Ödeme (Çıkış)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Kasa</label>
                <select
                  value={editSafeId}
                  onChange={(e) =>
                    setEditSafeId(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {data.safeBalances.map((safe) => (
                    <option key={safe.id} value={safe.id}>
                      {safe.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Tutar ($)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Açıklama
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={closePaymentEdit}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void handleSavePaymentEdit()}
                disabled={editSubmitting}
                className="btn btn-secondary flex flex-1 items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                {editSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
