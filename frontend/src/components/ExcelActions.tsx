import { useRef, useState } from 'react';
import axios from 'axios';
import { Download, Upload } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { buildExportFilename } from '../lib/exportFilename';

type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

/** Yukleme oncesi on kontrol yaniti (yalnizca stok listesi) */
type OnKontrol = {
  toplamSatir: number;
  guncellenecek: number;
  yeniAcilacak: number;
  adiMevcutOlanYeni: number;
  ornekler: string[];
  dosyaIciMukerrerAd: number;
};

type ExcelActionsProps = {
  exportPath: string;
  importPath: string;
  /**
   * Verilirse dosya once buraya gonderilir ve yalnizca SAYILIR. "Yeni
   * acilacak ama adi mevcut urunle ayni" satir varsa kullaniciya sorulur;
   * vazgecerse yukleme hic baslamaz. 9 ve 11 Eylul 2026'da iki kez
   * yasanan "5.000 urun ikinci kez acildi" olayinin onlemi.
   */
  precheckPath?: string;
  /**
   * Verilirse yukleme ARKA PLANDA calisir: sunucu hemen is numarasi doner,
   * ekran bu yoldan (`<statusPath>/<jobId>`) 2 saniyede bir ilerlemeyi
   * sorar. Cloudflare 100 saniyede yanitsiz baglantiyi kestigi icin
   * 5.000 satirlik yukleme baska turlu "bitti" diyemiyordu (15 Eylul 2026).
   */
  statusPath?: string;
  /**
   * Dosyanın taban adı — ör. "stoklar.xlsx". İndirilirken başına firma
   * kısaltması, sonuna tarih-saat damgası eklenir:
   * `SM-stoklar-20260907-1432.xlsx` (bkz. lib/exportFilename.ts).
   */
  exportFilename: string;
  exportQuery?: Record<string, string>;
  importTimeoutMs?: number;
  onImported?: () => void;
  onNotify?: (type: 'success' | 'error', message: string) => void;
  hint?: string;
};

export default function ExcelActions({
  exportPath,
  importPath,
  precheckPath,
  statusPath,
  exportFilename,
  exportQuery,
  importTimeoutMs = 120_000,
  onImported,
  onNotify,
  hint,
}: ExcelActionsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  /*
   * Yukleme sonucu KALICI kutuda durur. Ust bildirim 4 saniyede kayboluyor;
   * 5.000 satirlik yukleme 1-2 dakika surdugu icin kullanici o an ekrana
   * bakmiyorsa "yuklendi mi?" sorusu cevapsiz kaliyordu (15 Eylul 2026,
   * provada yasandi). Kullanici kapatana ya da yeni yukleme baslayana
   * kadar kalir.
   */
  const [sonuc, setSonuc] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  /** Arka plan isinin ilerlemesi — yalnizca statusPath verildiginde dolar */
  const [ilerleme, setIlerleme] = useState<{ asama: string; islenen: number; toplam: number; sureSn: number } | null>(null);
  const bildir = (type: 'success' | 'error', message: string) => {
    setSonuc({ type, message });
    onNotify?.(type, message);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await axios.get(`${API_BASE}${exportPath}`, {
        params: exportQuery,
        responseType: 'blob',
      });
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = buildExportFilename(exportFilename);
      link.click();
      window.URL.revokeObjectURL(url);
      onNotify?.('success', 'Excel dosyası indirildi.');
    } catch {
      onNotify?.('error', 'Excel indirilemedi.');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setSonuc(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      if (precheckPath) {
        const kontrol = await axios.post<{ success: boolean; data: OnKontrol }>(
          `${API_BASE}${precheckPath}`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' }, timeout: importTimeoutMs }
        );
        const k = kontrol.data.data;
        const uyarilar: string[] = [];
        if (k.adiMevcutOlanYeni > 0) {
          uyarilar.push(
            `${k.adiMevcutOlanYeni} satırın adı sistemde zaten olan bir ürünle AYNI ama Id / StokKodu eşleşmiyor. ` +
              `Bunlar YENİ ÜRÜN olarak ikinci kez açılacak.\n` +
              `Örnek: ${k.ornekler.join(' · ')}\n\n` +
              `Doğru yol: sistemden Excel indir, değişiklikleri onun üstüne işle, Id ve StokKodu dolu hâlde geri yükle.`
          );
        }
        if (k.dosyaIciMukerrerAd > 0) {
          uyarilar.push(`Dosyanın kendi içinde aynı adla birden fazla yazılmış ${k.dosyaIciMukerrerAd} satır var.`);
        }
        if (uyarilar.length > 0) {
          const devam = window.confirm(
            `DİKKAT — ${k.toplamSatir} satır: ${k.guncellenecek} güncellenecek, ${k.yeniAcilacak} yeni açılacak.\n\n` +
              uyarilar.join('\n\n') +
              `\n\nYine de yüklensin mi?`
          );
          if (!devam) {
            bildir('error', 'Excel yüklemesi iptal edildi; hiçbir şey değişmedi.');
            return;
          }
        }
      }

      const response = await axios.post<{
        success: boolean;
        data: ImportResult | { jobId: string };
        message: string;
      }>(`${API_BASE}${importPath}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: importTimeoutMs,
      });

      let result: ImportResult;
      let message: string;
      if (statusPath && 'jobId' in response.data.data) {
        // Arka plan isi: bitene kadar ilerlemeyi sor
        const jobId = response.data.data.jobId;
        /*
         * Durum sorgusu HATAYA DAYANIKLI (16 Eylul 2026 canli olayi): sunucu
         * uzun bir asamada mesgulken sorgu zaman asimina dusuyor ya da
         * Cloudflare 502/504 donuyordu; eski dongu ilk hatada kirilip
         * "Excel yuklenemedi" diyordu — is arkada bitmis oldugu halde.
         * Artik gecici hatalar sayilir ve sorulmaya devam edilir; yalnizca
         * 404 (is kaydi yok: sunucu yeniden basladi) ya da ust uste 30
         * basarisiz sorgu (~1 dk + zaman asimlari) donguyu bitirir.
         */
        let ustUsteHata = 0;
        for (;;) {
          await new Promise((r) => setTimeout(r, 2000));
          let durum;
          try {
            durum = await axios.get<{
              success: boolean;
              data: {
                durum: 'calisiyor' | 'bitti' | 'hata';
                asama: string;
                islenen: number;
                toplam: number;
                sureSn: number;
                sonuc: ImportResult | null;
              };
              message: string | null;
            }>(`${API_BASE}${statusPath}/${jobId}`, { timeout: 20_000 });
            ustUsteHata = 0;
          } catch (sorguHatasi) {
            if (axios.isAxiosError(sorguHatasi) && sorguHatasi.response?.status === 404) {
              throw sorguHatasi;
            }
            ustUsteHata += 1;
            if (ustUsteHata >= 30) throw sorguHatasi;
            setIlerleme((onceki) =>
              onceki ? { ...onceki, asama: `${onceki.asama} · sunucu bekleniyor` } : onceki
            );
            continue;
          }
          const d = durum.data.data;
          setIlerleme({ asama: d.asama, islenen: d.islenen, toplam: d.toplam, sureSn: d.sureSn });
          if (d.durum === 'hata') throw new Error(durum.data.message ?? 'Excel yüklenemedi.');
          if (d.durum === 'bitti' && d.sonuc) {
            result = d.sonuc;
            message = `${durum.data.message ?? 'İçe aktarma tamamlandı.'} (${d.sureSn} sn)`;
            break;
          }
        }
      } else {
        result = response.data.data as ImportResult;
        message = response.data.message || 'İçe aktarma tamamlandı.';
      }
      if (result.errors.length > 0) {
        const preview = result.errors.slice(0, 3).join(' · ');
        message += ` Uyarı: ${preview}${result.errors.length > 3 ? '…' : ''}`;
      }
      bildir('success', message);
      onImported?.();
    } catch (error) {
      const message =
        error instanceof Error && !axios.isAxiosError(error)
          ? error.message
          : axios.isAxiosError(error) && error.response?.status === 404 && statusPath
            ? 'Yükleme kaydı bulunamadı (sunucu yeniden başlamış olabilir). Sonucu listeden doğrulayın.'
          : axios.isAxiosError(error) && error.code === 'ECONNABORTED'
          ? 'Excel yükleme zaman aşımına uğradı. Dosya çok büyük olabilir; bir süre sonra tekrar deneyin.'
          : axios.isAxiosError(error) && error.response?.data?.message
            ? String(error.response.data.message)
            : axios.isAxiosError(error) && error.response?.status === 504
              ? 'Sunucu zaman aşımı (504). Deploy sonrası nginx timeout güncellemesi gerekebilir.'
              : 'Excel yüklenemedi.';
      bildir('error', message);
    } finally {
      setImporting(false);
      setIlerleme(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {exporting ? 'İndiriliyor…' : 'Excel İndir'}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {importing ? 'Yükleniyor…' : 'Excel Yükle'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleImport}
        />
      </div>
      {sonuc ? (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            sonuc.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <span className="flex-1">{sonuc.message}</span>
          <button
            type="button"
            onClick={() => setSonuc(null)}
            className="shrink-0 rounded px-1 text-xs font-semibold opacity-70 hover:opacity-100"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>
      ) : null}
      {importing ? (
        <p className="text-xs text-amber-700">
          {ilerleme
            ? `${ilerleme.asama}${ilerleme.toplam > 0 ? ` · ${ilerleme.islenen.toLocaleString('tr-TR')} / ${ilerleme.toplam.toLocaleString('tr-TR')} satır` : ''} · ${ilerleme.sureSn} sn`
            : 'Yükleniyor… Büyük dosyada birkaç dakika sürebilir; sonuç bittiğinde burada yazar.'}
        </p>
      ) : null}
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
