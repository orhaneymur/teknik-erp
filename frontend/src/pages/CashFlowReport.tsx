import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Download, Info, Wallet } from 'lucide-react';
import {
  API_BASE,
  authFetch,
  ensureArray,
  formatDate,
  formatMoney,
  yerelGunDizgisi,
} from '../lib/api';
import CustomerNameLink from '../components/CustomerNameLink';

/**
 * Kasa Raporu — kasaya FİİLEN giren ve çıkan para.
 *
 * Müşteri "Toplam giriş / toplam çıkış neye göre?" diye sordu (15 Eylül
 * 2026). Cevap ekranın üstünde yazılı; ayrıca her hareket kaynağına göre
 * gruplanıp gösteriliyor (satış tahsilatı, cari tahsilat, alış ödemesi...)
 * ve kasa başına dönem giriş/çıkışı ile güncel bakiye ayrı tabloda.
 * Sınıflandırma sunucuda yapılır (`hareketKaynagi`), burada yalnızca
 * gösterilir.
 */

type Kaynak =
  | 'SATIS_TAHSILAT'
  | 'CARI_TAHSILAT'
  | 'ALIS_ODEME'
  | 'IADE_ODEME'
  | 'CARI_ODEME'
  | 'IPTAL'
  | 'DUZENLEME'
  | 'ACILIS'
  | 'DIGER';

type Transaction = {
  id: number;
  type: 'GIRIS' | 'CIKIS';
  amount: number;
  description: string;
  createdAt: string;
  receiptNo: string | null;
  kaynak: Kaynak;
  safe: { id: number; name: string; currency: string };
  customer: { id: number; code: string; name: string } | null;
};

type KaynakOzeti = {
  kaynak: Kaynak;
  etiket: string;
  giris: number;
  cikis: number;
  adet: number;
};

type KasaOzeti = {
  id: number;
  ad: string;
  paraBirimi: string;
  bakiye: number;
  giris: number;
  cikis: number;
  net: number;
  adet: number;
};

type CashFlowData = {
  from: string;
  to: string;
  summary: { totalIn: number; totalOut: number; net: number };
  kaynaklar: KaynakOzeti[];
  kasalar: KasaOzeti[];
  transactions: Transaction[];
};

type TipSuzgeci = 'HEPSI' | 'GIRIS' | 'CIKIS';

const TH = 'px-4 py-3 text-xs font-semibold uppercase text-slate-500';

export default function CashFlowReport() {
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return yerelGunDizgisi(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [to, setTo] = useState(() => yerelGunDizgisi());
  const [kasaId, setKasaId] = useState<number | ''>('');
  const [tip, setTip] = useState<TipSuzgeci>('HEPSI');
  const [kaynak, setKaynak] = useState<Kaynak | ''>('');

  useEffect(() => {
    setLoading(true);
    axios
      .get<{ success: boolean; data: CashFlowData }>(
        `${API_BASE}/api/reports/cash-flow`,
        { params: { from, to, ...(kasaId ? { safeId: kasaId } : {}) } }
      )
      .then((res) => {
        if (res.data.success) {
          const d = res.data.data;
          setData({
            ...d,
            kaynaklar: ensureArray(d.kaynaklar),
            kasalar: ensureArray(d.kasalar),
            transactions: ensureArray(d.transactions),
          });
        }
      })
      .finally(() => setLoading(false));
  }, [from, to, kasaId]);

  /** Tip ve kaynak süzgeci ekranda uygulanır — sunucu dönemi bir kez verir */
  const gorunenHareketler = useMemo(() => {
    if (!data) return [];
    return data.transactions.filter(
      (tx) => (tip === 'HEPSI' || tx.type === tip) && (!kaynak || tx.kaynak === kaynak)
    );
  }, [data, tip, kaynak]);

  const gorunenToplam = useMemo(
    () =>
      gorunenHareketler.reduce(
        (acc, tx) => {
          if (tx.type === 'GIRIS') acc.giris += tx.amount;
          else acc.cikis += tx.amount;
          return acc;
        },
        { giris: 0, cikis: 0 }
      ),
    [gorunenHareketler]
  );

  const downloadCsv = () => {
    const kasaParam = kasaId ? `&safeId=${kasaId}` : '';
    authFetch(`${API_BASE}/api/reports/cash-flow?from=${from}&to=${to}${kasaParam}`, {
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

  const kaynakEtiketi = (k: Kaynak) =>
    data?.kaynaklar.find((x) => x.kaynak === k)?.etiket ?? k;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-600 p-2.5 text-white">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="page-title">Kasa Raporu</h1>
            <p className="text-sm text-slate-500">Kasaya giren ve çıkan para · seçilen dönem</p>
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

      {/* KASADA SU AN — en buyuk rakam; musteri "kasamda ne kadar para var?" diye
          sordu (16 Eylul 2026). Kasasiz cari kayitlari buraya hic girmez. */}
      {data && (
        <section className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-white px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-caption font-semibold uppercase tracking-wide text-emerald-700">
                Kasada şu an
              </p>
              <p className="text-3xl font-black tabular-nums text-emerald-900">
                {formatMoney(data.kasalar.reduce((t, k) => t + k.bakiye, 0))}
              </p>
              {data.kasalar.length > 1 && (
                <p className="mt-1 text-caption text-slate-500">
                  {data.kasalar.map((k) => `${k.ad}: ${formatMoney(k.bakiye)}`).join(' · ')}
                </p>
              )}
            </div>
            <div className="flex gap-3 text-sm">
              <div className="rounded-lg bg-white/80 px-3 py-2 text-right">
                <p className="text-caption text-slate-500">Dönemde giren</p>
                <p className="font-bold tabular-nums text-emerald-700">{formatMoney(data.summary.totalIn)}</p>
              </div>
              <div className="rounded-lg bg-white/80 px-3 py-2 text-right">
                <p className="text-caption text-slate-500">Dönemde çıkan</p>
                <p className="font-bold tabular-nums text-red-600">{formatMoney(data.summary.totalOut)}</p>
              </div>
              <div className="rounded-lg bg-white/80 px-3 py-2 text-right">
                <p className="text-caption text-slate-500">Net</p>
                <p className={`font-bold tabular-nums ${data.summary.net >= 0 ? 'text-slate-900' : 'text-red-700'}`}>
                  {formatMoney(data.summary.net)}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
        <p>
          Buradaki her rakam kasaya <strong>fiilen giren-çıkan para</strong>dır: nakit/kart
          satış ve cari tahsilat girer; alış ödemesi, iade ödemesi ve cari ödeme çıkar.
          Cari (veresiye) satış ve <strong>kasasız cari kayıtları</strong> buraya girmez.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
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
        {data && data.kasalar.length > 1 && (
          <div>
            <label className="mb-1 block text-xs text-slate-500">Kasa</label>
            <select
              value={kasaId}
              onChange={(e) => setKasaId(e.target.value ? Number(e.target.value) : '')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Tüm kasalar</option>
              {data.kasalar.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ad}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-slate-500">Tip</label>
          <select
            value={tip}
            onChange={(e) => setTip(e.target.value as TipSuzgeci)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="HEPSI">Giriş + Çıkış</option>
            <option value="GIRIS">Yalnızca giriş</option>
            <option value="CIKIS">Yalnızca çıkış</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Kaynak</label>
          <select
            value={kaynak}
            onChange={(e) => setKaynak(e.target.value as Kaynak | '')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Tümü</option>
            {data?.kaynaklar.map((k) => (
              <option key={k.kaynak} value={k.kaynak}>
                {k.etiket}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Kaynak bazlı: para NEDEN girdi/çıktı */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Kaynağa göre</h2>
              <p className="text-caption text-slate-400">Para neden girdi, neden çıktı</p>
            </div>
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className={`${TH} text-left`}>Kaynak</th>
                  <th className={`${TH} text-right`}>Hareket</th>
                  <th className={`${TH} text-right`}>Giriş</th>
                  <th className={`${TH} text-right`}>Çıkış</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.kaynaklar.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm text-slate-400">
                      Bu dönemde hareket yok.
                    </td>
                  </tr>
                ) : (
                  data.kaynaklar.map((k) => (
                    <tr
                      key={k.kaynak}
                      className={`cursor-pointer hover:bg-slate-50/60 ${
                        kaynak === k.kaynak ? 'bg-indigo-50/60' : ''
                      }`}
                      onClick={() => setKaynak(kaynak === k.kaynak ? '' : k.kaynak)}
                      title="Tıklayınca aşağıdaki liste bu kaynağa süzülür"
                    >
                      <td className="px-4 py-2.5 text-sm text-slate-800">{k.etiket}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-500">
                        {k.adet}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-emerald-700">
                        {k.giris > 0 ? formatMoney(k.giris) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-red-600">
                        {k.cikis > 0 ? formatMoney(k.cikis) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {/* Kasa bazlı: dönem hareketi + bugünkü bakiye — tek kasada gereksiz */}
          {data.kasalar.length > 1 && (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Kasaya göre</h2>
              <p className="text-caption text-slate-400">
                Dönem giriş / çıkışı ve kasanın bugünkü bakiyesi
              </p>
            </div>
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className={`${TH} text-left`}>Kasa</th>
                  <th className={`${TH} text-right`}>Giriş</th>
                  <th className={`${TH} text-right`}>Çıkış</th>
                  <th className={`${TH} text-right`}>Net</th>
                  <th className={`${TH} text-right`}>Bakiye (bugün)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.kasalar.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-sm text-slate-800">{k.ad}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-emerald-700">
                      {formatMoney(k.giris)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-red-600">
                      {formatMoney(k.cikis)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right text-sm font-medium tabular-nums ${
                        k.net >= 0 ? 'text-slate-800' : 'text-red-700'
                      }`}
                    >
                      {formatMoney(k.net)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right text-sm font-bold tabular-nums ${
                        k.bakiye >= 0 ? 'text-slate-900' : 'text-red-700'
                      }`}
                    >
                      {formatMoney(k.bakiye)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Hareketler</h2>
            <p className="text-caption text-slate-400">
              {gorunenHareketler.length} hareket
              {kaynak ? ` · ${kaynakEtiketi(kaynak)}` : ''}
              {tip !== 'HEPSI' ? (tip === 'GIRIS' ? ' · yalnızca giriş' : ' · yalnızca çıkış') : ''}
            </p>
          </div>
          {(kaynak || tip !== 'HEPSI') && (
            <button
              type="button"
              onClick={() => {
                setKaynak('');
                setTip('HEPSI');
              }}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              Süzgeci kaldır
            </button>
          )}
        </div>
        {loading ? (
          <p className="py-12 text-center text-slate-400">Yükleniyor...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className={`${TH} text-left`}>Tarih</th>
                  <th className={`${TH} text-left`}>Tip</th>
                  <th className={`${TH} text-left`}>Kaynak</th>
                  <th className={`${TH} text-left`}>Açıklama</th>
                  <th className={`${TH} text-left`}>Müşteri</th>
                  <th className={`${TH} text-left`}>Kasa</th>
                  <th className={`${TH} text-right`}>Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gorunenHareketler.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                      Bu dönemde hareket yok.
                    </td>
                  </tr>
                ) : (
                  gorunenHareketler.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-sm tabular-nums text-slate-600">
                        {formatDate(tx.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                            tx.type === 'GIRIS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {tx.type === 'GIRIS' ? 'Giriş' : 'Çıkış'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {kaynakEtiketi(tx.kaynak)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {tx.description}
                        {tx.receiptNo && (
                          <span className="text-slate-400">
                            {' · '}
                            {tx.receiptNo}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {tx.customer ? (
                          <CustomerNameLink customerId={tx.customer.id}>
                            {tx.customer.name}
                          </CustomerNameLink>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{tx.safe.name}</td>
                      <td
                        className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${
                          tx.type === 'GIRIS' ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {tx.type === 'GIRIS' ? '+' : '-'}
                        {formatMoney(tx.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {gorunenHareketler.length > 0 && (
                <tfoot className="border-t border-slate-200 bg-slate-50/60 text-sm font-semibold">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-slate-600">
                      Giriş {formatMoney(gorunenToplam.giris)} · Çıkış{' '}
                      {formatMoney(gorunenToplam.cikis)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        gorunenToplam.giris - gorunenToplam.cikis >= 0
                          ? 'text-slate-900'
                          : 'text-red-700'
                      }`}
                    >
                      {formatMoney(gorunenToplam.giris - gorunenToplam.cikis)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
