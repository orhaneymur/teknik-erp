import { useEffect } from 'react';
import { Search } from 'lucide-react';
import F2CustomerList from './F2CustomerList';
import { useF2CustomerSearch } from '../hooks/useF2CustomerSearch';
import { useF2KeyboardNav } from '../hooks/useF2KeyboardNav';
import { MUSTERI_ARAMA_MIN_KARAKTER, type Customer } from '../lib/api';

type CustomerSearchPanelProps = {
  onSelect: (customer: Customer) => void;
  selectedCustomerId?: number | '';
  accentClass?: 'blue' | 'emerald';
  className?: string;
};

/** F2 müşteri araması — modal olmadan sayfaya gömülü, kaydırılabilir liste */
export default function CustomerSearchPanel({
  onSelect,
  selectedCustomerId,
  accentClass = 'blue',
  className = '',
}: CustomerSearchPanelProps) {
  const search = useF2CustomerSearch({ open: true });

  const handleKeyDown = useF2KeyboardNav({
    open: true,
    results: search.results,
    focusedIndex: search.focusedIndex,
    navigateFocus: search.navigateFocus,
    onSelect,
    onClose: () => search.setSearchQuery(''),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => search.searchInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [search.searchInputRef]);

  const headerClass =
    accentClass === 'blue'
      ? 'border-blue-100 bg-blue-50/80'
      : 'border-emerald-100 bg-emerald-50/80';

  const inputFocus =
    accentClass === 'blue'
      ? 'focus:border-blue-500 focus:ring-blue-500'
      : 'focus:border-emerald-500 focus:ring-emerald-500';

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      <div className={`border-b px-3 py-3 ${headerClass}`}>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Müşteri Ara</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={search.searchInputRef}
            type="text"
            value={search.searchQuery}
            onChange={(e) => search.setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Kod veya isim yazın · ↑↓ Enter ile seçin"
            autoComplete="off"
            className={`w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm ${inputFocus}`}
          />
        </div>
        <p className="mt-1.5 text-caption text-slate-500">
          Liste açık — yazmadan kaydırarak da bulabilirsiniz · PgUp/Dn
        </p>
      </div>

      <div
        ref={search.listRef}
        onScroll={search.handleListScroll}
        className="min-h-[14rem] max-h-[min(52vh,28rem)] flex-1 overflow-y-auto"
      >
        {search.loading && (
          <p className="px-3 py-8 text-center text-sm text-slate-400">Müşteriler yükleniyor...</p>
        )}
        {!search.loading && search.results.length > 0 && (
          <F2CustomerList
            customers={search.results}
            focusedIndex={search.focusedIndex}
            onFocusIndex={search.setFocusedIndex}
            onSelect={onSelect}
            selectedId={selectedCustomerId === '' ? undefined : selectedCustomerId}
            accentClass={accentClass}
          />
        )}
        {search.loadingMore && (
          <p className="px-3 py-2 text-center text-xs text-slate-400">Daha fazla yükleniyor...</p>
        )}
        {!search.loading && search.results.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-slate-400">
            {!search.searchQuery.trim()
              ? 'Müşteri bulunamadı.'
              : search.searchQuery.trim().length < MUSTERI_ARAMA_MIN_KARAKTER
                ? `En az ${MUSTERI_ARAMA_MIN_KARAKTER} karakter yazın`
                : 'Sonuç bulunamadı.'}
          </p>
        )}
      </div>

      {search.totalCount > 0 && (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-right text-caption text-slate-500">
          {search.results.length.toLocaleString('tr-TR')} /{' '}
          {search.totalCount.toLocaleString('tr-TR')} müşteri
        </div>
      )}
    </div>
  );
}
