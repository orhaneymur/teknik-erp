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
            onNotify?.('error', 'Excel yüklemesi iptal edildi; hiçbir şey değişmedi.');
            return;
          }
        }
      }

      const response = await axios.post<{ success: boolean; data: ImportResult; message: string }>(
        `${API_BASE}${importPath}`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: importTimeoutMs,
        }
      );

      const result = response.data.data;
      let message = response.data.message || 'İçe aktarma tamamlandı.';
      if (result.errors.length > 0) {
        const preview = result.errors.slice(0, 3).join(' · ');
        message += ` Uyarı: ${preview}${result.errors.length > 3 ? '…' : ''}`;
      }
      onNotify?.('success', message);
      onImported?.();
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.code === 'ECONNABORTED'
          ? 'Excel yükleme zaman aşımına uğradı. Dosya çok büyük olabilir; bir süre sonra tekrar deneyin.'
          : axios.isAxiosError(error) && error.response?.data?.message
            ? String(error.response.data.message)
            : axios.isAxiosError(error) && error.response?.status === 504
              ? 'Sunucu zaman aşımı (504). Deploy sonrası nginx timeout güncellemesi gerekebilir.'
              : 'Excel yüklenemedi.';
      onNotify?.('error', message);
    } finally {
      setImporting(false);
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
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
