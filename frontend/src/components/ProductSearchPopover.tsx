import { useEffect, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';

type ProductSearchPopoverProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  hint?: string;
  headerClassName?: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  listRef?: RefObject<HTMLDivElement | null>;
  onListScroll?: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  searchLoading?: boolean;
  loadingMore?: boolean;
  footer?: string;
  children: ReactNode;
  emptyHint?: string;
  showEmpty?: boolean;
  searchPlaceholder?: string;
};

/** F2 / hızlı ürün arama — sayfayı kapatmaz, sağ üstte kompakt panel */
export default function ProductSearchPopover({
  open,
  onClose,
  title = 'Hızlı Stok Arama',
  hint = '↑↓ · PgUp/Dn · Enter · Esc',
  headerClassName = 'bg-indigo-600',
  searchQuery,
  onSearchChange,
  searchInputRef,
  listRef,
  onListScroll,
  onKeyDown,
  searchLoading = false,
  loadingMore = false,
  footer,
  children,
  emptyHint = 'Ürünler yükleniyor...',
  showEmpty = true,
  searchPlaceholder = 'SKU, barkod veya ürün adı...',
}: ProductSearchPopoverProps) {
  useEffect(() => {
    if (!open) return;

    const focusInput = () => searchInputRef.current?.focus();
    focusInput();
    const timer = window.setTimeout(focusInput, 0);
    const raf = window.requestAnimationFrame(focusInput);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape, true);

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [open, onClose, searchInputRef]);

  if (!open) return null;

  return (
    <div
      className="fixed top-[4.25rem] left-3 right-3 sm:left-auto sm:right-5 z-50 w-auto sm:w-[22rem] md:w-[26rem] rounded-xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`${headerClassName} px-3 py-2 text-white flex items-center justify-between gap-2`}>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{title}</h3>
          <p className="text-caption opacity-80">{hint} · sayfa açık kalır</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-1 rounded hover:bg-white/15"
          aria-label="Kapat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-2.5 border-b border-slate-100 bg-slate-50/50">
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={searchPlaceholder}
          autoComplete="off"
          autoFocus
          className="w-full rounded-lg border border-slate-300 bg-white text-sm px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>

      <div
        ref={listRef}
        onScroll={onListScroll}
        className="max-h-[min(60vh,24rem)] overflow-y-auto"
      >
        {searchLoading && (
          <p className="px-3 py-6 text-center text-slate-400 text-xs">Yükleniyor...</p>
        )}
        {!searchLoading && children}
        {loadingMore && (
          <p className="px-3 py-2 text-center text-slate-400 text-xs">Daha fazla yükleniyor...</p>
        )}
        {!searchLoading && showEmpty && (
          <p className="px-3 py-6 text-center text-slate-400 text-xs">{emptyHint}</p>
        )}
      </div>
      {footer ? (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-caption text-slate-500 text-right">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
