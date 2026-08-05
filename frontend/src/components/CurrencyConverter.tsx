import { useMemo, useState } from 'react';
import { useExchangeRates } from '../hooks/useExchangeRates';

type CurrencyCode = 'TRY' | 'USD' | 'EUR';

const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: 'TRY', symbol: '₺', label: 'Türk Lirası' },
  { code: 'USD', symbol: '$', label: 'Amerikan Doları' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
];

const amountFormatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const rateFormatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Girilen tutarı önce TL'ye çevirip hedef para birimine dönüştürür */
function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  usd: number,
  eur: number
) {
  const toTry = from === 'TRY' ? amount : from === 'USD' ? amount * usd : amount * eur;
  if (to === 'TRY') return toTry;
  const divisor = to === 'USD' ? usd : eur;
  return divisor > 0 ? toTry / divisor : 0;
}

function SymbolPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      {CURRENCIES.map((cur) => (
        <button
          key={cur.code}
          type="button"
          title={cur.label}
          aria-pressed={value === cur.code}
          onClick={() => onChange(cur.code)}
          className={`w-7 py-1 text-sm font-semibold transition-colors ${
            value === cur.code
              ? 'bg-emerald-600 text-white'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          {cur.symbol}
        </button>
      ))}
    </div>
  );
}

/** Üst barda duran canlı TCMB kur çevirici */
export default function CurrencyConverter() {
  const { rates, loading } = useExchangeRates();
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState<CurrencyCode>('TRY');
  const [to, setTo] = useState<CurrencyCode>('USD');

  const parsedAmount = useMemo(() => {
    const normalized = amount.replace(/\./g, '').replace(',', '.').trim();
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  }, [amount]);

  const result = useMemo(
    () => convert(parsedAmount, from, to, rates.usd, rates.eur),
    [parsedAmount, from, to, rates.usd, rates.eur]
  );

  const toSymbol = CURRENCIES.find((c) => c.code === to)?.symbol ?? '';

  /** Aynı sembol iki tarafta seçilirse karşı tarafı otomatik değiştirir */
  const handleFromChange = (code: CurrencyCode) => {
    setFrom(code);
    if (code === to) setTo(from);
  };

  const handleToChange = (code: CurrencyCode) => {
    setTo(code);
    if (code === from) setFrom(to);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 sm:px-3">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Tutar"
          aria-label="Çevrilecek tutar"
          className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 sm:w-24"
        />
        <SymbolPicker value={from} onChange={handleFromChange} ariaLabel="Kaynak para birimi" />

        <span className="text-slate-400">=</span>

        <output
          aria-label="Çevrilen tutar"
          className="w-24 truncate rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm font-semibold text-emerald-700 sm:w-28"
          title={`${amountFormatter.format(result)} ${toSymbol}`}
        >
          {amountFormatter.format(result)} {toSymbol}
        </output>
        <SymbolPicker value={to} onChange={handleToChange} ariaLabel="Hedef para birimi" />
      </div>

      <p className="mt-1 truncate text-center text-[10px] text-slate-500">
        {loading
          ? 'Kurlar yükleniyor…'
          : `${rates.source} · $ ${rateFormatter.format(rates.usd)} · € ${rateFormatter.format(rates.eur)}`}
      </p>
    </div>
  );
}
