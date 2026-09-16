import { useEffect, useRef } from 'react';
import { printDocument } from '../lib/printMode';

/**
 * Fatura Listesi'ndeki "Yazdır" düğmesi için (müşteri isteği, 16 Eylül 2026):
 * fiş, düzenleme ekranında açılır; yüklenir yüklenmez yazdırma diyaloğu
 * çıkar; diyalog kapanınca `onDone` ile listeye dönülür. Böylece fişin
 * çıktısı satış/alış/iade ekranındakiyle BİREBİR aynıdır — ikinci bir fiş
 * şablonu yazılmadı.
 *
 * `ready` fişin ekrana çizildiği andır (yükleme bitti, sepet dolu). Bir
 * kez tetiklenir; afterprint gelmezse (bazı tarayıcılar) 1,5 sn sonra
 * yine de döner.
 */
export function useAutoPrint(
  enabled: boolean,
  ready: boolean,
  onDone?: () => void,
  /** PDF dosya adı (lib/printMode musteriDosyaAdi) */
  dosyaAdi?: string
) {
  const fired = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const dosyaAdiRef = useRef(dosyaAdi);
  dosyaAdiRef.current = dosyaAdi;

  useEffect(() => {
    if (!enabled || !ready || fired.current) return;
    fired.current = true;

    let bitti = false;
    const bitir = () => {
      if (bitti) return;
      bitti = true;
      window.removeEventListener('afterprint', bitir);
      onDoneRef.current?.();
    };

    // Fişin DOM'a yerleşmesi için kısa bekleme; sonra yazdır
    const t = window.setTimeout(() => {
      window.addEventListener('afterprint', bitir);
      printDocument(dosyaAdiRef.current);
      window.setTimeout(bitir, 1500);
    }, 250);

    return () => window.clearTimeout(t);
  }, [enabled, ready]);
}
