import type { F2ProductContext } from '../hooks/useF2ProductSearch';

const STORAGE_KEY = 'akgun-f2-last-product';

function storageKey(context: F2ProductContext, partyId?: number | null): string {
  return `${context}:${partyId ?? 0}`;
}

function readStore(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, number>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function recordF2ProductSelection(
  context: F2ProductContext,
  productId: number,
  partyId?: number | null
) {
  if (!productId) return;
  const store = readStore();
  store[storageKey(context, partyId)] = productId;
  writeStore(store);
}

export function getLastF2ProductId(
  context: F2ProductContext,
  partyId?: number | null
): number | null {
  const id = readStore()[storageKey(context, partyId)];
  return typeof id === 'number' && id > 0 ? id : null;
}

const SEARCH_STORAGE_KEY = 'akgun-f2-last-search';

/** Arama metni müşteriden bağımsız — son kapandığı haliyle geri gelir */
function readSearchStore(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(SEARCH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSearchStore(store: Record<string, string>) {
  try {
    sessionStorage.setItem(SEARCH_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function recordF2SearchQuery(
  context: F2ProductContext,
  _partyId: number | null | undefined,
  query: string
) {
  const store = readSearchStore();
  store[context] = query;
  writeSearchStore(store);
}

export function getLastF2SearchQuery(
  context: F2ProductContext,
  _partyId?: number | null
): string {
  const value = readSearchStore()[context];
  return typeof value === 'string' ? value : '';
}

const FOCUS_STORAGE_KEY = 'akgun-f2-last-focus';

type FocusState = { query: string; index: number };

function readFocusStore(): Record<string, FocusState> {
  try {
    const raw = sessionStorage.getItem(FOCUS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, FocusState>;
  } catch {
    return {};
  }
}

function writeFocusStore(store: Record<string, FocusState>) {
  try {
    sessionStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

/** Son odaklanılan satır — aynı arama metniyle F2 yeniden açılınca geri gelir */
export function recordF2FocusedIndex(
  context: F2ProductContext,
  query: string,
  index: number
) {
  const trimmed = query.trim();
  if (!trimmed || index < 0) return;
  const store = readFocusStore();
  store[context] = { query: trimmed, index };
  writeFocusStore(store);
}

export function getLastF2FocusedIndex(
  context: F2ProductContext,
  query: string
): number | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const state = readFocusStore()[context];
  if (!state || state.query !== trimmed) return null;
  return typeof state.index === 'number' && state.index >= 0 ? state.index : null;
}

/** Fiş kesilince F2 arama metni / odak sıfırlanır */
export function clearF2SearchSession(context: F2ProductContext) {
  const searchStore = readSearchStore();
  delete searchStore[context];
  writeSearchStore(searchStore);

  const focusStore = readFocusStore();
  delete focusStore[context];
  writeFocusStore(focusStore);
}
