import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Package,
  Printer,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import ProductSearchPopover from '../components/ProductSearchPopover';
import F2ProductList from '../components/F2ProductList';
import { useF2ProductSearch, type F2Product } from '../hooks/useF2ProductSearch';
import { useF2KeyboardNav } from '../hooks/useF2KeyboardNav';
import { useHoldKeyReveal } from '../hooks/useHoldKeyReveal';
import { depotLabel } from '../lib/depots';
import {
  API_BASE,
  ensureArray,
  formatDate,
  formatUsd,
  roundPrice,
  type PaginatedListResponse,
} from '../lib/api';
import { recordF2ProductSelection } from '../lib/f2LastProduct';
import { useTrashInvoice } from '../hooks/useTrashInvoice';
import SalesCreate from './SalesCreate';

const EXCHANGE_RATE = 1;

type Branch = { id: number; name: string; type: string };
type Safe = {
  id: number;
  branchId: number;
  name: string;
  currency: string;
  balance: number;
};
type Customer = {
  id: number;
  code: string;
  name: string;
  creditLimit: number;
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
      product: { id: number; sku: string; barcode: string | null; name: string };
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

function pickCustomerFromSearch(query: string, results: Customer[]): Customer | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const codePart = trimmed.split(/[—\-]/)[0].trim().toLocaleLowerCase('tr-TR');
  const exactByCode = results.find(
    (customer) => customer.code.toLocaleLowerCase('tr-TR') === codePart
  );
  if (exactByCode) return exactByCode;

  const lower = trimmed.toLocaleLowerCase('tr-TR');
  return (
    results.find((customer) => customer.name.toLocaleLowerCase('tr-TR') === lower) ?? null
  );
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
  invoiceItemId: number;
  productId: number;
  productName: string;
  productSku: string;
  quantity: number;
  unitPriceTl: number;
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
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const [selectedBranch, setSelectedBranch] = useState<number | ''>('');
  const [selectedSafe, setSelectedSafe] = useState<number | ''>('');

  const [submitting, setSubmitting] = useState(false);
  const [searchModal, setSearchModal] = useState(false);
  const [warning, setWarning] = useState<WarningState | null>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<number | null>(null);
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
  const [shouldPrint, setShouldPrint] = useState(false);

  const showCosts = useHoldKeyReveal('F8');

  const handlePrintReceipt = useCallback(() => {
    window.print();
  }, []);

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
            customer: { id: number; code: string; name: string };
            items: Array<{
              id: number;
              quantity: number;
              unitPrice: number;
              product: { id: number; sku: string; name: string };
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
              productName: line.product.name,
              productSku: line.product.sku,
              quantity: line.quantity,
              unitPriceTl: roundPrice(line.unitPrice / rate),
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

  useEffect(() => {
    const query = customerSearch.trim();
    if (!customerDropdownOpen || query.length < 1) {
      setCustomerResults([]);
      return;
    }

    if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);

    customerDebounceRef.current = setTimeout(async () => {
      setCustomerSearchLoading(true);
      try {
        const response = await axios.get<PaginatedListResponse<Customer>>(
          `${API_BASE}/api/customers`,
          { params: { search: query, limit: 20, page: 1 } }
        );
        if (response.data.success) {
          setCustomerResults(response.data.data);
        }
      } catch {
        setCustomerResults([]);
      } finally {
        setCustomerSearchLoading(false);
      }
    }, 300);

    return () => {
      if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    };
  }, [customerSearch, customerDropdownOpen]);

  const selectCustomer = useCallback((customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(`${customer.code} — ${customer.name}`);
    setCustomerDropdownOpen(false);
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
      setCart((prev) => [
        ...prev,
        {
          rowId: newRowId('manual', product.id),
          productId: product.id,
          productName: product.name,
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
      notify('success', `${product.name} sepete eklendi — fiyatı satırda düzenleyebilirsiniz.`);
      setWarning(null);
    },
    [notify, selectedCustomer]
  );

  const duplicateReturnLine = useCallback(
    (line: ReturnCartLine) => {
      setCart((prev) => [
        ...prev,
        {
          ...line,
          rowId: newRowId('dup', line.productId),
          returnQty: 1,
          isChinaReturn: false,
        },
      ]);
      notify('success', 'Ayrı kalem eklendi — Çin iade tikini satır satır işaretleyin.');
    },
    [notify]
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

        setCart((prev) => [
          ...prev,
          {
            rowId: newRowId('ret', data.product.id),
            productId: data.product.id,
            productName: data.product.name,
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
          `${data.product.name} yeni satır olarak eklendi (adet: 1) — ${formatUsd(
            roundPrice(data.unitPrice / data.exchangeRate)
          )} · ${data.invoiceNo}`
        );
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
    [selectedCustomer, closeSearchModal, notify]
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
    const row = editLines.find((line) => line.rowId === rowId);
    if (row) {
      setRemovedItemIds((prev) =>
        prev.includes(row.invoiceItemId) ? prev : [...prev, row.invoiceItemId]
      );
    }
    setEditLines((prev) => prev.filter((line) => line.rowId !== rowId));
  };

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
          id: line.invoiceItemId,
          quantity: line.quantity,
          unitPrice: line.unitPriceTl,
          discountPercent: 0,
        })),
      });
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

  const handleSubmit = async () => {
    let customer = selectedCustomer;
    if (!customer) {
      customer = pickCustomerFromSearch(customerSearch, customerResults);
      if (customer) selectCustomer(customer);
    }

    if (!customer || selectedBranch === '' || selectedSafe === '') {
      notify('error', 'Müşteri, şube ve kasa seçimlerini tamamlayın.');
      return;
    }

    if (activeLines.length === 0) {
      notify('error', 'İade için en az bir ürün ekleyin.');
      return;
    }

    const manualLines = activeLines.filter((line) => line.manualOverride);
    const standardLines = activeLines.filter((line) => !line.manualOverride);

    const byInvoice = new Map<number, ReturnCartLine[]>();
    for (const line of standardLines) {
      const group = byInvoice.get(line.invoiceId) ?? [];
      group.push(line);
      byInvoice.set(line.invoiceId, group);
    }

    setSubmitting(true);
    try {
      const createdNos: string[] = [];

      for (const [invoiceId, lines] of byInvoice) {
        const exchangeRate = EXCHANGE_RATE;
        const response = await axios.post(`${API_BASE}/api/sales/return`, {
          customerId: customer.id,
          branchId: Number(selectedBranch),
          safeId: Number(selectedSafe),
          originalInvoiceId: invoiceId,
          exchangeRate,
          items: lines.map((row) => ({
            sourceInvoiceItemId: row.sourceInvoiceItemId,
            productId: row.productId,
            quantity: row.returnQty,
            unitPrice: row.unitPriceTl,
            isChinaReturn: row.isChinaReturn,
          })),
        });

        if (response.data.success) {
          const no = response.data.data?.invoiceNo;
          if (no) createdNos.push(no);
        }
      }

      if (manualLines.length > 0) {
        const response = await axios.post(`${API_BASE}/api/sales/return-discretionary`, {
          customerId: customer.id,
          branchId: Number(selectedBranch),
          safeId: Number(selectedSafe),
          exchangeRate: EXCHANGE_RATE,
          note: 'Kayıt dışı iade',
          items: manualLines.map((row) => ({
            productId: row.productId,
            quantity: row.returnQty,
            unitPrice: row.unitPriceTl,
            isChinaReturn: row.isChinaReturn,
          })),
        });
        if (response.data.success) {
          const no = response.data.data?.invoiceNo;
          if (no) createdNos.push(no);
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

      notify(
        'success',
        `İade kaydedildi · ${parts.join(' · ')} · ${invoiceLabel}`
      );

      let formResetDone = false;
      const resetAfterReturn = () => {
        if (formResetDone) return;
        formResetDone = true;
        setCart([]);
        setShouldPrint(false);
        setDisplayInvoiceNo('');
        onDataChange?.();
      };

      if (shouldPrint) {
        window.setTimeout(() => {
          window.print();
          const onAfterPrint = () => {
            resetAfterReturn();
            window.removeEventListener('afterprint', onAfterPrint);
          };
          window.addEventListener('afterprint', onAfterPrint);
          window.setTimeout(() => {
            window.removeEventListener('afterprint', onAfterPrint);
            resetAfterReturn();
          }, 30_000);
        }, 150);
      } else {
        resetAfterReturn();
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

    return (
      <div className="space-y-4 print:space-y-0">
        <div className="receipt-slip hidden print:block">
          <p className="receipt-slip-title">{displayInvoiceNo || 'İade Fişi'}</p>
          {editCustomerLabel && (
            <p className="receipt-slip-customer">{editCustomerLabel}</p>
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
          {editLines.map((line) => {
            const lineTotal = roundPrice(line.quantity * line.unitPriceTl);
            return (
              <div key={line.rowId} className="receipt-item-row">
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
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {editLines.map((line) => (
                  <tr key={line.rowId} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono font-semibold">{line.productSku}</td>
                    <td className="px-4 py-3">{line.productName}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) => {
                          const qty = Number(e.target.value);
                          setEditLines((prev) =>
                            prev.map((row) =>
                              row.rowId === line.rowId
                                ? { ...row, quantity: qty > 0 ? qty : row.quantity }
                                : row
                            )
                          );
                        }}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPriceTl}
                        onChange={(e) => {
                          const price = Number(e.target.value);
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
                        className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm"
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
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
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
              onClick={handlePrintReceipt}
              disabled={editLines.length === 0}
              className="btn inline-flex items-center gap-2 border-2 border-indigo-300 bg-indigo-50 font-bold text-indigo-800 hover:bg-indigo-100"
            >
              <Printer className="h-5 w-5" />
              Fiş Yazdır
            </button>
            <button
              type="button"
              onClick={() => void handleTrashInvoice()}
              disabled={trashing || submitting}
              className="btn inline-flex items-center gap-2 border-2 border-red-200 bg-red-50 font-bold text-red-700 hover:bg-red-100"
            >
              <Trash2 className="h-5 w-5" />
              {trashing ? 'Siliniyor...' : 'Fişi Sil'}
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

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="receipt-slip hidden print:block">
        <p className="receipt-slip-title">{displayInvoiceNo || 'İade Fişi'}</p>
        {selectedCustomer && (
          <p className="receipt-slip-customer">
            {selectedCustomer.code} — {selectedCustomer.name}
          </p>
        )}
        <p className="receipt-slip-meta">Satış iade</p>
        <div className="receipt-slip-divider" />
        <div className="receipt-item-row receipt-item-head">
          <span className="receipt-item-name">Ürün</span>
          <span className="receipt-item-qty">Ad</span>
          <span className="receipt-item-price">Fiyat</span>
          <span className="receipt-item-total">Top.</span>
        </div>
        {activeLines.map((line) => {
          const lineTotal = roundPrice(line.returnQty * line.unitPriceTl);
          return (
            <div key={line.rowId} className="receipt-item-row">
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
      </div>

      <div className="mb-2 flex items-center gap-3 print:hidden">
        <div className="rounded-xl bg-amber-600 p-2.5 text-white">
          <RotateCcw className="h-5 w-5" />
        </div>
        <div>
          <h1 className="page-title">Satış İade</h1>
          <p className="text-sm text-slate-500">
            Müşteri seçin, F2 ile ürün ekleyin — her F2 seçimi ayrı satır (adet 1). F8 basılı tutunca maliyet görünür
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 print:hidden">
        <div className="space-y-4 xl:col-span-2">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="relative">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Müşteri
                </label>
                <input
                  ref={customerSearchRef}
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setCustomerDropdownOpen(true);
                    if (!e.target.value.trim()) setSelectedCustomer(null);
                  }}
                  onFocus={() => setCustomerDropdownOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setCustomerDropdownOpen(false), 150);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const picked = pickCustomerFromSearch(customerSearch, customerResults);
                      if (picked) selectCustomer(picked);
                    }
                  }}
                  placeholder="Kod veya isim ile ara..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  autoComplete="off"
                />
                {selectedCustomer && (
                  <p className="mt-1 text-xs font-medium text-emerald-700">
                    Seçili: {selectedCustomer.code} — {selectedCustomer.name}
                  </p>
                )}
                {customerDropdownOpen && (customerSearch.trim() || customerResults.length > 0) && (
                  <ul className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg divide-y divide-slate-100">
                    {customerSearchLoading && (
                      <li className="px-3 py-2 text-sm text-slate-400">Aranıyor...</li>
                    )}
                    {!customerSearchLoading &&
                      customerResults.map((customer) => (
                        <li
                          key={customer.id}
                          onMouseDown={() => selectCustomer(customer)}
                          className="cursor-pointer px-3 py-2 text-sm hover:bg-amber-50"
                        >
                          <span className="font-medium">{customer.code}</span>
                          <span className="text-slate-500"> — {customer.name}</span>
                        </li>
                      ))}
                    {!customerSearchLoading &&
                      customerSearch.trim() &&
                      customerResults.length === 0 && (
                        <li className="px-3 py-2 text-sm text-slate-400">Sonuç yok</li>
                      )}
                  </ul>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Şube
                </label>
                <select
                  value={selectedBranch}
                  onChange={(e) =>
                    setSelectedBranch(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Kasa
                </label>
                <select
                  value={selectedSafe}
                  onChange={(e) =>
                    setSelectedSafe(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {branchSafes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={openSearchModal}
              disabled={!selectedCustomer || pickingProduct}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 py-4 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-6"
            >
              <Search className="h-4 w-4" />
              {pickingProduct ? 'Kontrol ediliyor...' : 'Ürün Ara (F2)'}
            </button>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
              <Package className="h-5 w-5 text-amber-600" />
              <h2 className="font-semibold text-slate-800">İade Sepeti</h2>
            </div>

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
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                        Fatura
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
                            <p className="text-sm font-medium text-slate-900">
                              {line.productName}
                            </p>
                            <p className="text-xs text-slate-500">{line.productSku}</p>
                          </td>
                          <td className="px-4 py-3">
                            {line.manualOverride || line.invoiceId <= 0 ? (
                              <span className="text-sm text-slate-400">{line.invoiceNo}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setViewingInvoiceId(line.invoiceId)}
                                className="text-sm font-semibold text-violet-700 hover:text-violet-900 hover:underline"
                                title="Faturayı görüntüle"
                              >
                                {line.invoiceNo}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.returnQty || ''}
                              onChange={(e) => {
                                const val = Number(e.target.value);
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
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={roundPrice(line.unitPriceTl / line.exchangeRate) || ''}
                                onChange={(e) => {
                                  const usd = Number(e.target.value);
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
        </div>

        <aside className="sticky top-6 h-fit space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800">İade Özeti</h2>
          <div className="page-title">{formatUsd(totalUsd)}</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>{depotLabel('MERKEZ_DEPO')}</span>
              <span className="font-medium text-emerald-700">{stockReturnCount} kalem</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>{depotLabel('CIN_IADE_DEPO')}</span>
              <span className="font-medium text-orange-700">{chinaReturnCount} kalem</span>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={shouldPrint}
              onChange={(e) => setShouldPrint(e.target.checked)}
              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            <Printer className="w-4 h-4" />
            Kayıttan sonra yazdır
          </label>
          <button
            type="button"
            onClick={handlePrintReceipt}
            disabled={activeLines.length === 0}
            className="btn btn-block border-2 border-indigo-300 bg-indigo-50 font-bold text-indigo-800 hover:bg-indigo-100"
          >
            <Printer className="h-5 w-5" />
            Fiş Yazdır
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || activeLines.length === 0}
            className="btn btn-lg btn-amber btn-block sm:w-auto"
          >
            <Save className="h-5 w-5" />
            {submitting ? 'Kaydediliyor...' : 'İADEYİ KAYDET'}
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
        headerClassName="bg-amber-600"
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
            accentClass="amber"
            showCost={showCosts}
          />
        )}
      </ProductSearchPopover>
    </div>
  );
}
