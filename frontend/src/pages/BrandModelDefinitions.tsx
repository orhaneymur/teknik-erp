import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Layers, Plus, Tag } from 'lucide-react';
import { API_BASE, ensureArray } from '../lib/api';

type BrandModel = {
  id: number;
  name: string;
  kind: 'MARKA' | 'MODEL';
  categoryId: number | null;
  category: { id: number; name: string } | null;
  _count?: { products: number };
};

type Category = {
  id: number;
  name: string;
};

type BrandModelDefinitionsProps = {
  kind: 'MARKA' | 'MODEL';
  onNotify?: (type: 'success' | 'error', message: string) => void;
};

export default function BrandModelDefinitions({
  kind,
  onNotify,
}: BrandModelDefinitionsProps) {
  const [brandModels, setBrandModels] = useState<BrandModel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const label = kind === 'MARKA' ? 'Marka' : 'Model';
  const isBrand = kind === 'MARKA';
  const iconBox = isBrand
    ? 'p-2.5 rounded-xl bg-violet-600 text-white'
    : 'p-2.5 rounded-xl bg-sky-600 text-white';
  const iconColor = isBrand ? 'w-4 h-4 text-violet-600' : 'w-4 h-4 text-sky-600';
  const inputFocus = isBrand
    ? 'focus:border-violet-500 focus:ring-violet-500'
    : 'focus:border-sky-500 focus:ring-sky-500';
  const buttonClass = isBrand
    ? 'flex items-center gap-1 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-400 text-white text-sm font-medium px-4 py-2 rounded-xl'
    : 'flex items-center gap-1 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 text-white text-sm font-medium px-4 py-2 rounded-xl';

  const notify = useCallback(
    (type: 'success' | 'error', message: string) => onNotify?.(type, message),
    [onNotify]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [brandRes, catRes] = await Promise.all([
        axios.get<{ success: boolean; data: BrandModel[] }>(
          `${API_BASE}/api/settings/brand-models`
        ),
        axios.get<{ success: boolean; data: Category[] }>(
          `${API_BASE}/api/settings/categories`
        ),
      ]);
      if (brandRes.data.success) setBrandModels(ensureArray(brandRes.data.data));
      if (catRes.data.success) setCategories(ensureArray(catRes.data.data));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const items = useMemo(
    () => brandModels.filter((item) => item.kind === kind),
    [brandModels, kind]
  );

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/api/settings/brand-model`, {
        name: name.trim(),
        kind,
        categoryId: categoryId === '' ? undefined : categoryId,
      });
      setName('');
      setCategoryId('');
      notify('success', `${label} eklendi.`);
      await loadData();
    } catch {
      notify('error', `${label} eklenemedi.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className={iconBox}>
          {isBrand ? (
            <Tag className="w-5 h-5" />
          ) : (
            <Layers className="w-5 h-5" />
          )}
        </div>
        <div>
          <h1 className="page-title">{isBrand ? 'Markalar' : 'Modeller'}</h1>
          <p className="text-sm text-slate-500">
            Stok kartı için {label.toLocaleLowerCase('tr-TR')} tanımlayın · kategori seçimi
            isteğe bağlı
          </p>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          {isBrand ? (
            <Tag className={iconColor} />
          ) : (
            <Layers className={iconColor} />
          )}
          <h2 className="font-semibold text-slate-800">{label} Ekle</h2>
        </div>
        <form onSubmit={addItem} className="p-5 border-b border-slate-100 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Yeni ${label.toLocaleLowerCase('tr-TR')} adı...`}
            className={`w-full rounded-xl border-slate-300 text-sm px-3 py-2 border ${inputFocus}`}
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={categoryId}
              onChange={(e) =>
                setCategoryId(e.target.value ? Number(e.target.value) : '')
              }
              className={`flex-1 rounded-xl border-slate-300 text-sm px-3 py-2 border ${inputFocus}`}
            >
              <option value="">Kategori (isteğe bağlı)</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={submitting}
              className={buttonClass}
            >
              <Plus className="w-4 h-4" />
              Ekle
            </button>
          </div>
        </form>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                  {label} Adı
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                  Kategori
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                  Ürün
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-sm">
                    Yükleniyor...
                  </td>
                </tr>
              ) : (
                <>
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {item.category?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-slate-600">
                        {item._count?.products ?? 0}
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-sm">
                        Henüz {label.toLocaleLowerCase('tr-TR')} yok.
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
