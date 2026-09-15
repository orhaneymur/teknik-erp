import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Kaydetmeden hemen önce ödeme yöntemini bir kez daha soran pencere.
 *
 * Müşteri isteği (16 Eylül 2026): personel Nakit/Cari seçimini unutuyor,
 * fiş yanlış yöntemle kesiliyor. Seçim büyük harflerle gösterilir;
 * varsayılan odak "Hayır" düğmesindedir ki Enter'a basıp geçilemesin —
 * onay için ya tıklanır ya da E tuşuna basılır.
 */
export default function OdemeOnayModal({
  acik,
  yontem,
  aciklama,
  onEvet,
  onHayir,
}: {
  acik: boolean;
  /** Büyük yazılan etiket — "NAKİT", "CARİ" */
  yontem: string;
  /** Altındaki kısa açıklama — "kasaya girer" */
  aciklama?: string;
  onEvet: () => void;
  onHayir: () => void;
}) {
  const hayirRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!acik) return;
    hayirRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onHayir();
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        onEvet();
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        onHayir();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [acik, onEvet, onHayir]);

  if (!acik) return null;

  const cari = /CAR/i.test(yontem);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="odeme-onay-baslik"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className={`rounded-xl p-2 ${cari ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="odeme-onay-baslik" className="text-base font-bold text-slate-900">
              Ödeme yöntemini kontrol edin
            </h3>
            <p className="mt-1 text-sm text-slate-600">Bu fiş şu yöntemle kaydedilecek:</p>
          </div>
        </div>

        <div
          className={`mt-4 rounded-xl border-2 px-4 py-4 text-center ${
            cari ? 'border-amber-400 bg-amber-50' : 'border-emerald-400 bg-emerald-50'
          }`}
        >
          <p className={`text-3xl font-black tracking-wide ${cari ? 'text-amber-800' : 'text-emerald-800'}`}>
            {yontem}
          </p>
          {aciklama && <p className="mt-1 text-sm text-slate-600">{aciklama}</p>}
        </div>

        <p className="mt-4 text-center text-sm font-medium text-slate-700">Emin misiniz?</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            ref={hayirRef}
            type="button"
            onClick={onHayir}
            className="rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            Hayır, değiştireceğim
            <span className="ml-1 font-mono text-xs text-slate-400">(H)</span>
          </button>
          <button
            type="button"
            onClick={onEvet}
            className={`rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:ring-2 ${
              cari
                ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-400'
                : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-400'
            }`}
          >
            Evet, kaydet
            <span className="ml-1 font-mono text-xs opacity-70">(E)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
