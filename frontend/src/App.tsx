import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import { API_BASE, AUTH_STORAGE_KEY, AUTH_TOKEN_KEY } from './lib/api';
import {
  buildPageUrl,
  getCategoryForPage,
  getPageLabel,
  menuCategories,
  parsePageFromUrl,
  type InvoiceFilter,
  type MenuCategoryId,
  type NavigateFn,
  type PageId,
} from './lib/navigation';
import Dashboard from './pages/Dashboard';
import SalesCreate from './pages/SalesCreate';
import Invoices from './pages/Invoices';
import DeletedInvoices from './pages/DeletedInvoices';
import StockList from './pages/StockList';
import BarcodePrint from './pages/BarcodePrint';
import CustomerList from './pages/CustomerList';
import CustomerCreate from './pages/CustomerCreate';
import CustomerPayment from './pages/CustomerPayment';
import CustomerBalances from './pages/CustomerBalances';
import ProfitReport from './pages/ProfitReport';
import CategoryManager from './pages/CategoryManager';
import SafeManager from './pages/SafeManager';
import PersonnelManager from './pages/PersonnelManager';
import ProductCreate from './pages/ProductCreate';
import SalesReturn from './pages/SalesReturn';
import PurchaseCreate from './pages/PurchaseCreate';
import StockTransfer from './pages/StockTransfer';
import StockMovements from './pages/StockMovements';
import StockValueReport from './pages/StockValueReport';
import CashFlowReport from './pages/CashFlowReport';
import CustomerStatement from './pages/CustomerStatement';
import CustomerDetail from './pages/CustomerDetail';
import AnalyticsReport from './pages/AnalyticsReport';
import Login from './pages/Login';
import { AppNavigationContext } from './context/AppNavigationContext';

const F2_ENABLED_PAGES: PageId[] = [
  'sales',
  'invoice-purchase',
  'sales-return',
  'customer-payments',
];

const initialOpenMenus = menuCategories.reduce(
  (acc, cat) => {
    acc[cat.id] = false;
    return acc;
  },
  {} as Record<MenuCategoryId, boolean>
);

const FRONTEND_VERSION = 'v1.8.32';

function App() {
  const initialUrl = parsePageFromUrl();
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => localStorage.getItem(AUTH_STORAGE_KEY) === 'true'
  );
  const [activePage, setActivePage] = useState<PageId>(initialUrl.page);
  const [activeCustomerId, setActiveCustomerId] = useState<number | undefined>(
    initialUrl.customerId
  );
  const [editInvoiceId, setEditInvoiceId] = useState<number | undefined>(
    initialUrl.editInvoiceId
  );
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>(initialUrl.invoiceFilter);
  const [preOrderOnly, setPreOrderOnly] = useState(initialUrl.preOrderOnly);
  const [openMenus, setOpenMenus] =
    useState<Record<MenuCategoryId, boolean>>(() => {
      const menus = { ...initialOpenMenus };
      const category = getCategoryForPage(initialUrl.page === 'pre-orders' ? 'sales' : initialUrl.page);
      if (category) menus[category] = true;
      return menus;
    });
  const [f2Trigger, setF2Trigger] = useState(0);
  const [embeddedSalesEditorOpen, setEmbeddedSalesEditorOpen] = useState(false);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [apiVersion, setApiVersion] = useState<string | null>(null);

  const applyRoute = useCallback(
    (parsed: ReturnType<typeof parsePageFromUrl>) => {
      setActivePage(parsed.page);
      setActiveCustomerId(parsed.customerId);
      setEditInvoiceId(parsed.editInvoiceId);
      setMobileNavOpen(false);

      if (parsed.page === 'invoices') {
        setInvoiceFilter(parsed.invoiceFilter);
        setPreOrderOnly(false);
      } else if (parsed.page === 'pre-orders') {
        setPreOrderOnly(true);
        setInvoiceFilter('SATIS');
      } else {
        setPreOrderOnly(parsed.preOrderOnly);
      }

      const category = getCategoryForPage(
        parsed.page === 'pre-orders' ? 'sales' : parsed.page
      );
      if (category) {
        setOpenMenus((prev) => ({ ...prev, [category]: true }));
      }
    },
    []
  );

  const navigateTo: NavigateFn = useCallback(
    (page, options) => {
      if (page === 'dashboard') {
        setDashboardRefreshKey((prev) => prev + 1);
      }

      const mergedOptions: Parameters<typeof buildPageUrl>[1] = {
        invoiceFilter: options?.invoiceFilter,
        preOrderOnly: page === 'pre-orders' || options?.preOrderOnly,
        customerId: options?.customerId,
        editInvoiceId: options?.editInvoiceId,
      };

      if (page === 'invoices') {
        mergedOptions.invoiceFilter = options?.invoiceFilter ?? 'ALL';
        mergedOptions.preOrderOnly = false;
      } else if (page === 'pre-orders') {
        mergedOptions.preOrderOnly = true;
      }

      const nextUrl = buildPageUrl(page, mergedOptions);
      const parsed = parsePageFromUrl();
      const currentParams = new URL(window.location.href).searchParams;
      const nextParams = new URL(nextUrl).searchParams;
      const sameRoute =
        currentParams.get('page') === nextParams.get('page') &&
        (currentParams.get('filter') ?? '') === (nextParams.get('filter') ?? '') &&
        (currentParams.get('preOrder') ?? '') === (nextParams.get('preOrder') ?? '') &&
        (currentParams.get('customerId') ?? '') === (nextParams.get('customerId') ?? '') &&
        (currentParams.get('invoiceId') ?? '') === (nextParams.get('invoiceId') ?? '');

      applyRoute({
        page,
        invoiceFilter:
          page === 'invoices'
            ? (options?.invoiceFilter ?? 'ALL')
            : page === 'pre-orders'
              ? 'SATIS'
              : parsed.invoiceFilter,
        preOrderOnly: page === 'pre-orders' || (options?.preOrderOnly ?? false),
        customerId: options?.customerId,
        editInvoiceId: options?.editInvoiceId,
      });

      if (options?.replace || sameRoute) {
        window.history.replaceState({ app: true }, '', nextUrl);
      } else {
        window.history.pushState({ app: true }, '', nextUrl);
      }
    },
    [applyRoute]
  );

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    if (activePage !== 'dashboard' || editInvoiceId) {
      navigateTo('dashboard', { replace: true });
    }
  }, [activePage, editInvoiceId, navigateTo]);

  const showBackButton =
    activePage !== 'dashboard' || editInvoiceId != null;

  const formattedDateLong = useMemo(
    () =>
      new Intl.DateTimeFormat('tr-TR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    []
  );

  const formattedDateShort = useMemo(
    () =>
      new Intl.DateTimeFormat('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date()),
    []
  );

  const showNotification = useCallback(
    (type: 'success' | 'error', message: string) => {
      setNotification({ type, message });
      setTimeout(() => setNotification(null), 4000);
    },
    []
  );

  const navigationValue = useMemo(
    () => ({
      navigateTo,
      navigateToCustomer: (customerId: number) => {
        navigateTo('customer-detail', { customerId });
      },
      goBack,
    }),
    [navigateTo, goBack]
  );

  const toggleMenu = useCallback((id: MenuCategoryId) => {
    setOpenMenus((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleLoginSuccess = useCallback(() => {
    localStorage.setItem(AUTH_STORAGE_KEY, 'true');
    setIsLoggedIn(true);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setIsLoggedIn(false);
    navigateTo('dashboard', { replace: true });
  }, [navigateTo]);

  useEffect(() => {
    if (!isLoggedIn) return;

    let cancelled = false;
    void axios
      .get<{ success: boolean; data: { version: string } }>(`${API_BASE}/api/version`)
      .then((response) => {
        if (!cancelled && response.data.success) {
          setApiVersion(response.data.data.version);
        }
      })
      .catch(() => {
        if (!cancelled) setApiVersion(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;

    const handlePopState = () => {
      applyRoute(parsePageFromUrl());
    };

    window.addEventListener('popstate', handlePopState);
    window.history.replaceState({ app: true }, '', window.location.href);

    return () => window.removeEventListener('popstate', handlePopState);
  }, [isLoggedIn, applyRoute]);

  useEffect(() => {
    if (!isLoggedIn) return;

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault();
        if (!F2_ENABLED_PAGES.includes(activePage) && !embeddedSalesEditorOpen) {
          showNotification(
            'error',
            'F2 yalnızca Satış, Alış Faturası, Satış İade ve Tahsilat/Ödeme ekranlarında çalışır.'
          );
          return;
        }
        setF2Trigger((prev) => prev + 1);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isLoggedIn, activePage, embeddedSalesEditorOpen, showNotification]);

  useEffect(() => {
    if (!mobileNavOpen) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  const handleDataChange = useCallback(() => {
    setDashboardRefreshKey((prev) => prev + 1);
  }, []);

  const pageContent = useMemo(() => {
    switch (activePage) {
      case 'dashboard':
        return (
          <Dashboard
            refreshKey={dashboardRefreshKey}
            f2Trigger={f2Trigger}
            initialEditInvoiceId={editInvoiceId}
            onNotify={showNotification}
            onDataChange={handleDataChange}
            onF2ContextActive={setEmbeddedSalesEditorOpen}
          />
        );
      case 'sales':
        return (
          <SalesCreate
            f2Trigger={f2Trigger}
            onNotify={showNotification}
            onDataChange={handleDataChange}
          />
        );
      case 'sales-return':
        return (
          <SalesReturn
            f2Trigger={f2Trigger}
            onNotify={showNotification}
            onDataChange={handleDataChange}
          />
        );
      case 'product-create':
        return <ProductCreate onNotify={showNotification} />;
      case 'invoice-purchase':
        return (
          <PurchaseCreate
            f2Trigger={f2Trigger}
            onNotify={showNotification}
            onDataChange={handleDataChange}
          />
        );
      case 'invoices':
        return (
          <Invoices
            key={`${invoiceFilter}-${preOrderOnly}-${dashboardRefreshKey}`}
            pageId="invoices"
            refreshKey={dashboardRefreshKey}
            initialFilter={invoiceFilter}
            preOrderOnly={preOrderOnly}
            initialEditInvoiceId={editInvoiceId}
            f2Trigger={f2Trigger}
            title={preOrderOnly ? 'Ön Siparişler' : 'Fatura Listesi'}
            description={
              preOrderOnly
                ? 'Stok düşümü yapılmamış bekleyen satış siparişleri'
                : 'Satış, alış ve iade faturaları — görüntüle ve düzenle'
            }
            onNotify={showNotification}
            onDataChange={handleDataChange}
            onF2ContextActive={setEmbeddedSalesEditorOpen}
          />
        );
      case 'deleted-invoices':
        return (
          <DeletedInvoices
            onNotify={showNotification}
            onDataChange={handleDataChange}
          />
        );
      case 'pre-orders':
        return (
          <Invoices
            key={`pre-orders-${dashboardRefreshKey}`}
            pageId="pre-orders"
            refreshKey={dashboardRefreshKey}
            preOrderOnly
            initialEditInvoiceId={editInvoiceId}
            f2Trigger={f2Trigger}
            initialFilter="SATIS"
            title="Ön Siparişler"
            description="Stok düşümü yapılmamış bekleyen satış siparişleri"
            onNotify={showNotification}
            onDataChange={handleDataChange}
            onF2ContextActive={setEmbeddedSalesEditorOpen}
          />
        );
      case 'stock-list':
        return <StockList onNotify={showNotification} />;
      case 'stock-transfer':
        return (
          <StockTransfer
            onNotify={showNotification}
            onDataChange={handleDataChange}
          />
        );
      case 'stock-movements':
        return <StockMovements />;
      case 'barcode-label':
        return <BarcodePrint />;
      case 'customer-list':
        return <CustomerList onNotify={showNotification} />;
      case 'customer-create':
        return (
          <CustomerCreate onNotify={showNotification} onNavigate={navigateTo} />
        );
      case 'customer-detail':
        if (!activeCustomerId) {
          return <CustomerList onNotify={showNotification} />;
        }
        return (
          <CustomerDetail
            customerId={activeCustomerId}
            initialEditInvoiceId={editInvoiceId}
            onNavigate={navigateTo}
            onNotify={showNotification}
            onDataChange={handleDataChange}
          />
        );
      case 'customer-payments':
        return (
          <CustomerPayment
            f2Trigger={f2Trigger}
            initialCustomerId={activeCustomerId}
            onNotify={showNotification}
            onDataChange={handleDataChange}
          />
        );
      case 'customer-balance':
        return <CustomerBalances />;
      case 'report-sales':
        return <ProfitReport />;
      case 'report-analytics':
        return <AnalyticsReport />;
      case 'report-stock-value':
        return <StockValueReport />;
      case 'report-cash-flow':
        return <CashFlowReport />;
      case 'report-customer-statement':
        return <CustomerStatement initialCustomerId={activeCustomerId} />;
      case 'def-products':
        return (
          <StockList
            onNotify={showNotification}
            title="Ürün Tanımları"
            subtitle="Ürün adı, fiyat ve stok düzenleme · silme · Excel isteğe bağlı"
          />
        );
      case 'def-categories':
        return <CategoryManager />;
      case 'def-safes':
        return <SafeManager />;
      case 'def-users':
        return <PersonnelManager />;
      default:
        return null;
    }
  }, [
    activePage,
    activeCustomerId,
    f2Trigger,
    showNotification,
    dashboardRefreshKey,
    handleDataChange,
    navigateTo,
    invoiceFilter,
    preOrderOnly,
    editInvoiceId,
  ]);

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <AppNavigationContext.Provider value={navigationValue}>
    <div className="flex min-h-[100dvh] overflow-x-hidden bg-slate-100 text-slate-900 print:block print:min-h-0 print:overflow-visible print:bg-white">
      {notification && (
        <div
          className={`fixed z-[60] px-4 py-3 text-sm font-medium text-white shadow-lg print:hidden sm:text-base ${
            notification.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          } bottom-4 left-4 right-4 rounded-lg sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:max-w-md`}
        >
          {notification.message}
        </div>
      )}

      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[2px] lg:hidden"
          aria-label="Menüyü kapat"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <Sidebar
        activePage={activePage}
        openMenus={openMenus}
        mobileOpen={mobileNavOpen}
        onToggleMenu={toggleMenu}
        onLogout={handleLogout}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col print:block print:min-w-0">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm print:hidden">
          <div className="flex flex-col gap-3 px-3 py-2.5 sm:px-6 sm:py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
                  aria-label="Menüyü aç"
                >
                  <Menu className="h-5 w-5" />
                </button>
                {showBackButton && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    title="Geri"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Geri</span>
                  </button>
                )}
                <div className="min-w-0">
                  {showBackButton && activePage !== 'dashboard' && (
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {getPageLabel(activePage)}
                    </p>
                  )}
                  <p className="truncate text-xs text-slate-500 sm:hidden">
                    {formattedDateShort}
                  </p>
                  <p className="hidden truncate text-sm text-slate-500 sm:block">
                    {formattedDateLong}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center sm:px-3">
                  <span className="text-[10px] font-medium text-slate-500 sm:text-xs">
                    Arayüz {FRONTEND_VERSION}
                    {apiVersion ? ` · API ${apiVersion}` : ''}
                  </span>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-center sm:px-4 sm:py-2">
                  <span className="text-xs font-semibold text-emerald-700 sm:text-sm">
                    Tutarlar: USD ($)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden p-3 sm:p-4 lg:p-6 print:overflow-visible print:p-0">
          {pageContent}
        </main>
      </div>
    </div>
    </AppNavigationContext.Provider>
  );
}

export default App;
