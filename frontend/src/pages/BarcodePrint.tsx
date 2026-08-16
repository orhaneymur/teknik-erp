import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Barcode, Printer, Search, X } from 'lucide-react';
import { API_BASE, LIST_PAGE_SIZE, type PaginatedListResponse, type Product } from '../lib/api';
import { getTenantConfig } from '../lib/tenantConfig';

export default function BarcodePrint() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProducts = useCallback(async (query = '') => {
    try {
      const params: Record<string, string | number> = { page: 1, limit: LIST_PAGE_SIZE };
      if (query.trim()) {
        params.search = query.trim();
      }
      const response = await axios.get<PaginatedListResponse<Product>>(
        `${API_BASE}/api/products`,
        { params }
      );
      if (response.data.success) {
        return response.data.data;
      }
    } catch {
      return [];
    }
    return [];
  }, []);

  useEffect(() => {
    loadProducts().then(setProducts);
  }, [loadProducts]);

  useEffect(() => {
    if (!searchOpen) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const results = await loadProducts(searchQuery);
      setSearchResults(results);
      setFocusedIndex(results.length > 0 ? 0 : -1);
      setSearchLoading(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, searchOpen, loadProducts]);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  const openSearch = () => {
    setSearchOpen(true);
    setSearchQuery('');
    setSearchResults([]);
    setFocusedIndex(-1);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setFocusedIndex(-1);
  };

  const selectProduct = (product: Product) => {
    setSelected(product);
    closeSearch();
  };

  const handleModalKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (searchResults.length === 0) return;
      setFocusedIndex((prev) =>
        prev < 0 ? 0 : Math.min(prev + 1, searchResults.length - 1)
      );
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (searchResults.length === 0) return;
      setFocusedIndex((prev) => Math.max(prev <= 0 ? 0 : prev - 1, 0));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const index =
        focusedIndex >= 0
          ? focusedIndex
          : searchResults.length === 1
            ? 0
            : -1;
      if (index >= 0 && searchResults[index]) {
        selectProduct(searchResults[index]);
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
    }
  };

  const barcodeValue = selected?.barcode ?? selected?.sku ?? '';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #barcode-print-area, #barcode-print-area * { visibility: visible; }
          #barcode-print-area {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-600 text-white">
            <Barcode className="w-5 h-5" />
          </div>
          <div>
            <h1 className="page-title">Barkod Etiket</h1>
            <p className="text-sm text-slate-500">
              Ürün seçin ve etiket yazdırın
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openSearch}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 px-5 text-sm font-semibold shadow-md transition-colors"
        >
          <Search className="w-4 h-4" />
          Ürün Ara (F2 benzeri)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Hızlı Seçim</h2>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setSelected(product)}
                className={`w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors ${
                  selected?.id === product.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''
                }`}
              >
                <p className="text-sm font-medium text-slate-900">{product.name}</p>
                <p className="text-xs text-slate-500">
                  {product.sku}
                  {product.barcode ? ` · ${product.barcode}` : ''}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 flex flex-col items-center">
          <h2 className="font-semibold text-slate-800 mb-4 self-start w-full">
            Etiket Önizleme
          </h2>

          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12">
              <Barcode className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm">Yazdırmak için bir ürün seçin</p>
            </div>
          ) : (
            <>
              <div
                id="barcode-print-area"
                className="border-2 border-dashed border-slate-300 rounded-xl bg-white p-6 flex flex-col items-center justify-center gap-3 w-72 min-h-40"
              >
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">
                  {getTenantConfig().companyName}
                </p>
                <div className="font-mono text-2xl font-bold tracking-[0.2em] text-slate-900">
                  {barcodeValue}
                </div>
                <div className="w-full h-12 bg-[repeating-linear-gradient(90deg,#1e293b_0,#1e293b_2px,transparent_2px,transparent_4px)] rounded-sm" />
                <p className="text-sm font-medium text-slate-800 text-center">
                  {selected.name}
                </p>
                <p className="text-xs text-slate-500 font-mono">{selected.sku}</p>
              </div>

              <button
                type="button"
                onClick={handlePrint}
                className="mt-6 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-8 rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
              >
                <Printer className="w-5 h-5" />
                Yazdır
              </button>
            </>
          )}
        </section>
      </div>

      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 no-print"
          onKeyDown={handleModalKeyDown}
        >
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={closeSearch}
          />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-violet-600 px-5 py-4 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Ürün Seç</h3>
                <p className="text-violet-200 text-xs mt-0.5">
                  ↑↓ gezin · Enter seç · Esc kapat
                </p>
              </div>
              <button type="button" onClick={closeSearch} className="p-1 hover:bg-violet-500 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 border-b border-slate-100">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ürün adı, SKU veya barkod..."
                className="w-full rounded-lg border-slate-300 text-base px-4 py-3 border focus:border-violet-500 focus:ring-violet-500"
              />
            </div>
            <div className="max-h-80 overflow-y-auto">
              {searchLoading && (
                <p className="px-4 py-8 text-center text-slate-400 text-sm">Aranıyor...</p>
              )}
              {!searchLoading && searchResults.length > 0 && (
                <ul className="divide-y divide-slate-100">
                  {searchResults.map((product, index) => (
                    <li
                      key={product.id}
                      onClick={() => selectProduct(product)}
                      onMouseEnter={() => setFocusedIndex(index)}
                      className={`px-4 py-3 cursor-pointer flex justify-between gap-4 ${
                        focusedIndex === index
                          ? 'bg-violet-50 border-l-4 border-violet-600'
                          : 'hover:bg-slate-50 border-l-4 border-transparent'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{product.name}</p>
                        <p className="text-xs text-slate-500">{product.sku}</p>
                      </div>
                      <p className="text-xs font-mono text-slate-400">
                        {product.barcode ?? '—'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {!searchLoading && searchQuery && searchResults.length === 0 && (
                <p className="px-4 py-8 text-center text-slate-400 text-sm">Sonuç bulunamadı.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
