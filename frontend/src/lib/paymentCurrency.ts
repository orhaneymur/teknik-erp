import { roundPrice } from './api';

/**
 * Para birimi çevirimi — tahsilat/ödeme girişi ve düzenlemesi için ORTAK
 * (bileşenler `components/PaymentAmountField.tsx`'te). Cari USD saklanır; TL/EUR girilen tutar günün
 * kurundan dolara çevrilir. Eskiden yalnızca Tahsilat/Ödeme ekranındaydı;
 * Müşteri Ekstre'deki "Ödeme Düzenle" yalnızca dolar alıyordu (müşteri
 * bildirdi, 16 Eylül 2026). Artık her ikisi de bu bileşeni kullanır.
 */

export type PaymentCurrency = 'USD' | 'TRY' | 'EUR';

export const CURRENCY_SYMBOL: Record<PaymentCurrency, string> = {
  USD: '$',
  TRY: '₺',
  EUR: '€',
};

const moneyFmt = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatTry(value: number): string {
  return `${moneyFmt.format(roundPrice(value))} ₺`;
}

export function formatEurAmount(value: number): string {
  return `${moneyFmt.format(roundPrice(value))} €`;
}

/** Girilen tutarı carinin saklandığı para birimine (USD) çevirir. */
export function amountToStoredUsd(
  value: number,
  currency: PaymentCurrency,
  usdRate: number,
  eurRate: number
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (currency === 'USD') return roundPrice(value);
  const usd = usdRate > 0 ? usdRate : 1;
  if (currency === 'TRY') return roundPrice(value / usd);
  // EUR → TL → USD
  const eur = eurRate > 0 ? eurRate : 1;
  return roundPrice((value * eur) / usd);
}

/** Saklanan USD tutarının üç para birimi karşılığını döndürür. */
export function usdToAllCurrencies(storedUsd: number, usdRate: number, eurRate: number) {
  const tl = storedUsd * (usdRate > 0 ? usdRate : 0);
  const eur = eurRate > 0 ? tl / eurRate : 0;
  return { usd: storedUsd, tl, eur };
}
