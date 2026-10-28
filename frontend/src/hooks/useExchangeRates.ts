import { useEffect, useState } from 'react';
import { DEFAULT_EUR, DEFAULT_USD, fetchExchangeRates, type ExchangeRates } from '../lib/api';

/*
 * 1 dakikada bir sorulur (eskiden 30 dk): kur bayatlarsa veya sunucu yedek
 * kaynaga gecerse ekran bunu hemen gostersin (kur gelmiyor sikayeti, 29 Ekim
 * 2026). Istek bellekteki kuru okur, sunucuya yuku yok.
 */
export function useExchangeRates(refreshMs = 60 * 1000) {
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
      if (!active) return;
      setRates((onceki) =>
        /*
         * Sunucuya ulasilamadiysa elde gercek kur varken sabit 46,39'a
         * dusme; son alinan kuru uyariyla tut.
         */
        data.source === 'varsayılan' && onceki.source !== 'varsayılan'
          ? { ...onceki, uyari: 'Sunucuya ulaşılamadı; son alınan kur gösteriliyor.' }
          : data
      );
      setLoading(false);
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
