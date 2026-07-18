import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useF2KeyboardNav } from '../hooks/useF2KeyboardNav';
import {
  API_BASE,
  SEARCH_MIN_CHARS,
  type Customer,
  type PaginatedListResponse,
} from '../lib/api';
import { pickCustomerFromSearch } from '../lib/customerSearch';

export type InlineCustomerSearchAccent = 'indigo' | 'rose' | 'emerald' | 'blue' | 'amber';

type InlineCustomerSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (customer: Customer) => void;
  selectedCustomer?: Customer | null;
  placeholder?: string;
  inputClassName?: string;
  accentClass?: InlineCustomerSearchAccent;
  minQueryLength?: number;
  showSelectedHint?: boolean;
  onResultsChange?: (results: Customer[]) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

const FOCUS_RING: Record<InlineCustomerSearchAccent, string> = {
  indigo: 'bg-indigo-50 border-indigo-600',
  rose: 'bg-rose-50 border-rose-600',
  emerald: 'bg-emerald-50 border-emerald-600',
  blue: 'bg-blue-50 border-blue-600',
  amber: 'bg-amber-50 border-amber-600',
};

const HOVER_RING: Record<InlineCustomerSearchAccent, string> = {
  indigo: 'hover:bg-indigo-50',
  rose: 'hover:bg-rose-50',
  emerald: 'hover:bg-emerald-50',
  blue: 'hover:bg-blue-50',
  amber: 'hover:bg-amber-50',
};

const SELECTED_HINT: Record<InlineCustomerSearchAccent, string> = {
  indigo: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rose: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
  amber: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

export default function InlineCustomerSearchInput({
  value,
  onChange,
  onSelect,
  selectedCustomer = null,
  placeholder = 'Kod veya isim ile ara...',
  inputClassName = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm',
  accentClass = 'indigo',
  minQueryLength = SEARCH_MIN_CHARS,
  showSelectedHint = true,
  onResultsChange,
  inputRef: externalInputRef,
}: InlineCustomerSearchInputProps) {
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Map<number, HTMLLIElement>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const listOpen = dropdownOpen && (value.trim().length > 0 || results.length > 0);

  useEffect(() => {
    const query = value.trim();
    if (!dropdownOpen || query.length < minQueryLength) {
      setResults([]);
      onResultsChange?.([]);
      setFocusedIndex(-1);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await axios.get<PaginatedListResponse<Customer>>(
          `${API_BASE}/api/customers`,
          { params: { search: query, limit: 20, page: 1 } }
        );
        if (response.data.success) {
          const batch = response.data.data;
          setResults(batch);
          onResultsChange?.(batch);
          setFocusedIndex(batch.length > 0 ? 0 : -1);
        } else {
          setResults([]);
          onResultsChange?.([]);
          setFocusedIndex(-1);
        }
      } catch {
        setResults([]);
        onResultsChange?.([]);
        setFocusedIndex(-1);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, dropdownOpen, minQueryLength, onResultsChange]);

  useEffect(() => {
    if (focusedIndex < 0) return;
    itemRefs.current.get(focusedIndex)?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const navigateFocus = useCallback(
    (delta: number) => {
      setFocusedIndex((prev) => {
        if (results.length === 0) return -1;
        const current = prev < 0 ? 0 : prev;
        return Math.max(0, Math.min(current + delta, results.length - 1));
      });
    },
    [results.length]
  );

  const handleSelect = useCallback(
    (customer: Customer) => {
      onSelect(customer);
      setDropdownOpen(false);
      setFocusedIndex(-1);
    },
    [onSelect]
  );

  const navHandler = useF2KeyboardNav({
    open: listOpen && results.length > 0,
    results,
    focusedIndex,
    navigateFocus,
    onSelect: handleSelect,
    onClose: () => setDropdownOpen(false),
  });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (listOpen && results.length > 0) {
      navHandler(event);
      if (event.defaultPrevented) return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const fromFocus =
        focusedIndex >= 0 && results[focusedIndex] ? results[focusedIndex] : null;
      const picked = fromFocus ?? pickCustomerFromSearch(value, results);
      if (picked) handleSelect(picked);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setDropdownOpen(true);
        }}
        onFocus={() => setDropdownOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setDropdownOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
      />
      {showSelectedHint && selectedCustomer && (
        <p
          className={`mt-2 rounded-lg border px-3 py-2 text-xs font-semibold ${SELECTED_HINT[accentClass]}`}
        >
          Seçili: {selectedCustomer.code} — {selectedCustomer.name}
        </p>
      )}
      {listOpen && (
        <ul
          ref={listRef}
          className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg divide-y divide-slate-100"
        >
          {loading && <li className="px-3 py-2 text-sm text-slate-400">Aranıyor...</li>}
          {!loading &&
            results.map((customer, index) => (
              <li
                key={customer.id}
                ref={(element) => {
                  if (element) itemRefs.current.set(index, element);
                  else itemRefs.current.delete(index);
                }}
                onMouseDown={() => handleSelect(customer)}
                onMouseEnter={() => setFocusedIndex(index)}
                className={`px-3 py-2 text-sm cursor-pointer border-l-2 transition-colors ${
                  focusedIndex === index
                    ? FOCUS_RING[accentClass]
                    : `border-transparent ${HOVER_RING[accentClass]}`
                }`}
              >
                <span className="font-medium">{customer.code}</span>
                <span className="text-slate-500"> — {customer.name}</span>
              </li>
            ))}
          {!loading &&
            value.trim().length > 0 &&
            value.trim().length < minQueryLength && (
              <li className="px-3 py-2 text-sm text-slate-400">
                En az {minQueryLength} harf yazın
              </li>
            )}
          {!loading &&
            value.trim().length >= minQueryLength &&
            results.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400">Sonuç yok</li>
            )}
        </ul>
      )}
    </div>
  );
}
