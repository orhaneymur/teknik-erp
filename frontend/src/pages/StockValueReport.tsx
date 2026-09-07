import { useEffect, useState } from 'react';
import axios from 'axios';
import { Download, Package } from 'lucide-react';
import { API_BASE, authFetch, formatMoney } from '../lib/api';

type StockValueRow = {
  productId: number;
  sku: string;
  name: string;
  quantity: number;
  costPrice: number;
  priceUsd: number;
  stockValue: number;
  saleValue: number;
};

type ReportData = {
  rows: StockValueRow[];
  totals: {
    totalQuantity: number;
    totalCostValue: number;
    totalSaleValue: number;
  };
};

export default function StockValueReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get<{ success: boolean; data: ReportData }>(`${API_BASE}/api/reports/stock-value`)
      .then((res) => {
        if (res.data.success) setData(res.data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const downloadCsv = () => {
    authFetch(`${API_BASE}/api/reports/stock-value`, {
      headers: { Accept: 'text/csv' },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stok-degeri.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  if (loading) {
    return <p className="py-12 text-center text-slate-400">Yükleniyor...</p>;
  }

  if (!data) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
        Rapor yüklenemedi.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-600 p-2.5 text-white">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="page-title">Stok Değeri Raporu</h1>
            <p className="text-sm text-slate-500">MERKEZ_DEPO · adet × maliyet ($)</p>
          </div>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          CSV İndir
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Toplam Adet</p>
          <p className="text-2xl font-bold">{data.totals.totalQuantity.toLocaleString('tr-TR')}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Maliyet Değeri ($)</p>
          <p className="text-2xl font-bold text-emerald-700">
            {formatMoney(data.totals.totalCostValue)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Toptan Değeri ($)</p>
          <p className="text-2xl font-bold text-indigo-700">
            {formatMoney(data.totals.totalSaleValue)}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[60vh] overflow-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Ürün
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                  Adet
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                  Maliyet
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                  Stok Değeri
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows
                .filter((r) => r.quantity > 0)
                .slice(0, 200)
                .map((row) => (
                  <tr key={row.productId} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2">
                      <p className="text-sm font-medium">{row.name}</p>
                      <p className="text-xs text-slate-400">{row.sku}</p>
                    </td>
                    <td className="px-4 py-2 text-right text-sm">{row.quantity}</td>
                    <td className="px-4 py-2 text-right text-sm">
                      {formatMoney(row.costPrice)}
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold">
                      {formatMoney(row.stockValue)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
