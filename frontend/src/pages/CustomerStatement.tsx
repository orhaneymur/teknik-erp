import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Pencil,
  Printer,
  Save,
  Search,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { printDocument } from '../lib/printMode';
import InlineCustomerSearchInput from '../components/InlineCustomerSearchInput';
import InvoiceDetailModal from '../components/InvoiceDetailModal';
import InvoiceInlineEditor, {
  isEditableInvoiceType,
  type EditableInvoiceRef,
} from '../components/InvoiceInlineEditor';
import { useAppNavigationOptional } from '../context/AppNavigationContext';
import {
  API_BASE,
  balanceStyles,
  formatDate,
  formatMoney,
  invoiceTypeLabel,
  type Customer,
} from '../lib/api';

type StatementItem = {
  id: number;
  productSku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
};

type StatementLine = {
  id: number;
  date: string;
  kind: 'invoice' | 'payment';
  description: string;
  debit: number;
  credit: number;
  invoiceNo?: string;
  invoiceType?: string;
  isPreOrder?: boolean;
  paymentMethod?: string | null;
  paymentType?: string | null;
  processedBy?: string | null;
  orderNotes?: string | null;
  amount?: number;
  safeName?: string | null;
  /** Ödeme satırları için — ekstreden düzenleme ve fiş no gösterimi */
  safeId?: number;
  receiptNo?: string | null;
  items?: StatementItem[];
};

type PaymentMethodOption = 'Nakit' | 'Kredi Kartı' | 'EFT/Havale';

const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  'Nakit',
  'Kredi Kartı',
  'EFT/Havale',
];

/** Fiş no: yeni seri (ÖDM-YYYY-0001) yoksa eski kayıtlar için KH-<id> */
function paymentReceiptLabel(line: StatementLine) {
  return line.receiptNo?.trim() || `KH-${line.id}`;
}

type StatementSafe = {
  id: number;
  name: string;
  currency: string;
  balance: number;
};

function lineKey(line: StatementLine) {
  return `${line.kind}-${line.id}`;
}

/** Fatura içindeki toplam ürün adedi */
function invoiceQuantity(line: StatementLine) {
  return (line.items ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

/** İlk oluşturma tarihine göre (yeniden eskiye) — düzenleme sırayı değiştirmez */
function sortLinesByCreatedDesc(items: StatementLine[]) {
  return [...items].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export default function CustomerStatement({
  initialCustomerId,
  f2Trigger = 0,
  onNotify,
}: {
  initialCustomerId?: number;
  f2Trigger?: number;
  onNotify?: (type: 'success' | 'error', message: string) => void;
} = {}) {
  const [customerId, setCustomerId] = useState<number | ''>(
    initialCustomerId && initialCustomerId > 0 ? initialCustomerId : ''
  );
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [printLines, setPrintLines] = useState<StatementLine[]>([]);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<number | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<EditableInvoiceRef | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  /** Ekstre üzerinden ödeme düzenleme */
  const [safes, setSafes] = useState<StatementSafe[]>([]);
  const [editingPayment, setEditingPayment] = useState<StatementLine | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payType, setPayType] = useState<'GIRIS' | 'CIKIS'>('GIRIS');
  const [paySafeId, setPaySafeId] = useState<number | ''>('');
  const [payMethod, setPayMethod] = useState<PaymentMethodOption>('Nakit');
  const [payDescription, setPayDescription] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const navigation = useAppNavigationOptional();

  const notify = useCallback(
    (type: 'success' | 'error', message: string) => onNotify?.(type, message),
    [onNotify]
  );

  useEffect(() => {
    if (f2Trigger > 0 && !editingInvoice) {
      searchInputRef.current?.focus();
    }
  }, [f2Trigger, editingInvoice]);

  const loadStatement = useCallback(() => {
    if (customerId === '') {
      setCustomer(null);
      setLines([]);
      return;
    }

    setLoading(true);
    axios
      .get<{
        success: boolean;
        data: { customer: Customer; lines: StatementLine[] };
      }>(`${API_BASE}/api/reports/customer-statement`, {
        params: { customerId },
      })
      .then((res) => {
        if (res.data.success) {
          setCustomer(res.data.data.customer);
          setLines(sortLinesByCreatedDesc(res.data.data.lines));
        }
      })
      .finally(() => setLoading(false));
  }, [customerId]);

  const selectCustomer = useCallback((picked: Customer) => {
    setCustomerId(picked.id);
    setCustomer(picked);
    setCustomerSearch(`${picked.code} — ${picked.name}`);
    setExpandedKeys(new Set());
    setSelectedKeys(new Set());
    setPrintLines([]);
  }, []);

  const clearCustomer = useCallback(() => {
    setCustomerId('');
    setCustomer(null);
    setCustomerSearch('');
    setLines([]);
    setExpandedKeys(new Set());
    setSelectedKeys(new Set());
    setPrintLines([]);
  }, []);

  useEffect(() => {
    if (!initialCustomerId || initialCustomerId <= 0) return;

    let cancelled = false;
    const loadInitial = async () => {
      try {
        const response = await axios.get<{ success: boolean; data: Customer }>(
          `${API_BASE}/api/customers/${initialCustomerId}`
        );
        if (!cancelled && response.data.success) {
          selectCustomer(response.data.data);
        }
      } catch {
        /* müşteri yüklenemedi */
      }
    };

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [initialCustomerId, selectCustomer]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  /** Ödeme düzenleme formu için kasa listesi */
  useEffect(() => {
    let cancelled = false;
    void axios
      .get<{ success: boolean; data: { safes: StatementSafe[] } }>(
        `${API_BASE}/api/sales/init`
      )
      .then((response) => {
        if (!cancelled && response.data.success) {
          setSafes(response.data.data.safes ?? []);
        }
      })
      .catch(() => {
        /* kasa listesi opsiyonel */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openPaymentEdit = useCallback((line: StatementLine) => {
    setEditingPayment(line);
    setPayAmount(String(line.amount ?? line.debit ?? line.credit ?? ''));
    setPayType(line.paymentType === 'CIKIS' ? 'CIKIS' : 'GIRIS');
    setPaySafeId(line.safeId ?? '');
    setPayMethod(
      PAYMENT_METHOD_OPTIONS.includes(line.paymentMethod as PaymentMethodOption)
        ? (line.paymentMethod as PaymentMethodOption)
        : 'Nakit'
    );
    setPayDescription(line.description ?? '');
  }, []);

  const closePaymentEdit = useCallback(() => {
    setEditingPayment(null);
    setPaySubmitting(false);
  }, []);

  const savePaymentEdit = useCallback(async () => {
    if (!editingPayment) return;

    const parsedAmount = Number(payAmount.replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      notify('error', 'Geçerli bir tutar girin.');
      return;
    }
    if (paySafeId === '') {
      notify('error', 'Kasa seçin.');
      return;
    }

    setPaySubmitting(true);
    try {
      const response = await axios.put(
        `${API_BASE}/api/customers/payment/${editingPayment.id}`,
        {
          amount: parsedAmount,
          type: payType,
          safeId: Number(paySafeId),
          method: payMethod,
          description: payDescription.trim() || undefined,
        }
      );
      if (response.data.success) {
        notify('success', `${paymentReceiptLabel(editingPayment)} güncellendi.`);
        closePaymentEdit();
        loadStatement();
      }
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'Ödeme güncellenemedi.';
      notify('error', message);
    } finally {
      setPaySubmitting(false);
    }
  }, [
    editingPayment,
    payAmount,
    payType,
    paySafeId,
    payMethod,
    payDescription,
    notify,
    closePaymentEdit,
    loadStatement,
  ]);

  const openInvoiceView = useCallback((invoiceId: number) => {
    setViewingInvoiceId(invoiceId);
  }, []);

  const openInvoiceEdit = useCallback(
    (line: StatementLine) => {
      const type = line.invoiceType ?? '';
      if (!isEditableInvoiceType(type)) {
        notify('error', 'Bu fiş türü düzenlenemez.');
        return;
      }
      setViewingInvoiceId(null);
      setEditingInvoice({ id: line.id, type });
    },
    [notify]
  );

  const closeInvoiceEdit = useCallback(() => {
    setEditingInvoice(null);
  }, []);

  const handleInvoiceSaved = useCallback(() => {
    closeInvoiceEdit();
    loadStatement();
  }, [closeInvoiceEdit, loadStatement]);

  const handleInvoiceEditFromModal = useCallback(
    (invoice: EditableInvoiceRef) => {
      setViewingInvoiceId(null);
      setEditingInvoice(invoice);
    },
    []
  );

  const selectedLines = useMemo(
    () => lines.filter((line) => selectedKeys.has(lineKey(line))),
    [lines, selectedKeys]
  );

  /** Satır bazında yürüyen bakiye (eskiden yeniye borç - alacak birikimi) */
  const balanceByKey = useMemo(() => {
    const ascending = [...lines].reverse();
    const map = new Map<string, number>();
    let running = 0;
    for (const line of ascending) {
      running += (line.debit ?? 0) - (line.credit ?? 0);
      map.set(lineKey(line), running);
    }
    return map;
  }, [lines]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const printReceipts = useCallback((toPrint: StatementLine[]) => {
    if (toPrint.length === 0) return;
    setPrintLines(toPrint);
    window.setTimeout(() => printDocument(), 80);
  }, []);

  const downloadCsv = () => {
    if (customerId === '') return;
    fetch(`${API_BASE}/api/reports/customer-statement?customerId=${customerId}`, {
      headers: { Accept: 'text/csv' },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ekstre-${customer?.code ?? customerId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const printTotal = useMemo(
    () =>
      printLines.reduce((sum, line) => {
        if (line.kind === 'invoice') {
          return sum + (line.debit > 0 ? line.debit : line.credit);
        }
        return sum + (line.amount ?? 0);
      }, 0),
    [printLines]
  );

  if (editingInvoice) {
    return (
      <InvoiceInlineEditor
        invoice={editingInvoice}
        onNotify={notify}
        onCancelEdit={closeInvoiceEdit}
        onSaved={handleInvoiceSaved}
      />
    );
  }

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="print-pdf-doc hidden">
        <h1>{printLines.length > 1 ? 'Toplu Ekstre Fişi' : 'Ekstre Fişi'}</h1>
        {customer && (
          <p className="pdf-meta">
            {customer.code} — {customer.name}
          </p>
        )}
        <p className="pdf-meta">
          {printLines.length} hareket · {new Date().toLocaleDateString('tr-TR')}
        </p>
        {printLines.map((line) => (
          <div key={lineKey(line)} style={{ marginTop: 14 }}>
            {line.kind === 'invoice' ? (
              <>
                <p className="pdf-meta" style={{ textAlign: 'left', fontWeight: 700 }}>
                  {line.invoiceNo} · {invoiceTypeLabel(line.invoiceType ?? '')}
                </p>
                <p className="pdf-meta" style={{ textAlign: 'left' }}>
                  {formatDate(line.date)}
                  {line.paymentMethod ? ` · ${line.paymentMethod}` : ''}
                </p>
                {line.orderNotes?.trim() && (
                  <div className="pdf-notes" style={{ textAlign: 'left' }}>
                    <strong>Açıklama:</strong> {line.orderNotes.trim()}
                  </div>
                )}
                <table>
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th className="pdf-num">Adet</th>
                      <th className="pdf-num">Birim</th>
                      <th className="pdf-num">Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(line.items ?? []).map((item) => (
                      <tr key={item.id}>
                        <td className="pdf-name">{item.productName}</td>
                        <td className="pdf-num">{item.quantity}</td>
                        <td className="pdf-num">{formatMoney(item.unitPrice)}</td>
                        <td className="pdf-num">{formatMoney(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="pdf-totals">
                  <p>
                    Fiş toplam:{' '}
                    {formatMoney(line.debit > 0 ? line.debit : line.credit)}
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="pdf-meta" style={{ textAlign: 'left', fontWeight: 700 }}>
                  {line.paymentType === 'GIRIS' ? 'Tahsilat' : 'Ödeme'}
                </p>
                <p className="pdf-meta" style={{ textAlign: 'left' }}>
                  {formatDate(line.date)}
                  {line.safeName ? ` · ${line.safeName}` : ''}
                </p>
                {line.description && (
                  <div className="pdf-notes">{line.description}</div>
                )}
                <div className="pdf-totals">
                  <p className="pdf-grand">Tutar: {formatMoney(line.amount ?? 0)}</p>
                </div>
              </>
            )}
          </div>
        ))}
        {printLines.length > 1 && (
          <div className="pdf-totals">
            <p className="pdf-grand">Genel toplam: {formatMoney(printTotal)}</p>
          </div>
        )}
      </div>

      <div className="receipt-slip hidden">
        <p className="receipt-slip-title">
          {printLines.length > 1 ? 'Toplu Fiş' : 'Fiş'}
        </p>
        {customer && (
          <p className="receipt-slip-customer">
            {customer.code} — {customer.name}
          </p>
        )}
        <p className="receipt-slip-meta">
          {printLines.length} hareket · {new Date().toLocaleDateString('tr-TR')}
        </p>

        {printLines.map((line) => (
          <div key={lineKey(line)}>
            <div className="receipt-slip-divider" />
            {line.kind === 'invoice' ? (
              <>
                <p className="receipt-slip-meta" style={{ textAlign: 'left', fontWeight: 700 }}>
                  {line.invoiceNo} · {invoiceTypeLabel(line.invoiceType ?? '')}
                </p>
                <p className="receipt-slip-meta" style={{ textAlign: 'left' }}>
                  {formatDate(line.date)}
                  {line.paymentMethod ? ` · ${line.paymentMethod}` : ''}
                </p>
                {line.orderNotes?.trim() && (
                  <p className="receipt-slip-notes">{line.orderNotes.trim()}</p>
                )}
                <div className="receipt-item-row receipt-item-head">
                  <span className="receipt-item-name">Ürün</span>
                  <span className="receipt-item-qty">Ad</span>
                  <span className="receipt-item-price">Fiyat</span>
                  <span className="receipt-item-total">Top.</span>
                </div>
                {(line.items ?? []).map((item) => (
                  <div key={item.id} className="receipt-item-row">
                    <span className="receipt-item-name" title={item.productName}>
                      {item.productName}
                    </span>
                    <span className="receipt-item-qty">{item.quantity}</span>
                    <span className="receipt-item-price">
                      {formatMoney(item.unitPrice)}
                    </span>
                    <span className="receipt-item-total">
                      {formatMoney(item.lineTotal)}
                    </span>
                  </div>
                ))}
                <div className="receipt-item-row receipt-slip-summary">
                  <span className="receipt-item-name">Fiş toplam</span>
                  <span className="receipt-item-total">
                    {formatMoney(line.debit > 0 ? line.debit : line.credit)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <p className="receipt-slip-meta" style={{ textAlign: 'left', fontWeight: 700 }}>
                  {line.paymentType === 'GIRIS' ? 'TAHSİLAT' : 'ÖDEME'}
                </p>
                <p className="receipt-slip-meta" style={{ textAlign: 'left' }}>
                  {formatDate(line.date)}
                  {line.safeName ? ` · ${line.safeName}` : ''}
                </p>
                {line.description && (
                  <p className="receipt-slip-notes">{line.description}</p>
                )}
                <div className="receipt-item-row receipt-slip-summary receipt-slip-grand">
                  <span className="receipt-item-name">Tutar</span>
                  <span className="receipt-item-total">
                    {formatMoney(line.amount ?? 0)}
                  </span>
                </div>
              </>
            )}
          </div>
        ))}

        {printLines.length > 1 && (
          <>
            <div className="receipt-slip-divider" />
            <div className="receipt-item-row receipt-slip-summary receipt-slip-grand">
              <span className="receipt-item-name">GENEL TOPLAM</span>
              <span className="receipt-item-total">{formatMoney(printTotal)}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600 p-2.5 text-white">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="page-title">Müşteri Ekstre</h1>
            <p className="text-sm text-slate-500">
              Müşteri arayın · hareketleri görüntüleyin ve düzenleyin
            </p>
          </div>
        </div>
        {customerId !== '' && (
          <div className="flex flex-wrap items-center gap-2">
            {navigation && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    navigation.navigateTo('customer-payments', {
                      customerId: Number(customerId),
                    })
                  }
                  className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  <Wallet className="h-4 w-4" />
                  Tahsilat
                </button>
                <button
                  type="button"
                  onClick={() => navigation.navigateToCustomer(Number(customerId))}
                  className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100"
                >
                  <User className="h-4 w-4" />
                  Kart
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => printReceipts(selectedLines)}
              disabled={selectedLines.length === 0}
              className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Fiş Yazdır
              {selectedLines.length > 0 ? ` (${selectedLines.length})` : ''}
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          </div>
        )}
      </div>

      <div className="print:hidden space-y-2">
        <label className="text-sm font-medium text-slate-700">Müşteri arayınız</label>
        <InlineCustomerSearchInput
          value={customerSearch}
          onChange={(text) => {
            setCustomerSearch(text);
            if (!text.trim()) clearCustomer();
          }}
          onSelect={selectCustomer}
          selectedCustomer={customer}
          inputRef={searchInputRef}
          accentClass="blue"
          placeholder="Kod veya ünvan yazın · yazdıkça liste gelir"
          inputClassName="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
          showSelectedHint={false}
        />
        {!customer && (
          <p className="text-caption text-slate-400">
            F2 ile arama kutusuna odaklanın · müşteri seçilince ekstre aşağıda açılır
          </p>
        )}
      </div>

      {customer && (
        <div className="print:hidden flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm">
          <span className="font-semibold text-slate-900">
            {customer.code} — {customer.name}
          </span>
          <span className="text-slate-500">
            Bakiye:{' '}
            <strong className={balanceStyles(customer.balance).text}>
              {formatMoney(customer.balance)}
            </strong>
          </span>
          <span className="text-slate-500">
            Limit: {formatMoney(customer.creditLimit)}
          </span>
          <button
            type="button"
            onClick={clearCustomer}
            className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Müşteri değiştir
          </button>
        </div>
      )}

      {customerId === '' ? (
        <div className="print:hidden rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
          <Search className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            Yukarıdaki kutuya yazarak müşteri seçin
          </p>
        </div>
      ) : (
        <section className="print:hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="py-12 text-center text-slate-400">Yükleniyor...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-10 px-2 py-3">
                      <span className="sr-only">Seç</span>
                    </th>
                    <th className="w-8 px-2 py-3" />
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      Sipariş No
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      Belge No
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      Tarih
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      Açıklama
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                      Adet
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                      Borç
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                      Alacak
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                      Bakiye
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                      İşlem
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line) => {
                    const key = lineKey(line);
                    const expanded = expandedKeys.has(key);
                    const selected = selectedKeys.has(key);
                    const isInvoice = line.kind === 'invoice';
                    const itemCount = line.items?.length ?? 0;
                    const isPending = isInvoice && Boolean(line.isPreOrder);
                    const rowClass = selected
                      ? 'bg-indigo-50/40'
                      : isPending
                        ? 'bg-red-50 hover:bg-red-100'
                        : 'hover:bg-slate-50/60';

                    return (
                      <Fragment key={key}>
                        <tr className={rowClass}>
                          <td className="px-2 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSelect(key)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              aria-label="Yazdırmak için seç"
                            />
                          </td>
                          <td className="px-2 py-3 text-slate-400">
                            {isInvoice ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(key)}
                                className="rounded p-0.5 hover:bg-slate-100"
                                aria-label={expanded ? 'Kapat' : 'İçeriği göster'}
                              >
                                {expanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            ) : (
                              <span className="inline-block w-4" />
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-sm">
                            {isInvoice && isPending ? (
                              <button
                                type="button"
                                onClick={() => openInvoiceView(line.id)}
                                className="font-medium text-red-700 hover:underline"
                              >
                                {line.invoiceNo}
                              </button>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-sm">
                            {isInvoice && !isPending ? (
                              <button
                                type="button"
                                onClick={() => openInvoiceView(line.id)}
                                className="font-medium text-indigo-700 hover:underline"
                              >
                                {line.invoiceNo}
                              </button>
                            ) : !isInvoice ? (
                              /* Ödeme fiş no — faturalardan bağımsız seri */
                              <span className="font-mono text-xs font-medium text-emerald-700">
                                {paymentReceiptLabel(line)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600">
                            {formatDate(line.date)}
                          </td>
                          <td className="px-3 py-3 text-sm">
                            {isInvoice ? (
                              <div className="text-left">
                                <span className="font-medium text-slate-700">
                                  {invoiceTypeLabel(line.invoiceType ?? '')}
                                </span>
                                {isPending && (
                                  <span className="ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-caption font-semibold bg-red-600 text-white">
                                    Ön Sipariş · Teslim Bekliyor
                                  </span>
                                )}
                                {itemCount > 0 && (
                                  <span className="ml-1 text-caption text-slate-400">
                                    · {itemCount} kalem
                                  </span>
                                )}
                                {line.orderNotes?.trim() && (
                                  <p className="text-caption text-slate-500">
                                    {line.orderNotes.trim()}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div>
                                <p className="font-medium text-slate-800">
                                  {line.paymentType === 'GIRIS' ? 'Tahsilat' : 'Ödeme'}
                                  {line.safeName ? ` · ${line.safeName}` : ''}
                                </p>
                                <p className="text-caption text-slate-500">
                                  {line.description}
                                </p>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right text-sm text-slate-700 tabular-nums">
                            {isInvoice && invoiceQuantity(line) > 0
                              ? invoiceQuantity(line)
                              : '—'}
                          </td>
                          <td className="px-3 py-3 text-right text-sm text-red-600 tabular-nums">
                            {line.debit > 0 ? formatMoney(line.debit) : '—'}
                          </td>
                          <td className="px-3 py-3 text-right text-sm text-emerald-700 tabular-nums">
                            {line.credit > 0 ? formatMoney(line.credit) : '—'}
                          </td>
                          <td
                            className={`px-3 py-3 text-right text-sm font-semibold tabular-nums ${balanceStyles(balanceByKey.get(key) ?? 0).text}`}
                          >
                            {formatMoney(balanceByKey.get(key) ?? 0)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1">
                              {isInvoice && isEditableInvoiceType(line.invoiceType) && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openInvoiceView(line.id)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                    title="Fişi görüntüle"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    Gör
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openInvoiceEdit(line)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
                                    title="Fişi düzenle"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Düzenle
                                  </button>
                                </>
                              )}
                              {!isInvoice && (
                                <button
                                  type="button"
                                  onClick={() => openPaymentEdit(line)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                                  title="Ödemeyi düzenle"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Düzenle
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => printReceipts([line])}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
                                title="Fiş yazdır"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Yazdır
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isInvoice && expanded && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={11} className="px-4 py-3">
                              {(line.items ?? []).length === 0 ? (
                                <p className="text-sm text-slate-400">Kalem yok.</p>
                              ) : (
                                <>
                                  {line.orderNotes?.trim() && (
                                    <p className="mb-2 text-sm text-slate-600">
                                      <span className="font-semibold text-slate-700">
                                        Açıklama:
                                      </span>{' '}
                                      {line.orderNotes.trim()}
                                    </p>
                                  )}
                                  <table className="min-w-full text-sm">
                                    <thead>
                                      <tr className="text-xs uppercase text-slate-500">
                                        <th className="py-1 pr-3 text-left font-semibold">
                                          Stok No
                                        </th>
                                        <th className="py-1 pr-3 text-left font-semibold">
                                          Ürün
                                        </th>
                                        <th className="py-1 pr-3 text-right font-semibold">
                                          Adet
                                        </th>
                                        <th className="py-1 pr-3 text-right font-semibold">
                                          Birim
                                        </th>
                                        <th className="py-1 text-right font-semibold">
                                          Toplam
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(line.items ?? []).map((item) => (
                                        <tr key={item.id} className="border-t border-slate-100">
                                          <td className="py-1.5 pr-3 font-mono text-xs text-slate-500">
                                            {item.productSku}
                                          </td>
                                          <td className="py-1.5 pr-3">{item.productName}</td>
                                          <td className="py-1.5 pr-3 text-right tabular-nums">
                                            {item.quantity}
                                          </td>
                                          <td className="py-1.5 pr-3 text-right tabular-nums">
                                            {formatMoney(item.unitPrice)}
                                          </td>
                                          <td className="py-1.5 text-right font-medium tabular-nums">
                                            {formatMoney(item.lineTotal)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {lines.length === 0 && (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-4 py-10 text-center text-sm text-slate-400"
                      >
                        Hareket yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <InvoiceDetailModal
        invoiceId={viewingInvoiceId}
        onClose={() => setViewingInvoiceId(null)}
        onEdit={handleInvoiceEditFromModal}
      />

      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Ödeme Düzenle</h3>
                <p className="mt-0.5 font-mono text-sm text-emerald-700">
                  Fiş: {paymentReceiptLabel(editingPayment)}
                </p>
                <p className="text-caption text-slate-500">
                  {customer ? `${customer.code} — ${customer.name}` : ''}
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
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  İşlem Tipi
                </label>
                <select
                  value={payType}
                  onChange={(e) => setPayType(e.target.value as 'GIRIS' | 'CIKIS')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="GIRIS">Tahsilat (Giriş)</option>
                  <option value="CIKIS">Ödeme (Çıkış)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Ödeme Yöntemi
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethodOption)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {PAYMENT_METHOD_OPTIONS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Kasa / Banka
                </label>
                <select
                  value={paySafeId}
                  onChange={(e) =>
                    setPaySafeId(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Kasa seçin</option>
                  {safes.map((safe) => (
                    <option key={safe.id} value={safe.id}>
                      {safe.name} ({formatMoney(safe.balance, safe.currency)})
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
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Açıklama
                </label>
                <textarea
                  value={payDescription}
                  onChange={(e) => setPayDescription(e.target.value)}
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
                onClick={() => void savePaymentEdit()}
                disabled={paySubmitting}
                className="btn btn-secondary flex flex-1 items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                {paySubmitting ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
