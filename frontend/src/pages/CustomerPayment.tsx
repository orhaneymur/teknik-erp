import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  Printer,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import F2CustomerList from '../components/F2CustomerList';
import InlineCustomerSearchInput from '../components/InlineCustomerSearchInput';
import CustomerNameLink from '../components/CustomerNameLink';
import ProductSearchPopover from '../components/ProductSearchPopover';
import { useF2CustomerSearch } from '../hooks/useF2CustomerSearch';
import { useF2KeyboardNav } from '../hooks/useF2KeyboardNav';
import {
  API_BASE,
  balanceStyles,
  ensureArray,
  formatMoney,
  formatUsd,
  formatDate,
  roundPrice,
  type Customer,
  type PaginatedListResponse,
  type Safe,
} from '../lib/api';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { printDocument } from '../lib/printMode';
import { pickCustomerFromSearch } from '../lib/customerSearch';

type PaymentCurrency = 'USD' | 'TRY';

function amountToStoredUsd(value: number, currency: PaymentCurrency, usdRate: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (currency === 'USD') return roundPrice(value);
  const rate = usdRate > 0 ? usdRate : 1;
  return roundPrice(value / rate);
}

function CurrencyToggle({
  value,
  onChange,
}: {
  value: PaymentCurrency;
  onChange: (next: PaymentCurrency) => void;
}) {
  const base =
    'px-3 py-2.5 text-sm font-semibold transition-colors min-w-[3rem]';
  const active = 'bg-emerald-600 text-white';
  const inactive = 'bg-white text-slate-600 hover:bg-slate-50';

  return (
    <div className="flex shrink-0 overflow-hidden rounded-xl border border-slate-300">
      <button
        type="button"
        onClick={() => onChange('USD')}
        className={`${base} border-r border-slate-300 ${value === 'USD' ? active : inactive}`}
        aria-pressed={value === 'USD'}
      >
        $
      </button>
      <button
        type="button"
        onClick={() => onChange('TRY')}
        className={`${base} ${value === 'TRY' ? active : inactive}`}
        aria-pressed={value === 'TRY'}
      >
        ₺
      </button>
    </div>
  );
}

function PaymentAmountField({
  label,
  amount,
  onAmountChange,
  currency,
  onCurrencyChange,
  usdRate,
  inputClass,
}: {
  label: string;
  amount: string;
  onAmountChange: (value: string) => void;
  currency: PaymentCurrency;
  onCurrencyChange: (value: PaymentCurrency) => void;
  usdRate: number;
  inputClass: string;
}) {
  const parsed = Number(amount);
  const storedUsd =
    parsed > 0 ? amountToStoredUsd(parsed, currency, usdRate) : null;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <div className="flex gap-2">
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder={currency === 'USD' ? '0,00 $' : '0,00 ₺'}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <CurrencyToggle value={currency} onChange={onCurrencyChange} />
      </div>
      {currency === 'TRY' && storedUsd != null && storedUsd > 0 && (
        <p className="mt-1.5 text-caption text-slate-500">
          Cari kaydı: ≈ {formatUsd(storedUsd)} · kur {usdRate.toFixed(4)} ₺/$
        </p>
      )}
      {currency === 'USD' && storedUsd != null && storedUsd > 0 && (
        <p className="mt-1.5 text-caption text-slate-500">
          Cari kaydı: {formatUsd(storedUsd)}
        </p>
      )}
    </div>
  );
}

type CustomerPaymentProps = {
  f2Trigger?: number;
  initialCustomerId?: number;
  onNotify?: (type: 'success' | 'error', message: string) => void;
  onDataChange?: () => void;
};

type PaymentRow = {
  id: number;
  type: 'GIRIS' | 'CIKIS';
  amount: number;
  description: string;
  createdAt: string;
  customer: { id: number; code: string; name: string; balance?: number } | null;
  safe: { id: number; name: string; currency: string; balance?: number };
};

type PaymentReceipt = {
  type: 'GIRIS' | 'CIKIS';
  amount: number;
  description: string;
  createdAt: string;
  customerLabel: string;
  safeName: string;
  balanceAfter?: number | null;
};

export default function CustomerPayment({
  f2Trigger = 0,
  initialCustomerId,
  onNotify,
  onDataChange,
}: CustomerPaymentProps) {
  const [safes, setSafes] = useState<Safe[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedSafe, setSelectedSafe] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [amountCurrency, setAmountCurrency] = useState<PaymentCurrency>('USD');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [f2Modal, setF2Modal] = useState(false);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [editCustomer, setEditCustomer] = useState<{
    id: number;
    code: string;
    name: string;
  } | null>(null);
  const [editCustomerSearch, setEditCustomerSearch] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editAmountCurrency, setEditAmountCurrency] = useState<PaymentCurrency>('USD');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState<'GIRIS' | 'CIKIS'>('GIRIS');
  const [editSafeId, setEditSafeId] = useState<number | ''>('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [shouldPrint, setShouldPrint] = useState(false);
  const [printReceipt, setPrintReceipt] = useState<PaymentReceipt | null>(null);

  const customerSearchRef = useRef<HTMLInputElement>(null);

  const f2 = useF2CustomerSearch({ open: f2Modal, f2Trigger });
  const { rates } = useExchangeRates();

  const loadSafes = useCallback(async () => {
    setLoading(true);
    try {
      const initRes = await axios.get<{ success: boolean; data: { safes: Safe[] } }>(
        `${API_BASE}/api/sales/init`
      );

      if (initRes.data.success) {
        const safeList = ensureArray(initRes.data.data.safes);
        setSafes(safeList);
        if (safeList.length > 0) {
          setSelectedSafe((prev) => (prev === '' ? safeList[0].id : prev));
        }
      }
    } catch {
      onNotify?.('error', 'Kasa verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadSafes();
  }, [loadSafes]);

  useEffect(() => {
    if (!initialCustomerId || initialCustomerId <= 0) return;

    let cancelled = false;
    const loadInitialCustomer = async () => {
      try {
        const response = await axios.get<{ success: boolean; data: Customer }>(
          `${API_BASE}/api/customers/${initialCustomerId}`
        );
        if (!cancelled && response.data.success) {
          const customer = response.data.data;
          setSelectedCustomer(customer);
          setCustomerSearch(`${customer.code} — ${customer.name}`);
        }
      } catch {
        /* müşteri yüklenemedi */
      }
    };

    void loadInitialCustomer();
    return () => {
      cancelled = true;
    };
  }, [initialCustomerId]);

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 30, page: 1 };
      if (selectedCustomer) params.customerId = selectedCustomer.id;
      const response = await axios.get<PaginatedListResponse<PaymentRow>>(
        `${API_BASE}/api/customers/payments`,
        { params }
      );
      if (response.data.success) {
        setPayments(ensureArray(response.data.data));
      }
    } catch {
      onNotify?.('error', 'Ödeme listesi yüklenemedi.');
    } finally {
      setPaymentsLoading(false);
    }
  }, [selectedCustomer, onNotify]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    if (f2Trigger > 0) {
      setF2Modal(true);
    }
  }, [f2Trigger]);

  const selectCustomer = useCallback((customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(`${customer.code} — ${customer.name}`);
  }, []);

  const refreshSelectedCustomer = useCallback(async (customerId: number) => {
    try {
      const response = await axios.get<{ success: boolean; data: Customer }>(
        `${API_BASE}/api/customers/${customerId}`
      );
      if (response.data.success) {
        const customer = response.data.data;
        setSelectedCustomer(customer);
        setCustomerSearch(`${customer.code} — ${customer.name}`);
      }
    } catch {
      /* bakiye yenileme opsiyonel */
    }
  }, []);

  const openF2Modal = useCallback(() => {
    setF2Modal(true);
  }, []);

  const closeF2Modal = useCallback(() => {
    setF2Modal(false);
  }, []);

  const handleF2Select = useCallback(
    (customer: Customer) => {
      selectCustomer(customer);
      closeF2Modal();
    },
    [closeF2Modal, selectCustomer]
  );

  const handleModalKeyDown = useF2KeyboardNav({
    open: f2Modal,
    results: f2.results,
    focusedIndex: f2.focusedIndex,
    navigateFocus: f2.navigateFocus,
    onSelect: handleF2Select,
    onClose: closeF2Modal,
  });

  const selectedSafeData = safes.find((s) => s.id === selectedSafe);

  const printPaymentReceipt = useCallback((receipt: PaymentReceipt) => {
    setPrintReceipt(receipt);
    window.setTimeout(() => printDocument(), 80);
  }, []);

  const printPaymentRow = useCallback(
    (payment: PaymentRow) => {
      printPaymentReceipt({
          type: payment.type,
          amount: payment.amount,
          description: payment.description,
          createdAt: payment.createdAt,
          customerLabel: payment.customer
            ? `${payment.customer.code} — ${payment.customer.name}`
            : '—',
          safeName: payment.safe.name,
          balanceAfter: payment.customer?.balance ?? null,
        });
    },
    [printPaymentReceipt]
  );

  const handlePayment = async (type: 'GIRIS' | 'CIKIS') => {
    let customer = selectedCustomer;
    if (!customer) {
      customer = pickCustomerFromSearch(customerSearch, customerResults);
      if (customer) selectCustomer(customer);
    }

    const parsedAmount = Number(amount);
    const storedAmount = amountToStoredUsd(parsedAmount, amountCurrency, rates.usd);

    if (!customer || selectedSafe === '') {
      onNotify?.('error', 'Lütfen müşteri ve kasa seçin.');
      return;
    }

    if (!storedAmount || storedAmount <= 0) {
      onNotify?.('error', 'Geçerli bir tutar girin.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post(`${API_BASE}/api/customers/payment`, {
        customerId: customer.id,
        safeId: Number(selectedSafe),
        amount: storedAmount,
        type,
        description: description.trim() || undefined,
      });

      if (response.data.success) {
        const label = type === 'GIRIS' ? 'Tahsilat' : 'Ödeme';
        const amountLabel =
          amountCurrency === 'TRY'
            ? `${parsedAmount.toLocaleString('tr-TR')} ₺ (≈ ${formatUsd(storedAmount)})`
            : formatUsd(storedAmount);
        onNotify?.('success', `${label} kaydedildi: ${amountLabel}`);

        const receipt: PaymentReceipt = {
          type,
          amount: storedAmount,
          description:
            description.trim() ||
            (type === 'GIRIS'
              ? `${customer.code} cari tahsilat`
              : `${customer.code} cari ödeme`),
          createdAt: new Date().toISOString(),
          customerLabel: `${customer.code} — ${customer.name}`,
          safeName: selectedSafeData?.name ?? '—',
          balanceAfter:
            type === 'GIRIS'
              ? roundPrice(customer.balance - storedAmount)
              : roundPrice(customer.balance + storedAmount),
        };

        const finishPayment = async () => {
          setAmount('');
          setAmountCurrency('USD');
          setDescription('');
          setShouldPrint(false);
          await Promise.all([
            refreshSelectedCustomer(customer.id),
            loadSafes(),
            loadPayments(),
          ]);
          onDataChange?.();
        };

        if (shouldPrint) {
          printPaymentReceipt(receipt);
          window.setTimeout(() => {
            void finishPayment();
          }, 400);
        } else {
          await finishPayment();
        }
      }
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'İşlem kaydedilemedi.';
      onNotify?.('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditPayment = (payment: PaymentRow) => {
    if (!payment.customer) {
      onNotify?.('error', 'Bu kasa hareketi cari kaydı olmadığı için düzenlenemez.');
      return;
    }
    setEditingPayment(payment);
    setEditCustomer(payment.customer);
    setEditCustomerSearch(`${payment.customer.code} — ${payment.customer.name}`);
    setEditAmount(String(payment.amount));
    setEditAmountCurrency('USD');
    setEditDescription(payment.description);
    setEditType(payment.type);
    setEditSafeId(payment.safe.id);
  };

  const closeEditPayment = () => {
    setEditingPayment(null);
    setEditCustomer(null);
    setEditCustomerSearch('');
  };

  const selectEditCustomer = (customer: Customer) => {
    setEditCustomer({ id: customer.id, code: customer.code, name: customer.name });
    setEditCustomerSearch(`${customer.code} — ${customer.name}`);
  };

  const handleSaveEdit = async () => {
    if (!editingPayment) return;
    if (!editCustomer) {
      onNotify?.('error', 'Müşteri seçin.');
      return;
    }
    const parsedAmount = Number(editAmount);
    const storedAmount = amountToStoredUsd(parsedAmount, editAmountCurrency, rates.usd);
    if (!storedAmount || storedAmount <= 0) {
      onNotify?.('error', 'Geçerli bir tutar girin.');
      return;
    }
    if (editSafeId === '') {
      onNotify?.('error', 'Kasa seçin.');
      return;
    }

    setEditSubmitting(true);
    try {
      const response = await axios.put(
        `${API_BASE}/api/customers/payment/${editingPayment.id}`,
        {
          amount: storedAmount,
          type: editType,
          description: editDescription.trim() || undefined,
          safeId: Number(editSafeId),
          customerId: editCustomer.id,
        }
      );
      if (response.data.success) {
        onNotify?.('success', 'Ödeme kaydı güncellendi.');
        closeEditPayment();
        if (selectedCustomer) await refreshSelectedCustomer(selectedCustomer.id);
        await Promise.all([loadSafes(), loadPayments()]);
        onDataChange?.();
      }
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'Güncelleme başarısız.';
      onNotify?.('error', message);
    } finally {
      setEditSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Yükleniyor...
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border-slate-300 text-sm px-3 py-2.5 border focus:border-emerald-500 focus:ring-emerald-500';

  return (
    <div className="space-y-6 print:space-y-0">
      {printReceipt && (
        <>
          <div className="print-pdf-doc hidden">
            <h1>
              {printReceipt.type === 'GIRIS' ? 'Tahsilat Fişi' : 'Ödeme Fişi'}
            </h1>
            <p className="pdf-meta">{printReceipt.customerLabel}</p>
            <p className="pdf-meta">{formatDate(printReceipt.createdAt)}</p>
            <p className="pdf-meta">Kasa: {printReceipt.safeName}</p>
            {printReceipt.description && (
              <div className="pdf-notes">
                <strong>Açıklama:</strong> {printReceipt.description}
              </div>
            )}
            <div className="pdf-totals">
              <p className="pdf-grand">Tutar: {formatMoney(printReceipt.amount)}</p>
              {printReceipt.balanceAfter != null && (
                <p>Sonraki bakiye: {formatMoney(printReceipt.balanceAfter)}</p>
              )}
            </div>
          </div>
          <div className="receipt-slip hidden">
            <p className="receipt-slip-title">
              {printReceipt.type === 'GIRIS' ? 'TAHSİLAT FİŞİ' : 'ÖDEME FİŞİ'}
            </p>
            <p className="receipt-slip-customer">{printReceipt.customerLabel}</p>
            <p className="receipt-slip-meta">{formatDate(printReceipt.createdAt)}</p>
            <p className="receipt-slip-meta">Kasa: {printReceipt.safeName}</p>
            {printReceipt.description && (
              <p className="receipt-slip-notes">{printReceipt.description}</p>
            )}
            <div className="receipt-slip-divider" />
            <div className="receipt-item-row receipt-slip-summary receipt-slip-grand">
              <span className="receipt-item-name">Tutar</span>
              <span className="receipt-item-total">
                {formatMoney(printReceipt.amount)}
              </span>
            </div>
            {printReceipt.balanceAfter != null && (
              <div className="receipt-item-row receipt-slip-summary">
                <span className="receipt-item-name">Sonraki bakiye</span>
                <span className="receipt-item-total">
                  {formatMoney(printReceipt.balanceAfter)}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex items-center gap-3 print:hidden">
        <div className="p-2.5 rounded-xl bg-emerald-600 text-white">
          <Wallet className="w-5 h-5" />
        </div>
        <div>
          <h1 className="page-title">Müşteri Ödeme İşlemleri</h1>
          <p className="text-sm text-slate-500">
            Cari tahsilat ve ödeme · Kod/isim ile ara veya F2 ile hızlı müşteri bul
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 print:hidden">
        <section className="xl:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">Müşteri</label>
              <InlineCustomerSearchInput
                value={customerSearch}
                onChange={(text) => {
                  setCustomerSearch(text);
                  if (!text.trim()) setSelectedCustomer(null);
                }}
                onSelect={selectCustomer}
                onResultsChange={setCustomerResults}
                selectedCustomer={selectedCustomer}
                inputRef={customerSearchRef}
                inputClassName={inputClass}
                accentClass="emerald"
              />
              <button
                type="button"
                onClick={openF2Modal}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                <Search className="w-3.5 h-3.5" />
                Hızlı Müşteri Bul (F2)
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kasa</label>
              <select
                value={selectedSafe}
                onChange={(e) => setSelectedSafe(e.target.value ? Number(e.target.value) : '')}
                className={inputClass}
              >
                <option value="">Kasa seçin</option>
                {safes.map((safe) => (
                  <option key={safe.id} value={safe.id}>
                    {safe.name} ({formatMoney(safe.balance, safe.currency)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <PaymentAmountField
            label="Tutar"
            amount={amount}
            onAmountChange={setAmount}
            currency={amountCurrency}
            onCurrencyChange={setAmountCurrency}
            usdRate={rates.usd}
            inputClass={inputClass}
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Açıklama</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="İşlem açıklaması (opsiyonel)"
              className={`${inputClass} resize-none`}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={shouldPrint}
              onChange={(e) => setShouldPrint(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <Printer className="w-4 h-4" />
            Kayıttan sonra fiş yazdır
          </label>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handlePayment('GIRIS')}
              className="btn btn-secondary flex-1 min-w-[200px]"
            >
              <ArrowDownLeft className="w-5 h-5" />
              {submitting ? 'Kaydediliyor...' : 'Tahsilat Al (Giriş)'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handlePayment('CIKIS')}
              className="btn flex-1 min-w-[200px] bg-rose-600 text-white hover:bg-rose-500 disabled:bg-slate-400"
            >
              <ArrowUpRight className="w-5 h-5" />
              {submitting ? 'Kaydediliyor...' : 'Ödeme Yap (Çıkış)'}
            </button>
          </div>
        </section>

        <aside className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4 sticky top-6 h-fit">
          <h2 className="font-semibold text-slate-800">Anlık Durum</h2>

          {selectedCustomer && (
            <div className="rounded-xl border border-slate-100 p-4 space-y-2">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Seçili Müşteri</p>
              <p className="text-sm font-semibold text-slate-900">{selectedCustomer.name}</p>
              <p className="text-xs text-slate-400">{selectedCustomer.code}</p>
              <div className="pt-2 flex items-center justify-between">
                <span className="text-sm text-slate-600">Cari Bakiye</span>
                <span
                  className={`text-sm font-bold ${balanceStyles(selectedCustomer.balance).text}`}
                >
                  {formatMoney(selectedCustomer.balance)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Limit</span>
                <span className="text-sm text-slate-700">
                  {formatMoney(selectedCustomer.creditLimit)}
                </span>
              </div>
            </div>
          )}

          {selectedSafeData && (
            <div className="rounded-xl border border-slate-100 p-4 space-y-2">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Seçili Kasa</p>
              <p className="text-sm font-semibold text-slate-900">{selectedSafeData.name}</p>
              <div className="pt-2 flex items-center justify-between">
                <span className="text-sm text-slate-600">Kasa Bakiyesi</span>
                <span className="text-sm font-bold text-emerald-700">
                  {formatMoney(selectedSafeData.balance, selectedSafeData.currency)}
                </span>
              </div>
            </div>
          )}
        </aside>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm print:hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-800">
            {selectedCustomer ? `${selectedCustomer.code} — Son Ödemeler` : 'Son Cari Ödemeler'}
          </h2>
          <button
            type="button"
            onClick={() => void loadPayments()}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            Yenile
          </button>
        </div>
        {paymentsLoading ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Yükleniyor...</p>
        ) : payments.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Kayıt yok</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    Tarih
                  </th>
                  {!selectedCustomer && (
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      Müşteri
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    Tip
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    Kasa
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                    Tutar
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    Açıklama
                  </th>
                  <th className="w-24 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDate(payment.createdAt)}
                    </td>
                    {!selectedCustomer && (
                      <td className="px-4 py-3 text-sm text-slate-800">
                        {payment.customer ? (
                          <CustomerNameLink customerId={payment.customer.id}>
                            {payment.customer.name}
                          </CustomerNameLink>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          payment.type === 'GIRIS'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {payment.type === 'GIRIS' ? 'Tahsilat' : 'Ödeme'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{payment.safe.name}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                      {formatMoney(payment.amount)}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-sm text-slate-500">
                      {payment.description}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => printPaymentRow(payment)}
                          className="rounded p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                          title="Fiş yazdır"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditPayment(payment)}
                          className="rounded p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                          title="Düzenle"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Ödeme Düzenle</h3>
              <button
                type="button"
                onClick={closeEditPayment}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="relative">
                <label className="field-label">Müşteri</label>
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
                  inputClassName="field-input"
                  accentClass="emerald"
                />
              </div>
              <div>
                <label className="field-label">İşlem Tipi</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as 'GIRIS' | 'CIKIS')}
                  className="field-input"
                >
                  <option value="GIRIS">Tahsilat (Giriş)</option>
                  <option value="CIKIS">Ödeme (Çıkış)</option>
                </select>
              </div>
              <div>
                <label className="field-label">Kasa</label>
                <select
                  value={editSafeId}
                  onChange={(e) =>
                    setEditSafeId(e.target.value ? Number(e.target.value) : '')
                  }
                  className="field-input"
                >
                  {safes.map((safe) => (
                    <option key={safe.id} value={safe.id}>
                      {safe.name}
                    </option>
                  ))}
                </select>
              </div>
              <PaymentAmountField
                label="Tutar"
                amount={editAmount}
                onAmountChange={setEditAmount}
                currency={editAmountCurrency}
                onCurrencyChange={setEditAmountCurrency}
                usdRate={rates.usd}
                inputClass="field-input"
              />
              <div>
                <label className="field-label">Açıklama</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="field-input resize-none"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={editSubmitting}
                  className="btn btn-secondary flex-1"
                >
                  {editSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
                <button
                  type="button"
                  onClick={closeEditPayment}
                  className="btn btn-outline flex-1"
                >
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ProductSearchPopover
        open={f2Modal}
        onClose={closeF2Modal}
        title="Hızlı Müşteri Arama"
        hint="↑↓ · PgUp/Dn · Enter · Esc"
        headerClassName="bg-emerald-600"
        searchQuery={f2.searchQuery}
        onSearchChange={f2.setSearchQuery}
        searchInputRef={f2.searchInputRef}
        listRef={f2.listRef}
        onListScroll={f2.handleListScroll}
        onKeyDown={handleModalKeyDown}
        searchLoading={f2.loading}
        loadingMore={f2.loadingMore}
        footer={
          f2.totalCount > 0
            ? `${f2.results.length} / ${f2.totalCount} müşteri`
            : undefined
        }
        emptyHint="Müşteri kodu veya adı yazın..."
        showEmpty={!f2.loading && f2.results.length === 0}
      >
        <F2CustomerList
          customers={f2.results}
          focusedIndex={f2.focusedIndex}
          onFocusIndex={f2.setFocusedIndex}
          onSelect={handleF2Select}
        />
      </ProductSearchPopover>
    </div>
  );
}
