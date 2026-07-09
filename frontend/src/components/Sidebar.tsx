import { ChevronDown, Keyboard, LogOut, X, Zap } from 'lucide-react';
import type { MenuCategoryId, PageId } from '../lib/navigation';
import {
  buildPageUrl,
  dashboardItem,
  dashboardQuickLinks,
  menuCategories,
} from '../lib/navigation';

type SidebarProps = {
  activePage: PageId;
  openMenus: Record<MenuCategoryId, boolean>;
  mobileOpen?: boolean;
  appVersion?: string;
  onToggleMenu: (id: MenuCategoryId) => void;
  onLogout: () => void;
  onMobileClose?: () => void;
};

export default function Sidebar({
  activePage,
  openMenus,
  mobileOpen = false,
  appVersion,
  onToggleMenu,
  onLogout,
  onMobileClose,
}: SidebarProps) {
  const DashboardIcon = dashboardItem.icon;

  const isItemActive = (pageId: PageId) =>
    activePage === pageId ||
    (pageId === 'customer-list' && activePage === 'customer-detail');

  const isCategoryActive = (categoryId: MenuCategoryId) => {
    if (categoryId === 'customer' && activePage === 'customer-detail') return true;
    return (
      menuCategories
        .find((c) => c.id === categoryId)
        ?.items.some((item) => item.id === activePage) ?? false
    );
  };

  /** Sol menü her zaman yeni sekmede açılır; sayfa içi gezinme geri butonu ile çalışır */
  const handleMenuClick = () => {
    onMobileClose?.();
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-[min(100vw-3rem,17rem)] flex-col bg-slate-900 text-slate-200 shadow-xl transition-transform duration-300 ease-in-out print:hidden lg:static lg:z-auto lg:w-64 lg:shrink-0 lg:translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      aria-label="Ana menü"
    >
      <div className="border-b border-slate-800/80 px-4 py-4 lg:px-5 lg:py-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="rounded-lg bg-indigo-500/90 p-1.5 text-white">
              <Zap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-wide text-white">
                AKG
              </h1>
              <p className="text-caption text-slate-400">Teknik ERP</p>
            </div>
          </div>
          {onMobileClose && (
            <button
              type="button"
              onClick={onMobileClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
              aria-label="Menüyü kapat"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-2 py-3">
        <a
          href={buildPageUrl('dashboard')}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleMenuClick}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all no-underline ${
            isItemActive('dashboard')
              ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/30'
              : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
          }`}
        >
          <DashboardIcon className="h-4 w-4 shrink-0 text-indigo-300" />
          <span>{dashboardItem.label}</span>
        </a>

        <div className="mb-2 space-y-0.5 border-b border-slate-800/80 pb-2 pl-2 pr-1">
          <p className="px-3 py-1 text-caption font-semibold uppercase tracking-wide text-slate-500">
            Hızlı İşlemler
          </p>
          {dashboardQuickLinks.map((item) => {
            const active = isItemActive(item.id);
            return (
              <a
                key={item.id}
                href={buildPageUrl(item.id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleMenuClick}
                className={`flex w-full items-center gap-2 rounded-lg py-2 pl-7 pr-3 text-sm transition-all no-underline ${
                  active
                    ? 'bg-indigo-600/90 font-medium text-white shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && (
                  <kbd
                    className={`rounded px-1.5 py-0.5 font-mono text-caption ${
                      active
                        ? 'bg-indigo-500/50 text-indigo-100'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {item.badge}
                  </kbd>
                )}
              </a>
            );
          })}
        </div>

        {menuCategories.map((category) => {
          const CategoryIcon = category.icon;
          const isOpen = openMenus[category.id];
          const categoryActive = isCategoryActive(category.id);

          return (
            <div key={category.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => onToggleMenu(category.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  categoryActive
                    ? 'bg-slate-800/80 text-white'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <CategoryIcon
                  className={`h-4 w-4 shrink-0 ${
                    categoryActive ? 'text-indigo-300' : 'text-slate-500'
                  }`}
                />
                <span className="flex-1 text-left text-sm">{category.label}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <div
                className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="space-y-0.5 py-1 pl-2 pr-1">
                    {category.items.map((item) => {
                      const active = isItemActive(item.id);
                      const href = buildPageUrl(
                        item.id,
                        item.id === 'pre-orders' ? { preOrderOnly: true } : undefined
                      );
                      return (
                        <a
                          key={item.id}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={handleMenuClick}
                          className={`flex w-full items-center gap-2 rounded-lg py-2 pl-7 pr-3 text-sm transition-all no-underline ${
                            active
                              ? 'bg-indigo-600/90 font-medium text-white shadow-sm'
                              : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                          }`}
                        >
                          <span className="flex-1 text-left">{item.label}</span>
                          {item.badge && (
                            <kbd
                              className={`rounded px-1.5 py-0.5 font-mono text-caption ${
                                active
                                  ? 'bg-indigo-500/50 text-indigo-100'
                                  : 'bg-slate-800 text-slate-500'
                              }`}
                            >
                              {item.badge}
                            </kbd>
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-slate-800/80 px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {appVersion && (
          <p className="px-2 text-center text-[10px] font-mono text-slate-600">{appVersion}</p>
        )}
        <div className="flex items-center gap-2 px-2 text-xs text-slate-500">
          <Keyboard className="h-3.5 w-3.5" />
          <span>F2 — Stok ara · Menü yeni sekmede</span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm font-medium text-red-400 transition-all hover:bg-red-500/20 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          Güvenli Çıkış
        </button>
      </div>
    </aside>
  );
}
