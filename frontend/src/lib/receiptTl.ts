/**
 * Fişlerde TL karşılığı.
 *
 * Sistemin tamamı USD çalışır; TL yalnızca fişin üzerine müşteri okusun diye
 * yazılır. Kur, fatura/tahsilat KAYDEDİLİRKEN kayda yazılan `tryRate`
 * alanından gelir (backend: receiptTryRate) — böylece aynı fiş aylar sonra
 * yeniden yazdırıldığında da kesildiği günün rakamını gösterir.
 *
 * Kayıtta kur yoksa (sürüm öncesi faturalar) TL satırı hiç basılmaz; yanlış
 * rakam basmaktansa hiç basmamak doğrudur.
 */

/** 12450.5 -> "12.450,50 TL" */
export function formatTry(value: number): string {
  return `${new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} TL`;
}

/**
 * USD tutarın TL karşılığı. Kur yoksa null — çağıran satırı hiç basmaz.
 * Yuvarlama kuruş seviyesinde yapılır; fişte iki hane gösterilir.
 */
export function tryEquivalent(
  amountUsd: number,
  rate: number | null | undefined
): string | null {
  if (!rate || rate <= 0 || !Number.isFinite(rate)) return null;
  return formatTry(Math.round(amountUsd * rate * 100) / 100);
}

/** Fiş altındaki kur dipnotu: "1 USD = 41,5023 TL" */
export function tryRateNote(rate: number | null | undefined): string | null {
  if (!rate || rate <= 0 || !Number.isFinite(rate)) return null;
  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(rate);
  return `1 USD = ${formatted} TL`;
}
