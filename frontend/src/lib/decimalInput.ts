/**
 * Sayı kutularına yazılan metnin okunması.
 *
 * Tarayıcının `<input type="number">` alanı Türkçe kullanımda iki sorun
 * çıkarıyordu:
 *
 *   1. Ondalık ayırıcı tarayıcının diline bağlıdır. Dili İngilizce olan
 *      bir tarayıcıda "0,25" yazıldığında virgül sessizce yutulur, geriye
 *      "025" kalır ve fiyat 0,25 $ yerine 25 $ olarak kaydedilirdi.
 *   2. Fare tekerleği odaktaki alanın değerini değiştirirdi.
 *
 * Bu yüzden sayı kutuları `type="text"` olarak çizilir ve metin burada
 * çözümlenir. Kural:
 *
 *   "025"   -> 25      (baştaki sıfırlar atılır)
 *   "0,25"  -> 0.25    (virgül ondalık ayırıcıdır)
 *   "0.25"  -> 0.25    (nokta da kabul edilir)
 *   ",5"    -> 0.5
 *   ""      -> null    (kullanıcı silmiş; çağıran eski değeri korur)
 */

/**
 * Yazarken kabul edilecek karakterleri süzer: rakamlar ve tek bir ondalık
 * ayırıcı. Ayırıcı her zaman virgüle çevrilir ki kutuda tek bir yazım
 * biçimi görünsün.
 */
export function sanitizeDecimalDraft(raw: string, allowDecimal = true): string {
  if (!allowDecimal) {
    // Tam sayı alanı: ayırıcıdan sonrası atılır — "1,5" adet 15 olmasın.
    const [whole] = raw.split(/[.,]/);
    return whole.replace(/[^0-9]/g, '');
  }

  const onlyAllowed = raw.replace(/[^0-9.,]/g, '');

  // İlk ayırıcı kalır, sonrakiler atılır: "0,2,5" -> "0,25"
  let seenSeparator = false;
  let result = '';
  for (const ch of onlyAllowed) {
    if (ch === ',' || ch === '.') {
      if (seenSeparator) continue;
      seenSeparator = true;
      result += ',';
      continue;
    }
    result += ch;
  }
  return result;
}

/** Kutudaki metni sayıya çevirir. Geçersiz ya da boşsa `null`. */
export function parseDecimalInput(raw: string): number | null {
  const cleaned = sanitizeDecimalDraft(raw);
  if (cleaned === '' || cleaned === ',') return null;
  const value = Number(cleaned.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/**
 * Sayıyı kutuda gösterilecek metne çevirir.
 *
 * Baştaki sıfırlar burada düşer ("025" yazıp alandan çıkınca "25" görünür),
 * ondalık kısım virgülle yazılır (0.25 -> "0,25").
 */
export function formatDecimalDraft(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}
