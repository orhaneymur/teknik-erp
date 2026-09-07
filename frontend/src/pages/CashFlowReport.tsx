import { useEffect, useState } from 'react';
import axios from 'axios';
import { Download, Wallet } from 'lucide-react';
import { API_BASE, authFetch, formatDate, formatMoney } from '../lib/api';

type Transaction = {
  id: number;
  type: 'GIRIS' | 'CIKIS';
  amount: number;
  description: string;
  createdAt: string;
  safe: { name: string; currency: string };
  customer: { code: string; name: string } | null;
};

type CashFlowData = {
  from: string;
  to: string;
  summary: { totalIn: number; totalOut: number; net: number };
  transactions: Transaction[];
};

export default function CashFlowReport() {
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    setLoading(true);
    axios
      .get<{ success: boolean; data: CashFlowData }>(
        `${API_BASE}/api/reports/cash-flow`,
        { params: { from, to } }
      )
      .then((res) => {
        if (res.data.success) setData(res.data.data);
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  const downloadCsv = () => {
    authFetch(`${API_BASE}/api/reports/cash-flow?from=${from}&to=${to}`, {
      headers: { Accept: 'text/csv' },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kasa-raporu.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-600 p-2.5 text-white">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="page-title">Kasa Giriş-Çıkış Raporu</h1>
            <p className="text-sm text-slate-500">Dönemsel kasa hareketleri</p>
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

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Başlangıç</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Bitiş</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs text-emerald-600">Toplam Giriş</p>
            <p className="text-xl font-bold text-emerald-800">
              {formatMoney(data.summary.totalIn)}
            </p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs text-red-600">Toplam Çıkış</p>
            <p className="text-xl font-bold text-red-800">
              {formatMoney(data.summary.totalOut)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Net</p>
            <p className="text-xl font-bold">{formatMoney(data.summary.net)}</p>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="py-12 text-center text-slate-400">Yükleniyor...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    Tarih
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    Açıklama
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    Kasa
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                    Tutar
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDate(tx.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm">{tx.description}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{tx.safe.name}</td>
                    <td
                      className={`px-4 py-3 text-right text-sm font-semibold ${
                        tx.type === 'GIRIS' ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {tx.type === 'GIRIS' ? '+' : '-'}
                      {formatMoney(tx.amount, tx.safe.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
