import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE, SEARCH_MIN_CHARS, ensureArray } from '../lib/api';
import {
  clearF2SearchSession,
  getLastF2FocusedIndex,
  getLastF2SearchQuery,
  recordF2FocusedIndex,
  recordF2SearchQuery,
} from '../lib/f2LastProduct';

export type F2ProductContext = 'sales' | 'purchase' | 'return';

export type F2Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  appearance?: string | null;
  quality?: string | null;
  costPrice: number;
  costUsd?: number;
  priceTl: number;
  priceUsd: number;
  lastPartyPriceTl?: number | null;
  lastPartyPriceUsd?: number | null;
  lastSoldPrice?: number | null;
  lastSoldPriceUsd?: number | null;
};

type ProductsResponse = {
  success: boolean;
  data: F2Product[];
  totalCount: number;
  page: number;
  limit: number;
};

const PAGE_SIZE = 200;

/**
 * Türkçe duyarlı katlama — backend'deki foldSearchText ile aynı.
 * `toLocaleLowerCase('tr-TR')` "INFİNİX" → "ınfinix" ürettiği için kullanıcının
 * yazdığı "infinix" ile eşleşmiyordu.
 */
const TR_FOLD_MAP: Record<string, string> = {
  İ: 'i', I: 'i', ı: 'i',
  Ş: 's', ş: 's',
  Ğ: 'g', ğ: 'g',
  Ü: 'u', ü: 'u',
  Ö: 'o', ö: 'o',
  Ç: 'c', ç: 'c',
};

function foldSearchText(value: string | null | undefined): string {
  if (!value) return '';
  let out = '';
  for (const char of value) {
    out += TR_FOLD_MAP[char] ?? char;
  }
  return out.toLowerCase();
}

/** Kısa parçaların (ör. "8") stok kodundaki rakamlara denk gelmesi engellenir */
const SHORT_TOKEN_MAX_LEN = 2;

function joinFolded(parts: Array<string | null | undefined>): string {
  return foldSearchText(parts.filter(Boolean).join(' '));
}

/** Yerel filtre — sunucudaki buildProductSearchWhere ile aynı kurallar */
function matchesProductQuery(product: F2Product, query: string): boolean {
  const words = foldSearchText(query.trim()).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  // description istemciye gelmez; kalan alanlar sunucudakiyle aynı
  const wide = joinFolded([
    product.name,
    product.sku,
    product.barcode,
    product.brand,
    product.model,
    product.color,
    product.appearance,
    product.quality,
  ]);

  if (words.length === 1) return wide.includes(words[0]);

  const narrow = joinFolded([product.name, product.brand, product.model]);
  return words.every((word) =>
    word.length <= SHORT_TOKEN_MAX_LEN ? narrow.includes(word) : wide.includes(word)
  );
}

function filterProducts(products: F2Product[], query: string): F2Product[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return products.filter((product) => matchesProductQuery(product, trimmed));
}

export function useF2ProductSearch(options: {
  open: boolean;
  f2Trigger?: number;
  context: F2ProductContext;
  partyId?: number | null;
  exchangeRate: number;
}) {
  const { open, f2Trigger = 0, context, partyId, exchangeRate } = options;

  const [searchQuery, setSearchQuery] = useState(() =>
    getLastF2SearchQuery(context, partyId)
  );
  const [results, setResults] = useState<F2Product[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastF2TriggerRef = useRef(0);
  const wasOpenRef = useRef(false);
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;

  /** Son sunucu yanıtı — yazarak daraltırken buradan yerel filtre uygulanır */
  const anchorQueryRef = useRef('');
  const anchorResultsRef = useRef<F2Product[]>([]);
  const anchorCompleteRef = useRef(false);
  const anchorTotalCountRef = useRef(0);
  const fetchGenRef = useRef(0);

  const persistFocusedIndex = useCallback(
    (index: number, query = searchQueryRef.current) => {
      if (index >= 0) {
        recordF2FocusedIndex(context, query, index);
      }
    },
    [context]
  );

  const setFocusedIndexTracked = useCallback(
    (value: number | ((prev: number) => number)) => {
      setFocusedIndex((prev) => {
        const next = typeof value === 'function' ? value(prev) : value;
        if (next >= 0) {
          persistFocusedIndex(next);
        }
        return next;
      });
    },
    [persistFocusedIndex]
  );

  /**
   * Yalnızca ANLIK geri bildirim içindir; sonuç kümesi burada kesinleşmez.
   * Elde yalnızca son sunucu sayfası olduğu için tam liste her zaman
   * sunucudan tazelenir (bkz. arama effect'i).
   */
  const applyLocalFilter = useCallback(
    (query: string) => {
      const filtered = filterProducts(anchorResultsRef.current, query);
      setResults(filtered);
      setTotalCount(filtered.length);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      setPage(1);

      const savedIndex = getLastF2FocusedIndex(context, query.trim());
      const nextIndex =
        savedIndex != null && savedIndex < filtered.length
          ? savedIndex
          : filtered.length > 0
            ? 0
            : -1;
      setFocusedIndex(nextIndex);
      if (nextIndex >= 0) {
        persistFocusedIndex(nextIndex, query.trim());
      }
    },
    [context, persistFocusedIndex]
  );

  const clearResults = useCallback(() => {
    setResults([]);
    setFocusedIndex(-1);
    setPage(1);
    setTotalCount(0);
    setHasMore(false);
    setLoading(false);
    setLoadingMore(false);
    anchorQueryRef.current = '';
    anchorResultsRef.current = [];
    anchorCompleteRef.current = false;
    anchorTotalCountRef.current = 0;
  }, []);

  /** Fiş kesilince — arama oturumunu baştan başlat */
  const resetSession = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    fetchGenRef.current += 1;
    setSearchQuery('');
    clearResults();
    clearF2SearchSession(context);
  }, [clearResults, context]);

  /**
   * Panel kapanırken sonuçları SİLME — ekrandan kaybolsun ama state kalsın.
   * Açılırken sorguyu geri yükle; aynı arama zaten doluysa yeniden istek atma.
   */
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const lastQuery = getLastF2SearchQuery(context, partyId);
      if (lastQuery !== searchQueryRef.current) {
        setSearchQuery(lastQuery);
      }
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    } else if (!open && wasOpenRef.current) {
      recordF2SearchQuery(context, partyId, searchQueryRef.current);
      persistFocusedIndex(focusedIndexRef.current);
    }
    wasOpenRef.current = open;
  }, [open, context, partyId, persistFocusedIndex]);

  /** F2 tetikleyicisi (panel zaten açıkken tekrar F2) — sorguyu koru, inputa odak */
  useEffect(() => {
    if (f2Trigger > lastF2TriggerRef.current) {
      lastF2TriggerRef.current = f2Trigger;
      if (open) {
        const lastQuery = getLastF2SearchQuery(context, partyId);
        if (lastQuery !== searchQueryRef.current) {
          setSearchQuery(lastQuery);
        }
        requestAnimationFrame(() => {
          searchInputRef.current?.focus();
        });
      }
    }
  }, [f2Trigger, open, context, partyId]);

  /** Yazarken anlık kaydet (sekme kapanırsa da kalsın) */
  useEffect(() => {
    if (!open) return;
    recordF2SearchQuery(context, partyId, searchQuery);
  }, [open, searchQuery, context, partyId]);

  const fetchPage = useCallback(
    async (pageNumber: number, query: string, append: boolean) => {
      const trimmed = query.trim();
      if (trimmed.length < SEARCH_MIN_CHARS) {
        clearResults();
        return;
      }

      const gen = ++fetchGenRef.current;
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const params: Record<string, string> = {
          page: String(pageNumber),
          limit: String(PAGE_SIZE),
          context,
          exchangeRate: String(exchangeRate),
          search: trimmed,
        };
        if (partyId) params.customerId = String(partyId);

        const response = await axios.get<ProductsResponse>(`${API_BASE}/api/sales/products`, {
          params,
        });

        if (gen !== fetchGenRef.current) return;

        if (response.data.success) {
          const batch = ensureArray(response.data.data);
          const nextResults = append
            ? [...anchorResultsRef.current, ...batch]
            : batch;
          const complete =
            response.data.page * response.data.limit >= response.data.totalCount;

          anchorQueryRef.current = trimmed;
          anchorResultsRef.current = nextResults;
          anchorCompleteRef.current = complete;
          anchorTotalCountRef.current = response.data.totalCount;

          // Kullanıcı yazmaya devam ettiyse bu yanıtı yeni sorguya göre daralt
          const liveQuery = searchQueryRef.current.trim();
          if (liveQuery !== trimmed && liveQuery.startsWith(trimmed)) {
            applyLocalFilter(liveQuery);
            return;
          }

          setResults(nextResults);
          setTotalCount(response.data.totalCount);
          setPage(response.data.page);
          setHasMore(!complete);
          if (!append) {
            const savedIndex = getLastF2FocusedIndex(context, trimmed);
            const nextIndex =
              savedIndex != null && savedIndex < nextResults.length
                ? savedIndex
                : nextResults.length > 0
                  ? 0
                  : -1;
            setFocusedIndex(nextIndex);
            if (nextIndex >= 0) {
              persistFocusedIndex(nextIndex, trimmed);
            }
          }
        }
      } catch {
        if (gen === fetchGenRef.current && !append) {
          clearResults();
        }
      } finally {
        if (gen === fetchGenRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [applyLocalFilter, clearResults, context, exchangeRate, partyId, persistFocusedIndex]
  );

  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = searchQuery.trim();

    if (trimmed.length < SEARCH_MIN_CHARS) {
      clearResults();
      return;
    }

    const anchor = anchorQueryRef.current;
    const hasAnchor = anchor.length > 0 && anchorResultsRef.current.length > 0;

    // Aynı sunucu sorgusu — bellekten anında göster (F2 yeniden açılış / geri silme)
    if (trimmed === anchor && hasAnchor) {
      setResults(anchorResultsRef.current);
      setTotalCount(anchorTotalCountRef.current);
      setHasMore(!anchorCompleteRef.current);
      setLoading(false);
      return;
    }

    /*
     * Daraltma: "1" → "11". Elde yalnızca son sunucu SAYFASI var; eldeki küme
     * eksikken yerel filtre uygulanıp orada kalınırsa 1. sayfaya girmemiş
     * eşleşmeler HİÇ görünmüyordu (bildirilen "bazı ürünler listelenmiyor"
     * sorununun ana nedeni). Artık yerel filtre yalnızca anında geri bildirim
     * için uygulanır; sonuç her durumda sunucudan tamamlanır.
     */
    if (hasAnchor && trimmed.startsWith(anchor) && trimmed !== anchor) {
      applyLocalFilter(trimmed);
    }

    // Genişletme / daraltma / yeni arama / karakter silme → her hâlükârda sunucu
    debounceRef.current = setTimeout(() => {
      void fetchPage(1, trimmed, false);
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, searchQuery, partyId, fetchPage, clearResults, applyLocalFilter]);

  const loadMore = useCallback(() => {
    if (!open || loading || loadingMore || !hasMore) return;
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    // Yerel daraltılmış görünümde sunucu sayfası yükleme
    if (trimmed !== anchorQueryRef.current) return;
    void fetchPage(page + 1, trimmed, true);
  }, [open, loading, loadingMore, hasMore, fetchPage, page, searchQuery]);

  const handleListScroll = useCallback(() => {
    const element = listRef.current;
    if (!element || loadingMore || !hasMore) return;
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 48) {
      loadMore();
    }
  }, [loadMore, loadingMore, hasMore]);

  const navigateFocus = useCallback(
    (delta: number) => {
      setFocusedIndexTracked((prev) => {
        if (results.length === 0) return -1;
        const current = prev < 0 ? 0 : prev;
        const next = Math.max(0, Math.min(current + delta, results.length - 1));
        const trimmed = searchQuery.trim();
        if (
          next >= results.length - 10 &&
          hasMore &&
          !loadingMore &&
          !loading &&
          trimmed === anchorQueryRef.current
        ) {
          void fetchPage(page + 1, trimmed, true);
        }
        return next;
      });
    },
    [
      results.length,
      hasMore,
      loadingMore,
      loading,
      page,
      searchQuery,
      fetchPage,
      setFocusedIndexTracked,
    ]
  );

  return {
    searchQuery,
    setSearchQuery,
    results,
    focusedIndex,
    setFocusedIndex: setFocusedIndexTracked,
    loading,
    loadingMore,
    totalCount,
    hasMore,
    searchInputRef,
    listRef,
    handleListScroll,
    navigateFocus,
    resetSession,
  };
}
