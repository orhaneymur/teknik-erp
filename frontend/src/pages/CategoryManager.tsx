import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { FolderTree, Plus, Tag } from 'lucide-react';
import { API_BASE, ensureArray } from '../lib/api';

type Category = {
  id: number;
  name: string;
  _count?: { products: number; brandModels: number };
};

type CategoryManagerProps = {
  onNotify?: (type: 'success' | 'error', message: string) => void;
};

export default function CategoryManager({ onNotify }: CategoryManagerProps = {}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const notify = useCallback(
    (type: 'success' | 'error', message: string) => onNotify?.(type, message),
    [onNotify]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get<{ success: boolean; data: Category[] }>(
        `${API_BASE}/api/settings/categories`
      );
      if (res.data.success) setCategories(ensureArray(res.data.data));
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
      notify('success', 'Kategori eklendi.');
      await loadData();
    } catch {
      notify('error', 'Kategori eklenemedi. Ad benzersiz olmalı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-indigo-600 text-white">
          <FolderTree className="w-5 h-5" />
        </div>
        <div>
          <h1 className="page-title">Kategoriler</h1>
          <p className="text-sm text-slate-500">
            Stok kartı için kategori tanımlayın · marka ve model ayrı sayfalarda
          </p>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Tag className="w-4 h-4 text-indigo-600" />
          <h2 className="font-semibold text-slate-800">Kategori Ekle</h2>
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
                  Ürün
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-slate-400 text-sm">
                    Yükleniyor...
                  </td>
                </tr>
              ) : (
                <>
                  {categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {cat.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-slate-600">
                        {cat._count?.products ?? 0}
                      </td>
                    </tr>
                  ))}
                  {categories.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-slate-400 text-sm">
                        Henüz kategori yok.
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
