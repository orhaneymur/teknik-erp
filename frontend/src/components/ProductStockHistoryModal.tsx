import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { History, Users, X } from 'lucide-react';
import CustomerSearchPanel from './CustomerSearchPanel';
import PaginationBar from './PaginationBar';
import {
  API_BASE,
  LIST_PAGE_SIZE,
  ensureArray,
  formatDate,
  formatMoney,
  invoiceTypeLabel,
  type Customer,
  type PaginatedListResponse,
} from '../lib/api';

type MovementRow = {
  id: number;
  invoiceId: number;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
  direction: 'IN' | 'OUT';
  invoiceNo: string;
  invoiceType: string;
  isPreOrder: boolean;
  affectsStock: boolean;
  processedBy: string | null;
  customer: { id: number; code: string; name: string };
  createdAt: string;
};

type ProductRef = {
  id: number;
  sku: string;
  name: string;
};

type ProductStockHistoryModalProps = {
  open: boolean;
  onClose: () => void;
  product: ProductRef | null;
  /** Satış ekranında seçili müşteri — varsa varsayılan filtre */
  initialCustomer?: Customer | null;
};

export default function ProductStockHistoryModal({
  open,
  onClose,
  product,
  initialCustomer = null,
}: ProductStockHistoryModalProps) {
  const [filterCustomer, setFilterCustomer] = useState<Customer | null>(null);
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || !product) return;
    setFilterCustomer(initialCustomer ?? null);
    setPage(1);
    setRows([]);
    setTotalCount(0);
  }, [open, product?.id, initialCustomer?.id]);

  useEffect(() => {
    if (!open || !product) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          page,
          limit: LIST_PAGE_SIZE,
          productId: product.id,
        };
        if (filterCustomer) params.customerId = filterCustomer.id;

        const res = await axios.get<PaginatedListResponse<MovementRow>>(
          `${API_BASE}/api/reports/stock-history`,
          { params }
        );
        if (res.data.success) {
          setRows(ensureArray(res.data.data));
          setTotalCount(res.data.totalCount);
        } else {
          setRows([]);
          setTotalCount(0);
        }
      } catch {
        setRows([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, product?.id, filterCustomer?.id, page]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [open, onClose]);

  if (!open || !product) return null;

  const selectCustomer = (customer: Customer) => {
    setFilterCustomer(customer);
    setPage(1);
  };

  const clearCustomerFilter = () => {
    setFilterCustomer(null);
    setPage(1);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Ürün stok hareketleri"
      onClick={onClose}
    >
      <div
        className="flex h-[min(92vh,52rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-cyan-600 px-4 py-3 text-white sm:px-5">
          <div className="min-w-0 flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-white/15 p-2">
              <History className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold sm:text-lg">
                Stok Hareketleri
              </h2>
              <p className="truncate text-sm font-medium text-cyan-50">
                {product.name}
              </p>
              <p className="text-caption text-cyan-100/90">{product.sku}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 hover:bg-white/15"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[17rem_1fr] lg:grid-cols-[19rem_1fr]">
          <aside className="flex min-h-0 flex-col border-b border-slate-200 md:border-b-0 md:border-r">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2.5">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Users className="h-4 w-4 text-cyan-700" />
                Müşteri filtresi
              </div>
              {filterCustomer ? (
                <div className="mb-2 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-2">
                  <p className="text-xs font-medium text-cyan-900 truncate">
                    {filterCustomer.name}
                  </p>
                  <p className="text-caption text-cyan-700">{filterCustomer.code}</p>
                  <button
                    type="button"
                    onClick={clearCustomerFilter}
                    className="mt-1.5 text-caption font-semibold text-cyan-800 underline-offset-2 hover:underline"
                  >
                    Filtreyi kaldır (tüm hareketler)
                  </button>
                </div>
              ) : (
                <p className="mb-2 text-caption text-slate-500">
                  Filtre yok — bu ürünün tüm hareketleri listeleniyor.
                </p>
              )}
              <button
                type="button"
                onClick={clearCustomerFilter}
                className={`w-full rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  !filterCustomer
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Tüm müşteriler
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden p-2">
              <CustomerSearchPanel
                onSelect={selectCustomer}
                selectedCustomerId={filterCustomer?.id}
                accentClass="blue"
                className="h-full border-0 shadow-none"
              />
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="border-b border-slate-100 px-4 py-2.5 text-sm text-slate-600">
              {filterCustomer ? (
                <>
                  <span className="font-medium text-slate-800">{filterCustomer.name}</span>
                  {' '}için bu ürünün geçmiş hareketleri
                </>
              ) : (
                <>Bu ürünün tüm müşterilerdeki stok hareketleri</>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                      Tarih
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                      Müşteri
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                      Fiş
                    </th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase text-slate-500">
                      Yön
                    </th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-slate-500">
                      Adet
                    </th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-slate-500">
                      Birim Fiyat
                    </th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-slate-500">
                      Satır
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                        Yükleniyor...
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-600">
                          {formatDate(row.createdAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="text-sm font-medium text-slate-900">
                            {row.customer.name}
                          </p>
                          <p className="text-caption text-slate-400">{row.customer.code}</p>
                        </td>
                        <td className="px-3 py-2.5 text-sm">
                          <p className="font-medium text-slate-800">{row.invoiceNo}</p>
                          <p className="text-caption text-slate-400">
                            {invoiceTypeLabel(row.invoiceType)}
                            {row.processedBy ? ` · ${row.processedBy}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                              row.direction === 'IN'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-600'
                            }`}
                          >
                            {row.direction === 'IN' ? 'Giriş' : 'Çıkış'}
                          </span>
                          {row.isPreOrder && (
                            <span className="mt-1 block text-caption font-medium text-amber-700">
                              Ön sipariş
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                          {row.quantity}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">
                          {formatMoney(row.unitPrice)}
                          {row.discountPercent > 0 && (
                            <span className="block text-caption text-amber-600">
                              %{row.discountPercent} ind.
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-900">
                          {formatMoney(row.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                        {filterCustomer
                          ? 'Bu müşteri için bu üründe hareket bulunamadı.'
                          : 'Bu ürün için hareket bulunamadı.'}
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
              onPageChange={setPage}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
