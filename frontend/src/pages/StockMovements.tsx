import { Fragment, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronRight, History, Package, Search } from 'lucide-react';
import PaginationBar from '../components/PaginationBar';
import CustomerNameLink from '../components/CustomerNameLink';
import InvoiceDetailModal from '../components/InvoiceDetailModal';
import { openInvoiceEditorInNewTab } from '../lib/navigation';
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

type StokOzetiSatiri = {
  id: number;
  sku: string;
  name: string;
  merkez: number;
  cinIade: number;
};

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
  /** Aramaya uyan urunlerin MEVCUT stogu — hareket listesinin ustundeki serit */
  const [stokOzeti, setStokOzeti] = useState<StokOzetiSatiri[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<number | null>(null);
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
      setStokOzeti([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.get<
          PaginatedListResponse<MovementRow> & { stokOzeti?: StokOzetiSatiri[] }
        >(
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
          setStokOzeti(ensureArray(res.data.stokOzeti));
          setTotalCount(res.data.totalCount);
        } else {
          setRows([]);
          setStokOzeti([]);
          setTotalCount(0);
        }
      } catch {
        setRows([]);
        setStokOzeti([]);
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

      {/* Mevcut stok seridi — hareketleri gorurken stok listesine gitmeye gerek kalmasin
          (musteri istegi, 16 Eylul 2026). Liste ve arama aynen; yalnizca bu serit eklendi. */}
      {hasQuery && stokOzeti.length > 0 && (
        <section className="rounded-xl border border-cyan-200 bg-cyan-50/60 px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-cyan-800">
            <Package className="h-3.5 w-3.5" /> Mevcut stok
          </p>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {stokOzeti.map((u) => (
              <li key={u.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-slate-700">
                  <span className="font-mono text-caption text-slate-500">{u.sku}</span>{' '}
                  {u.name}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span
                    className={`font-bold ${
                      u.merkez <= 0 ? 'text-red-600' : u.merkez <= 5 ? 'text-amber-600' : 'text-slate-900'
                    }`}
                  >
                    {u.merkez} adet
                  </span>
                  {u.cinIade > 0 && (
                    <span className="ml-2 text-caption text-sky-700">Çin iade: {u.cinIade}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {stokOzeti.length >= 12 && (
            <p className="mt-1 text-caption text-slate-500">
              İlk 12 ürün gösteriliyor — daha kesin sonuç için aramayı daraltın.
            </p>
          )}
        </section>
      )}

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
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingInvoiceId(row.invoiceId);
                                  }}
                                  className="font-medium text-cyan-800 underline-offset-2 hover:underline"
                                  title="Fiş içeriğini görüntüle / düzenle"
                                >
                                  {row.invoiceNo}
                                </button>
                                {' · '}
                                {invoiceTypeLabel(row.invoiceType)}
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

      <InvoiceDetailModal
        invoiceId={viewingInvoiceId}
        onClose={() => setViewingInvoiceId(null)}
        // "Duzenle": fis yeni sekmede duzenleme ekraninda acilir; arama
        // sonucu bu sekmede kalir (musteri istegi, 16 Eylul 2026)
        onEdit={(inv) => {
          setViewingInvoiceId(null);
          openInvoiceEditorInNewTab(inv.id);
        }}
      />
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
