import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Package,
  Receipt,
  RotateCcw,
  Ship,
  Users,
} from 'lucide-react';
import { API_BASE, ensureArray, formatDate, formatMoney, yerelGunDizgisi } from '../lib/api';
import CustomerNameLink from '../components/CustomerNameLink';
import InvoiceDetailModal from '../components/InvoiceDetailModal';

/**
 * Satış Kırılımı — kategori, müşteri, ürün, fiş listesi, iade ve Çin iade
 * tek ekranda.
 *
 * Ayrı rapor sayfaları yerine tek sayfa + sekme tercih edildi: hepsi aynı
 * tarih aralığına bakıyor ve kullanıcı genelde birinden diğerine geçiyor.
 * Ayrı sayfalar olsaydı her geçişte tarih yeniden seçilecekti.
 *
 * "Ürün Bazlı" ve "Satış Fişleri" sekmeleri müşteri isteğiyle eklendi
 * (15 Eylül 2026): "tarih aralığında satılan tüm ürünler, yapılan satışlar,
 * satış yapılan ürünler sırayla". Fiş listesi kayıt sırasıyladır; satır
 * açılınca fişin kalemleri girildiği sırada görünür.
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
  /** Yalnızca ürün sekmesinde: aynı aralıkta iade edilen adet */
  iadeAdet?: number;
};

type SatisKalemi = {
  productId: number;
  sku: string;
  ad: string;
  adet: number;
  birimFiyat: number;
  tutar: number;
};

type Satis = {
  id: number;
  fisNo: string;
  tarih: string;
  musteri: { id: number; ad: string } | null;
  odeme: string;
  satici: string | null;
  kalemler: SatisKalemi[];
  adet: number;
  tutar: number;
  maliyet: number;
  kar: number;
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
  urunler: Kirilim[];
  iadeler: Kirilim[];
  satislar: Satis[];
  fisSayisi: number;
};

type Sekme = 'kategori' | 'musteri' | 'urun' | 'fis' | 'iade';

/** Ürün sekmesi sıralaması — ciro varsayılan, adet de seçilebilir */
type UrunSira = 'ciro' | 'adet' | 'kar';

type Props = {
  onNotify?: (type: 'success' | 'error', message: string) => void;
};

function ayBasi() {
  const now = new Date();
  return yerelGunDizgisi(new Date(now.getFullYear(), now.getMonth(), 1));
}

function bugun() {
  return yerelGunDizgisi();
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

const TH = 'px-5 py-3 font-medium';

export default function SalesBreakdownReport({ onNotify }: Props) {
  const [from, setFrom] = useState(ayBasi);
  const [to, setTo] = useState(bugun);
  const [sekme, setSekme] = useState<Sekme>('kategori');
  const [urunSira, setUrunSira] = useState<UrunSira>('ciro');
  const [data, setData] = useState<Rapor | null>(null);
  const [loading, setLoading] = useState(true);
  const [acikFisler, setAcikFisler] = useState<Set<number>>(new Set());
  const [gosterilenFis, setGosterilenFis] = useState<number | null>(null);

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
          urunler: ensureArray(d.urunler),
          iadeler: ensureArray(d.iadeler),
          satislar: ensureArray(d.satislar),
        });
        setAcikFisler(new Set());
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
    if (sekme === 'urun') {
      // Sunucu ciroya göre sıralı gönderir; adet/kâr burada seçilir
      if (urunSira === 'ciro') return data.urunler;
      return [...data.urunler].sort((a, b) => b[urunSira] - a[urunSira]);
    }
    return data.iadeler;
  }, [data, sekme, urunSira]);

  const enBuyukCiro = useMemo(
    () => satirlar.reduce((max, row) => Math.max(max, row.ciro), 0),
    [satirlar]
  );

  const toplamAdet = useMemo(
    () => satirlar.reduce((t, row) => t + row.adet, 0),
    [satirlar]
  );

  const fisAcKapat = (id: number) => {
    setAcikFisler((onceki) => {
      const yeni = new Set(onceki);
      if (yeni.has(id)) yeni.delete(id);
      else yeni.add(id);
      return yeni;
    });
  };

  const hepsiniAcKapat = () => {
    if (!data) return;
    setAcikFisler((onceki) =>
      onceki.size === data.satislar.length
        ? new Set()
        : new Set(data.satislar.map((f) => f.id))
    );
  };

  const sekmeler: Array<{ key: Sekme; label: string; icon: typeof Users }> = [
    { key: 'kategori', label: 'Kategori Bazlı', icon: BarChart3 },
    { key: 'musteri', label: 'Müşteri Bazlı', icon: Users },
    { key: 'urun', label: 'Ürün Bazlı', icon: Package },
    { key: 'fis', label: 'Satış Fişleri', icon: Receipt },
    { key: 'iade', label: 'Müşteri Bazlı İade', icon: RotateCcw },
  ];

  const ilkSutunBasligi =
    sekme === 'kategori' ? 'Kategori' : sekme === 'urun' ? 'Ürün' : 'Müşteri';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl bg-slate-900 p-2.5 text-white">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="page-title">Satış Kırılımı</h1>
          <p className="text-sm text-slate-500">
            Kategori, müşteri, ürün, fiş ve iade dağılımı · seçilen tarih aralığı ·
            teslim bekleyen ön siparişler dahil değildir
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <OzetKutu
              baslik="Ciro"
              deger={formatMoney(data.toplam.ciro)}
              alt={`${data.fisSayisi} fiş · ${data.urunler.length} çeşit ürün`}
            />
            <OzetKutu
              baslik="Kâr"
              deger={formatMoney(data.toplam.kar)}
              alt={`Marj %${data.toplam.marjYuzde.toFixed(1)}`}
              vurgu={data.toplam.kar >= 0 ? 'iyi' : 'kotu'}
            />
            <OzetKutu
              baslik="Satılan adet"
              deger={String(data.urunler.reduce((t, u) => t + u.adet, 0))}
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

          <div className="flex flex-wrap items-center gap-1.5">
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

            {sekme === 'urun' && (
              <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
                <span>Sırala:</span>
                <select
                  value={urunSira}
                  onChange={(e) => setUrunSira(e.target.value as UrunSira)}
                  className="field-input py-1"
                >
                  <option value="ciro">Ciroya göre</option>
                  <option value="adet">Adede göre</option>
                  <option value="kar">Kâra göre</option>
                </select>
              </div>
            )}

            {sekme === 'fis' && data.satislar.length > 0 && (
              <button
                type="button"
                onClick={hepsiniAcKapat}
                className="ml-auto text-sm font-medium text-indigo-600 hover:underline"
              >
                {acikFisler.size === data.satislar.length
                  ? 'Kalemleri gizle'
                  : 'Tüm kalemleri göster'}
              </button>
            )}
          </div>

          {sekme === 'fis' ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead className="border-b border-slate-100 bg-slate-50/60">
                    <tr className="text-caption uppercase tracking-wide text-slate-400">
                      <th className={`${TH} w-8`} />
                      <th className={`${TH} text-left`}>Tarih</th>
                      <th className={`${TH} text-left`}>Fiş No</th>
                      <th className={`${TH} text-left`}>Müşteri</th>
                      <th className={`${TH} text-left`}>Ödeme</th>
                      <th className={`${TH} text-left`}>Satan</th>
                      <th className={`${TH} text-right`}>Kalem</th>
                      <th className={`${TH} text-right`}>Adet</th>
                      <th className={`${TH} text-right`}>Tutar</th>
                      <th className={`${TH} text-right`}>Kâr</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.satislar.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-sm text-slate-400">
                          Bu aralıkta satış yok.
                        </td>
                      </tr>
                    ) : (
                      data.satislar.map((fis) => {
                        const acik = acikFisler.has(fis.id);
                        return [
                          <tr
                            key={`fis-${fis.id}`}
                            className="cursor-pointer hover:bg-slate-50/60"
                            onClick={() => fisAcKapat(fis.id)}
                          >
                            <td className="px-3 py-3 text-slate-400">
                              {acik ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </td>
                            <td className="px-5 py-3 text-sm tabular-nums text-slate-600">
                              {formatDate(fis.tarih)}
                            </td>
                            <td className="px-5 py-3 text-sm">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGosterilenFis(fis.id);
                                }}
                                className="font-medium text-indigo-600 hover:underline"
                              >
                                {fis.fisNo}
                              </button>
                            </td>
                            <td className="px-5 py-3 text-sm text-slate-800">
                              {fis.musteri ? (
                                <CustomerNameLink customerId={fis.musteri.id}>
                                  {fis.musteri.ad}
                                </CustomerNameLink>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-5 py-3 text-sm text-slate-600">{fis.odeme}</td>
                            <td className="px-5 py-3 text-sm text-slate-600">
                              {fis.satici || '—'}
                            </td>
                            <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-600">
                              {fis.kalemler.length}
                            </td>
                            <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-600">
                              {fis.adet}
                            </td>
                            <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-slate-800">
                              {formatMoney(fis.tutar)}
                            </td>
                            <td
                              className={`px-5 py-3 text-right text-sm font-semibold tabular-nums ${
                                fis.kar >= 0 ? 'text-emerald-700' : 'text-red-700'
                              }`}
                            >
                              {formatMoney(fis.kar)}
                            </td>
                          </tr>,
                          acik ? (
                            <tr key={`fis-${fis.id}-kalemler`} className="bg-slate-50/50">
                              <td />
                              <td colSpan={9} className="px-5 pb-3 pt-1">
                                <table className="w-full">
                                  <tbody>
                                    {fis.kalemler.map((k, i) => (
                                      <tr key={`${fis.id}-${i}`} className="text-sm">
                                        <td className="w-8 py-1 text-slate-400">{i + 1}.</td>
                                        <td className="py-1 text-slate-700">
                                          {k.ad}
                                          {k.sku && (
                                            <span className="text-slate-400">
                                              {' · '}
                                              {k.sku}
                                            </span>
                                          )}
                                        </td>
                                        <td className="w-24 py-1 text-right tabular-nums text-slate-600">
                                          {k.adet} adet
                                        </td>
                                        <td className="w-28 py-1 text-right tabular-nums text-slate-500">
                                          {formatMoney(k.birimFiyat)}
                                        </td>
                                        <td className="w-28 py-1 text-right font-medium tabular-nums text-slate-800">
                                          {formatMoney(k.tutar)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          ) : null,
                        ];
                      })
                    )}
                  </tbody>
                  {data.satislar.length > 0 && (
                    <tfoot className="border-t border-slate-200 bg-slate-50/60 text-sm font-semibold">
                      <tr>
                        <td colSpan={6} className="px-5 py-3 text-slate-600">
                          {data.satislar.length} fiş
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                          {data.satislar.reduce((t, f) => t + f.kalemler.length, 0)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                          {data.satislar.reduce((t, f) => t + f.adet, 0)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-slate-900">
                          {formatMoney(data.toplam.ciro)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-emerald-700">
                          {formatMoney(data.toplam.kar)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="border-b border-slate-100 bg-slate-50/60">
                    <tr className="text-caption uppercase tracking-wide text-slate-400">
                      <th className={`${TH} text-left`}>{ilkSutunBasligi}</th>
                      <th className={`${TH} text-right`}>Adet</th>
                      {sekme === 'urun' && <th className={`${TH} text-right`}>İade</th>}
                      {sekme !== 'iade' && <th className={`${TH} text-right`}>Fiş</th>}
                      <th className={`${TH} text-right`}>
                        {sekme === 'iade' ? 'İade Tutarı' : 'Ciro'}
                      </th>
                      {sekme !== 'iade' && (
                        <>
                          <th className={`${TH} text-right`}>Kâr</th>
                          <th className={`${TH} text-right`}>Marj</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {satirlar.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
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
                                {sekme === 'kategori' || sekme === 'urun' ? (
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
                            {sekme === 'urun' && (
                              <td className="px-5 py-3 text-right text-sm tabular-nums text-red-600">
                                {row.iadeAdet ? row.iadeAdet : '—'}
                              </td>
                            )}
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
                  {satirlar.length > 0 && (
                    <tfoot className="border-t border-slate-200 bg-slate-50/60 text-sm font-semibold">
                      <tr>
                        <td className="px-5 py-3 text-slate-600">{satirlar.length} satır</td>
                        <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                          {toplamAdet}
                        </td>
                        {sekme === 'urun' && (
                          <td className="px-5 py-3 text-right tabular-nums text-red-600">
                            {satirlar.reduce((t, r) => t + (r.iadeAdet ?? 0), 0) || '—'}
                          </td>
                        )}
                        {sekme !== 'iade' && <td />}
                        <td className="px-5 py-3 text-right tabular-nums text-slate-900">
                          {formatMoney(satirlar.reduce((t, r) => t + r.ciro, 0))}
                        </td>
                        {sekme !== 'iade' && (
                          <>
                            <td className="px-5 py-3 text-right tabular-nums text-emerald-700">
                              {formatMoney(satirlar.reduce((t, r) => t + r.kar, 0))}
                            </td>
                            <td />
                          </>
                        )}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <InvoiceDetailModal invoiceId={gosterilenFis} onClose={() => setGosterilenFis(null)} />
    </div>
  );
}
