import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  ChevronDown,
  ChevronRight,
  Layers,
  Package,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import PaginationBar from '../components/PaginationBar';
import ExcelActions from '../components/ExcelActions';
import TypeaheadField from '../components/TypeaheadField';
import {
  API_BASE,
  ensureArray,
  formatUsd,
  getTotalPages,
  LIST_PAGE_SIZE,
  toIntegerQty,
  type PaginatedListResponse,
  type Product,
} from '../lib/api';
import { depotLabel } from '../lib/depots';

type CategoryOption = { id: number; name: string };
type BrandModelOption = {
  id: number;
  name: string;
  kind: 'MARKA' | 'MODEL';
  categoryId: number | null;
};

type StockListProps = {
  onNotify?: (type: 'success' | 'error', message: string) => void;
  title?: string;
  subtitle?: string;
};

export default function StockList({
  onNotify,
  title = 'Stok Listesi',
  subtitle,
}: StockListProps = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brandModels, setBrandModels] = useState<BrandModelOption[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [categoryText, setCategoryText] = useState('');
  const [form, setForm] = useState({
    sku: '',
    name: '',
    barcode: '',
    categoryId: '' as number | '',
    brand: '',
    model: '',
    description: '',
    costPrice: '',
    priceUsd: '',
  });
  const [stockForm, setStockForm] = useState<Array<{ branchId: number; branchName: string; quantity: string }>>(
    []
  );
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback(
    (type: 'success' | 'error', message: string) => onNotify?.(type, message),
    [onNotify]
  );

  const loadProducts = useCallback(async (query: string, pageNumber: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: pageNumber,
        limit: LIST_PAGE_SIZE,
      };
      if (query.trim()) {
        params.search = query.trim();
      }

      const response = await axios.get<PaginatedListResponse<Product>>(
        `${API_BASE}/api/products`,
        { params }
      );

      if (response.data.success) {
        setProducts(response.data.data);
        setTotalCount(response.data.totalCount);
        setPage(response.data.page);
      }
    } catch {
      setProducts([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      axios.get<{ success: boolean; data: CategoryOption[] }>(
        `${API_BASE}/api/settings/categories`
      ),
      axios.get<{ success: boolean; data: BrandModelOption[] }>(
        `${API_BASE}/api/settings/brand-models`
      ),
    ])
      .then(([catRes, brandRes]) => {
        if (catRes.data.success) setCategories(ensureArray(catRes.data.data));
        if (brandRes.data.success) setBrandModels(ensureArray(brandRes.data.data));
      })
      .catch(() => {
        /* tanimlar opsiyonel */
      });
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      loadProducts(search, page);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, page, loadProducts]);

  const productStocks = (product: Product) => ensureArray(product.stocks);

  const totalStock = (product: Product) =>
    productStocks(product).reduce((sum, s) => sum + s.quantity, 0);

  const totalPages = getTotalPages(totalCount, LIST_PAGE_SIZE);

  const brandOptions = brandModels.filter((item) => {
    if (item.kind !== 'MARKA') return false;
    if (form.categoryId === '') return true;
    return item.categoryId === form.categoryId || item.categoryId == null;
  });

  const modelOptions = brandModels.filter((item) => {
    if (item.kind !== 'MODEL') return false;
    if (form.categoryId === '') return true;
    return item.categoryId === form.categoryId || item.categoryId == null;
  });

  const openEdit = (product: Product, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditing(product);
    setCategoryText(product.category?.name ?? '');
    setForm({
      sku: product.sku,
      name: product.name,
      barcode: product.barcode ?? '',
      categoryId: product.categoryId ?? product.category?.id ?? '',
      brand: product.brand ?? '',
      model: product.model ?? '',
      description: product.description ?? '',
      costPrice: String(product.costPrice),
      priceUsd: String(product.priceUsd),
    });
    setStockForm(
      productStocks(product).map((stock) => ({
        branchId: stock.branchId,
        branchName: stock.branch.name,
        quantity: String(stock.quantity),
      }))
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!form.name.trim()) {
      notify('error', 'Ürün adı zorunludur.');
      return;
    }
    setSubmitting(true);
    try {
      await axios.put(`${API_BASE}/api/products/${editing.id}`, {
        sku: form.sku.trim(),
        name: form.name.trim(),
        barcode: form.barcode.trim() || null,
        categoryId: form.categoryId === '' ? null : Number(form.categoryId),
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        description: form.description.trim() || null,
        costPrice: Number(form.costPrice),
        priceUsd: Number(form.priceUsd),
        priceTl: Number(form.priceUsd),
      });

      if (stockForm.length > 0) {
        await axios.put(`${API_BASE}/api/products/${editing.id}/stock`, {
          stocks: stockForm.map((row) => ({
            branchId: row.branchId,
            quantity: toIntegerQty(row.quantity, 0),
          })),
        });
      }

      notify('success', 'Ürün güncellendi.');
      setEditing(null);
      await loadProducts(search, page);
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'Güncelleme başarısız.';
      notify('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = window.confirm(
      `"${product.name}" (${product.sku}) ürününü silmek istiyor musunuz?\n\nFaturada kullanılmış ürünler silinemez.`
    );
    if (!ok) return;

    setDeletingId(product.id);
    try {
      await axios.delete(`${API_BASE}/api/products/${product.id}`);
      notify('success', 'Ürün silindi.');
      if (editing?.id === product.id) setEditing(null);
      await loadProducts(search, page);
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'Ürün silinemedi.';
      notify('error', message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600 text-white">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="text-sm text-slate-500">
              {subtitle ??
                `Ad değiştir · düzenle · sil · Excel isteğe bağlı · ${LIST_PAGE_SIZE} kayıt / sayfa`}
              {!subtitle &&
                totalPages > 0 &&
                ` · ${totalPages.toLocaleString('tr-TR')} sayfa`}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
          <ExcelActions
            exportPath="/api/products/export/excel"
            importPath="/api/products/import/excel"
            exportFilename="stoklar.xlsx"
            importTimeoutMs={600_000}
            onImported={() => loadProducts(search, page)}
            onNotify={notify}
            hint="Tam senkron: Excel'deki ürünler güncellenir, Excel'de olmayanlar silinir (fatura geçmişi olanların stoğu 0 olur). Bakiye = stok adedi."
          />
          <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün adı, SKU veya barkod..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500 shadow-sm"
          />
          </div>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Ürün Stokları</h2>
          <span className="text-xs text-slate-400">
            {loading ? 'Yükleniyor...' : `${totalCount.toLocaleString('tr-TR')} ürün`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="w-10 px-3 py-3" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                  SKU
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                  Ürün Adı
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                  Barkod
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                  Fiyat ($)
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                  Toplam Stok
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                  Şube / Depo
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                  İşlem
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-slate-400 text-sm"
                  >
                    Yükleniyor...
                  </td>
                </tr>
              )}

              {!loading &&
                products.map((product) => {
                  const isExpanded = expandedId === product.id;
                  const stocks = productStocks(product);
                  const stockTotal = totalStock(product);

                  return (
                    <Fragment key={product.id}>
                      <tr
                        className="hover:bg-slate-50/60 cursor-pointer"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : product.id)
                        }
                      >
                        <td className="px-3 py-3 text-slate-400">
                          {stocks.length > 1 ? (
                            isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                          {product.sku}
                        </td>
                        <td className="px-4 py-3 max-w-[280px]">
                          <button
                            type="button"
                            onClick={(e) => openEdit(product, e)}
                            className="truncate text-left text-sm font-medium text-indigo-700 hover:underline"
                            title="Düzenle"
                          >
                            {product.name}
                          </button>
                          <p className="mt-0.5 truncate text-caption text-slate-500">
                            {[
                              product.category?.name,
                              product.brand,
                              product.model,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Kategori / marka / model yok'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 font-mono">
                          {product.barcode ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-slate-700 tabular-nums">
                          {formatUsd(product.priceUsd)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-lg text-sm font-semibold ring-1 ring-inset ${
                              stockTotal <= 10
                                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                                : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            }`}
                          >
                            {stockTotal} adet
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {stocks.length === 0 && (
                              <span className="text-xs text-slate-400">
                                Stok yok
                              </span>
                            )}
                            {stocks
                              .slice(0, isExpanded ? undefined : 2)
                              .map((stock) => (
                                <span
                                  key={stock.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
                                >
                                  <Layers className="w-3 h-3" />
                                  {depotLabel(stock.branch.name)}: {stock.quantity} adet
                                </span>
                              ))}
                            {!isExpanded && stocks.length > 2 && (
                              <span className="text-xs text-slate-400">
                                +{stocks.length - 2} şube
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => openEdit(product, e)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                              title="Düzenle"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => void handleDelete(product, e)}
                              disabled={deletingId === product.id}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                              title="Sil"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && stocks.length > 0 && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={8} className="px-6 py-4">
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                              Tüm Şube Stokları — {product.name}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {stocks.map((stock) => (
                                <span
                                  key={stock.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 text-slate-700 shadow-sm"
                                >
                                  <span className="font-medium">
                                    {depotLabel(stock.branch.name)}
                                  </span>
                                  <span className="text-indigo-600 font-semibold">
                                    {stock.quantity} adet
                                  </span>
                                  <span className="text-caption text-slate-400 uppercase">
                                    {stock.branch.type}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

              {!loading && products.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-slate-400 text-sm"
                  >
                    Aramanıza uygun ürün bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}
          totalCount={totalCount}
          limit={LIST_PAGE_SIZE}
          loading={loading}
          onPageChange={setPage}
          accent="indigo"
        />
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60" onClick={() => setEditing(null)} />
          <form
            onSubmit={handleSave}
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-900">Ürün Düzenle</h3>
                <p className="text-caption text-slate-500">
                  Kategori, marka, model, fiyat ve stok
                </p>
              </div>
              <button type="button" onClick={() => setEditing(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <label className="text-xs font-medium text-slate-600">Ürün Adı *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">SKU *</label>
                  <input
                    required
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Barkod</label>
                  <input
                    value={form.barcode}
                    onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Kategori</label>
                <TypeaheadField
                  value={categoryText}
                  onChange={(value) => {
                    setCategoryText(value);
                    const match = categories.find(
                      (cat) =>
                        cat.name.toLocaleLowerCase('tr-TR') ===
                        value.trim().toLocaleLowerCase('tr-TR')
                    );
                    setForm((f) => ({
                      ...f,
                      categoryId: match?.id ?? '',
                    }));
                  }}
                  onSelectOption={(option) => {
                    setCategoryText(option.label);
                    setForm((f) => ({ ...f, categoryId: Number(option.id) }));
                  }}
                  options={categories.map((cat) => ({
                    id: cat.id,
                    label: cat.name,
                  }))}
                  placeholder="Yazmaya başlayın..."
                  inputClassName="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">Marka</label>
                  <TypeaheadField
                    value={form.brand}
                    onChange={(value) => setForm((f) => ({ ...f, brand: value }))}
                    options={brandOptions.map((item) => ({
                      id: item.id,
                      label: item.name,
                    }))}
                    placeholder="Yazmaya başlayın..."
                    inputClassName="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Model</label>
                  <TypeaheadField
                    value={form.model}
                    onChange={(value) => setForm((f) => ({ ...f, model: value }))}
                    options={modelOptions.map((item) => ({
                      id: item.id,
                      label: item.name,
                    }))}
                    placeholder="Yazmaya başlayın..."
                    inputClassName="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">Maliyet ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.costPrice}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, costPrice: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Satış ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.priceUsd}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, priceUsd: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Açıklama</label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  rows={2}
                  className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              {stockForm.length > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Depo Stokları
                  </p>
                  {stockForm.map((row, index) => (
                    <div key={row.branchId} className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-slate-700">
                        {depotLabel(row.branchName)}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={row.quantity}
                        onChange={(e) =>
                          setStockForm((prev) =>
                            prev.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    quantity: String(toIntegerQty(e.target.value, 0)),
                                  }
                                : item
                            )
                          )
                        }
                        className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm"
                      />
                      <span className="text-xs text-slate-400">adet</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button
                type="button"
                onClick={(e) => void handleDelete(editing, e)}
                disabled={deletingId === editing.id || submitting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Sil
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg px-4 py-2 text-sm text-slate-600"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
