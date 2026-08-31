import { useEffect, useState } from 'react';
import axios from 'axios';
import { Save, UserPlus } from 'lucide-react';
import { API_BASE, ensureArray } from '../lib/api';
import type { NavigateFn } from '../lib/navigation';
import CityDistrictSelect from '../components/CityDistrictSelect';

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

type CustomerCreateProps = {
  onNotify?: (type: 'success' | 'error', message: string) => void;
  onNavigate?: NavigateFn;
};

export default function CustomerCreate({ onNotify, onNavigate }: CustomerCreateProps) {
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const notify = (type: 'success' | 'error', message: string) => {
    onNotify?.(type, message);
  };

  /*
   * "Yetkili" alani serbest metin yerine personel listesinden secilir.
   * Amac: bu musterinin bizden sorumlusu kim, kayitli kalsin. Elle
   * yazildiginda ayni kisi "Ahmet", "ahmet", "Ahmet B." diye uc farkli
   * deger olarak birikiyordu.
   */
  const [personnels, setPersonnels] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    let iptal = false;
    void (async () => {
      try {
        const response = await axios.get<{
          success: boolean;
          data: Array<{ id: number; name: string }>;
        }>(`${API_BASE}/api/settings/personnels`);
        if (!iptal && response.data.success) {
          setPersonnels(ensureArray(response.data.data));
        }
      } catch {
        // Liste gelmezse alan bos kalir; kart yine olusturulabilir
      }
    })();
    return () => {
      iptal = true;
    };
  }, []);

  const resetForm = () => setForm(emptyForm());

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    /*
     * Zorunlu alanlar. Eksik müşteri kartı sonradan fatura kesilirken,
     * kargo gönderilirken ve ekstre yollanırken sorun çıkarıyordu; kartı
     * açan kişi o an bilgiye ulaşabiliyor, bir hafta sonra ulaşamıyor.
     */
    const zorunlu: Array<[string, string]> = [
      [form.name, 'Ünvan'],
      [form.phone, 'Telefon'],
      [form.city, 'İl'],
      [form.district, 'İlçe'],
      [form.address, 'Adres'],
    ];
    const eksik = zorunlu.filter(([value]) => !value.trim()).map(([, label]) => label);
    if (eksik.length > 0) {
      notify('error', `Şu alanlar zorunlu: ${eksik.join(', ')}`);
      return;
    }

    setSubmitting(true);
    const payload = {
      // code gonderilmiyor — backend otomatik uretir
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
      const response = await axios.post(`${API_BASE}/api/customers`, payload);
      const code = response.data.data?.code ?? form.code;
      notify('success', `Müşteri kartı oluşturuldu${code ? `: ${code}` : ''}.`);
      resetForm();
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'Müşteri kartı oluşturulamadı.';
      notify('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = 'field-input';
  const labelClass = 'field-label';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-sky-600 p-2.5 text-white">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h1 className="page-title">Yeni Müşteri Kartı</h1>
          <p className="text-sm text-slate-500">
            Cari hesap kartı oluşturun — kod boş bırakılırsa otomatik atanır
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-3xl rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Cari Kodu</label>
            {/* Kod sistem tarafindan uretilir. Alan bilerek kapali: elle
                yazilan kodlar cakisiyor ve sonradan duzeltmesi zor oluyordu. */}
            <input
              value=""
              readOnly
              disabled
              placeholder="Kaydedince otomatik atanır"
              className={`${fieldClass} bg-slate-100 text-slate-500 cursor-not-allowed`}
            />
          </div>
          <div>
            <label className={labelClass}>Kredi Limiti ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.creditLimit}
              onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Ünvan *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={fieldClass}
              placeholder="Firma veya müşteri adı"
            />
          </div>
          <div>
            <label className={labelClass}>Yetkili (Sorumlu Personel)</label>
            <select
              value={form.contactPerson}
              onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
              className={fieldClass}
            >
              <option value="">Seçiniz</option>
              {personnels.map((person) => (
                <option key={person.id} value={person.name}>
                  {person.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              Bu müşteri bizden kimin müşterisi?
            </p>
          </div>
          <div>
            <label className={labelClass}>Telefon *</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>E-posta</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={fieldClass}
            />
          </div>
          <CityDistrictSelect
            city={form.city}
            district={form.district}
            onChange={(next) => setForm((f) => ({ ...f, ...next }))}
            fieldClass={fieldClass}
            labelClass={labelClass}
          />
          <div>
            <label className={labelClass}>Vergi Dairesi</label>
            <input
              value={form.taxOffice}
              onChange={(e) => setForm((f) => ({ ...f, taxOffice: e.target.value }))}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Vergi / TC No</label>
            <input
              value={form.taxNumber}
              onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Adres *</label>
            <textarea
              rows={3}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className={fieldClass}
            />
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Bakiye yalnızca satış, iade ve tahsilat işlemleriyle oluşur; yeni kartta başlangıç
          bakiyesi sıfırdır.
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('customer-list')}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Müşteri Listesi
            </button>
          )}
          <button
            type="button"
            onClick={resetForm}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Temizle
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {submitting ? 'Kaydediliyor...' : 'Kartı Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
}
