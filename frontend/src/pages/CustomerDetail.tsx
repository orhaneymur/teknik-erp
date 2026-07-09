import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  ArrowLeft,
  Eye,
  FileText,
  Pencil,
  Save,
  User,
  Wallet,
  X,
} from 'lucide-react';
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
  invoiceAmountUsd,
  invoiceTypeLabel,
  invoiceTypeStyles,
  type Customer,
} from '../lib/api';
import type { NavigateFn } from '../lib/navigation';
import { useAppNavigationOptional } from '../context/AppNavigationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type CustomerRecord = Customer & {
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  contactPerson?: string | null;
  taxOffice?: string | null;
  taxNumber?: string | null;
};

type InvoiceRow = {
  id: number;
  invoiceNo: string;
  type: string;
  isPreOrder?: boolean;
  totalAmountTl: number;
  totalAmountUsd?: number;
  exchangeRate?: number;
  paymentMethod: string;
  createdAt: string;
};

type PaymentRow = {
  id: number;
  type: 'GIRIS' | 'CIKIS';
  amount: number;
  description: string;
  createdAt: string;
  safe: { name: string; currency: string };
};

type StatementLine = {
  date: string;
  kind: 'invoice' | 'payment';
  description: string;
  debit: number;
  credit: number;
};

type CustomerDetailProps = {
  customerId: number;
  initialEditInvoiceId?: number;
  onNavigate: NavigateFn;
  onNotify?: (type: 'success' | 'error', message: string) => void;
  onDataChange?: () => void;
};

type EditForm = {
  code: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  district: string;
  address: string;
  contactPerson: string;
  taxOffice: string;
  taxNumber: string;
  creditLimit: string;
};

function toEditForm(customer: CustomerRecord): EditForm {
  return {
    code: customer.code,
    name: customer.name,
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    city: customer.city ?? '',
    district: customer.district ?? '',
    address: customer.address ?? '',
    contactPerson: customer.contactPerson ?? '',
    taxOffice: customer.taxOffice ?? '',
    taxNumber: customer.taxNumber ?? '',
    creditLimit: String(customer.creditLimit ?? 0),
  };
}

export default function CustomerDetail({
  customerId,
  initialEditInvoiceId,
  onNavigate,
  onNotify,
  onDataChange,
}: CustomerDetailProps) {
  const navigation = useAppNavigationOptional();
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [statementLines, setStatementLines] = useState<StatementLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<EditableInvoiceRef | null>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<number | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  useDocumentTitle(customer?.name);

  const notify = useCallback(
    (type: 'success' | 'error', message: string) => onNotify?.(type, message),
    [onNotify]
  );

  useEffect(() => {
    if (!initialEditInvoiceId) {
      setEditingInvoice(null);
      return;
    }

    let cancelled = false;
    void axios
      .get<{ success: boolean; data: { id: number; type: string } }>(
        `${API_BASE}/api/sales/invoices/${initialEditInvoiceId}`
      )
      .then((res) => {
        if (cancelled || !res.data.success) return;
        const { id, type } = res.data.data;
        if (isEditableInvoiceType(type)) {
          setEditingInvoice({ id, type });
        }
      })
      .catch(() => {
        if (!cancelled) setEditingInvoice(null);
      });

    return () => {
      cancelled = true;
    };
  }, [initialEditInvoiceId]);

  const openInvoiceEditor = useCallback(
    (inv: InvoiceRow) => {
      if (!isEditableInvoiceType(inv.type)) {
        notify('error', 'Bu fatura türü düzenlenemez.');
        return;
      }
      setViewingInvoiceId(null);
      setEditingInvoice({ id: inv.id, type: inv.type });
      navigation?.navigateTo('customer-detail', {
        customerId,
        editInvoiceId: inv.id,
      });
    },
    [customerId, navigation, notify]
  );

  const openInvoiceView = useCallback((invoiceId: number) => {
    setViewingInvoiceId(invoiceId);
  }, []);

  const closeInvoiceEditor = useCallback(() => {
    if (navigation) {
      navigation.goBack();
    } else {
      setEditingInvoice(null);
    }
  }, [navigation]);

  const handleInvoiceEditFromModal = useCallback((invoice: EditableInvoiceRef) => {
    setViewingInvoiceId(null);
    setEditingInvoice(invoice);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [customerRes, invoicesRes, paymentsRes, statementRes] = await Promise.all([
        axios.get<{ success: boolean; data: CustomerRecord }>(
          `${API_BASE}/api/customers/${customerId}`
        ),
        axios.get<{ success: boolean; data: InvoiceRow[] }>(
          `${API_BASE}/api/sales/invoices`,
          { params: { customerId } }
        ),
        axios.get<{ success: boolean; data: PaymentRow[] }>(
          `${API_BASE}/api/customers/payments`,
          { params: { customerId, page: 1, limit: 15 } }
        ),
        axios.get<{
          success: boolean;
          data: { customer: CustomerRecord; lines: StatementLine[] };
        }>(`${API_BASE}/api/reports/customer-statement`, { params: { customerId } }),
      ]);

      if (!customerRes.data.success) {
        setError('Müşteri bulunamadı.');
        return;
      }

      setCustomer(customerRes.data.data);
      setInvoices(invoicesRes.data.success ? invoicesRes.data.data : []);
      setPayments(paymentsRes.data.success ? paymentsRes.data.data : []);
      if (statementRes.data.success) {
        setStatementLines(statementRes.data.data.lines.slice(0, 20));
      } else {
        setStatementLines([]);
      }
    } catch {
      setError('Müşteri bilgileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const openEdit = () => {
    if (!customer) return;
    setEditForm(toEditForm(customer));
    setShowEditForm(true);
  };

  const closeEdit = () => {
    setShowEditForm(false);
    setEditForm(null);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editForm || !customer) return;

    setSaving(true);
    try {
      await axios.put(`${API_BASE}/api/customers/${customer.id}`, {
        code: editForm.code.trim() || undefined,
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || undefined,
        email: editForm.email.trim() || undefined,
        city: editForm.city.trim() || undefined,
        district: editForm.district.trim() || undefined,
        address: editForm.address.trim() || undefined,
        contactPerson: editForm.contactPerson.trim() || undefined,
        taxOffice: editForm.taxOffice.trim() || undefined,
        taxNumber: editForm.taxNumber.trim() || undefined,
        creditLimit: Number(editForm.creditLimit) || 0,
      });
      notify('success', 'Müşteri kartı güncellendi.');
      closeEdit();
      await loadAll();
      onDataChange?.();
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.message
          ? String(err.response.data.message)
          : 'Güncelleme başarısız.';
      notify('error', message);
    } finally {
      setSaving(false);
    }
  };

  if (editingInvoice) {
    return (
      <InvoiceInlineEditor
        invoice={editingInvoice}
        onNotify={notify}
        onDataChange={onDataChange}
        onCancelEdit={closeInvoiceEditor}
        onSaved={() => {
          closeInvoiceEditor();
          void loadAll();
          onDataChange?.();
        }}
      />
    );
  }

  if (loading && !customer) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        Yükleniyor...
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error ?? 'Müşteri bulunamadı.'}
        </div>
        <button
          type="button"
          onClick={() => onNavigate('customer-list')}
          className="text-sm font-medium text-sky-700 hover:underline"
        >
          Müşteri listesine dön
        </button>
      </div>
    );
  }

  const styles = balanceStyles(customer.balance);
  const isRisky = customer.balance > customer.creditLimit;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => onNavigate('customer-list')}
            className="mt-1 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            title="Listeye dön"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="rounded-xl bg-sky-600 p-2.5 text-white">
            <User className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sky-700">{customer.code}</p>
            <h1 className="page-title">{customer.name}</h1>
            <p className="text-sm text-slate-500">Müşteri kartı · cari özet ve geçmiş işlemler</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigate('customer-payments', { customerId: customer.id })}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Tahsilat / Ödeme
          </button>
          <button
            type="button"
            onClick={() =>
              onNavigate('report-customer-statement', { customerId: customer.id })
            }
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
          >
            Tam Ekstre
          </button>
          <button
            type="button"
            onClick={openEdit}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            <Pencil className="h-4 w-4" />
            Düzenle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Güncel Bakiye
          </p>
          <p className={`mt-2 text-3xl font-bold tabular-nums ${styles.text}`}>
            {formatMoney(customer.balance)}
          </p>
          <span
            className={`mt-2 inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${styles.bg} ${styles.text}`}
          >
            {styles.label}
          </span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Kredi Limiti
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-800 tabular-nums">
            {formatMoney(customer.creditLimit)}
          </p>
          {isRisky && (
            <p className="mt-2 text-xs font-semibold text-amber-700">Limit aşımı var</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            İşlem Özeti
          </p>
          <p className="mt-2 text-sm text-slate-700">
            <strong>{invoices.length}</strong> fatura
          </p>
          <p className="text-sm text-slate-700">
            <strong>{payments.length}</strong> son tahsilat/ödeme kaydı
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-800">İletişim Bilgileri</h2>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Yetkili</dt>
              <dd className="font-medium text-slate-900">{customer.contactPerson || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Telefon</dt>
              <dd className="font-medium text-slate-900">{customer.phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">E-posta</dt>
              <dd className="font-medium text-slate-900">{customer.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Vergi Dairesi / No</dt>
              <dd className="font-medium text-slate-900">
                {[customer.taxOffice, customer.taxNumber].filter(Boolean).join(' · ') || '—'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Adres</dt>
              <dd className="font-medium text-slate-900">
                {[customer.address, customer.district, customer.city]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-slate-800">Son Tahsilat / Ödemeler</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Tarih
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Tür
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-500">
                    Tutar
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2 text-slate-600">{formatDate(payment.createdAt)}</td>
                    <td className="px-4 py-2">
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
                    <td className="px-4 py-2 text-right font-semibold">
                      {formatMoney(payment.amount)}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                      Kayıt yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <FileText className="h-4 w-4 text-violet-600" />
          <h2 className="font-semibold text-slate-800">Faturalar</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Fatura No
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Tür
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Ödeme
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                  Tutar
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                  Tarih
                </th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {isEditableInvoiceType(inv.type) ? (
                      <button
                        type="button"
                        onClick={() => openInvoiceView(inv.id)}
                        className="text-left text-indigo-700 hover:underline"
                      >
                        {inv.invoiceNo}
                      </button>
                    ) : (
                      inv.invoiceNo
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${invoiceTypeStyles(inv.type)}`}
                    >
                      {invoiceTypeLabel(inv.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{inv.paymentMethod}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatMoney(invoiceAmountUsd(inv))}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {formatDate(inv.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditableInvoiceType(inv.type) && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openInvoiceView(inv.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-indigo-600"
                          title="Faturayı görüntüle"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openInvoiceEditor(inv)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700"
                          title="Faturayı düzenle"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Fatura kaydı yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-800">Son Cari Hareketler</h2>
          <button
            type="button"
            onClick={() =>
              onNavigate('report-customer-statement', { customerId: customer.id })
            }
            className="text-xs font-semibold text-sky-700 hover:underline"
          >
            Tüm ekstre
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Tarih
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Açıklama
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                  Borç
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                  Alacak
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {statementLines.map((line, idx) => (
                <tr key={`${line.date}-${idx}`} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-slate-600">{formatDate(line.date)}</td>
                  <td className="px-4 py-3">{line.description}</td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {line.debit > 0 ? formatMoney(line.debit) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-700">
                    {line.credit > 0 ? formatMoney(line.credit) : '—'}
                  </td>
                </tr>
              ))}
              {statementLines.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    Hareket yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showEditForm && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60" onClick={closeEdit} />
          <form
            onSubmit={handleSave}
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <h3 className="font-semibold text-slate-900">Müşteri Kartını Düzenle</h3>
              <button type="button" onClick={closeEdit}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Kod</label>
                  <input
                    value={editForm.code}
                    onChange={(e) => setEditForm((f) => f && { ...f, code: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Kredi Limiti</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.creditLimit}
                    onChange={(e) =>
                      setEditForm((f) => f && { ...f, creditLimit: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Ünvan *</label>
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => f && { ...f, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Telefon</label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => f && { ...f, phone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Adres</label>
                <textarea
                  rows={2}
                  value={editForm.address}
                  onChange={(e) => setEditForm((f) => f && { ...f, address: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}

      <InvoiceDetailModal
        invoiceId={viewingInvoiceId}
        onClose={() => setViewingInvoiceId(null)}
        onEdit={handleInvoiceEditFromModal}
      />
    </div>
  );
}
