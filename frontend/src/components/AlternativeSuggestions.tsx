import { Repeat, X } from 'lucide-react';
import { formatUsd } from '../lib/api';
import { productDisplayName } from '../lib/productDisplayName';

/**
 * Muadil öneri kaydı — `/api/products/:id/alternatives` yanıtı.
 *
 * F2Product ile aynı alanları taşır (fiyat çözümleyicileri ikisinde de
 * çalışsın diye) ve bir de `relevance` ekler: kaynak ürünle ortak kelime
 * sayısı. Sıralama sunucuda yapılır, burada yalnızca gösterilir.
 */
export type AlternativeProduct = {
  id: number;
  sku: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  appearance?: string | null;
  quality?: string | null;
  costPrice: number;
  costUsd?: number;
  priceTl: number;
  priceUsd: number;
  priceUsd2?: number | null;
  merkezDepoQuantity: number;
  relevance: number;
};

type AlternativeSuggestionsProps = {
  /** Stokta bulunmayan ürünün ekranda görünen adı */
  sourceName: string;
  items: AlternativeProduct[];
  onReplace: (alternative: AlternativeProduct) => void;
  onDismiss: () => void;
};

/**
 * "Bu üründe stok yok — yerine şunu verebilirsin" şeridi.
 *
 * Akışı KESMEZ: ürün istendiği gibi sepete girer, bu şerit yalnızca
 * bilgilendirir. Değiştir'e basılırsa sepetteki satır muadille yer
 * değiştirir, adet korunur.
 *
 * Sıralama parça tipi benzerliğine göredir; ilk sıradakiler kaynakla aynı
 * parça olma ihtimali en yüksek olanlardır. Alttakiler elenmez, çünkü
 * verideki kategori alanı parça tipini ayırmıyor (hepsi "iPhone Yedek
 * Parça") ve yanlış eleme satış kaybettirir.
 */
export default function AlternativeSuggestions({
  sourceName,
  items,
  onReplace,
  onDismiss,
}: AlternativeSuggestionsProps) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 print:hidden">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-amber-900">
          {sourceName} stokta yok — muadili var:
        </p>
        <button
          type="button"
          onClick={onDismiss}
          title="Kapat"
          className="shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/70 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-medium leading-snug text-slate-900 break-words sm:text-xs">
                {productDisplayName(item)}
              </p>
              <p className="text-caption text-slate-500">
                {item.sku} · stok {item.merkezDepoQuantity} adet ·{' '}
                {formatUsd(item.priceUsd)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onReplace(item)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              <Repeat className="h-3.5 w-3.5" />
              Değiştir
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
