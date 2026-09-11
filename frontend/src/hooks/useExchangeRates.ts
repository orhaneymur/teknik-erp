import { useEffect, useState } from 'react';
import { DEFAULT_EUR, DEFAULT_USD, fetchExchangeRates, type ExchangeRates } from '../lib/api';

export function useExchangeRates(refreshMs = 30 * 60 * 1000) {
  const [rates, setRates] = useState<ExchangeRates>({
    usd: DEFAULT_USD,
    eur: DEFAULT_EUR,
    source: 'varsayılan',
    updatedAt: new Date().toISOString(),
    uyari: 'Kur yükleniyor.',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const data = await fetchExchangeRates();
      if (active) {
        setRates(data);
        setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, refreshMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refreshMs]);

  return { rates, loading };
}
