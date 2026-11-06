import { useEffect } from 'react';
import { formatDocumentTitle } from '../lib/navigation';

/**
 * Sayfa içi dinamik başlık (ör. müşteri adı yüklendiğinde sekme metnini
 * günceller).
 *
 * `firma` verilirse sekmedeki firma adının yerine yazılır — satış / alış /
 * iade ekranları seçilen müşterinin adını buradan geçirir. Müşteri
 * temizlenince `undefined` gelir ve başlık firma adına döner.
 *
 * App.tsx de başlığı kurar; onun etkisi yalnızca sayfa değişince çalışır,
 * bu yüzden sayfa içindeki seçim bu kancayla üstüne yazar.
 */
export function useDocumentTitle(pageTitle: string | undefined, firma?: string) {
  useEffect(() => {
    const label = pageTitle?.trim();
    if (!label) return;

    /*
     * Cikista eski baslik geri konur. Satis/alis/iade duzenleyicisi anasayfa
     * ve fatura listesi icinde GOMULU de acilabiliyor; kapatildiginda App'in
     * baslik etkisi yeniden kosmadigi icin sekmede "... Duzenle · MUSTERI"
     * asili kalirdi.
     */
    const onceki = document.title;
    document.title = formatDocumentTitle(label, firma);
    return () => {
      document.title = onceki;
    };
  }, [pageTitle, firma]);
}
