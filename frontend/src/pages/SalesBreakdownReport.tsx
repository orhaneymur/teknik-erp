import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BarChart3, RotateCcw, Ship, Users } from 'lucide-react';
import { API_BASE, ensureArray, formatMoney } from '../lib/api';
import CustomerNameLink from '../components/CustomerNameLink';

/**
 * Satış Kırılımı — kategori, müşteri, iade ve Çin iade tek ekranda.
 *
 * Dört ayrı rapor sayfası yerine tek sayfa + sekme tercih edildi: hepsi aynı
 * tarih aralığına bakıyor ve kullanıcı genelde birinden diğerine geçiyor.
 * Ayrı sayfalar olsaydı her geçişte tarih yeniden seçilecekti.
 */

type Kirilim = {
  id: number;
  ad: string;
  ek: string | null;
  adet: number;
  ciro: number;
  maliyet: number;
  kar: number;
  faturaSayisi: number;
};

type Rapor = {
  aralik: { from: string; to: string };
  toplam: {
    ciro: number;
    maliyet: number;
    kar: number;
    marjYuzde: number;
    iade: number;
    netCiro: number;
  };
  cinIade: { tutar: number; adet: number };
  kategoriler: Kirilim[];
  musteriler: Kirilim[];
  iadeler: Kirilim[];
};

type Sekme = 'kategori' | 'musteri' | 'iade';

type Props = {
  onNotify?: (type: 'success' | 'error', message: string) => void;
};

function ayBasi() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

function bugun() {
  return new Date().toISOString().split('T')[0];
}

/** Özet kutusu — İşletme Özeti ekranındaki kalıbın aynısı */
function OzetKutu({
  baslik,
  deger,
  alt,
  vurgu,
}: {
  baslik: string;
  deger: string;
  alt?: string;
  vurgu?: 'iyi' | 'kotu';
}) {
  const renk =
    vurgu === 'iyi'
      ? 'text-emerald-700'
      : vurgu === 'kotu'
        ? 'text-red-700'
        : 'text-slate-900';
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
      <p className="text-caption font-medium uppercase tracking-wide text-slate-400">
        {baslik}
      </p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${renk}`}>{deger}</p>
      {alt && <p className="text-caption text-slate-400">{alt}</p>}
    </div>
  );
}

export default function SalesBreakdownReport({ onNotify }: Props) {
  const [from, setFrom] = useState(ayBasi);
  const [to, setTo] = useState(bugun);
  const [sekme, setSekme] = useState<Sekme>('kategori');
  const [data, setData] = useState<Rapor | null>(null);
  const [loading, setLoading] = useState(true);

  const yukle = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get<{ success: boolean; data: Rapor }>(
        `${API_BASE}/api/reports/sales-breakdown`,
        { params: { from, to } }
      );
      if (response.data.success) {
        const d = response.data.data;
        setData({
          ...d,
          kategoriler: ensureArray(d.kategoriler),
          musteriler: ensureArray(d.musteriler),
          iadeler: ensureArray(d.iadeler),
        });
      }
    } catch {
      onNotify?.('error', 'Rapor yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [from, to, onNotify]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const satirlar = useMemo(() => {
    if (!data) return [];
    if (sekme === 'kategori') return data.kategoriler;
    if (sekme === 'musteri') return data.musteriler;
    return data.iadeler;
  }, [data, sekme]);

  const enBuyukCiro = useMemo(
    () => satirlar.reduce((max, row) => Math.max(max, row.ciro), 0),
    [satirlar]
  );

  const sekmeler: Array<{ key: Sekme; label: string; icon: typeof Users }> = [
    { key: 'kategori', label: 'Kategori Bazlı Satış', icon: BarChart3 },
    { key: 'musteri', label: 'Müşteri Bazlı Satış', icon: Users },
    { key: 'iade', label: 'Müşteri Bazlı İade', icon: RotateCcw },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl bg-slate-900 p-2.5 text-white">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="page-title">Satış Kırılımı</h1>
          <p className="text-sm text-slate-500">
            Kategori, müşteri ve iade dağılımı · seçilen tarih aralığı
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="field-label">Başlangıç</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Bitiş</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="field-input"
            />
          </div>
        </div>
      </div>

      {loading && !data ? (
        <p className="py-16 text-center text-sm text-slate-400">Yükleniyor…</p>
      ) : !data ? (
        <p className="py-16 text-center text-sm text-slate-400">Veri yok.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <OzetKutu baslik="Ciro" deger={formatMoney(data.toplam.ciro)} />
            <OzetKutu
              baslik="Kâr"
              deger={formatMoney(data.toplam.kar)}
              alt={`Marj %${data.toplam.marjYuzde.toFixed(1)}`}
              vurgu={data.toplam.kar >= 0 ? 'iyi' : 'kotu'}
            />
            <OzetKutu
              baslik="İade"
              deger={formatMoney(data.toplam.iade)}
              vurgu={data.toplam.iade > 0 ? 'kotu' : undefined}
            />
            <OzetKutu baslik="Net Ciro" deger={formatMoney(data.toplam.netCiro)} />
            <div className="rounded-2xl border border-sky-200/80 bg-sky-50 px-4 py-3 shadow-sm">
              <p className="flex items-center gap-1.5 text-caption font-medium uppercase tracking-wide text-sky-700">
                <Ship className="h-3.5 w-3.5" /> Çin İade
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-sky-900">
                {formatMoney(data.cinIade.tutar)}
              </p>
              <p className="text-caption text-sky-600">{data.cinIade.adet} adet</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {sekmeler.map((item) => {
              const Icon = item.icon;
              const aktif = sekme === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSekme(item.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    aktif
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr className="text-caption uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 text-left font-medium">
                      {sekme === 'kategori' ? 'Kategori' : 'Müşteri'}
                    </th>
                    <th className="px-5 py-3 text-right font-medium">Adet</th>
                    {sekme !== 'iade' && (
                      <th className="px-5 py-3 text-right font-medium">Fatura</th>
                    )}
                    <th className="px-5 py-3 text-right font-medium">
                      {sekme === 'iade' ? 'İade Tutarı' : 'Ciro'}
                    </th>
                    {sekme !== 'iade' && (
                      <>
                        <th className="px-5 py-3 text-right font-medium">Kâr</th>
                        <th className="px-5 py-3 text-right font-medium">Marj</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {satirlar.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                        Bu aralıkta kayıt yok.
                      </td>
                    </tr>
                  ) : (
                    satirlar.map((row) => {
                      const oran = enBuyukCiro > 0 ? (row.ciro / enBuyukCiro) * 100 : 0;
                      const marj = row.ciro > 0 ? (row.kar / row.ciro) * 100 : 0;
                      return (
                        <tr key={`${sekme}-${row.id}`} className="hover:bg-slate-50/60">
                          <td className="px-5 py-3">
                            <div className="text-sm font-medium text-slate-800">
                              {sekme === 'kategori' ? (
                                row.ad
                              ) : (
                                <CustomerNameLink customerId={row.id}>
                                  {row.ad}
                                </CustomerNameLink>
                              )}
                              {row.ek ? (
                                <span className="font-normal text-slate-400">
                                  {' · '}
                                  {row.ek}
                                </span>
                              ) : null}
                            </div>
                            {/* Ciro payını gösteren ince çubuk — sayıyı okumadan
                                sıralamayı görmeyi kolaylaştırır */}
                            <div className="mt-1 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${
                                  sekme === 'iade' ? 'bg-red-400' : 'bg-indigo-500'
                                }`}
                                style={{ width: `${oran}%` }}
                              />
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-600">
                            {row.adet}
                          </td>
                          {sekme !== 'iade' && (
                            <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-600">
                              {row.faturaSayisi || '—'}
                            </td>
                          )}
                          <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-slate-800">
                            {formatMoney(row.ciro)}
                          </td>
                          {sekme !== 'iade' && (
                            <>
                              <td
                                className={`px-5 py-3 text-right text-sm font-semibold tabular-nums ${
                                  row.kar >= 0 ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {formatMoney(row.kar)}
                              </td>
                              <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-500">
                                %{marj.toFixed(1)}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
