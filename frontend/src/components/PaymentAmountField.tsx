import { formatUsd } from '../lib/api';
import {
  type PaymentCurrency,
  CURRENCY_SYMBOL,
  amountToStoredUsd,
  formatEurAmount,
  formatTry,
  usdToAllCurrencies,
} from '../lib/paymentCurrency';

/** Tutar alanı + para birimi seçici ($ / ₺ / €); çevirim `lib/paymentCurrency.ts` */

export function CurrencyToggle({
  value,
  onChange,
}: {
  value: PaymentCurrency;
  onChange: (next: PaymentCurrency) => void;
}) {
  const base =
    'px-3 py-2.5 text-sm font-semibold transition-colors min-w-[3rem]';
  const active = 'bg-emerald-600 text-white';
  const inactive = 'bg-white text-slate-600 hover:bg-slate-50';
  const order: PaymentCurrency[] = ['USD', 'TRY', 'EUR'];

  return (
    <div className="flex shrink-0 overflow-hidden rounded-xl border border-slate-300">
      {order.map((cur, idx) => (
        <button
          key={cur}
          type="button"
          onClick={() => onChange(cur)}
          className={`${base} ${idx > 0 ? 'border-l border-slate-300' : ''} ${
            value === cur ? active : inactive
          }`}
          aria-pressed={value === cur}
        >
          {CURRENCY_SYMBOL[cur]}
        </button>
      ))}
    </div>
  );
}

export function PaymentAmountField({
  label,
  amount,
  onAmountChange,
  currency,
  onCurrencyChange,
  usdRate,
  eurRate,
  inputClass,
}: {
  label: string;
  amount: string;
  onAmountChange: (value: string) => void;
  currency: PaymentCurrency;
  onCurrencyChange: (value: PaymentCurrency) => void;
  usdRate: number;
  eurRate: number;
  inputClass: string;
}) {
  const parsed = Number(amount);
  const storedUsd =
    parsed > 0 ? amountToStoredUsd(parsed, currency, usdRate, eurRate) : null;
  const equiv =
    storedUsd != null && storedUsd > 0
      ? usdToAllCurrencies(storedUsd, usdRate, eurRate)
      : null;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <div className="flex gap-2">
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder={`0,00 ${CURRENCY_SYMBOL[currency]}`}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <CurrencyToggle value={currency} onChange={onCurrencyChange} />
      </div>
      {equiv && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-caption text-slate-600">
          <span className="font-semibold text-slate-500">Karşılığı:</span>
          <span>{formatUsd(equiv.usd)}</span>
          <span className="text-slate-300">·</span>
          <span>{formatTry(equiv.tl)}</span>
          <span className="text-slate-300">·</span>
          <span>{formatEurAmount(equiv.eur)}</span>
          <span className="ml-auto text-slate-400">
            $ {usdRate.toFixed(2)} · € {eurRate.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
