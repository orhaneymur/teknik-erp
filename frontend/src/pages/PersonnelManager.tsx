import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Pencil, Plus, Power, Shield, Trash2, UserCog, Users, X } from 'lucide-react';
import { API_BASE } from '../lib/api';

type Personnel = {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive?: boolean;
  createdAt: string;
  _count?: { invoices: number };
};

/*
 * ROLLER — sunucudaki yetki matrisiyle ayni dort rol
 * (backend/src/lib/yetki.ts). Aciklamalar burada yazili ki yonetici
 * rolu secerken neyi actigini bilsin; yetkinin kendisi SUNUCUDA zorlanir.
 *
 * Eski "staff" rolu artik "satis" — migration ile cevrildi. Tanimadigi bir
 * deger gelirse (elle duzenlenmis kayit) kod en kisitli role duser.
 */
const ROLLER: Array<{ kod: string; ad: string; aciklama: string }> = [
  { kod: 'admin', ad: 'Yönetici', aciklama: 'Tüm yetkiler — ayarlar ve fiş silme dahil' },
  {
    kod: 'satis',
    ad: 'Satış',
    aciklama: 'Satış, iade, tahsilat, müşteri. Maliyet/kâr görmez, fiş silemez.',
  },
  {
    kod: 'depo',
    ad: 'Depo',
    aciklama: 'Stok, alış, depo transferi. Maliyeti görür, tahsilat yapamaz.',
  },
  { kod: 'okur', ad: 'Salt Okunur', aciklama: 'Yalnızca görüntüleme ve Excel indirme' },
];

const roleLabels: Record<string, string> = Object.fromEntries(
  ROLLER.map((r) => [r.kod, r.ad])
);

const roleStyles: Record<string, string> = {
  admin: 'bg-violet-100 text-violet-700 ring-violet-200',
  satis: 'bg-sky-100 text-sky-700 ring-sky-200',
  depo: 'bg-amber-100 text-amber-700 ring-amber-200',
  okur: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function PersonnelManager() {
  const [personnels, setPersonnels] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Personnel | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'satis',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get<{ success: boolean; data: Personnel[] }>(
        `${API_BASE}/api/settings/personnels`
      );
      if (response.data.success) {
        setPersonnels(response.data.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setForm({ name: '', email: '', password: '', role: 'satis' });
    setEditing(null);
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (person: Personnel) => {
    setEditing(person);
    setForm({
      name: person.name,
      email: person.email,
      password: '',
      role: person.role,
    });
    setShowForm(true);
  };

  /** Pasife al / geri aç — kayit SILINMEZ, gecmis fisler okunur kalir */
  const aktiflikDegistir = async (person: Personnel) => {
    const pasifeAl = person.isActive !== false;
    if (
      !window.confirm(
        pasifeAl
          ? `${person.name} pasife alınsın mı? Giriş yapamaz, geçmiş fişleri olduğu gibi kalır.`
          : `${person.name} tekrar aktif edilsin mi?`
      )
    ) {
      return;
    }
    try {
      await axios.put(`${API_BASE}/api/settings/personnel/${person.id}`, {
        isActive: !pasifeAl,
      });
      await loadData();
    } catch {
      alert('İşlem başarısız.');
    }
  };

  /**
   * Kalici silme — sunucu yalnizca HIC FIS KESMEMIS kaydi siler.
   * Fisi olan kullanici icin 409 ve "pasife alin" mesaji doner; mesaji
   * oldugu gibi gosteriyoruz ki kullanici ne yapacagini aramasin.
   */
  const kaliciSil = async (person: Personnel) => {
    if (!window.confirm(`${person.name} kaydı kalıcı olarak silinsin mi?`)) return;
    try {
      await axios.delete(`${API_BASE}/api/settings/personnel/${person.id}`);
      await loadData();
    } catch (error) {
      const mesaj =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'Silme başarısız.';
      alert(mesaj);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await axios.put(`${API_BASE}/api/settings/personnel/${editing.id}`, {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        if (!form.password) {
          alert('Yeni personel için şifre zorunludur.');
          setSubmitting(false);
          return;
        }
        await axios.post(`${API_BASE}/api/settings/personnel`, {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        });
      }
      resetForm();
      await loadData();
    } catch {
      alert(editing ? 'Güncelleme başarısız.' : 'Personel eklenemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Yükleniyor...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-600 text-white">
            <UserCog className="w-5 h-5" />
          </div>
          <div>
            <h1 className="page-title">Kullanıcı Yönetimi</h1>
            <p className="text-sm text-slate-500">
              Giriş yapan kullanıcılar, rolleri ve yetkileri
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-md"
        >
          <Plus className="w-4 h-4" />
          Yeni Kullanıcı
        </button>
      </div>

      {showForm && (
        <section className="bg-white rounded-2xl border border-violet-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">
              {editing ? 'Personel Düzenle' : 'Yeni Personel'}
            </h2>
            <button type="button" onClick={resetForm} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Ad Soyad
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="AD SOYAD"
                className="w-full rounded-xl border-slate-300 text-sm px-3 py-2 border uppercase"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                E-posta
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-xl border-slate-300 text-sm px-3 py-2 border"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Rol
              </label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-xl border-slate-300 text-sm px-3 py-2 border"
              >
                {ROLLER.map((rol) => (
                  <option key={rol.kod} value={rol.kod}>
                    {rol.ad}
                  </option>
                ))}
              </select>
              {/* Rolun ne actigi secim aninda yazilir — yonetici
                  "Satis ne gorur?" diye kilavuza bakmasin */}
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {ROLLER.find((r) => r.kod === form.role)?.aciklama}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Şifre {editing && '(boş bırakılırsa değişmez)'}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-xl border-slate-300 text-sm px-3 py-2 border"
                required={!editing}
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-400 text-white text-sm font-semibold rounded-xl"
              >
                {submitting ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {personnels.map((person) => (
          <div
            key={person.id}
            className={`rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md ${
              person.isActive === false
                ? 'border-slate-200 bg-slate-50 opacity-70'
                : 'border-slate-200/80 bg-white'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                  {person.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{person.name}</h3>
                  <p className="text-xs text-slate-500">{person.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => openEdit(person)}
                  title="Düzenle / şifre sıfırla"
                  className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => aktiflikDegistir(person)}
                  title={person.isActive === false ? 'Tekrar aktif et' : 'Pasife al'}
                  className={`rounded-lg p-1.5 ${
                    person.isActive === false
                      ? 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600'
                      : 'text-slate-400 hover:bg-amber-50 hover:text-amber-600'
                  }`}
                >
                  <Power className="w-4 h-4" />
                </button>
                {/* Fis kesmis kullanici silinemez; sunucu 409 ile
                    "pasife alin" diyor. Dugme yine duruyor ki yonetici
                    sebebini ekrandan ogrensin. */}
                <button
                  type="button"
                  onClick={() => kaliciSil(person)}
                  title="Kalıcı sil (yalnızca hiç fiş kesmemiş kullanıcı)"
                  className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ring-1 ring-inset ${roleStyles[person.role] ?? roleStyles.staff}`}
              >
                <Shield className="w-3 h-3" />
                {roleLabels[person.role] ?? person.role}
              </span>
              <span className="flex items-center gap-2 text-xs text-slate-400">
                {person.isActive === false && (
                  <span className="rounded-md bg-slate-200 px-1.5 py-0.5 font-semibold text-slate-600">
                    PASİF
                  </span>
                )}
                {person._count?.invoices ?? 0} fatura
              </span>
            </div>
          </div>
        ))}
      </div>

      {personnels.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400 text-sm flex flex-col items-center gap-2">
          <Users className="w-10 h-10 opacity-40" />
          Henüz personel tanımı yok.
        </div>
      )}
    </div>
  );
}
