import { useEffect, useRef } from 'react';
import { formatUsd, roundPrice } from '../lib/api';
import { productDisplayName } from '../lib/productDisplayName';
import type { F2Product } from '../hooks/useF2ProductSearch';

type F2ProductListProps = {
  products: F2Product[];
  focusedIndex: number;
  onFocusIndex: (index: number) => void;
  onSelect: (product: F2Product) => void;
  partySelected: boolean;
  accentClass?: string;
  showCost?: boolean;
};

export default function F2ProductList({
  products,
  focusedIndex,
  onFocusIndex,
  onSelect,
  partySelected,
  accentClass = 'indigo',
  showCost = false,
}: F2ProductListProps) {
  const itemRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  useEffect(() => {
    if (focusedIndex < 0) return;
    itemRefs.current.get(focusedIndex)?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  /*
   * Satır arka planı stok durumunu gösterir (yeşil = stokta, açık kırmızı = yok).
   * Bu yüzden odak artık arka planla değil, sol kenar çizgisi + bir ton koyu
   * stok rengiyle belirtilir; aksi halde odaklanınca stok bilgisi kayboluyordu.
   */
  const focusBorder =
    accentClass === 'amber'
      ? 'border-amber-600'
      : accentClass === 'rose'
        ? 'border-rose-600'
        : 'border-indigo-600';

  return (
    <ul className="divide-y divide-slate-100">
      {products.map((product, index) => {
        const partyUsd = resolvePartyPriceUsd(product, partySelected);
        const inStock = (product.merkezDepoQuantity ?? 0) > 0;
        const focused = focusedIndex === index;
        const stockTone = inStock
          ? focused
            ? 'bg-emerald-100'
            : 'bg-emerald-50 hover:bg-emerald-100'
          : focused
            ? 'bg-red-100'
            : 'bg-red-50 hover:bg-red-100';

        return (
          <li
            key={product.id}
            ref={(element) => {
              if (element) itemRefs.current.set(index, element);
              else itemRefs.current.delete(index);
            }}
            onClick={() => onSelect(product)}
            onMouseEnter={() => onFocusIndex(index)}
            title={
              inStock
                ? `Stok: ${product.merkezDepoQuantity ?? 0}`
                : 'Stokta yok'
            }
            className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 transition-colors border-l-2 ${stockTone} ${
              focused ? focusBorder : 'border-transparent'
            }`}
          >
            <div className="min-w-0">
              <p className="text-[11px] font-medium leading-snug text-slate-900 break-words">
                {productDisplayName(product)}
              </p>
              {/*
               * Yeni stok kartlarında marka/model ada eklenmiyor, kendi
               * kolonlarında duruyor. "11 Pro" araması yapınca hangi markanın
               * modeli olduğu görünsün diye bu satır basılır.
               */}
              {brandModelLabel(product) && (
                <p className="text-caption font-medium text-slate-700 break-words">
                  {brandModelLabel(product)}
                </p>
              )}
              <p className="text-caption text-slate-500">{product.sku}</p>
              {partySelected && partyUsd != null && (
                <p className="text-caption text-amber-700">
                  Son fiyat: {formatUsd(partyUsd)}
                </p>
              )}
              {showCost && (
                <p className="text-caption text-slate-500">
                  Maliyet:{' '}
                  {formatUsd(
                    product.costUsd != null && product.costUsd > 0
                      ? roundPrice(product.costUsd)
                      : roundPrice(product.priceUsd)
                  )}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold text-slate-900 tabular-nums">
                {formatUsd(product.priceUsd)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** "Marka · Model" — ikisi de boşsa boş string döner */
function brandModelLabel(product: F2Product): string {
  return [product.brand, product.model]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' · ');
}

function resolvePartyPriceUsd(product: F2Product, partySelected: boolean) {
  if (!partySelected) return null;
  if (product.lastPartyPriceUsd != null) {
    return roundPrice(product.lastPartyPriceUsd);
  }
  if (product.lastSoldPriceUsd != null) {
    return roundPrice(product.lastSoldPriceUsd);
  }
  if (product.lastPartyPriceTl != null) {
    return roundPrice(product.lastPartyPriceTl);
  }
  if (product.lastSoldPrice != null) {
    return roundPrice(product.lastSoldPrice);
  }
  return null;
}

export function resolveSalesUnitPriceUsd(product: F2Product, partySelected: boolean) {
  const partyUsd = resolvePartyPriceUsd(product, partySelected);
  if (partyUsd != null) return partyUsd;
  return roundPrice(product.priceUsd);
}

export function resolvePurchaseUnitPriceUsd(product: F2Product, partySelected: boolean) {
  if (partySelected && product.lastPartyPriceUsd != null) {
    return roundPrice(product.lastPartyPriceUsd);
  }
  if (partySelected && product.lastSoldPriceUsd != null) {
    return roundPrice(product.lastSoldPriceUsd);
  }
  const costUsd =
    product.costUsd ?? (product.costPrice > 0 ? roundPrice(product.costPrice) : 0);
  return roundPrice(costUsd > 0 ? costUsd : product.priceUsd);
}
