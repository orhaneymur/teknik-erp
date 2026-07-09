import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  ArrowDownLeft,
  ArrowRight,
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
} from '../lib/api';
import CustomerNameLink from '../components/CustomerNameLink';
import InlineCustomerSearchInput from '../components/InlineCustomerSearchInput';
import {
  AreaTrendChart,
  LowStockMeter,
  RankingChart,
} from '../components/DashboardCharts';
import { useInvoiceEditorFromUrl } from '../hooks/useInvoiceEditorFromUrl';
import { buildPageUrl, type PageId } from '../lib/navigation';
import InvoiceInlineEditor from '../components/InvoiceInlineEditor';

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
  monthlySales: { label: string; total: number }[];
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

function SeeAllLink({
  page,
  label = 'Tümünü gör',
}: {
  page: PageId;
  label?: string;
}) {
  return (
    <a
      href={buildPageUrl(page)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </a>
  );
}

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
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState<'GIRIS' | 'CIKIS'>('GIRIS');
  const [editSafeId, setEditSafeId] = useState<number | ''>('');
  const [editSubmitting, setEditSubmitting] = useState(false);

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
          monthlySales: [],
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
            monthlySales: ensureArray(insights.monthlySales),
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
    setEditAmount(String(payment.amount));
    setEditDescription(payment.description);
    setEditType(payment.type);
    setEditSafeId(payment.safe.id);
  }, [notify]);

  const closePaymentEdit = useCallback(() => {
    setEditingPayment(null);
    setEditCustomer(null);
    setEditCustomerSearch('');
  }, []);

  const selectEditCustomer = useCallback((customer: Customer) => {
    setEditCustomer({ id: customer.id, code: customer.code, name: customer.name });
    setEditCustomerSearch(`${customer.code} — ${customer.name}`);
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
    return (
      <InvoiceInlineEditor
        invoice={editingInvoice}
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
            Canlı özet raporlar · detay için kartlardaki Tümünü gör
          </p>
        </div>
        <SeeAllLink page="report-analytics" label="İşletme özeti" />
      </div>

      <section className="flex gap-3 overflow-x-auto pb-1">
        {data.safeBalances.map((safe) => (
          <a
            key={safe.id}
            href={buildPageUrl('report-cash-flow')}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-[148px] shrink-0 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-4 py-3 shadow-sm no-underline transition hover:border-indigo-200 hover:shadow-md"
          >
            <div className="flex items-center gap-1.5 text-slate-500">
              <Wallet className="h-3.5 w-3.5" />
              <span className="truncate text-xs">{safe.name}</span>
            </div>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {formatMoney(safe.balance, safe.currency)}
            </p>
          </a>
        ))}
        <a
          href={buildPageUrl('report-cash-flow')}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-[120px] shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-3 text-xs font-semibold text-indigo-700 no-underline hover:border-indigo-300 hover:bg-indigo-50"
        >
          Tüm kasalar
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </a>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Son 7 Gün Satış</h2>
                <p className="text-caption text-slate-400">Günlük ciro trendi</p>
              </div>
            </div>
            <SeeAllLink page="report-analytics" />
          </div>
          <AreaTrendChart
            items={insights.dailySales.map((row) => ({
              label: row.label,
              value: row.total,
            }))}
            valueFormatter={(v) => formatMoney(v)}
            emptyLabel="Satış verisi yok"
            accent="indigo"
          />
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-violet-100 p-2 text-violet-700">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Son 6 Ay Satış</h2>
                <p className="text-caption text-slate-400">Aylık ciro trendi</p>
              </div>
            </div>
            <SeeAllLink page="report-sales" label="Kâr-zarar" />
          </div>
          <AreaTrendChart
            items={insights.monthlySales.map((row) => ({
              label: row.label,
              value: row.total,
            }))}
            valueFormatter={(v) => formatMoney(v)}
            emptyLabel="Aylık satış verisi yok"
            accent="sky"
          />
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
                <Package className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  En Çok Satan Ürünler
                </h2>
                <p className="text-caption text-slate-400">Son 30 gün · adet</p>
              </div>
            </div>
            <SeeAllLink page="report-analytics" />
          </div>
          <RankingChart
            items={insights.topProducts.slice(0, 8).map((row) => ({
              label: row.name,
              sublabel: row.sku,
              value: row.quantity,
            }))}
            valueFormatter={(v) => `${Math.round(v)} adet`}
            emptyLabel="Ürün satışı yok"
            accent="emerald"
          />
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-sky-100 p-2 text-sky-700">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  En Çok Alış Yapan Müşteriler
                </h2>
                <p className="text-caption text-slate-400">Son 30 gün · ciro</p>
              </div>
            </div>
            <SeeAllLink page="customer-balance" label="Borç / alacak" />
          </div>
          <RankingChart
            items={insights.topCustomers.slice(0, 8).map((row) => ({
              label: row.name,
              sublabel: `${row.code} · ${row.invoiceCount} fiş`,
              value: row.amount,
            }))}
            valueFormatter={(v) => formatMoney(v)}
            emptyLabel="Müşteri satışı yok"
            accent="sky"
          />
          {insights.topCustomers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <SeeAllLink page="report-customer-statement" label="Müşteri ekstre" />
              <SeeAllLink page="report-analytics" label="İşletme özeti" />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-900/5 lg:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-amber-100 p-2 text-amber-800">
                <Package className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Düşük Stok Uyarısı</h2>
                <p className="text-caption text-slate-400">
                  MERKEZ_DEPO · 5 adet ve altı
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <SeeAllLink page="stock-list" label="Stok listesi" />
              <SeeAllLink page="report-stock-value" label="Stok değeri" />
            </div>
          </div>
          {insights.lowStock.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Kritik stok yok</p>
          ) : (
            <div className="grid grid-cols-1 gap-x-10 gap-y-2 md:grid-cols-2">
              <LowStockMeter
                items={insights.lowStock
                  .slice(0, Math.ceil(insights.lowStock.length / 2))
                  .map((row) => ({
                    id: row.id,
                    label: row.name,
                    sublabel: row.sku,
                    value: row.quantity,
                  }))}
              />
              <LowStockMeter
                items={insights.lowStock
                  .slice(Math.ceil(insights.lowStock.length / 2))
                  .map((row) => ({
                    id: row.id,
                    label: row.name,
                    sublabel: row.sku,
                    value: row.quantity,
                  }))}
                emptyLabel=""
              />
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Son Faturalar</h2>
            <SeeAllLink page="invoices" />
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
            <SeeAllLink page="customer-payments" />
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
                <InlineCustomerSearchInput
                  value={editCustomerSearch}
                  onChange={(text) => {
                    setEditCustomerSearch(text);
                    if (!text.trim()) setEditCustomer(null);
                  }}
                  onSelect={selectEditCustomer}
                  selectedCustomer={
                    editCustomer
                      ? ({
                          ...editCustomer,
                          creditLimit: 0,
                          balance: 0,
                          createdAt: '',
                          updatedAt: '',
                        } as Customer)
                      : null
                  }
                  inputClassName="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  accentClass="emerald"
                />
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
