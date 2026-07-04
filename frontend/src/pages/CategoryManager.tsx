import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { FolderTree, Layers, Plus, Tag } from 'lucide-react';
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
  brandModels: BrandModel[];
  _count?: { products: number; brandModels: number };
};

export default function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brandModels, setBrandModels] = useState<BrandModel[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [brandKind, setBrandKind] = useState<'MARKA' | 'MODEL'>('MARKA');
  const [brandCategoryId, setBrandCategoryId] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, brandRes] = await Promise.all([
        axios.get<{ success: boolean; data: Category[] }>(
          `${API_BASE}/api/settings/categories`
        ),
        axios.get<{ success: boolean; data: BrandModel[] }>(
          `${API_BASE}/api/settings/brand-models`
        ),
      ]);
      if (catRes.data.success) setCategories(ensureArray(catRes.data.data));
      if (brandRes.data.success) setBrandModels(ensureArray(brandRes.data.data));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/api/settings/category`, {
        name: categoryName.trim(),
      });
      setCategoryName('');
      await loadData();
    } catch {
      alert('Kategori eklenemedi. Ad benzersiz olmalı.');
    } finally {
      setSubmitting(false);
    }
  };

  const addBrandModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) return;
    if (brandCategoryId === '') {
      alert('Marka/model için kategori seçin.');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/api/settings/brand-model`, {
        name: brandName.trim(),
        kind: brandKind,
        categoryId: brandCategoryId,
      });
      setBrandName('');
      setBrandKind('MARKA');
      setBrandCategoryId('');
      await loadData();
    } catch {
      alert('Marka/model eklenemedi.');
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
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-indigo-600 text-white">
          <FolderTree className="w-5 h-5" />
        </div>
        <div>
          <h1 className="page-title">
            Kategori & Marka/Model
          </h1>
          <p className="text-sm text-slate-500">
            Excel ve stok kartlarındaki marka/model otomatik listelenir; elle de ekleyebilirsiniz
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Tag className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-800">Kategoriler</h2>
          </div>
          <form onSubmit={addCategory} className="p-5 border-b border-slate-100 flex gap-2">
            <input
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Yeni kategori adı..."
              className="flex-1 rounded-xl border-slate-300 text-sm px-3 py-2 border focus:border-indigo-500 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white text-sm font-medium px-4 py-2 rounded-xl"
            >
              <Plus className="w-4 h-4" />
              Ekle
            </button>
          </form>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Kategori
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                    Marka/Model
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                    Ürün
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      {cat.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600">
                      {cat._count?.brandModels ?? ensureArray(cat.brandModels).length}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600">
                      {cat._count?.products ?? 0}
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-sm">
                      Henüz kategori yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-600" />
            <h2 className="font-semibold text-slate-800">Marka / Model</h2>
          </div>
          <form
            onSubmit={addBrandModel}
            className="p-5 border-b border-slate-100 space-y-3"
          >
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Marka veya model adı..."
              className="w-full rounded-xl border-slate-300 text-sm px-3 py-2 border focus:border-violet-500 focus:ring-violet-500"
            />
            <div className="flex flex-wrap gap-2">
              <select
                value={brandKind}
                onChange={(e) => setBrandKind(e.target.value as 'MARKA' | 'MODEL')}
                className="rounded-xl border-slate-300 text-sm px-3 py-2 border focus:border-violet-500 focus:ring-violet-500"
              >
                <option value="MARKA">Marka</option>
                <option value="MODEL">Model</option>
              </select>
              <select
                value={brandCategoryId}
                onChange={(e) =>
                  setBrandCategoryId(
                    e.target.value ? Number(e.target.value) : ''
                  )
                }
                className="flex-1 rounded-xl border-slate-300 text-sm px-3 py-2 border focus:border-violet-500 focus:ring-violet-500"
              >
                <option value="">Kategori seçin *</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-400 text-white text-sm font-medium px-4 py-2 rounded-xl"
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
                    Tür
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Ad
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
                {brandModels.map((brand) => (
                  <tr key={brand.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {brand.kind === 'MARKA' ? 'Marka' : 'Model'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      {brand.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {brand.category?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600">
                      {brand._count?.products ?? 0}
                    </td>
                  </tr>
                ))}
                {brandModels.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">
                      Henüz marka/model yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
