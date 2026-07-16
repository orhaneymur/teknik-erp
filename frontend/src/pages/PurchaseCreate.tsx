import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Printer, Save, Search, ShoppingCart, Trash2, X, ArrowLeft, FileText } from 'lucide-react';
import ProductSearchPopover from '../components/ProductSearchPopover';
import ProductStockHistoryModal from '../components/ProductStockHistoryModal';
import InlineCustomerSearchInput from '../components/InlineCustomerSearchInput';
import F2ProductList, {
  resolvePurchaseUnitPriceUsd,
} from '../components/F2ProductList';
import { useF2ProductSearch, type F2Product } from '../hooks/useF2ProductSearch';
import { useF2KeyboardNav } from '../hooks/useF2KeyboardNav';
import {
  API_BASE,
  ensureArray,
  formatMoney,
  formatUsd,
  roundPrice,
  toIntegerQty,
  type Customer,
} from '../lib/api';
import { recordF2ProductSelection } from '../lib/f2LastProduct';
import {
  RECEIPT_DISCLAIMER,
  buildReceiptPartyLines,
  type ReceiptParty,
} from '../lib/receiptParty';
import { printDocument } from '../lib/printMode';
import { buildPageUrl } from '../lib/navigation';
import { useTrashInvoice } from '../hooks/useTrashInvoice';

const EXCHANGE_RATE = 1;

type Branch = { id: number; name: string; type: string };
type Safe = {
  id: number;
  branchId: number;
  name: string;
  currency: string;
  balance: number;
  branch?: Pick<Branch, 'id' | 'name' | 'type'>;
};
type Personnel = { id: number; name: string };
type Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  costPrice: number;
  priceTl: number;
  priceUsd: number;
};
type CartItem = {
  rowId: string;
  sourceInvoiceItemId?: number;
  product: Product;
  quantity: number;
  unitPriceUsd: number;
};
type InitData = {
  branches: Branch[];
  safes: Safe[];
  personnels: Personnel[];
  nextInvoiceNo: string;
};

type PaymentMethod = 'Nakit' | 'EFT/Havale' | 'Kart' | 'Cari';
type PaymentType = 'Peşin' | 'Vadeli';
type SettlementType = 'ACIK' | 'KAPALI';

/** Genel cari (kod 120) → Kapalı; diğerleri → Açık */
function defaultSettlementForParty(party: Pick<Customer, 'code'>): SettlementType {
  return String(party.code).trim() === '120' ? 'KAPALI' : 'ACIK';
}

type PurchaseCreateProps = {
  f2Trigger?: number;
  editInvoiceId?: number | null;
  onNotify?: (type: 'success' | 'error', message: string) => void;
  onDataChange?: () => void;
  onCancelEdit?: () => void;
  onSaved?: () => void;
};

export default function PurchaseCreate({
  f2Trigger = 0,
  editInvoiceId = null,
  onNotify,
  onDataChange,
  onCancelEdit,
  onSaved,
}: PurchaseCreateProps) {
  const isEditMode = editInvoiceId != null && editInvoiceId > 0;
  const [initData, setInitData] = useState<InitData>({
    branches: [],
    safes: [],
    personnels: [],
    nextInvoiceNo: '',
  });
  const [selectedSupplier, setSelectedSupplier] = useState<Customer | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<number | ''>('');
  const [selectedSafe, setSelectedSafe] = useState<number | ''>('');
  /** Açık = cari, Kapalı = kasadan ödeme */
  const [settlementType, setSettlementType] = useState<SettlementType>('ACIK');
  const [paymentType, setPaymentType] = useState<PaymentType>('Peşin');
  const paymentMethod: PaymentMethod =
    settlementType === 'KAPALI' ? 'Nakit' : 'Cari';
  const settlementLabel =
    settlementType === 'KAPALI' ? 'Kapalı Fatura (Kasadan)' : 'Açık Fatura (Cari)';
  const [invoiceDate, setInvoiceDate] = useState(() =>
    new Date().toISOString().split('T')[0]
  );
  const [dueDate, setDueDate] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [processedBy, setProcessedBy] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [historyProduct, setHistoryProduct] = useState<{
    id: number;
    sku: string;
    name: string;
  } | null>(null);
  const [searchModal, setSearchModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [displayInvoiceNo, setDisplayInvoiceNo] = useState('');
  const [removedItemIds, setRemovedItemIds] = useState<number[]>([]);
  const [shouldPrint, setShouldPrint] = useState(false);
  const [printParty, setPrintParty] = useState<ReceiptParty | null>(null);

  const handlePrint = useCallback(() => {
    printDocument();
  }, []);

  const totalQuantity = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const supplierSearchRef = useRef<HTMLInputElement>(null);

  const f2 = useF2ProductSearch({
    open: searchModal,
    f2Trigger,
    context: 'purchase',
    partyId: selectedSupplier?.id ?? null,
    exchangeRate: EXCHANGE_RATE,
  });

  const storeBranch = useMemo(
    () =>
      initData.branches.find((b) => b.type === 'STORE') ??
      initData.branches.find((b) => !b.name.includes('DEPO')) ??
      initData.branches[0] ??
      null,
    [initData.branches]
  );

  const branchSafes = useMemo(
    () =>
      initData.safes.filter(
        (safe) => selectedBranch !== '' && safe.branchId === selectedBranch
      ),
    [initData.safes, selectedBranch]
  );

  const totalUsd = useMemo(
    () => roundPrice(cart.reduce((sum, item) => sum + item.quantity * item.unitPriceUsd, 0)),
    [cart]
  );

  const receiptParty = printParty ?? selectedSupplier;
  const receiptPartyLines = useMemo(
    () => buildReceiptPartyLines(receiptParty),
    [receiptParty]
  );

  const notify = useCallback(
    (type: 'success' | 'error', message: string) => {
      onNotify?.(type, message);
    },
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

  const loadInitData = useCallback(async () => {
    try {
      const response = await axios.get<{ success: boolean; data: InitData }>(
        `${API_BASE}/api/purchases/init`
      );
      if (response.data.success) {
        const data = response.data.data;
        const branches = ensureArray(data.branches);
        const safes = ensureArray(data.safes);
        const personnels = ensureArray(data.personnels);

        setInitData({
          branches,
          safes,
          personnels,
          nextInvoiceNo: data.nextInvoiceNo ?? '',
        });

        const branch =
          branches.find((b) => b.type === 'STORE') ??
          branches.find((b) => !b.name.includes('DEPO')) ??
          branches[0];

        if (branch) {
          if (!isEditMode) {
            setSelectedBranch(branch.id);
            const branchSafe = safes.find((s) => s.branchId === branch.id);
            if (branchSafe) setSelectedSafe(branchSafe.id);
          }
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
            paymentMethod: string;
            paymentType: string | null;
            processedBy: string | null;
            orderNotes: string | null;
            dueDate: string | null;
            exchangeRate: number;
            createdAt: string;
            customer: Customer;
            branch: { id: number };
            safe?: { id: number } | null;
            items: Array<{
              id: number;
              quantity: number;
              unitPrice: number;
              product: Product;
            }>;
          };
        }>(`${API_BASE}/api/sales/invoices/${editInvoiceId}`);

        if (!invRes.data.success || cancelled) return;
        const data = invRes.data.data;

        if (data.type !== 'ALIS') {
          notify('error', 'Yalnızca alış faturaları düzenlenebilir.');
          onCancelEdit?.();
          return;
        }

        const rate = data.exchangeRate > 0 ? data.exchangeRate : 1;
        setDisplayInvoiceNo(data.invoiceNo);
        setSelectedSupplier(data.customer);
        setSupplierSearch(`${data.customer.code} — ${data.customer.name}`);
        setSelectedBranch(data.branch.id);
        if (data.safe?.id) setSelectedSafe(data.safe.id);

        setSettlementType(
          data.paymentMethod === 'Cari' ? 'ACIK' : 'KAPALI'
        );
        if (data.paymentType === 'Peşin' || data.paymentType === 'Vadeli') {
          setPaymentType(data.paymentType);
        }
        setProcessedBy(data.processedBy ?? '');
        setOrderNotes(data.orderNotes ?? '');
        setDueDate(data.dueDate ? data.dueDate.slice(0, 10) : '');
        setInvoiceDate(data.createdAt.slice(0, 10));
        setRemovedItemIds([]);
        setCart(
          data.items.map((line) => ({
            rowId: `inv-${line.id}`,
            sourceInvoiceItemId: line.id,
            product: line.product,
            quantity: toIntegerQty(line.quantity, 1),
            unitPriceUsd: roundPrice(line.unitPrice / rate),
          }))
        );
      } catch {
        if (!cancelled) {
          notify('error', 'Fatura yüklenemedi.');
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
    loadInitData();
  }, [loadInitData]);

  const openSearchModal = useCallback(() => {
    setSearchModal(true);
  }, []);

  const closeSearchModal = useCallback(() => {
    setSearchModal(false);
  }, []);

  useEffect(() => {
    if (f2Trigger > 0) {
      setSearchModal(true);
    }
  }, [f2Trigger]);

  useEffect(() => {
    if (selectedBranch === '') return;
    const safeInBranch = initData.safes.find((s) => s.branchId === selectedBranch);
    if (safeInBranch) setSelectedSafe(safeInBranch.id);
  }, [selectedBranch, initData.safes]);

  const selectSupplier = (customer: Customer) => {
    setSelectedSupplier(customer);
    setSupplierSearch(`${customer.code} — ${customer.name}`);
    setSettlementType(defaultSettlementForParty(customer));
  };

  const addProductToCart = (product: F2Product | Product) => {
    recordF2ProductSelection(
      'purchase',
      product.id,
      selectedSupplier ? selectedSupplier.id : null
    );
    const unitPriceUsd = resolvePurchaseUnitPriceUsd(
      product as F2Product,
      Boolean(selectedSupplier)
    );
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          rowId: `row-${product.id}-${Date.now()}`,
          product: product as Product,
          quantity: 1,
          unitPriceUsd,
        },
      ];
    });
    closeSearchModal();
  };

  const handleModalKeyDown = useF2KeyboardNav({
    open: searchModal,
    results: f2.results,
    focusedIndex: f2.focusedIndex,
    navigateFocus: f2.navigateFocus,
    onSelect: addProductToCart,
    onClose: closeSearchModal,
  });

  const removeCartItem = (rowId: string) => {
    const row = cart.find((item) => item.rowId === rowId);
    if (row?.sourceInvoiceItemId) {
      setRemovedItemIds((prev) =>
        prev.includes(row.sourceInvoiceItemId!) ? prev : [...prev, row.sourceInvoiceItemId!]
      );
    }
    setCart((prev) => prev.filter((item) => item.rowId !== rowId));
  };

  const handleSubmit = async () => {
    if (!selectedSupplier) {
      notify('error', 'Lütfen tedarikçi seçin.');
      return;
    }

    if (!storeBranch && selectedBranch === '') {
      notify('error', 'Geçerli bir şube bulunamadı.');
      return;
    }

    const branchId =
      selectedBranch !== '' ? Number(selectedBranch) : storeBranch!.id;

    if (settlementType === 'KAPALI' && selectedSafe === '') {
      notify('error', 'Kapalı fatura için kasa/banka seçin.');
      return;
    }

    if (cart.length === 0) {
      notify('error', 'Sepete en az bir ürün ekleyin.');
      return;
    }

    const safeId =
      paymentMethod === 'Cari'
        ? (branchSafes[0]?.id ?? Number(selectedSafe))
        : Number(selectedSafe);

    if (!safeId) {
      notify('error', 'Geçerli bir kasa bulunamadı.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEditMode && editInvoiceId) {
        await axios.put(`${API_BASE}/api/sales/invoices/${editInvoiceId}`, {
          customerId: selectedSupplier.id,
          paymentMethod,
          paymentType,
          processedBy: processedBy || null,
          orderNotes: orderNotes || undefined,
          dueDate: dueDate || null,
          invoiceDate,
          exchangeRate: EXCHANGE_RATE,
          ...(removedItemIds.length > 0 ? { removeItemIds: removedItemIds } : {}),
          items: cart.map((item) => {
            const payload = {
              quantity: toIntegerQty(item.quantity, 1),
              unitPrice: roundPrice(item.unitPriceUsd),
              discountPercent: 0,
            };
            if (item.sourceInvoiceItemId) {
              return { id: item.sourceInvoiceItemId, ...payload };
            }
            return { productId: item.product.id, ...payload };
          }),
        });

        notify('success', `Alış faturası güncellendi: ${displayInvoiceNo}`);
        onDataChange?.();
        onSaved?.();
        return;
      }

      const response = await axios.post(`${API_BASE}/api/purchases/store`, {
        customerId: selectedSupplier.id,
        branchId,
        safeId,
        paymentMethod,
        paymentType,
        exchangeRate: EXCHANGE_RATE,
        dueDate: dueDate || undefined,
        invoiceDate,
        processedBy: processedBy || undefined,
        orderNotes: orderNotes || undefined,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: toIntegerQty(item.quantity, 1),
          unitPrice: roundPrice(item.unitPriceUsd),
        })),
      });

      if (response.data.success) {
        const savedInvoiceNo =
          typeof response.data.data?.invoiceNo === 'string'
            ? response.data.data.invoiceNo
            : '';
        if (savedInvoiceNo) setDisplayInvoiceNo(savedInvoiceNo);
        setPrintParty(selectedSupplier);

        notify(
          'success',
          `Alış faturası kaydedildi! ${savedInvoiceNo} · MERKEZ_DEPO stok güncellendi`
        );

        let afterPurchaseDone = false;
        const afterPurchase = () => {
          if (afterPurchaseDone) return;
          afterPurchaseDone = true;
          setShouldPrint(false);
          setPrintParty(null);
          onDataChange?.();
          void loadInitData();
        };

        if (shouldPrint) {
          window.setTimeout(() => {
            printDocument();
            const onAfterPrint = () => {
              afterPurchase();
              window.removeEventListener('afterprint', onAfterPrint);
            };
            window.addEventListener('afterprint', onAfterPrint);
            window.setTimeout(() => {
              window.removeEventListener('afterprint', onAfterPrint);
              afterPurchase();
            }, 30_000);
          }, 150);
        } else {
          afterPurchase();
        }
      }
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'Alış faturası kaydedilemedi.';
      notify('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'field-input';
  const labelClass = 'field-label';

  if (editLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Fatura yükleniyor...
      </div>
    );
  }

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="print-pdf-doc hidden">
        <h1>{displayInvoiceNo || initData.nextInvoiceNo || 'Alış Fişi'}</h1>
        {receiptPartyLines.length > 0 && (
          <div className="pdf-party">
            {receiptPartyLines.map((line) => (
              <p key={line} className="pdf-party-line">
                {line}
              </p>
            ))}
          </div>
        )}
        <p className="pdf-meta">
          {invoiceDate}
          {processedBy ? ` · ${processedBy}` : ''}
        </p>
        <p className="pdf-meta">
          {[settlementLabel, paymentType].filter(Boolean).join(' · ')}
        </p>
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
            {cart.map((item) => {
              const lineTotal = roundPrice(item.quantity * item.unitPriceUsd);
              return (
                <tr key={item.rowId}>
                  <td className="pdf-name">{item.product.name}</td>
                  <td className="pdf-num">{item.quantity}</td>
                  <td className="pdf-num">{formatUsd(item.unitPriceUsd)}</td>
                  <td className="pdf-num">{formatUsd(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pdf-totals">
          <p>Toplam adet: {totalQuantity}</p>
          <p className="pdf-grand">Net toplam: {formatUsd(totalUsd)}</p>
        </div>
        <p className="pdf-disclaimer">{RECEIPT_DISCLAIMER}</p>
      </div>

      <div className="receipt-slip hidden">
        <p className="receipt-slip-title">
          {displayInvoiceNo || initData.nextInvoiceNo || 'Alış Fişi'}
        </p>
        {receiptPartyLines.length > 0 && (
          <div className="receipt-slip-party">
            {receiptPartyLines.map((line) => (
              <p key={line} className="receipt-slip-party-line">
                {line}
              </p>
            ))}
          </div>
        )}
        <p className="receipt-slip-meta">
          {invoiceDate}
          {processedBy ? ` · ${processedBy}` : ''}
        </p>
        <p className="receipt-slip-meta">
          {[settlementLabel, paymentType].filter(Boolean).join(' · ')}
        </p>
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

        {cart.map((item) => {
          const lineTotal = roundPrice(item.quantity * item.unitPriceUsd);
          return (
            <div key={item.rowId} className="receipt-item-row">
              <span className="receipt-item-name" title={item.product.name}>
                {item.product.name}
              </span>
              <span className="receipt-item-qty">{item.quantity}</span>
              <span className="receipt-item-price">{formatUsd(item.unitPriceUsd)}</span>
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

        <div className="receipt-slip-divider" />
        <p className="receipt-slip-disclaimer">{RECEIPT_DISCLAIMER}</p>
      </div>

      <div className="mb-2 flex items-center gap-3 print:hidden">
        {isEditMode && onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            title="Listeye dön"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className={`p-2.5 rounded-xl text-white ${isEditMode ? 'bg-violet-600' : 'bg-emerald-600'}`}>
          <ShoppingCart className="w-5 h-5" />
        </div>
        <div>
          <h1 className="page-title">
            {isEditMode ? 'Alış Faturası Düzenle' : 'Hızlı Alış Yap'}
          </h1>
          <p className="page-subtitle">
            {isEditMode
              ? `${displayInvoiceNo} · kalemler ve üst bilgi güncellenir`
              : 'Esnaf fatura tezgâhı · F2 stok ara · Fiyatlar $ (USD) · MERKEZ_DEPO stok artışı'}
          </p>
        </div>
      </div>

      {/* ÜST 4 KUTU */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 print:hidden">
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-bold text-indigo-700 border-b border-indigo-100 pb-2">
            Evrak Bilgileri
          </h2>
          <div>
            <label className={labelClass}>Alış Fatura No</label>
            <input
              type="text"
              readOnly
              value={
                isEditMode
                  ? displayInvoiceNo
                  : displayInvoiceNo || initData.nextInvoiceNo || '260715...'
              }
              className={`${inputClass} bg-slate-50 font-mono font-bold text-indigo-700`}
            />
          </div>
          <div>
            <label className={labelClass}>Fatura Tarihi</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Vade Tarihi</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3 relative">
          <h2 className="text-sm font-bold text-indigo-700 border-b border-indigo-100 pb-2">
            Tedarikçi Bilgileri
          </h2>
          <div>
            <label className={labelClass}>Tedarikçi Seçimi</label>
            <div className="flex items-stretch gap-2">
              <div className="min-w-0 flex-1">
                <InlineCustomerSearchInput
                  value={supplierSearch}
                  onChange={(text) => {
                    setSupplierSearch(text);
                    if (!text.trim()) setSelectedSupplier(null);
                  }}
                  onSelect={selectSupplier}
                  selectedCustomer={selectedSupplier}
                  inputRef={supplierSearchRef}
                  inputClassName={inputClass}
                  accentClass="indigo"
                  placeholder="Kod veya ünvan ile ara..."
                  showSelectedHint
                />
              </div>
              {selectedSupplier && (
                <button
                  type="button"
                  title="Tedarikçi ekstresini yeni sekmede aç"
                  onClick={() =>
                    window.open(
                      buildPageUrl('report-customer-statement', {
                        customerId: selectedSupplier.id,
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
              <label className={labelClass}>Cari Limiti</label>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                {selectedSupplier
                  ? formatMoney(selectedSupplier.creditLimit)
                  : '—'}
              </div>
            </div>
            <div>
              <label className={labelClass}>Cari Bakiye</label>
              <div
                className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                  selectedSupplier && selectedSupplier.balance < 0
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                {selectedSupplier ? formatMoney(selectedSupplier.balance) : '—'}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-bold text-indigo-700 border-b border-indigo-100 pb-2">
            Fatura Tipi
          </h2>
          <div>
            <label className={labelClass}>Fatura Türü</label>
            <select
              value={settlementType}
              onChange={(e) =>
                setSettlementType(e.target.value === 'KAPALI' ? 'KAPALI' : 'ACIK')
              }
              className={inputClass}
            >
              <option value="ACIK">Açık Fatura — tedarikçi carisine işler</option>
              <option value="KAPALI">Kapalı Fatura — kasadan ödeme</option>
            </select>
            <p className="mt-1 text-caption text-slate-400">
              {settlementType === 'ACIK'
                ? 'Alış tutarı tedarikçi bakiyesine yazılır; kasa hareketi olmaz.'
                : 'Alış tutarı seçilen kasadan çıkış olarak kaydedilir; cariye yazılmaz.'}
            </p>
          </div>
          <div>
            <label className={labelClass}>Ödeme Şekli</label>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value as PaymentType)}
              className={inputClass}
            >
              <option value="Peşin">Peşin</option>
              <option value="Vadeli">Vadeli</option>
            </select>
          </div>
          {settlementType === 'KAPALI' && (
            <div>
              <label className={labelClass}>Banka / Kasa Seçimi</label>
              <select
                value={selectedSafe}
                onChange={(e) =>
                  setSelectedSafe(e.target.value ? Number(e.target.value) : '')
                }
                className={inputClass}
              >
                <option value="">Seçin</option>
                {branchSafes.map((safe) => (
                  <option key={safe.id} value={safe.id}>
                    {safe.name} ({formatMoney(safe.balance, safe.currency)})
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
          <div>
            <label className={labelClass}>Şube</label>
            <select
              value={selectedBranch}
              onChange={(e) =>
                setSelectedBranch(e.target.value ? Number(e.target.value) : '')
              }
              className={inputClass}
            >
              {initData.branches
                .filter((b) => b.type === 'STORE')
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Sipariş Açıklaması</label>
            <textarea
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              rows={3}
              placeholder="İrsaliye no, açıklama..."
              className={`${inputClass} resize-none`}
            />
          </div>
        </section>
      </div>

      <button
        type="button"
        onClick={openSearchModal}
        className="btn btn-secondary btn-block print:hidden"
      >
        <Search className="w-5 h-5" />
        Hızlı Stok Kartı Bul (F2)
      </button>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 print:hidden">
        <section className="xl:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-800">Akıllı Sepet</h2>
            <span className="text-sm text-slate-500">({cart.length} kalem)</span>
          </div>
          <div className="overflow-x-auto print:overflow-visible">
            <table className="receipt-cart-table min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-600 uppercase w-24">
                    Stok Kodu
                  </th>
                  <th className="receipt-col-name px-3 py-2.5 text-left text-xs font-bold text-slate-600 uppercase min-w-[11rem] sm:min-w-[14rem]">
                    Stok Adı
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600 uppercase w-20">
                    Adet
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600 uppercase w-24">
                    Maliyet ($)
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600 uppercase w-28">
                    Toplam
                  </th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cart.map((item) => {
                  const lineTotal = roundPrice(item.quantity * item.unitPriceUsd);
                  return (
                    <tr key={item.rowId} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-600 sm:text-xs align-top">
                        {item.product.sku}
                      </td>
                      <td className="receipt-col-name px-3 py-2 align-top min-w-[11rem] max-w-[32rem]">
                        <button
                          type="button"
                          onClick={() =>
                            setHistoryProduct({
                              id: item.product.id,
                              sku: item.product.sku,
                              name: item.product.name,
                            })
                          }
                          title="Stok hareketlerini gör"
                          className="receipt-product-name text-left text-[11px] font-medium leading-snug text-indigo-700 break-words underline-offset-2 hover:underline sm:text-xs"
                        >
                          {item.product.name}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const qty = toIntegerQty(e.target.value, item.quantity);
                            setCart((prev) =>
                              prev.map((row) =>
                                row.rowId === item.rowId
                                  ? { ...row, quantity: qty > 0 ? qty : row.quantity }
                                  : row
                              )
                            );
                          }}
                          className="w-16 text-right rounded border-slate-300 text-sm px-1.5 py-1 border focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPriceUsd}
                          onChange={(e) => {
                            const price = Number(e.target.value);
                            setCart((prev) =>
                              prev.map((row) =>
                                row.rowId === item.rowId
                                  ? {
                                      ...row,
                                      unitPriceUsd:
                                        price >= 0 ? roundPrice(price) : row.unitPriceUsd,
                                    }
                                  : row
                              )
                            );
                          }}
                          className="w-20 text-right rounded border-slate-300 text-sm px-1.5 py-1 border tabular-nums focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-900 tabular-nums">
                        {formatUsd(lineTotal)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeCartItem(item.rowId)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-slate-400">
                      Sepet boş.{' '}
                      <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">F2</kbd> ile
                      ürün ekleyin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="h-fit space-y-4 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm sm:p-5 xl:col-span-1 xl:sticky xl:top-4">
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

          <p className="text-xs text-center text-slate-500 border-t border-slate-200 pt-2">
            Kayıt sonrası <span className="font-semibold text-slate-700">MERKEZ_DEPO</span>{' '}
            stokları artırılır ve ürün maliyeti güncellenir.
          </p>

          {!isEditMode && (
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
          )}

          <div className="print:hidden">
            <label className={labelClass}>İşlemi Yapan</label>
            <select
              value={processedBy}
              onChange={(e) => setProcessedBy(e.target.value)}
              className={inputClass}
            >
              <option value="">Seçiniz</option>
              {initData.personnels.map((person) => (
                <option key={person.id} value={person.name}>
                  {person.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            disabled={cart.length === 0}
            className="btn btn-block border-2 border-indigo-300 bg-indigo-50 font-bold text-indigo-800 hover:bg-indigo-100 print:hidden"
          >
            <Printer className="w-5 h-5" />
            Fiş Yazdır
          </button>

          {isEditMode && (
            <button
              type="button"
              onClick={() => void handleTrashInvoice()}
              disabled={trashing || submitting}
              className="btn btn-block border-2 border-red-200 bg-red-50 font-bold text-red-700 hover:bg-red-100 print:hidden"
            >
              <Trash2 className="w-5 h-5" />
              {trashing ? 'Siliniyor...' : 'Fişi Sil'}
            </button>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || cart.length === 0}
            className="btn btn-lg btn-primary btn-block uppercase tracking-wide print:hidden"
          >
            <Save className="h-5 w-5" />
            {submitting
              ? 'Kaydediliyor...'
              : isEditMode
                ? 'DEĞİŞİKLİKLERİ KAYDET'
                : 'KAYDET'}
          </button>
        </aside>
      </div>

      <ProductSearchPopover
        open={searchModal}
        onClose={closeSearchModal}
        title="Alış Ürün Ara"
        headerClassName="bg-indigo-600"
        searchQuery={f2.searchQuery}
        onSearchChange={f2.setSearchQuery}
        searchInputRef={f2.searchInputRef}
        listRef={f2.listRef}
        onListScroll={f2.handleListScroll}
        onKeyDown={handleModalKeyDown}
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
            onSelect={addProductToCart}
            partySelected={Boolean(selectedSupplier)}
            accentClass="indigo"
          />
        )}
      </ProductSearchPopover>

      <ProductStockHistoryModal
        open={historyProduct != null}
        onClose={() => setHistoryProduct(null)}
        product={historyProduct}
        initialCustomer={selectedSupplier}
      />
    </div>
  );
}
