import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE, ensureArray } from '../lib/api';
import { getLastF2SearchQuery, recordF2SearchQuery } from '../lib/f2LastProduct';

export type F2ProductContext = 'sales' | 'purchase' | 'return';

export type F2Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
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

const PAGE_SIZE = 100;

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

  const clearResults = useCallback(() => {
    setResults([]);
    setFocusedIndex(-1);
    setPage(1);
    setTotalCount(0);
    setHasMore(false);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  /** Panel kapanırken sorguyu kaydet; açılırken son hali geri yükle */
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const lastQuery = getLastF2SearchQuery(context, partyId);
      setSearchQuery(lastQuery);
      if (!lastQuery.trim()) {
        clearResults();
      }
    } else if (!open && wasOpenRef.current) {
      recordF2SearchQuery(context, partyId, searchQueryRef.current);
      clearResults();
    }
    wasOpenRef.current = open;
  }, [open, context, partyId, clearResults]);

  /** F2 tetikleyicisi (panel zaten açıkken tekrar F2) — sorguyu koru, inputa odak */
  useEffect(() => {
    if (f2Trigger > lastF2TriggerRef.current) {
      lastF2TriggerRef.current = f2Trigger;
      if (open) {
        const lastQuery = getLastF2SearchQuery(context, partyId);
        if (lastQuery !== searchQueryRef.current) {
          setSearchQuery(lastQuery);
        }
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
      if (!trimmed) {
        clearResults();
        return;
      }

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

        if (response.data.success) {
          const batch = ensureArray(response.data.data);
          setResults((prev) => (append ? [...prev, ...batch] : batch));
          setTotalCount(response.data.totalCount);
          setPage(response.data.page);
          setHasMore(response.data.page * response.data.limit < response.data.totalCount);
          setFocusedIndex((prev) => (append ? prev : batch.length > 0 ? 0 : -1));
        }
      } catch {
        if (!append) {
          clearResults();
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [clearResults, context, exchangeRate, partyId]
  );

  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = searchQuery.trim();

    if (!trimmed) {
      clearResults();
      return;
    }

    debounceRef.current = setTimeout(() => {
      void fetchPage(1, trimmed, false);
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, searchQuery, partyId, fetchPage, clearResults]);

  const loadMore = useCallback(() => {
    if (!open || loading || loadingMore || !hasMore) return;
    if (!searchQuery.trim()) return;
    void fetchPage(page + 1, searchQuery.trim(), true);
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
      setFocusedIndex((prev) => {
        if (results.length === 0) return -1;
        const current = prev < 0 ? 0 : prev;
        const next = Math.max(0, Math.min(current + delta, results.length - 1));
        if (next >= results.length - 10 && hasMore && !loadingMore && !loading) {
          void fetchPage(page + 1, searchQuery.trim(), true);
        }
        return next;
      });
    },
    [results.length, hasMore, loadingMore, loading, page, searchQuery, fetchPage]
  );

  return {
    searchQuery,
    setSearchQuery,
    results,
    focusedIndex,
    setFocusedIndex,
    loading,
    loadingMore,
    totalCount,
    hasMore,
    searchInputRef,
    listRef,
    handleListScroll,
    navigateFocus,
  };
}
