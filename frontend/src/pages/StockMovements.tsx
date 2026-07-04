import { Fragment, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronRight, History, Search } from 'lucide-react';
import PaginationBar from '../components/PaginationBar';
import CustomerNameLink from '../components/CustomerNameLink';
import {
  API_BASE,
  LIST_PAGE_SIZE,
  ensureArray,
  formatDate,
  formatMoney,
  invoiceAmountUsd,
  invoiceTypeLabel,
  type PaginatedListResponse,
} from '../lib/api';
import { depotLabel } from '../lib/depots';

type MovementRow = {
  id: number;
  invoiceId: number;
  invoiceItemId: number;
  product: { id: number; sku: string; name: string; barcode?: string | null };
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
  direction: 'IN' | 'OUT';
  depot: string;
  affectsStock: boolean;
  invoiceNo: string;
  invoiceType: string;
  isPreOrder: boolean;
  paymentMethod: string;
  paymentType: string | null;
  processedBy: string | null;
  exchangeRate: number;
  invoiceTotalTl: number;
  invoiceTotalUsd?: number;
  customer: { id: number; code: string; name: string };
  branch: { id: number; name: string };
  safe: { id: number; name: string } | null;
  createdAt: string;
};

export default function StockMovements() {
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const trimmedSearch = search.trim();
  const hasQuery = trimmedSearch.length > 0;

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [trimmedSearch]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!hasQuery) {
      setRows([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.get<PaginatedListResponse<MovementRow>>(
          `${API_BASE}/api/reports/stock-history`,
          {
            params: {
              page,
              limit: LIST_PAGE_SIZE,
              search: trimmedSearch,
            },
          }
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
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [page, hasQuery, trimmedSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-cyan-600 p-2.5 text-white">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h1 className="page-title">Stok Hareketleri</h1>
            <p className="text-sm text-slate-500">
              Stok numarası veya ürün adıyla arayın — satış, alış ve iade hareketleri
            </p>
          </div>
        </div>

        <div className="relative w-full sm:w-[28rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Stok no (SKU) veya stok adı..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-cyan-500 focus:ring-cyan-500"
            autoComplete="off"
          />
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {!hasQuery && (
          <div className="px-4 py-16 text-center">
            <Search className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              Hareket görmek için arama yapın
            </p>
            <p className="mt-1 text-caption text-slate-400">
              Stok numarası veya ürün adının bir kısmını yazın
            </p>
          </div>
        )}

        {hasQuery && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-8 px-2 py-3" />
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      Tarih
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      Stok No
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      Stok Adı
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      Müşteri / Fiş
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-slate-500">
                      Yön
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                      Adet
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                      Birim
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                      Toplam
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                        Yükleniyor...
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    rows.map((row) => {
                      const expanded = expandedId === row.id;
                      return (
                        <Fragment key={row.id}>
                          <tr
                            className="cursor-pointer hover:bg-slate-50/60"
                            onClick={() => setExpandedId(expanded ? null : row.id)}
                          >
                            <td className="px-2 py-3 text-slate-400">
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                              {formatDate(row.createdAt)}
                            </td>
                            <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-800">
                              {row.product.sku}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-900">
                              {row.product.name}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <CustomerNameLink customerId={row.customer.id}>
                                {row.customer.name}
                              </CustomerNameLink>
                              <p className="text-xs text-slate-400">
                                {row.invoiceNo} · {invoiceTypeLabel(row.invoiceType)}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-center">
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
                            <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
                              {row.quantity}
                            </td>
                            <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-700">
                              {formatMoney(row.unitPrice)}
                              {row.discountPercent > 0 && (
                                <span className="block text-caption text-amber-600">
                                  %{row.discountPercent} ind.
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                              {formatMoney(row.lineTotal)}
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-cyan-50/40">
                              <td colSpan={9} className="px-6 py-4">
                                <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
                                  <Detail label="Müşteri kodu" value={row.customer.code} />
                                  <Detail label="Kim işledi" value={row.processedBy || '—'} />
                                  <Detail label="Ödeme" value={row.paymentMethod} />
                                  <Detail label="Ödeme tipi" value={row.paymentType || '—'} />
                                  <Detail label="Şube" value={row.branch.name} />
                                  <Detail label="Kasa" value={row.safe?.name || '—'} />
                                  <Detail label="Depo" value={depotLabel(row.depot)} />
                                  <Detail
                                    label="Fatura toplamı ($)"
                                    value={formatMoney(
                                      row.invoiceTotalUsd ??
                                        invoiceAmountUsd({
                                          totalAmountTl: row.invoiceTotalTl,
                                          exchangeRate: row.exchangeRate,
                                        })
                                    )}
                                  />
                                  {row.product.barcode && (
                                    <Detail label="Barkod" value={row.product.barcode} />
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                        Bu arama için hareket bulunamadı.
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
          </>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-caption font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="font-medium text-slate-800">{value}</p>
    </div>
  );
}
