import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { API_BASE, formatDate, formatMoney } from '../lib/api';

/**
 * Ürün çöp kutusu.
 *
 * Silinen ürün kaydı DURUR: geçmiş faturalar ürüne işaret ediyor ve
 * kayıt gidince o faturalar ürün adını kaybederdi. Buradaki ürünler
 * hiçbir listede, aramada, Excel'de ve fiyat listesinde görünmez —
 * ama faturalarda ve raporlarda aynen okunur.
 *
 * Kalıcı silme yalnızca hiç faturada geçmemiş ürünler için açıktır.
 */

type SilinenUrun = {
  id: number;
  sku: string;
  name: string;
  brand: string | null;
  model: string | null;
  costPrice: number;
  priceUsd: number;
  deletedAt: string | null;
  category: { name: string } | null;
  faturaKalemSayisi: number;
  kaliciSilinebilir: boolean;
};

type Props = {
  onNotify?: (type: 'success' | 'error', message: string) => void;
  onDataChange?: () => void;
};

export default function DeletedProducts({ onNotify, onDataChange }: Props) {
  const [urunler, setUrunler] = useState<SilinenUrun[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemdeId, setIslemdeId] = useState<number | null>(null);

  const notify = useCallback(
    (type: 'success' | 'error', message: string) => onNotify?.(type, message),
    [onNotify]
  );

  const listeyiYukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const cevap = await axios.get(`${API_BASE}/api/products/cop-kutusu`);
      setUrunler(cevap.data.data ?? []);
    } catch {
      notify('error', 'Çöp kutusu yüklenemedi.');
    } finally {
      setYukleniyor(false);
    }
  }, [notify]);

  useEffect(() => {
    void listeyiYukle();
  }, [listeyiYukle]);

  const geriAl = async (urun: SilinenUrun) => {
    setIslemdeId(urun.id);
    try {
      await axios.post(`${API_BASE}/api/products/${urun.id}/geri-al`);
      notify('success', `"${urun.name}" geri alındı.`);
      await listeyiYukle();
      onDataChange?.();
    } catch (hata) {
      const mesaj =
        axios.isAxiosError(hata) && hata.response?.data?.message
          ? hata.response.data.message
          : 'Ürün geri alınamadı.';
      notify('error', mesaj);
    } finally {
      setIslemdeId(null);
    }
  };

  const kaliciSil = async (urun: SilinenUrun) => {
    const onay = window.confirm(
      `"${urun.name}" (${urun.sku}) KALICI olarak silinecek.\n\n` +
        'Bu işlem geri alınamaz. Ürün kartı tamamen kaldırılır.\n\n' +
        'Devam etmek istiyor musunuz?'
    );
    if (!onay) return;

    setIslemdeId(urun.id);
    try {
      await axios.delete(`${API_BASE}/api/products/${urun.id}/kalici-sil`);
      notify('success', `"${urun.name}" kalıcı olarak silindi.`);
      await listeyiYukle();
      onDataChange?.();
    } catch (hata) {
      const mesaj =
        axios.isAxiosError(hata) && hata.response?.data?.message
          ? hata.response.data.message
          : 'Ürün silinemedi.';
      notify('error', mesaj);
    } finally {
      setIslemdeId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Silinen Ürünler</h1>
        <p className="text-sm text-slate-500">
          Buradaki ürünler hiçbir listede, aramada, Excel'de ve fiyat listesinde
          görünmez — geçmiş faturalarda ve raporlarda ise aynen durur.
        </p>
      </div>

      {yukleniyor ? (
        <p className="text-sm text-slate-500">Yükleniyor...</p>
      ) : urunler.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <Trash2 className="mx-auto size-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">Çöp kutusu boş</p>
          <p className="mt-1 text-sm text-slate-500">
            Stok listesinden sildiğiniz ürünler burada birikir.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Ürün
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Kategori
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                  Maliyet ($)
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Silinme
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Fatura geçmişi
                </th>
                <th className="w-44 px-4 py-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {urunler.map((urun) => (
                <tr key={urun.id}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{urun.name}</p>
                    <p className="font-mono text-xs text-slate-500">{urun.sku}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {urun.category?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {formatMoney(urun.costPrice, 'USD')}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {urun.deletedAt ? formatDate(urun.deletedAt) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {urun.faturaKalemSayisi > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        <AlertTriangle className="size-3.5" />
                        {urun.faturaKalemSayisi} fatura kalemi
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">hareket yok</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => geriAl(urun)}
                        disabled={islemdeId === urun.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-50"
                      >
                        <RotateCcw className="size-3.5" />
                        Geri al
                      </button>

                      {urun.kaliciSilinebilir ? (
                        <button
                          type="button"
                          onClick={() => kaliciSil(urun)}
                          disabled={islemdeId === urun.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                          Kalıcı sil
                        </button>
                      ) : (
                        <span
                          className="text-xs text-slate-400"
                          title="Faturada kullanılmış ürün kalıcı silinemez; silinirse o faturalar ürün adını kaybeder."
                        >
                          kalıcı silinemez
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
