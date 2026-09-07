import { useCallback, useRef, type KeyboardEvent } from 'react';

/**
 * Fatura kalemleri tablosunda klavyeyle dolaşma.
 *
 * Fişi hızlı yazan kullanıcı fareye uzanmak zorunda kalmasın diye tablo
 * bir hücre ızgarası gibi davranır:
 *
 *   Enter            bir alt satırda AYNI sütuna iner (adet -> adet)
 *   Shift+Enter      bir üst satırda aynı sütuna çıkar
 *   Yukarı / Aşağı   aynı sütunda satır değiştirir
 *   Sol / Sağ        aynı satırda sütun değiştirir, satır sonunda
 *                    komşu satıra geçer
 *
 * Sütun listesi ekrana göre değişir (satışta iskonto/adet/fiyat, alışta
 * adet/fiyat) ve bir satırda o sütun hiç çizilmemiş olabilir — iade
 * ekranında birim fiyat yalnızca elle girilen satırlarda vardır. Bu yüzden
 * gezinme, kaydı olmayan hücreleri atlayarak ilk odaklanabilir hücreyi
 * bulur.
 */

export type CartGridField = string;

const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/**
 * İmleç metnin ucunda mı? Tümü seçiliyse (hücreye yeni gelinmiştir) de
 * uçta sayılır, yön tuşu ilk basışta komşu hücreye geçsin.
 */
function atTextEdge(input: HTMLInputElement, key: string) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (start == null || end == null) return true;
  const length = input.value.length;
  if (start === 0 && end === length) return true;
  return key === 'ArrowLeft' ? start === 0 && end === 0 : start === length && end === length;
}

function fieldKey(rowId: string, field: CartGridField) {
  return `${rowId}:${field}`;
}

export function useCartGridKeyboardNav(
  getRowIds: () => string[],
  fieldOrder: readonly CartGridField[]
) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setRef = useCallback((rowId: string, field: CartGridField) => {
    return (el: HTMLInputElement | null) => {
      if (el) {
        inputRefs.current[fieldKey(rowId, field)] = el;
      } else {
        // Satır silindiğinde kaydı da bırak, sözlük şişmesin
        delete inputRefs.current[fieldKey(rowId, field)];
      }
    };
  }, []);

  /** Hücreyi odaklar. Hücre yoksa (çizilmemişse) false döner. */
  const focusField = useCallback((rowId: string, field: CartGridField) => {
    const el = inputRefs.current[fieldKey(rowId, field)];
    if (!el || el.disabled || el.readOnly) return false;
    el.focus();
    el.select();
    return true;
  }, []);

  /**
   * Henüz çizilmemiş satırı odaklamak için: sepete ürün eklendiği anda o
   * satırın kutusu DOM'da yoktur, bir sonraki çizim karesini bekleriz.
   */
  const focusFieldSoon = useCallback(
    (rowId: string, field: CartGridField) => {
      requestAnimationFrame(() => {
        focusField(rowId, field);
      });
    },
    [focusField]
  );

  /** Aynı sütunda yukarı/aşağı; boş hücreleri atlar. */
  const focusInColumn = useCallback(
    (rowIds: string[], fromRow: number, step: number, field: CartGridField) => {
      for (let i = fromRow + step; i >= 0 && i < rowIds.length; i += step) {
        if (focusField(rowIds[i], field)) return true;
      }
      return false;
    },
    [focusField]
  );

  /** Satır boyunca sağa/sola; satır sonunda komşu satırın ucuna geçer. */
  const focusInRowFlow = useCallback(
    (rowIds: string[], fromRow: number, fromField: number, step: number) => {
      const fields = fieldOrder;
      let row = fromRow;
      let field = fromField;
      // En fazla ızgaradaki hücre sayısı kadar dener; sonsuz döngü olmaz.
      for (let guard = 0; guard < rowIds.length * fields.length; guard += 1) {
        field += step;
        if (field >= fields.length) {
          row += 1;
          field = 0;
        } else if (field < 0) {
          row -= 1;
          field = fields.length - 1;
        }
        if (row < 0 || row >= rowIds.length) return false;
        if (focusField(rowIds[row], fields[field])) return true;
      }
      return false;
    },
    [focusField, fieldOrder]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, rowId: string, field: CartGridField) => {
      const key = e.key;
      const isEnter = key === 'Enter';
      if (!isEnter && !ARROW_KEYS.includes(key)) return;

      const rowIds = getRowIds();
      const rowIndex = rowIds.indexOf(rowId);
      const fieldIndex = fieldOrder.indexOf(field);
      if (rowIndex < 0 || fieldIndex < 0) return;

      if (!isEnter && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        // Yazının içinde imleç gezebilsin: hücre değiştirme yalnızca imleç
        // metnin ucundayken ya da değer tümüyle seçiliyken (hücreye yeni
        // gelindiğinde olduğu gibi) devreye girer.
        if (!atTextEdge(e.currentTarget, key)) return;
      }

      e.preventDefault();

      if (isEnter) {
        // Son satırda Enter'ın gidecek yeri yok; odak yerinde kalır.
        focusInColumn(rowIds, rowIndex, e.shiftKey ? -1 : 1, field);
        return;
      }

      if (key === 'ArrowUp') {
        focusInColumn(rowIds, rowIndex, -1, field);
        return;
      }
      if (key === 'ArrowDown') {
        focusInColumn(rowIds, rowIndex, 1, field);
        return;
      }
      focusInRowFlow(rowIds, rowIndex, fieldIndex, key === 'ArrowLeft' ? -1 : 1);
    },
    [getRowIds, fieldOrder, focusInColumn, focusInRowFlow]
  );

  return { setRef, focusField, focusFieldSoon, onKeyDown };
}
