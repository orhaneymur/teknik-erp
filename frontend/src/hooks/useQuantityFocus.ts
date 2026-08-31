import { useCallback, useRef } from 'react';

/**
 * Sepete ürün eklendiğinde o satırın adet kutusunu odaklar ve içindeki
 * değeri seçili hâle getirir.
 *
 * Amaç: ürünü seçtikten sonra kullanıcının fareye uzanıp adet kutusuna
 * tıklaması, sonra da mevcut "1" değerini silmesi gerekmesin. Ürün eklenir
 * eklenmez doğrudan adedi tuşlamaya başlayabilsin.
 *
 * Kullanım:
 *   const { setQuantityRef, focusQuantity } = useQuantityFocus();
 *   <input ref={setQuantityRef(item.rowId)} ... />
 *   // sepete ekledikten sonra:
 *   focusQuantity(rowId);
 */
export function useQuantityFocus() {
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  const setQuantityRef = useCallback(
    (rowId: string) => (el: HTMLInputElement | null) => {
      if (el) {
        refs.current[rowId] = el;
      } else {
        // Satır silindiğinde referansı da bırak, sözlük şişmesin
        delete refs.current[rowId];
      }
    },
    []
  );

  const focusQuantity = useCallback((rowId: string) => {
    // Yeni satır henüz çizilmemiş olabilir; bir sonraki çizim karesini bekle.
    requestAnimationFrame(() => {
      const el = refs.current[rowId];
      if (!el) return;
      el.focus();
      el.select();
    });
  }, []);

  return { setQuantityRef, focusQuantity };
}
