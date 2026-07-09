import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Pencil,
  Printer,
} from 'lucide-react';
import { printDocument } from '../lib/printMode';
import CustomerNameLink from '../components/CustomerNameLink';
import CustomerSearchPanel from '../components/CustomerSearchPanel';
import InvoiceDetailModal from '../components/InvoiceDetailModal';
import InvoiceInlineEditor, {
  isEditableInvoiceType,
  type EditableInvoiceRef,
} from '../components/InvoiceInlineEditor';
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
  paymentMethod?: string | null;
  paymentType?: string | null;
  processedBy?: string | null;
  orderNotes?: string | null;
  amount?: number;
  safeName?: string | null;
  items?: StatementItem[];
};

function lineKey(line: StatementLine) {
  return `${line.kind}-${line.id}`;
}

export default function CustomerStatement({
  initialCustomerId,
  onNotify,
}: {
  initialCustomerId?: number;
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

  const notify = useCallback(
    (type: 'success' | 'error', message: string) => onNotify?.(type, message),
    [onNotify]
  );

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
          setLines(res.data.data.lines);
        }
      })
      .finally(() => setLoading(false));
  }, [customerId]);

  const selectCustomer = useCallback((picked: Customer) => {
    setCustomerId(picked.id);
    setCustomer(picked);
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
      {/* PDF / A4 */}
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

      {/* Termal fiş — yalnızca fiş yazıcısı */}
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
              Fiş görüntüle ve düzenle · seçili fişleri yazdır
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            disabled={customerId === ''}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            CSV İndir
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 print:hidden">
        <div className="space-y-3 lg:col-span-4">
          <CustomerSearchPanel
            selectedCustomerId={customerId}
            onSelect={selectCustomer}
            accentClass="blue"
          />
          {customer && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">
                {customer.code} — {customer.name}
              </p>
              <p className="mt-1">
                Güncel bakiye:{' '}
                <strong className={balanceStyles(customer.balance).text}>
                  {formatMoney(customer.balance)}
                </strong>
              </p>
              <CustomerNameLink customerId={customer.id} className="mt-2 inline-block text-sm">
                Müşteri kartını aç
              </CustomerNameLink>
            </div>
          )}
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-8">
          {loading ? (
            <p className="py-12 text-center text-slate-400">Yükleniyor...</p>
          ) : customerId === '' ? (
            <p className="py-12 text-center text-sm text-slate-400">
              Ekstre görmek için soldan bir müşteri seçin.
            </p>
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
                      Tarih
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      Açıklama
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                      Borç
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                      Alacak
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

                    return (
                      <Fragment key={key}>
                        <tr
                          className={`hover:bg-slate-50/60 ${selected ? 'bg-indigo-50/40' : ''}`}
                        >
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
                          <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600">
                            {formatDate(line.date)}
                          </td>
                          <td className="px-3 py-3 text-sm">
                            {isInvoice ? (
                              <div className="text-left">
                                <button
                                  type="button"
                                  onClick={() => openInvoiceView(line.id)}
                                  className="font-medium text-indigo-700 hover:underline"
                                >
                                  {line.invoiceNo}
                                </button>
                                <span className="font-normal text-slate-500">
                                  {' '}
                                  ({invoiceTypeLabel(line.invoiceType ?? '')})
                                </span>
                                {itemCount > 0 && (
                                  <span className="ml-1 text-caption text-slate-400">
                                    · {itemCount} kalem
                                  </span>
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
                          <td className="px-3 py-3 text-right text-sm text-red-600 tabular-nums">
                            {line.debit > 0 ? formatMoney(line.debit) : '—'}
                          </td>
                          <td className="px-3 py-3 text-right text-sm text-emerald-700 tabular-nums">
                            {line.credit > 0 ? formatMoney(line.credit) : '—'}
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
                            <td colSpan={7} className="px-4 py-3">
                              {(line.items ?? []).length === 0 ? (
                                <p className="text-sm text-slate-400">Kalem yok.</p>
                              ) : (
                                <>
                                  {line.orderNotes?.trim() && (
                                    <p className="mb-2 text-sm text-slate-600">
                                      <span className="font-semibold text-slate-700">Açıklama:</span>{' '}
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
                                  <tbody className="divide-y divide-slate-200">
                                    {(line.items ?? []).map((item) => (
                                      <tr key={item.id}>
                                        <td className="py-1.5 pr-3 font-mono text-xs text-slate-600">
                                          {item.productSku}
                                        </td>
                                        <td className="py-1.5 pr-3 text-slate-800">
                                          {item.productName}
                                        </td>
                                        <td className="py-1.5 pr-3 text-right tabular-nums">
                                          {item.quantity}
                                        </td>
                                        <td className="py-1.5 pr-3 text-right tabular-nums">
                                          {formatMoney(item.unitPrice)}
                                          {item.discountPercent > 0 && (
                                            <span className="ml-1 text-caption text-amber-600">
                                              %{item.discountPercent}
                                            </span>
                                          )}
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
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                        Hareket yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <InvoiceDetailModal
        invoiceId={viewingInvoiceId}
        onClose={() => setViewingInvoiceId(null)}
        onEdit={handleInvoiceEditFromModal}
      />
    </div>
  );
}
