import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  FileText,
  Printer,
  RotateCcw,
  Save,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';
import NumericInput from '../components/NumericInput';
import SavedBanner from '../components/SavedBanner';
import ProductSearchPopover from '../components/ProductSearchPopover';
import InlineCustomerSearchInput from '../components/InlineCustomerSearchInput';
import F2ProductList from '../components/F2ProductList';
import ProductStockHistoryModal from '../components/ProductStockHistoryModal';
import { useAppNavigationOptional } from '../context/AppNavigationContext';
import { useF2ProductSearch, type F2Product } from '../hooks/useF2ProductSearch';
import { useF2KeyboardNav } from '../hooks/useF2KeyboardNav';
import { useCartGridKeyboardNav } from '../hooks/useCartGridKeyboardNav';
import { useHoldKeyReveal } from '../hooks/useHoldKeyReveal';
import { depotLabel } from '../lib/depots';
import {
  API_BASE,
  ensureArray,
  formatDate,
  formatMoney,
  formatUsd,
  roundPrice,
  toIntegerQty,
  type Customer,
} from '../lib/api';
import { recordF2ProductSelection } from '../lib/f2LastProduct';
import { pickCustomerFromSearch } from '../lib/customerSearch';
import {
  RECEIPT_DISCLAIMER,
  buildReceiptPartyLines,
  type ReceiptParty,
} from '../lib/receiptParty';
import { printDocument } from '../lib/printMode';
import InvoiceTrashButton from '../components/InvoiceTrashButton';
import { productDisplayName } from '../lib/productDisplayName';
import { buildPageUrl } from '../lib/navigation';
import { useTrashInvoice } from '../hooks/useTrashInvoice';
import SalesCreate from './SalesCreate';

const EXCHANGE_RATE = 1;

/**
 * İade ızgarasında sol→sağ hücre sırası. Birim fiyat kutusu yalnızca elle
 * girilen (kayıt dışı) satırlarda çizilir; gezinme olmayan hücreyi atlar.
 */
const RETURN_GRID_FIELDS = ['returnQty', 'unitPriceUsd'] as const;

/** Kayıtlı iadeyi düzenleme ızgarasının hücre sırası */
const EDIT_GRID_FIELDS = ['quantity', 'unitPriceTl'] as const;

type Branch = { id: number; name: string; type: string };
type Safe = {
  id: number;
  branchId: number;
  name: string;
  currency: string;
  balance: number;
};

type ReturnableLookup =
  | {
      status: 'ok';
      invoiceId: number;
      invoiceNo: string;
      soldAt: string;
      exchangeRate: number;
      sourceInvoiceItemId: number;
      unitPrice: number;
      returnableQty: number;
      product: {
        id: number;
        sku: string;
        barcode: string | null;
        name: string;
        /** Fişte gizlenir — yalnızca adın sadeleştirilmesinde kullanılır */
        brand?: string | null;
        model?: string | null;
      };
    }
  | { status: 'never_purchased' }
  | { status: 'too_old'; lastPurchaseDate: string }
  | { status: 'fully_returned'; lastPurchaseDate: string };

type ReturnCartLine = {
  rowId: string;
  productId: number;
  productName: string;
  productSku: string;
  sourceInvoiceItemId: number;
  invoiceId: number;
  invoiceNo: string;
  unitPriceTl: number;
  exchangeRate: number;
  returnQty: number;
  costUsd: number;
  isChinaReturn: boolean;
  manualOverride?: boolean;
};

function productCostUsd(product: F2Product): number {
  if (product.costUsd != null && product.costUsd > 0) {
    return roundPrice(product.costUsd);
  }
  if (product.costPrice > 0) {
    return roundPrice(product.costPrice);
  }
  return roundPrice(product.priceUsd);
}

function newRowId(prefix: string, productId: number) {
  return `${prefix}-${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type WarningState = {
  title: string;
  message: string;
  product?: F2Product;
  allowForce?: boolean;
};

type SalesReturnProps = {
  f2Trigger?: number;
  editInvoiceId?: number | null;
  onNotify?: (type: 'success' | 'error', message: string) => void;
  onDataChange?: () => void;
  onCancelEdit?: () => void;
  onSaved?: () => void;
};

type EditReturnLine = {
  rowId: string;
  /** Kayitli kalemin id'si. null ise bu satir duzenleme sirasinda EKLENDI. */
  invoiceItemId: number | null;
  productId: number;
  productName: string;
  productSku: string;
  quantity: number;
  unitPriceTl: number;
  /** true ise stok CIN_IADE_DEPO'ya isler */
  isChinaReturn: boolean;
};

export default function SalesReturn({
  f2Trigger = 0,
  editInvoiceId = null,
  onNotify,
  onDataChange,
  onCancelEdit,
  onSaved,
}: SalesReturnProps) {
  const isEditMode = editInvoiceId != null && editInvoiceId > 0;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [safes, setSafes] = useState<Safe[]>([]);
  const [cart, setCart] = useState<ReturnCartLine[]>([]);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const [selectedBranch, setSelectedBranch] = useState<number | ''>('');
  const [selectedSafe, setSelectedSafe] = useState<number | ''>('');
  /** Açık = cari, Kapalı = kasadan para çıkışı */
  const [settlementType, setSettlementType] = useState<'ACIK' | 'KAPALI'>('ACIK');

  const [submitting, setSubmitting] = useState(false);
  const [searchModal, setSearchModal] = useState(false);
  const [warning, setWarning] = useState<WarningState | null>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<number | null>(null);
  const [historyProduct, setHistoryProduct] = useState<{
    id: number;
    sku: string;
    name: string;
  } | null>(null);
  const [pickingProduct, setPickingProduct] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [displayInvoiceNo, setDisplayInvoiceNo] = useState('');
  const [editLines, setEditLines] = useState<EditReturnLine[]>([]);
  const [removedItemIds, setRemovedItemIds] = useState<number[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [editProcessedBy, setEditProcessedBy] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editCustomerLabel, setEditCustomerLabel] = useState('');
  const [editCustomerId, setEditCustomerId] = useState<number | ''>('');
  /** Kayıtlı iadenin tahsil şekli — fişteki bakiye hesabı buna göre yapılır */
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [shouldPrint, setShouldPrint] = useState(false);
  const [printParty, setPrintParty] = useState<ReceiptParty | null>(null);
  const [orderNotes, setOrderNotes] = useState('');

  const showCosts = useHoldKeyReveal('F8');

  const handlePrint = useCallback(() => {
    printDocument();
  }, []);

  const getCartRowIds = useCallback(() => cart.map((line) => line.rowId), [cart]);
  const {
    setRef: setCartInputRef,
    focusFieldSoon: focusCartFieldSoon,
    onKeyDown: onCartFieldKeyDown,
  } = useCartGridKeyboardNav(getCartRowIds, RETURN_GRID_FIELDS);

  const getEditRowIds = useCallback(() => editLines.map((line) => line.rowId), [editLines]);
  const {
    setRef: setEditInputRef,
    focusFieldSoon: focusEditFieldSoon,
    onKeyDown: onEditFieldKeyDown,
  } = useCartGridKeyboardNav(getEditRowIds, EDIT_GRID_FIELDS);

  /**
   * Kayıttan sonra sayfada kalınır; yeşil şerit onayı ekranın üstünde
   * tutar, fişte bir şey değişince kaybolur.
   */
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const f2 = useF2ProductSearch({
    open: searchModal,
    f2Trigger,
    context: 'return',
    partyId: selectedCustomer?.id ?? null,
    exchangeRate: EXCHANGE_RATE,
  });

  const branchSafes = useMemo(
    () =>
      safes.filter(
        (safe) => selectedBranch !== '' && safe.branchId === selectedBranch
      ),
    [safes, selectedBranch]
  );

  const activeLines = useMemo(() => cart.filter((row) => row.returnQty > 0), [cart]);

  const totalUsd = useMemo(
    () =>
      roundPrice(
        activeLines.reduce((sum, row) => sum + row.returnQty * row.unitPriceTl, 0)
      ),
    [activeLines]
  );

  const totalQuantity = useMemo(
    () => activeLines.reduce((sum, row) => sum + row.returnQty, 0),
    [activeLines]
  );

  const receiptParty = printParty ?? selectedCustomer;
  const receiptPartyLines = useMemo(
    () => buildReceiptPartyLines(receiptParty),
    [receiptParty]
  );

  /** İade fişinde önceki/güncel bakiye — Açık faturada cariden düşer, Kapalıda değişmez */
  const receiptBalance = useMemo(() => {
    if (!receiptParty || typeof receiptParty.balance !== 'number') return null;
    const before = receiptParty.balance;
    const after = settlementType === 'ACIK' ? roundPrice(before - totalUsd) : before;
    return { before, after };
  }, [receiptParty, settlementType, totalUsd]);

  /** Fiş/PDF çıktısı alfabetik — ekrandaki sepet ekleme sırasında kalır */
  const receiptLines = useMemo(
    () =>
      [...activeLines].sort((a, b) =>
        a.productName.localeCompare(b.productName, 'tr')
      ),
    [activeLines]
  );

  const receiptEditLines = useMemo(
    () =>
      [...editLines].sort((a, b) =>
        a.productName.localeCompare(b.productName, 'tr')
      ),
    [editLines]
  );

  const chinaReturnCount = activeLines.filter((r) => r.isChinaReturn).length;
  const stockReturnCount = activeLines.length - chinaReturnCount;

  const notify = useCallback(
    (type: 'success' | 'error', message: string) => onNotify?.(type, message),
    [onNotify]
  );

  const { trashInvoice, trashing } = useTrashInvoice(() => {
    onDataChange?.();
    onCancelEdit?.();
  });

  const handleTrashInvoice = useCallback(async () => {
    if (!editInvoiceId || !displayInvoiceNo) return;
    const ok = await trashInvoice(editInvoiceId, displayInvoiceNo);
    if (ok) notify('success', 'Fiş silinen işlemlere taşındı.');
  }, [editInvoiceId, displayInvoiceNo, trashInvoice, notify]);

  const closeInvoiceView = useCallback(() => {
    setViewingInvoiceId(null);
  }, []);

  /*
   * Fatura görünümü açıkken üst bardaki Geri tuşu da bu görünümü kapatsın.
   * Öncesinde o tuş `history.back()` çağırıp ana sayfaya atıyor, iade
   * ekranındaki müşteri ve sepet seçimi kayboluyordu.
   */
  const appNavigation = useAppNavigationOptional();

  useEffect(() => {
    if (!appNavigation || viewingInvoiceId === null) return;
    appNavigation.registerBackHandler(() => {
      setViewingInvoiceId(null);
      return true;
    });
    return () => appNavigation.registerBackHandler(null);
  }, [appNavigation, viewingInvoiceId]);

  const loadInit = useCallback(async () => {
    try {
      const initRes = await axios.get<{
        success: boolean;
        data: { branches: Branch[]; safes: Safe[] };
      }>(`${API_BASE}/api/sales/init`);

      if (initRes.data.success) {
        const branchList = ensureArray(initRes.data.data.branches);
        const safeList = ensureArray(initRes.data.data.safes);
        setBranches(branchList);
        setSafes(safeList);
        if (!isEditMode && branchList.length > 0) {
          setSelectedBranch(branchList[0].id);
          const safe = safeList.find((s) => s.branchId === branchList[0].id);
          if (safe) setSelectedSafe(safe.id);
        }
      }

    } catch {
      notify('error', 'Başlangıç verileri yüklenemedi.');
    }
  }, [notify, isEditMode]);

  useEffect(() => {
    if (!isEditMode || !editInvoiceId) return;

    let cancelled = false;
    const loadInvoice = async () => {
      setEditLoading(true);
      try {
        const invRes = await axios.get<{
          success: boolean;
          data: {
            id: number;
            invoiceNo: string;
            type: string;
            processedBy: string | null;
            orderNotes: string | null;
            exchangeRate: number;
            createdAt: string;
            paymentMethod?: string | null;
            customer: { id: number; code: string; name: string };
            items: Array<{
              id: number;
              quantity: number;
              unitPrice: number;
              /** Satir CIN_IADE_DEPO'ya mi islendi */
              isChinaReturn?: boolean;
              product: {
                id: number;
                sku: string;
                name: string;
                brand?: string | null;
                model?: string | null;
              };
            }>;
          };
        }>(`${API_BASE}/api/sales/invoices/${editInvoiceId}`);

        if (!invRes.data.success || cancelled) return;
        const data = invRes.data.data;

        if (data.type !== 'IADE') {
          notify('error', 'Yalnızca iade faturaları düzenlenebilir.');
          onCancelEdit?.();
          return;
        }

        setDisplayInvoiceNo(data.invoiceNo);
        setEditCustomerId(data.customer.id);
        setEditCustomerLabel(`${data.customer.code} — ${data.customer.name}`);
        setEditPaymentMethod(data.paymentMethod ?? '');

        /*
         * Fişte müşteri bilgileri ve bakiye çıkabilmesi için tam müşteri kartı.
         * Fatura ucu yalnızca kod/ad döner; adres, telefon, VKN ve bakiye
         * müşteri kartından gelir.
         */
        try {
          const custRes = await axios.get<{ success: boolean; data: Customer }>(
            `${API_BASE}/api/customers/${data.customer.id}`
          );
          if (!cancelled && custRes.data.success) {
            setSelectedCustomer(custRes.data.data);
          }
        } catch {
          /* fiş yine basılır — yalnızca ek bilgiler eksik kalır */
        }
        setEditProcessedBy(data.processedBy ?? '');
        setEditNotes(data.orderNotes ?? '');
        setEditInvoiceDate(data.createdAt.slice(0, 10));
        setRemovedItemIds([]);
        setEditLines(
          data.items.map((line) => {
            const rate = data.exchangeRate > 0 ? data.exchangeRate : 1;
            return {
              rowId: `inv-${line.id}`,
              invoiceItemId: line.id,
              productId: line.product.id,
              productName: productDisplayName(line.product),
              productSku: line.product.sku,
              quantity: toIntegerQty(line.quantity, 1),
              unitPriceTl: roundPrice(line.unitPrice / rate),
              isChinaReturn: Boolean(line.isChinaReturn),
            };
          })
        );
      } catch {
        if (!cancelled) {
          notify('error', 'İade faturası yüklenemedi.');
          onCancelEdit?.();
        }
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    };

    void loadInvoice();
    return () => {
      cancelled = true;
    };
  }, [editInvoiceId, isEditMode, notify, onCancelEdit]);

  useEffect(() => {
    loadInit();
  }, [loadInit]);

  useEffect(() => {
    setCart([]);
  }, [selectedCustomer?.id]);

  const selectCustomer = useCallback((customer: Customer) => {
    setSavedNotice(null);
    setSelectedCustomer(customer);
    setCustomerSearch(`${customer.code} — ${customer.name}`);
    // Genel müşteri (120) → Kapalı; diğerleri → Açık
    setSettlementType(String(customer.code).trim() === '120' ? 'KAPALI' : 'ACIK');
  }, []);

  const closeSearchModal = useCallback(() => {
    setSearchModal(false);
  }, []);

  const openSearchModal = useCallback(() => {
    if (!selectedCustomer) {
      notify('error', 'Önce müşteri seçin.');
      return;
    }
    setSearchModal(true);
  }, [selectedCustomer, notify]);

  useEffect(() => {
    if (f2Trigger > 0) {
      openSearchModal();
    }
  }, [f2Trigger, openSearchModal]);

  const showLookupWarning = (data: ReturnableLookup, product: F2Product) => {
    if (data.status === 'never_purchased') {
      setWarning({
        title: 'Satın alma kaydı yok',
        message:
          'Bu müşteri bu ürünü sistemde satın almamış görünüyor. Eski kayıtlar için yine de iade alabilirsiniz.',
        product,
        allowForce: true,
      });
      return;
    }
    if (data.status === 'too_old') {
      setWarning({
        title: '6 aylık iade süresi doldu',
        message: `Son alım ${formatDate(data.lastPurchaseDate)} (6 aydan eski). Yine de sepete ekleyebilirsiniz.`,
        product,
        allowForce: true,
      });
      return;
    }
    if (data.status === 'fully_returned') {
      setWarning({
        title: 'Kayıtlı iade limiti dolmuş',
        message: `Son alım ${formatDate(data.lastPurchaseDate)}. Yine de sepete ekleyebilirsiniz.`,
        product,
        allowForce: true,
      });
    }
  };

  const addManualReturnLine = useCallback(
    (product: F2Product) => {
      if (selectedCustomer) {
        recordF2ProductSelection('return', product.id, selectedCustomer.id);
      }
      const unitPriceTl = roundPrice(product.priceUsd);
      const rowId = newRowId('manual', product.id);
      setCart((prev) => [
        ...prev,
        {
          rowId,
          productId: product.id,
          productName: productDisplayName(product),
          productSku: product.sku,
          sourceInvoiceItemId: 0,
          invoiceId: 0,
          invoiceNo: '—',
          unitPriceTl: unitPriceTl > 0 ? unitPriceTl : 0,
          exchangeRate: EXCHANGE_RATE,
          returnQty: 1,
          costUsd: productCostUsd(product),
          isChinaReturn: false,
          manualOverride: true,
        },
      ]);
      notify('success', `${productDisplayName(product)} sepete eklendi — fiyatı satırda düzenleyebilirsiniz.`);
      setWarning(null);
      focusCartFieldSoon(rowId, 'returnQty');
      setSavedNotice(null);
    },
    [notify, selectedCustomer, focusCartFieldSoon]
  );

  const duplicateReturnLine = useCallback(
    (line: ReturnCartLine) => {
      const rowId = newRowId('dup', line.productId);
      setCart((prev) => [
        ...prev,
        {
          ...line,
          rowId,
          returnQty: 1,
          isChinaReturn: false,
        },
      ]);
      notify('success', 'Ayrı kalem eklendi — Çin iade tikini satır satır işaretleyin.');
      focusCartFieldSoon(rowId, 'returnQty');
      setSavedNotice(null);
    },
    [notify, focusCartFieldSoon]
  );

  const pickProductForReturn = useCallback(
    async (product: F2Product) => {
      if (!selectedCustomer) {
        notify('error', 'Önce müşteri seçin.');
        return;
      }

      setPickingProduct(true);
      try {
        const response = await axios.get<{
          success: boolean;
          data: ReturnableLookup;
        }>(`${API_BASE}/api/sales/returnable-item`, {
          params: {
            customerId: selectedCustomer.id,
            productId: product.id,
          },
        });

        if (!response.data.success) return;

        const data = response.data.data;
        closeSearchModal();

        if (data.status !== 'ok') {
          showLookupWarning(data, product);
          return;
        }

        recordF2ProductSelection('return', product.id, selectedCustomer.id);

        const rowId = newRowId('ret', data.product.id);
        setCart((prev) => [
          ...prev,
          {
            rowId,
            productId: data.product.id,
            productName: productDisplayName(data.product),
            productSku: data.product.sku,
            sourceInvoiceItemId: data.sourceInvoiceItemId,
            invoiceId: data.invoiceId,
            invoiceNo: data.invoiceNo,
            unitPriceTl: roundPrice(
              data.unitPrice / (data.exchangeRate > 0 ? data.exchangeRate : 1)
            ),
            exchangeRate: EXCHANGE_RATE,
            returnQty: 1,
            costUsd: productCostUsd(product),
            isChinaReturn: false,
          },
        ]);

        notify(
          'success',
          `${productDisplayName(data.product)} yeni satır olarak eklendi (adet: 1) — ${formatUsd(
            roundPrice(data.unitPrice / data.exchangeRate)
          )} · ${data.invoiceNo}`
        );
        focusCartFieldSoon(rowId, 'returnQty');
      setSavedNotice(null);
      } catch (error) {
        const message =
          axios.isAxiosError(error) && error.response?.data?.message
            ? String(error.response.data.message)
            : 'Ürün iade kontrolü yapılamadı.';
        notify('error', message);
      } finally {
        setPickingProduct(false);
      }
    },
    [selectedCustomer, closeSearchModal, notify, focusCartFieldSoon]
  );

  const handleSearchKeyDown = useF2KeyboardNav({
    open: searchModal,
    results: f2.results,
    focusedIndex: f2.focusedIndex,
    navigateFocus: f2.navigateFocus,
    onSelect: (product) => void pickProductForReturn(product),
    onClose: closeSearchModal,
  });

  const removeLine = (rowId: string) => {
    setCart((prev) => prev.filter((row) => row.rowId !== rowId));
  };

  const removeEditLine = (rowId: string) => {
    setSavedNotice(null);
    const row = editLines.find((line) => line.rowId === rowId);
    // Yalnizca KAYITLI kalemler sunucuya "sil" diye bildirilir; duzenleme
    // sirasinda eklenip yine burada silinen satir hic gonderilmemis olur.
    if (row?.invoiceItemId != null) {
      const itemId = row.invoiceItemId;
      setRemovedItemIds((prev) =>
        prev.includes(itemId) ? prev : [...prev, itemId]
      );
    }
    setEditLines((prev) => prev.filter((line) => line.rowId !== rowId));
  };

  /**
   * Duzenlenen iade faturasina yeni kalem ekler.
   *
   * Satis faturasi duzenlemesiyle ayni davranis: urun dogrudan eklenir,
   * "bu musteri bunu almis miydi" kontrolu yapilmaz. Duzenleme zaten
   * kayitli bir iadeyi duzeltmek icindir; kontrol yeni iade olustururken
   * yapiliyor.
   */
  const addProductToEditLines = useCallback(
    (product: F2Product) => {
      const rowId = newRowId('new', product.id);
      setSavedNotice(null);
      setEditLines((prev) => [
        ...prev,
        {
          rowId,
          invoiceItemId: null,
          productId: product.id,
          productName: productDisplayName(product),
          productSku: product.sku,
          quantity: 1,
          unitPriceTl: roundPrice(
            product.priceUsd > 0 ? product.priceUsd : product.priceTl
          ),
          isChinaReturn: false,
        },
      ]);
      recordF2ProductSelection('return', product.id, editCustomerId || null);
      closeSearchModal();
      notify('success', `${productDisplayName(product)} eklendi — adet ve fiyatı satırda düzenleyin.`);
      focusEditFieldSoon(rowId, 'quantity');
    },
    [closeSearchModal, notify, editCustomerId, focusEditFieldSoon]
  );

  const handleEditSearchKeyDown = useF2KeyboardNav({
    open: searchModal,
    results: f2.results,
    focusedIndex: f2.focusedIndex,
    navigateFocus: f2.navigateFocus,
    onSelect: addProductToEditLines,
    onClose: closeSearchModal,
  });

  const handleEditSave = async () => {
    if (!editInvoiceId || editCustomerId === '') return;
    if (editLines.length === 0) {
      notify('error', 'En az bir kalem olmalı.');
      return;
    }

    setSubmitting(true);
    try {
      await axios.put(`${API_BASE}/api/sales/invoices/${editInvoiceId}`, {
        customerId: Number(editCustomerId),
        processedBy: editProcessedBy || null,
        orderNotes: editNotes || undefined,
        invoiceDate: editInvoiceDate,
        exchangeRate: EXCHANGE_RATE,
        ...(removedItemIds.length > 0 ? { removeItemIds: removedItemIds } : {}),
        items: editLines.map((line) => ({
          // Kayitli kalem id ile, duzenlemede eklenen kalem productId ile
          // gonderilir — sunucu ikisini bu alana gore ayirir.
          ...(line.invoiceItemId != null
            ? { id: line.invoiceItemId }
            : { productId: line.productId }),
          quantity: toIntegerQty(line.quantity, 1),
          unitPrice: line.unitPriceTl,
          discountPercent: 0,
          isChinaReturn: line.isChinaReturn,
        })),
      });
      setSavedNotice(`Fatura kaydedildi · ${displayInvoiceNo}`);
      notify('success', `İade faturası güncellendi: ${displayInvoiceNo}`);
      onDataChange?.();
      onSaved?.();
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'İade faturası güncellenemedi.';
      notify('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const paymentMethod = settlementType === 'KAPALI' ? 'Nakit' : 'Cari';
  const settlementLabel =
    settlementType === 'KAPALI' ? 'Kapalı Fatura (Kasadan)' : 'Açık Fatura (Cari)';

  const handleSubmit = async () => {
    let customer = selectedCustomer;
    if (!customer) {
      customer = pickCustomerFromSearch(customerSearch, customerResults);
      if (customer) selectCustomer(customer);
    }

    if (!customer || selectedBranch === '') {
      notify('error', 'Müşteri ve şube seçimlerini tamamlayın.');
      return;
    }

    if (settlementType === 'KAPALI' && selectedSafe === '') {
      notify('error', 'Kapalı fatura için kasa seçin.');
      return;
    }

    const resolvedSafeId =
      selectedSafe !== ''
        ? Number(selectedSafe)
        : branchSafes[0]?.id ?? safes[0]?.id;

    if (!resolvedSafeId) {
      notify('error', 'Geçerli bir kasa bulunamadı.');
      return;
    }

    if (activeLines.length === 0) {
      notify('error', 'İade için en az bir ürün ekleyin.');
      return;
    }

    /*
     * İade artık KAYNAK FATURAYA BAĞLANMIYOR (karar: 8 Eylül 2026).
     *
     * Eskiden kalemler alındıkları faturaya göre gruplanır ve her fatura
     * için ayrı bir iade faturası kesilirdi; iade edilen adet o faturadan
     * düşülürdü. Müşteri aynı üründen iki ayrı faturayla aldığında tek bir
     * iade üç ayrı belge üretebiliyordu.
     *
     * Yeni kural: müşteri daha önce almışsa iade alınır (almamışsa uyarı
     * çıkar, kullanıcı yine de ekleyebilir) ve HEPSİ tek bir iade
     * faturasına yazılır. Hangi faturadan geldiği artık takip edilmiyor;
     * ürünün geçmişi zaten stok hareketlerinde duruyor.
     */

    setSubmitting(true);
    try {
      const createdNos: string[] = [];
      let notesForPrint = orderNotes;

      // Tüm kalemler tek iade faturasına — fatura bazlı gruplama yok
      const response = await axios.post(`${API_BASE}/api/sales/return-discretionary`, {
        customerId: customer.id,
        branchId: Number(selectedBranch),
        safeId: resolvedSafeId,
        paymentMethod,
        exchangeRate: EXCHANGE_RATE,
        note: orderNotes.trim() || undefined,
        items: activeLines.map((row) => ({
          productId: row.productId,
          quantity: toIntegerQty(row.returnQty, 1),
          unitPrice: row.unitPriceTl,
          isChinaReturn: row.isChinaReturn,
        })),
      });

      if (response.data.success) {
        const no = response.data.data?.invoiceNo;
        if (no) createdNos.push(no);
        const savedNotes = response.data.data?.orderNotes;
        if (typeof savedNotes === 'string' && savedNotes.trim()) {
          notesForPrint = savedNotes;
        }
      }

      const parts: string[] = [];
      if (stockReturnCount > 0) {
        parts.push(`${stockReturnCount} kalem ${depotLabel('MERKEZ_DEPO')}`);
      }
      if (chinaReturnCount > 0) {
        parts.push(`${chinaReturnCount} kalem ${depotLabel('CIN_IADE_DEPO')}`);
      }

      const invoiceLabel = createdNos.join(', ');
      if (invoiceLabel) setDisplayInvoiceNo(invoiceLabel);
      if (notesForPrint.trim()) {
        setOrderNotes(notesForPrint);
      }

      setSavedNotice(
        `Fatura kaydedildi${invoiceLabel ? ` · ${invoiceLabel}` : ''}`
      );
      notify(
        'success',
        `İade kaydedildi · ${parts.join(' · ')} · ${invoiceLabel}`
      );

      setPrintParty(customer);

      let afterReturnDone = false;
      const afterReturn = () => {
        if (afterReturnDone) return;
        afterReturnDone = true;
        setShouldPrint(false);
        setPrintParty(null);
        onDataChange?.();
      };

      if (shouldPrint) {
        window.setTimeout(() => {
          printDocument();
          const onAfterPrint = () => {
            afterReturn();
            window.removeEventListener('afterprint', onAfterPrint);
          };
          window.addEventListener('afterprint', onAfterPrint);
          window.setTimeout(() => {
            window.removeEventListener('afterprint', onAfterPrint);
            afterReturn();
          }, 30_000);
        }, 150);
      } else {
        afterReturn();
      }
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'İade kaydedilemedi.';
      notify('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (isEditMode) {
    if (editLoading) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
          Fatura yükleniyor...
        </div>
      );
    }

    const editTotalTl = editLines.reduce(
      (sum, line) => sum + line.quantity * line.unitPriceTl,
      0
    );
    const editTotalQty = editLines.reduce((sum, line) => sum + line.quantity, 0);

    /*
     * Kayıtlı iade zaten cariye işlendiği için güncel bakiye = müşterinin
     * şu anki bakiyesi; önceki bakiye bu iade eklenmeden önceki değerdir.
     * (Açık faturada iade cariden DÜŞER, kapalıda cariyi etkilemez.)
     */
    const editAffectsBalance = editPaymentMethod === 'Cari';
    const editReceiptBalance =
      selectedCustomer && typeof selectedCustomer.balance === 'number'
        ? {
            before: editAffectsBalance
              ? roundPrice(selectedCustomer.balance + editTotalTl)
              : selectedCustomer.balance,
            after: selectedCustomer.balance,
          }
        : null;

    return (
      <div className="space-y-4 print:space-y-0">
        <SavedBanner message={savedNotice} />
        <div className="print-pdf-doc hidden">
          <h1>{displayInvoiceNo || 'İade Fişi'}</h1>
          {receiptPartyLines.length > 0 ? (
            <div className="pdf-party">
              {receiptPartyLines.map((line) => (
                <p key={line} className="pdf-party-line">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            editCustomerLabel && <p className="pdf-meta">{editCustomerLabel}</p>
          )}
          <p className="pdf-meta">
            {editInvoiceDate}
            {editProcessedBy ? ` · ${editProcessedBy}` : ''}
          </p>
          {editNotes.trim() && (
            <div className="pdf-notes">
              <strong>Açıklama:</strong> {editNotes.trim()}
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th>Ürün</th>
                <th className="pdf-num">Adet</th>
                <th className="pdf-num">Birim</th>
                <th className="pdf-num">Toplam</th>
              </tr>
            </thead>
            <tbody>
              {receiptEditLines.map((line) => {
                const lineTotal = roundPrice(line.quantity * line.unitPriceTl);
                return (
                  <tr key={line.rowId}>
                    <td className="pdf-name">{line.productName}</td>
                    <td className="pdf-num">{line.quantity}</td>
                    <td className="pdf-num">{formatUsd(line.unitPriceTl)}</td>
                    <td className="pdf-num">{formatUsd(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="pdf-totals">
            <p>Toplam adet: {editTotalQty}</p>
            <p className="pdf-grand">Net toplam: {formatUsd(editTotalTl)}</p>
            {editReceiptBalance && (
              <>
                <p>Önceki bakiye: {formatMoney(editReceiptBalance.before)}</p>
                <p>
                  <strong>Güncel bakiye: {formatMoney(editReceiptBalance.after)}</strong>
                </p>
              </>
            )}
          </div>
          <p className="pdf-disclaimer">{RECEIPT_DISCLAIMER}</p>
        </div>

        <div className="receipt-slip hidden">
          {/* Firma bilgisi EN USTTE — fis duzeninde once kimin kestigi,
            sonra fis numarasi gelir. */}
        {receiptPartyLines.length > 0 && (
          <div className="pdf-party">
            {receiptPartyLines.map((line) => (
              <p key={line} className="pdf-party-line">
                {line}
              </p>
            ))}
          </div>
        )}
        <p className="receipt-slip-title">{displayInvoiceNo || 'İade Fişi'}</p>
          {receiptPartyLines.length > 0 ? (
            <div className="receipt-slip-party">
              {receiptPartyLines.map((line) => (
                <p key={line} className="receipt-slip-party-line">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            editCustomerLabel && (
              <p className="receipt-slip-customer">{editCustomerLabel}</p>
            )
          )}
          <p className="receipt-slip-meta">
            {editInvoiceDate}
            {editProcessedBy ? ` · ${editProcessedBy}` : ''}
          </p>
          {editNotes.trim() && (
            <p className="receipt-slip-notes">{editNotes.trim()}</p>
          )}
          <div className="receipt-slip-divider" />
          <div className="receipt-item-row receipt-item-head">
            <span className="receipt-item-name">Ürün</span>
            <span className="receipt-item-qty">Ad</span>
            <span className="receipt-item-price">Fiyat</span>
            <span className="receipt-item-total">Top.</span>
          </div>
          {receiptEditLines.map((line) => {
            const lineTotal = roundPrice(line.quantity * line.unitPriceTl);
            return (
              <div key={line.rowId} className="receipt-item-row receipt-item-line">
                <span className="receipt-item-name" title={line.productName}>
                  {line.productName}
                </span>
                <span className="receipt-item-qty">{line.quantity}</span>
                <span className="receipt-item-price">{formatUsd(line.unitPriceTl)}</span>
                <span className="receipt-item-total">{formatUsd(lineTotal)}</span>
              </div>
            );
          })}
          <div className="receipt-slip-divider" />
          <div className="receipt-item-row receipt-slip-summary">
            <span className="receipt-item-name">Toplam adet</span>
            <span className="receipt-item-total">{editTotalQty}</span>
          </div>
          <div className="receipt-item-row receipt-slip-summary receipt-slip-grand">
            <span className="receipt-item-name">NET TOPLAM</span>
            <span className="receipt-item-total">{formatUsd(editTotalTl)}</span>
          </div>
          {editReceiptBalance && (
            <>
              <div className="receipt-slip-divider" />
              <div className="receipt-item-row receipt-slip-summary">
                <span className="receipt-item-name">Önceki bakiye</span>
                <span className="receipt-item-total">
                  {formatMoney(editReceiptBalance.before)}
                </span>
              </div>
              <div className="receipt-item-row receipt-slip-summary receipt-slip-grand">
                <span className="receipt-item-name">Güncel bakiye</span>
                <span className="receipt-item-total">
                  {formatMoney(editReceiptBalance.after)}
                </span>
              </div>
            </>
          )}
          <div className="receipt-slip-divider" />
          <p className="receipt-slip-disclaimer">{RECEIPT_DISCLAIMER}</p>
        </div>

        <div className="mb-2 flex items-center gap-3 print:hidden">
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
              title="Listeye dön"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="rounded-xl bg-amber-600 p-2.5 text-white">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <h1 className="page-title">İade Faturası Düzenle</h1>
            <p className="text-sm text-slate-500">
              {displayInvoiceNo} · {editCustomerLabel}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 print:hidden">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Fatura Tarihi</label>
            <input
              type="date"
              value={editInvoiceDate}
              onChange={(e) => setEditInvoiceDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">İşlemi Yapan</label>
            <input
              type="text"
              value={editProcessedBy}
              onChange={(e) => setEditProcessedBy(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="print:hidden">
          <label className="mb-1 block text-sm font-medium text-slate-700">Not</label>
          <textarea
            rows={2}
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">Fatura Kalemleri</p>
            <button
              type="button"
              onClick={() => setSearchModal(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              <Search className="h-4 w-4" />
              Ürün Ekle (F2)
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    SKU
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    Ürün
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                    Adet
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                    Birim ($)
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-slate-500">
                    Çin İade
                  </th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {editLines.map((line) => (
                  <tr key={line.rowId} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono font-semibold">{line.productSku}</td>
                    <td className="px-4 py-3">
                      {line.productName}
                      {line.invoiceItemId == null && (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-caption font-semibold text-emerald-700">
                          yeni
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <NumericInput
                        ref={setEditInputRef(line.rowId, 'quantity')}
                        decimal={false}
                        min={1}
                        value={line.quantity}
                        onValueChange={(qty) => {
                          setSavedNotice(null);
                          setEditLines((prev) =>
                            prev.map((row) =>
                              row.rowId === line.rowId
                                ? { ...row, quantity: qty > 0 ? qty : row.quantity }
                                : row
                            )
                          );
                        }}
                        onKeyDown={(e) => onEditFieldKeyDown(e, line.rowId, 'quantity')}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <NumericInput
                        ref={setEditInputRef(line.rowId, 'unitPriceTl')}
                        min={0}
                        value={line.unitPriceTl}
                        onValueChange={(price) => {
                          setSavedNotice(null);
                          setEditLines((prev) =>
                            prev.map((row) =>
                              row.rowId === line.rowId
                                ? {
                                    ...row,
                                    unitPriceTl: price >= 0 ? roundPrice(price) : row.unitPriceTl,
                                  }
                                : row
                            )
                          );
                        }}
                        onKeyDown={(e) => onEditFieldKeyDown(e, line.rowId, 'unitPriceTl')}
                        className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    {/*
                      * Cin iade tiki: isaretli satirin stogu MERKEZ_DEPO
                      * yerine CIN_IADE_DEPO'ya isler. Duzenlemede tik
                      * degistirilirse sunucu miktari iki depo arasinda
                      * tasir.
                      */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={line.isChinaReturn}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSavedNotice(null);
                          setEditLines((prev) =>
                            prev.map((row) =>
                              row.rowId === line.rowId
                                ? { ...row, isChinaReturn: checked }
                                : row
                            )
                          );
                        }}
                        title={
                          line.isChinaReturn
                            ? depotLabel('CIN_IADE_DEPO')
                            : depotLabel('MERKEZ_DEPO')
                        }
                        className="h-4 w-4 rounded border-slate-300 text-orange-600"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeEditLine(line.rowId)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {editLines.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      Kalem yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <p className="text-sm font-semibold text-slate-700">
            Toplam: {formatUsd(editTotalTl)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={editLines.length === 0}
              className="btn inline-flex items-center gap-2 border-2 border-indigo-300 bg-indigo-50 font-bold text-indigo-800 hover:bg-indigo-100"
            >
              <Printer className="h-5 w-5" />
              Fiş Yazdır
            </button>
            <button
              type="button"
              onClick={handleEditSave}
              disabled={submitting}
              className="btn btn-lg btn-primary inline-flex items-center gap-2"
            >
              <Save className="h-5 w-5" />
              {submitting ? 'Kaydediliyor...' : 'DEĞİŞİKLİKLERİ KAYDET'}
            </button>
          </div>
        </div>

        <InvoiceTrashButton
          onTrash={() => void handleTrashInvoice()}
          trashing={trashing}
          disabled={submitting}
        />

        {/*
          * Duzenleme ekraninin kendi urun arama penceresi. Yeni iade
          * olustururken kullanilan pencereyle ayni arama durumunu paylasir,
          * ama secim baska yere gider: burada dogrudan fatura kalemine.
          */}
        <ProductSearchPopover
          open={searchModal}
          onClose={closeSearchModal}
          title="Faturaya Ürün Ekle"
          hint="↑↓ · Enter · Esc"
          headerClassName="bg-amber-600"
          searchQuery={f2.searchQuery}
          onSearchChange={f2.setSearchQuery}
          searchInputRef={f2.searchInputRef}
          listRef={f2.listRef}
          onListScroll={f2.handleListScroll}
          onKeyDown={handleEditSearchKeyDown}
          searchLoading={f2.loading}
          loadingMore={f2.loadingMore}
          footer={`${f2.results.length.toLocaleString('tr-TR')} / ${f2.totalCount.toLocaleString('tr-TR')} ürün`}
          showEmpty={!f2.loading && f2.results.length === 0}
          emptyHint={
            f2.searchQuery.trim()
              ? 'Sonuç bulunamadı.'
              : 'Aramak için yazmaya başlayın...'
          }
        >
          {!f2.loading && f2.results.length > 0 && (
            <F2ProductList
              products={f2.results}
              focusedIndex={f2.focusedIndex}
              onFocusIndex={f2.setFocusedIndex}
              onSelect={addProductToEditLines}
              partySelected={false}
              accentClass="amber"
              showCost={showCosts}
            />
          )}
        </ProductSearchPopover>
      </div>
    );
  }

  if (viewingInvoiceId !== null) {
    return (
      <SalesCreate
        key={viewingInvoiceId}
        editInvoiceId={viewingInvoiceId}
        f2Trigger={f2Trigger}
        onNotify={onNotify}
        onDataChange={onDataChange}
        onCancelEdit={closeInvoiceView}
      />
    );
  }

  const tlToUsd = (tl: number, rate: number) =>
    roundPrice(rate > 0 ? tl / rate : 0);

  const inputClass = 'field-input';
  const labelClass = 'field-label';
  const returnInvoiceDate = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4 print:space-y-0">
      <SavedBanner message={savedNotice} />
      <div className="print-pdf-doc hidden">
        <h1>{displayInvoiceNo || 'İade Fişi'}</h1>
        <p className="pdf-meta">Satış iade · {settlementLabel}</p>
        {orderNotes.trim() && (
          <div className="pdf-notes">
            <strong>Açıklama:</strong> {orderNotes.trim()}
          </div>
        )}
        <table>
          <thead>
            <tr>
              <th>Ürün</th>
              <th className="pdf-num">Adet</th>
              <th className="pdf-num">Birim</th>
              <th className="pdf-num">Toplam</th>
            </tr>
          </thead>
          <tbody>
            {receiptLines.map((line) => {
              const lineTotal = roundPrice(line.returnQty * line.unitPriceTl);
              return (
                <tr key={line.rowId}>
                  <td className="pdf-name">{line.productName}</td>
                  <td className="pdf-num">{line.returnQty}</td>
                  <td className="pdf-num">{formatUsd(line.unitPriceTl)}</td>
                  <td className="pdf-num">{formatUsd(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pdf-totals">
          <p>Toplam adet: {totalQuantity}</p>
          <p className="pdf-grand">Net toplam: {formatUsd(totalUsd)}</p>
          {receiptBalance && (
            <>
              <p>Önceki bakiye: {formatMoney(receiptBalance.before)}</p>
              <p>
                <strong>Güncel bakiye: {formatMoney(receiptBalance.after)}</strong>
              </p>
            </>
          )}
        </div>
        <p className="pdf-disclaimer">{RECEIPT_DISCLAIMER}</p>
      </div>

      <div className="receipt-slip hidden">
        <p className="receipt-slip-title">{displayInvoiceNo || 'İade Fişi'}</p>
        {receiptPartyLines.length > 0 && (
          <div className="receipt-slip-party">
            {receiptPartyLines.map((line) => (
              <p key={line} className="receipt-slip-party-line">
                {line}
              </p>
            ))}
          </div>
        )}
        <p className="receipt-slip-meta">Satış iade · {settlementLabel}</p>
        {orderNotes.trim() && (
          <p className="receipt-slip-notes">{orderNotes.trim()}</p>
        )}
        <div className="receipt-slip-divider" />
        <div className="receipt-item-row receipt-item-head">
          <span className="receipt-item-name">Ürün</span>
          <span className="receipt-item-qty">Ad</span>
          <span className="receipt-item-price">Fiyat</span>
          <span className="receipt-item-total">Top.</span>
        </div>
        {receiptLines.map((line) => {
          const lineTotal = roundPrice(line.returnQty * line.unitPriceTl);
          return (
            <div key={line.rowId} className="receipt-item-row receipt-item-line">
              <span className="receipt-item-name" title={line.productName}>
                {line.productName}
              </span>
              <span className="receipt-item-qty">{line.returnQty}</span>
              <span className="receipt-item-price">{formatUsd(line.unitPriceTl)}</span>
              <span className="receipt-item-total">{formatUsd(lineTotal)}</span>
            </div>
          );
        })}
        <div className="receipt-slip-divider" />
        <div className="receipt-item-row receipt-slip-summary">
          <span className="receipt-item-name">Toplam adet</span>
          <span className="receipt-item-total">{totalQuantity}</span>
        </div>
        <div className="receipt-item-row receipt-slip-summary receipt-slip-grand">
          <span className="receipt-item-name">NET TOPLAM</span>
          <span className="receipt-item-total">{formatUsd(totalUsd)}</span>
        </div>
        {receiptBalance && (
          <>
            <div className="receipt-slip-divider" />
            <div className="receipt-item-row receipt-slip-summary">
              <span className="receipt-item-name">Önceki bakiye</span>
              <span className="receipt-item-total">
                {formatMoney(receiptBalance.before)}
              </span>
            </div>
            <div className="receipt-item-row receipt-slip-summary receipt-slip-grand">
              <span className="receipt-item-name">Güncel bakiye</span>
              <span className="receipt-item-total">
                {formatMoney(receiptBalance.after)}
              </span>
            </div>
          </>
        )}
        <div className="receipt-slip-divider" />
        <p className="receipt-slip-disclaimer">{RECEIPT_DISCLAIMER}</p>
      </div>

      <div className="mb-2 flex items-center gap-3 print:hidden">
        <div className="p-2.5 rounded-xl bg-emerald-600 text-white">
          <RotateCcw className="h-5 w-5" />
        </div>
        <div>
          <h1 className="page-title">Hızlı İade Al</h1>
          <p className="page-subtitle">
            Esnaf fatura tezgâhı · F2 stok ara · Fiyatlar $ (USD) · F8 maliyet
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 print:hidden">
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-bold text-indigo-700 border-b border-indigo-100 pb-2">
            Evrak Bilgileri
          </h2>
          <div>
            <label className={labelClass}>İade Fiş No</label>
            <input
              type="text"
              readOnly
              value={displayInvoiceNo || 'Otomatik'}
              className={`${inputClass} bg-slate-50 font-mono font-bold text-indigo-700`}
            />
          </div>
          <div>
            <label className={labelClass}>İade Tarihi</label>
            <input
              type="date"
              readOnly
              value={returnInvoiceDate}
              className={`${inputClass} bg-slate-50`}
            />
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3 relative">
          <h2 className="text-sm font-bold text-indigo-700 border-b border-indigo-100 pb-2">
            Müşteri Bilgileri
          </h2>
          <div>
            <label className={labelClass}>Müşteri Seçimi</label>
            <div className="flex items-stretch gap-2">
              <div className="min-w-0 flex-1">
                <InlineCustomerSearchInput
                  value={customerSearch}
                  onChange={(text) => {
                    setCustomerSearch(text);
                    if (!text.trim()) setSelectedCustomer(null);
                  }}
                  onSelect={selectCustomer}
                  onResultsChange={setCustomerResults}
                  selectedCustomer={selectedCustomer}
                  inputRef={customerSearchRef}
                  inputClassName={inputClass}
                  accentClass="indigo"
                  showSelectedHint
                />
              </div>
              {selectedCustomer && (
                <button
                  type="button"
                  title="Müşteri ekstresini yeni sekmede aç"
                  onClick={() =>
                    window.open(
                      buildPageUrl('report-customer-statement', {
                        customerId: selectedCustomer.id,
                      }),
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-indigo-700 hover:bg-indigo-100"
                >
                  <FileText className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Müşteri Limiti</label>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                {selectedCustomer
                  ? formatMoney(selectedCustomer.creditLimit)
                  : '—'}
              </div>
            </div>
            <div>
              <label className={labelClass}>Müşteri Bakiyesi</label>
              <div
                className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                  selectedCustomer && selectedCustomer.balance > 0
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : selectedCustomer && selectedCustomer.balance < 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                {selectedCustomer ? formatMoney(selectedCustomer.balance) : '—'}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-bold text-indigo-700 border-b border-indigo-100 pb-2">
            Fatura Tipi
          </h2>
          <div>
            <label className={labelClass}>İade Türü</label>
            <select
              value={settlementType}
              onChange={(e) =>
                setSettlementType(e.target.value === 'KAPALI' ? 'KAPALI' : 'ACIK')
              }
              className={inputClass}
            >
              <option value="ACIK">Açık Fatura — müşteri carisine işler</option>
              <option value="KAPALI">Kapalı Fatura — kasadan para çıkar</option>
            </select>
            <p className="mt-1 text-caption text-slate-400">
              {settlementType === 'ACIK'
                ? 'İade tutarı müşteri bakiyesinden düşülür; kasa hareketi olmaz.'
                : 'İade tutarı seçilen kasadan çıkış olarak kaydedilir; cariye yazılmaz.'}
            </p>
          </div>
          <div>
            <label className={labelClass}>Şube</label>
            <select
              value={selectedBranch}
              onChange={(e) =>
                setSelectedBranch(e.target.value ? Number(e.target.value) : '')
              }
              className={inputClass}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          {settlementType === 'KAPALI' && (
            <div>
              <label className={labelClass}>Kasa (çıkış)</label>
              <select
                value={selectedSafe}
                onChange={(e) =>
                  setSelectedSafe(e.target.value ? Number(e.target.value) : '')
                }
                className={inputClass}
              >
                <option value="">Seçiniz</option>
                {branchSafes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatMoney(s.balance, s.currency)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-bold text-indigo-700 border-b border-indigo-100 pb-2">
            Teslimat & Açıklama
          </h2>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 space-y-1">
            <p>
              <span className="font-semibold text-emerald-700">{depotLabel('MERKEZ_DEPO')}</span>
              {' — '}normal iade stok girişi
            </p>
            <p>
              <span className="font-semibold text-orange-700">{depotLabel('CIN_IADE_DEPO')}</span>
              {' — '}satırda &quot;Çin İade&quot; işaretleyin
            </p>
          </div>
          <div>
            <label className={labelClass}>Sipariş Açıklaması</label>
            <textarea
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              rows={3}
              placeholder="İade notu, açıklama..."
              className={`${inputClass} resize-none`}
            />
          </div>
        </section>
      </div>

      <button
        type="button"
        onClick={openSearchModal}
        disabled={!selectedCustomer || pickingProduct}
        className="btn btn-secondary btn-block print:hidden disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Search className="w-5 h-5" />
        {pickingProduct ? 'Kontrol ediliyor...' : 'Hızlı Stok Kartı Bul (F2)'}
      </button>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 print:hidden">
        <section className="xl:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-800">Akıllı Sepet</h2>
            <span className="text-sm text-slate-500">({cart.length} kalem)</span>
            <span className="text-caption text-slate-400 hidden sm:inline">
              Maliyet: F8 basılı tut
            </span>
          </div>

          <section className="overflow-hidden">
            {cart.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-slate-400">
                Henüz ürün eklenmedi. Müşteri seçip{' '}
                <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">F2</kbd> ile ürün
                arayın.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                        Ürün
                      </th>
                      <th className="w-24 px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                        İade Adet
                      </th>
                      <th className="w-20 px-4 py-3 text-center text-xs font-semibold uppercase text-slate-500">
                        Çin İade
                      </th>
                      {showCosts && (
                        <th className="w-24 px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                          Maliyet ($)
                        </th>
                      )}
                      <th className="w-28 px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                        Birim ($)
                      </th>
                      <th className="w-28 px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                        Toplam ($)
                      </th>
                      <th className="w-20 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cart.map((line) => {
                      const unitUsd = tlToUsd(line.unitPriceTl, line.exchangeRate);
                      const lineTotalUsd = roundPrice(unitUsd * line.returnQty);

                      return (
                        <tr
                          key={line.rowId}
                          className={line.isChinaReturn ? 'bg-orange-50/50' : undefined}
                        >
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                setHistoryProduct({
                                  id: line.productId,
                                  sku: line.productSku,
                                  name: line.productName,
                                })
                              }
                              className="text-left text-sm font-medium text-slate-900 hover:text-violet-700 hover:underline"
                              title="Stok hareketlerini görüntüle"
                            >
                              {line.productName}
                            </button>
                            <p className="text-xs text-slate-500">{line.productSku}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <NumericInput
                              ref={setCartInputRef(line.rowId, 'returnQty')}
                              decimal={false}
                              min={0}
                              emptyWhenZero
                              value={line.returnQty}
                              onValueChange={(val) => {
                                setSavedNotice(null);
                                setCart((prev) =>
                                  prev.map((row) =>
                                    row.rowId === line.rowId
                                      ? {
                                          ...row,
                                          returnQty: Math.max(0, val),
                                        }
                                      : row
                                  )
                                );
                              }}
                              onKeyDown={(e) =>
                                onCartFieldKeyDown(e, line.rowId, 'returnQty')
                              }
                              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              disabled={line.returnQty <= 0}
                              checked={line.isChinaReturn}
                              onChange={(e) =>
                                setCart((prev) =>
                                  prev.map((row) =>
                                    row.rowId === line.rowId
                                      ? { ...row, isChinaReturn: e.target.checked }
                                      : row
                                  )
                                )
                              }
                              title={
                                line.isChinaReturn
                                  ? depotLabel('CIN_IADE_DEPO')
                                  : depotLabel('MERKEZ_DEPO')
                              }
                              className="h-4 w-4 rounded border-slate-300 text-orange-600"
                            />
                          </td>
                          {showCosts && (
                            <td className="px-4 py-3 text-right text-sm text-slate-500 tabular-nums">
                              {formatUsd(line.costUsd)}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right text-sm">
                            {line.manualOverride ? (
                              <NumericInput
                                ref={setCartInputRef(line.rowId, 'unitPriceUsd')}
                                min={0}
                                emptyWhenZero
                                value={roundPrice(line.unitPriceTl / line.exchangeRate)}
                                onValueChange={(usd) => {
                                  setSavedNotice(null);
                                  setCart((prev) =>
                                    prev.map((row) =>
                                      row.rowId === line.rowId
                                        ? {
                                            ...row,
                                            unitPriceTl: roundPrice(
                                              usd * row.exchangeRate
                                            ),
                                          }
                                        : row
                                    )
                                  );
                                }}
                                onKeyDown={(e) =>
                                  onCartFieldKeyDown(e, line.rowId, 'unitPriceUsd')
                                }
                                className="w-20 rounded-md border border-violet-200 px-2 py-1 text-right text-sm"
                                title="Birim fiyat USD"
                              />
                            ) : (
                              formatUsd(unitUsd)
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold">
                            {formatUsd(lineTotalUsd)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-0.5">
                              <button
                                type="button"
                                onClick={() => duplicateReturnLine(line)}
                                className="rounded p-1 text-slate-400 hover:bg-amber-50 hover:text-amber-700"
                                title="Aynı üründen ayrı kalem ekle (farklı depo için)"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeLine(line.rowId)}
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title="Satırı kaldır"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>

        <aside className="h-fit space-y-4 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm sm:p-5 xl:col-span-1 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
          <h2 className="border-b border-slate-200 pb-2 text-center font-bold text-slate-800">
            Fatura Özeti
          </h2>

          <div className="text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wide">
              Toplam Ürün Adedi
            </p>
            <p className="text-2xl font-extrabold text-blue-600">
              {totalQuantity} Adet
            </p>
          </div>

          <div className="text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wide">
              Net Toplam ($)
            </p>
            <p className="text-3xl font-black text-red-600 tabular-nums">
              {formatUsd(totalUsd)}
            </p>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Fatura tipi</span>
              <span className="font-medium text-indigo-700">
                {settlementType === 'ACIK' ? 'Açık (Cari)' : 'Kapalı (Kasa)'}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>{depotLabel('MERKEZ_DEPO')}</span>
              <span className="font-medium text-emerald-700">{stockReturnCount} kalem</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>{depotLabel('CIN_IADE_DEPO')}</span>
              <span className="font-medium text-orange-700">{chinaReturnCount} kalem</span>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={shouldPrint}
              onChange={(e) => setShouldPrint(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
              <Printer className="w-4 h-4" /> Kayıttan sonra fiş yazdır
            </span>
          </label>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || activeLines.length === 0}
            className="btn btn-lg btn-primary btn-block uppercase tracking-wide print:hidden"
          >
            <Save className="h-5 w-5" />
            {submitting ? 'Kaydediliyor...' : 'KAYDET'}
          </button>
        </aside>
      </div>

      {warning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            role="alertdialog"
            aria-labelledby="return-warning-title"
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-full bg-amber-100 p-2 text-amber-700">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3
                  id="return-warning-title"
                  className="text-lg font-bold text-slate-900"
                >
                  {warning.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600">{warning.message}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {warning.allowForce && warning.product && (
                <button
                  type="button"
                  onClick={() => addManualReturnLine(warning.product!)}
                  className="flex-1 rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white hover:bg-amber-500"
                >
                  Yine de Sepete Ekle
                </button>
              )}
              <button
                type="button"
                onClick={() => setWarning(null)}
                className={`rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${
                  warning.allowForce ? 'flex-1' : 'w-full'
                }`}
              >
                {warning.allowForce ? 'Vazgeç' : 'Tamam'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ProductSearchPopover
        open={searchModal}
        onClose={closeSearchModal}
        title="İade Ürün Ara"
        hint="↑↓ · Enter · Esc"
        headerClassName="bg-indigo-600"
        searchQuery={f2.searchQuery}
        onSearchChange={f2.setSearchQuery}
        searchInputRef={f2.searchInputRef}
        listRef={f2.listRef}
        onListScroll={f2.handleListScroll}
        onKeyDown={handleSearchKeyDown}
        searchLoading={f2.loading || pickingProduct}
        loadingMore={f2.loadingMore}
        footer={`${f2.results.length.toLocaleString('tr-TR')} / ${f2.totalCount.toLocaleString('tr-TR')} ürün`}
        showEmpty={!f2.loading && f2.results.length === 0}
        emptyHint={
          f2.searchQuery.trim()
            ? 'Sonuç bulunamadı.'
            : 'Aramak için yazmaya başlayın...'
        }
      >
        {!f2.loading && f2.results.length > 0 && (
          <F2ProductList
            products={f2.results}
            focusedIndex={f2.focusedIndex}
            onFocusIndex={f2.setFocusedIndex}
            onSelect={(product) => void pickProductForReturn(product)}
            partySelected={!!selectedCustomer}
            accentClass="indigo"
            showCost={showCosts}
          />
        )}
      </ProductSearchPopover>

      <ProductStockHistoryModal
        open={historyProduct != null}
        onClose={() => setHistoryProduct(null)}
        product={historyProduct}
        initialCustomer={selectedCustomer}
      />
    </div>
  );
}
