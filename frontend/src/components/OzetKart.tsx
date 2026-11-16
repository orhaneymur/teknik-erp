import { ArrowDownLeft, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { buildPageUrl, type PageId } from '../lib/navigation';

/**
 * Ozet karti — sayfanin ust seridindeki tek rakam.
 *
 * Rakam buyuk ve kalin; etiket ve karsilastirma kucuk. Renk yalnizca
 * ANLAM tasidiginda kullanilir (dusus kirmizi, uyari amber); geri kalan
 * her sey notr kalir ki goz once rakama gitsin.
 *
 * Anasayfa ve Isletme Ozeti ortak kullanir.
 */
export default function OzetKart({
  etiket,
  deger,
  degisim,
  altBilgi,
  Ikon,
  sayfa,
  uyari = false,
}: {
  etiket: string;
  deger: string;
  degisim?: number | null;
  altBilgi?: string;
  Ikon: LucideIcon;
  sayfa?: PageId;
  uyari?: boolean;
}) {
  const icerik = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-medium uppercase tracking-wide text-slate-500">
          {etiket}
        </span>
        <Ikon
          className={`h-4 w-4 ${uyari ? 'text-amber-500' : 'text-slate-300'}`}
        />
      </div>

      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
        {deger}
      </p>

      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {degisim != null && (
          <span
            className={`inline-flex items-center gap-0.5 font-semibold ${
              degisim >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {degisim >= 0 ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownLeft className="h-3.5 w-3.5" />
            )}
            %{Math.abs(degisim).toFixed(0)}
          </span>
        )}
        {altBilgi && <span className="text-slate-400">{altBilgi}</span>}
      </div>
    </>
  );

  const sinif =
    'block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-900/5 no-underline transition';

  return sayfa ? (
    <a
      href={buildPageUrl(sayfa)}
      target="_blank"
      rel="noopener noreferrer"
      className={`${sinif} hover:border-indigo-300 hover:shadow-md`}
    >
      {icerik}
    </a>
  ) : (
    <div className={sinif}>{icerik}</div>
  );
}
