import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Pencil, Plus, Search, Users, X } from 'lucide-react';
import CustomerNameLink from '../components/CustomerNameLink';
import PaginationBar from '../components/PaginationBar';
import ExcelActions from '../components/ExcelActions';
import {
  API_BASE,
  balanceStyles,
  formatMoney,
  getTotalPages,
  LIST_PAGE_SIZE,
  type Customer,
  type PaginatedListResponse,
} from '../lib/api';

type CustomerForm = {
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

const emptyForm = (): CustomerForm => ({
  code: '',
  name: '',
  phone: '',
  email: '',
  city: '',
  district: '',
  address: '',
  contactPerson: '',
  taxOffice: '',
  taxNumber: '',
  creditLimit: '0',
});

type CustomerListProps = {
  onNotify?: (type: 'success' | 'error', message: string) => void;
};

export default function CustomerList({ onNotify }: CustomerListProps = {}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * Eski "M9624233045" bicimli kodlu musteri sayisi. Sifirdan buyukse
   * "Eski kodları düzelt" dugmesi gorunur; duzeltince kaybolur.
   */
  const [eskiKodSayisi, setEskiKodSayisi] = useState(0);
  const [kodDuzeltiliyor, setKodDuzeltiliyor] = useState(false);

  const notify = useCallback(
    (type: 'success' | 'error', message: string) => onNotify?.(type, message),
    [onNotify]
  );

  const loadCustomers = useCallback(async (query: string, pageNumber: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: pageNumber,
        limit: LIST_PAGE_SIZE,
      };
      if (query.trim()) params.search = query.trim();

      const response = await axios.get<PaginatedListResponse<Customer>>(
        `${API_BASE}/api/customers`,
        { params }
      );

      if (response.data.success) {
        setCustomers(response.data.data);
        setTotalCount(response.data.totalCount);
        setPage(response.data.page);
      }
    } catch {
      setCustomers([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadCustomers(search, page), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, page, loadCustomers]);

  const eskiKodSayisiniYukle = useCallback(async () => {
    try {
      const r = await axios.get<{ success: boolean; data: { sayi: number } }>(
        `${API_BASE}/api/customers/eski-kod-sayisi`
      );
      setEskiKodSayisi(r.data.data?.sayi ?? 0);
    } catch {
      setEskiKodSayisi(0);
    }
  }, []);

  useEffect(() => {
    void eskiKodSayisiniYukle();
  }, [eskiKodSayisiniYukle]);

  const eskiKodlariDuzelt = async () => {
    const onay = window.confirm(
      `${eskiKodSayisi} müşterinin eski biçimli kodu (M…) sıradaki sayıyla değiştirilecek.\n` +
        `Faturalar, tahsilatlar ve bakiyeler etkilenmez; yalnızca kod ve hareket açıklamalarındaki kod etiketi değişir.\n\nDevam edilsin mi?`
    );
    if (!onay) return;
    setKodDuzeltiliyor(true);
    try {
      const r = await axios.post<{ success: boolean; message: string }>(
        `${API_BASE}/api/customers/kodlari-duzelt`
      );
      notify('success', r.data.message);
      await eskiKodSayisiniYukle();
      await loadCustomers(search, page);
    } catch (error) {
      notify(
        'error',
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'Kodlar düzeltilemedi.'
      );
    } finally {
      setKodDuzeltiliyor(false);
    }
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditing(null);
    setShowForm(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = async (customer: Customer) => {
    try {
      const res = await axios.get<{ success: boolean; data: Customer & CustomerForm }>(
        `${API_BASE}/api/customers/${customer.id}`
      );
      const data = res.data.data;
      setEditing(customer);
      setForm({
        code: data.code,
        name: data.name,
        phone: (data as { phone?: string }).phone ?? '',
        email: (data as { email?: string }).email ?? '',
        city: (data as { city?: string }).city ?? '',
        district: (data as { district?: string }).district ?? '',
        address: (data as { address?: string }).address ?? '',
        contactPerson: (data as { contactPerson?: string }).contactPerson ?? '',
        taxOffice: (data as { taxOffice?: string }).taxOffice ?? '',
        taxNumber: (data as { taxNumber?: string }).taxNumber ?? '',
        creditLimit: String(data.creditLimit ?? 0),
      });
      setShowForm(true);
    } catch {
      notify('error', 'Müşteri bilgisi yüklenemedi.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      notify('error', 'Ünvan zorunludur.');
      return;
    }

    setSubmitting(true);
    const payload = {
      code: form.code.trim() || undefined,
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      city: form.city.trim() || undefined,
      district: form.district.trim() || undefined,
      address: form.address.trim() || undefined,
      contactPerson: form.contactPerson.trim() || undefined,
      taxOffice: form.taxOffice.trim() || undefined,
      taxNumber: form.taxNumber.trim() || undefined,
      creditLimit: Number(form.creditLimit) || 0,
    };

    try {
      if (editing) {
        await axios.put(`${API_BASE}/api/customers/${editing.id}`, payload);
        notify('success', 'Müşteri güncellendi.');
      } else {
        await axios.post(`${API_BASE}/api/customers`, payload);
        notify('success', 'Müşteri eklendi.');
      }
      resetForm();
      await loadCustomers(search, page);
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : editing
            ? 'Güncelleme başarısız.'
            : 'Müşteri eklenemedi.';
      notify('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-600 text-white">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="page-title">Müşteri Listesi</h1>
            <p className="text-sm text-slate-500">
              Düzenlenebilir cari kartlar · {LIST_PAGE_SIZE} kayıt / sayfa
              {getTotalPages(totalCount, LIST_PAGE_SIZE) > 0 &&
                ` · ${getTotalPages(totalCount, LIST_PAGE_SIZE).toLocaleString('tr-TR')} sayfa`}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
          <ExcelActions
            exportPath="/api/customers/export/excel"
            importPath="/api/customers/import/excel"
            exportFilename="musteriler.xlsx"
            onImported={() => loadCustomers(search, page)}
            onNotify={notify}
            hint="Bakiye sütunu bilgi amaçlıdır; yüklemede değiştirilmez."
          />
          {eskiKodSayisi > 0 ? (
            <button
              type="button"
              onClick={eskiKodlariDuzelt}
              disabled={kodDuzeltiliyor}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              title="M ile başlayan eski biçimli kodları sıradaki sayıyla değiştirir"
            >
              {kodDuzeltiliyor ? 'Düzeltiliyor…' : `Eski kodları düzelt (${eskiKodSayisi} müşteri)`}
            </button>
          ) : null}
          <div className="flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İsim veya kod ile ara..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:border-sky-500 focus:ring-sky-500 shadow-sm"
            />
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
          >
            <Plus className="w-4 h-4" />
            Yeni
          </button>
          </div>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                  Kod
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                  Ünvan
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                  Kredi Limiti
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                  Bakiye
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">
                  Durum
                </th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">
                    Yükleniyor...
                  </td>
                </tr>
              )}
              {!loading &&
                customers.map((customer) => {
                  const styles = balanceStyles(customer.balance);
                  return (
                    <tr key={customer.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                        <CustomerNameLink customerId={customer.id}>
                          {customer.code}
                        </CustomerNameLink>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-800">
                        <CustomerNameLink customerId={customer.id}>
                          {customer.name}
                        </CustomerNameLink>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-slate-600">
                        {formatMoney(customer.creditLimit)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-lg text-sm font-semibold ring-1 ring-inset ${styles.bg} ${styles.text}`}
                        >
                          {formatMoney(customer.balance)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${styles.bg} ${styles.text}`}
                        >
                          {styles.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(customer)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50"
                          title="Düzenle"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}
          totalCount={totalCount}
          limit={LIST_PAGE_SIZE}
          loading={loading}
          onPageChange={setPage}
          accent="sky"
        />
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60" onClick={resetForm} />
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <h3 className="font-semibold text-slate-900">
                {editing ? 'Müşteri Düzenle' : 'Yeni Müşteri'}
              </h3>
              <button type="button" onClick={resetForm}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Kod</label>
                  <input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="Otomatik"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Kredi Limiti</label>
                  <input
                    type="number"
                    min="0"
                    value={form.creditLimit}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, creditLimit: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Ünvan *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Telefon</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">E-posta</label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Yetkili</label>
                <input
                  value={form.contactPerson}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contactPerson: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Adres</label>
                <textarea
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              {editing && (
                <p className="text-xs text-slate-400">
                  Bakiye yalnızca satış, iade ve tahsilat işlemleriyle değişir.
                </p>
              )}
            </div>
            <div className="sticky bottom-0 border-t border-slate-100 bg-slate-50 px-5 py-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {submitting ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
