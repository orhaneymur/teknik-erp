import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeftRight, Save, Search } from 'lucide-react';
import { API_BASE, ensureArray, toIntegerQty, type PaginatedListResponse } from '../lib/api';
import { depotLabel, isWarehouseDepot } from '../lib/depots';

type Branch = { id: number; name: string; type: string };
type Product = {
  id: number;
  sku: string;
  name: string;
  stocks?: { branchId: number; quantity: number; branch: Branch }[];
};

type StockTransferProps = {
  onNotify?: (type: 'success' | 'error', message: string) => void;
  onDataChange?: () => void;
};

export default function StockTransfer({
  onNotify,
  onDataChange,
}: StockTransferProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [fromBranchId, setFromBranchId] = useState<number | ''>('');
  const [toBranchId, setToBranchId] = useState<number | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const notify = useCallback(
    (type: 'success' | 'error', message: string) => onNotify?.(type, message),
    [onNotify]
  );

  useEffect(() => {
    axios
      .get<{ success: boolean; data: Branch[] }>(`${API_BASE}/api/settings/branches`)
      .then((res) => {
        if (res.data.success) {
          const depots = ensureArray(res.data.data).filter((b) =>
            isWarehouseDepot(b.name)
          );
          setBranches(depots);
          if (depots.length >= 2) {
            setFromBranchId(depots[0].id);
            setToBranchId(depots[1].id);
          }
        }
      })
      .catch(() => notify('error', 'Depo listesi yüklenemedi.'));
  }, [notify]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get<PaginatedListResponse<Product>>(
          `${API_BASE}/api/products`,
          { params: { search: q, limit: 20 } }
        );
        if (res.data.success) {
          setSearchResults(ensureArray(res.data.data));
        }
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const sourceQty =
    selectedProduct?.stocks?.find((s) => s.branchId === fromBranchId)?.quantity ??
    0;

  const handleSubmit = async () => {
    if (!selectedProduct || fromBranchId === '' || toBranchId === '') {
      notify('error', 'Ürün ve depoları seçin.');
      return;
    }
    if (fromBranchId === toBranchId) {
      notify('error', 'Kaynak ve hedef depo farklı olmalı.');
      return;
    }
    if (quantity <= 0) {
      notify('error', 'Geçerli miktar girin.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE}/api/products/stock-movement`, {
        productId: selectedProduct.id,
        fromBranchId: Number(fromBranchId),
        toBranchId: Number(toBranchId),
        quantity,
      });
      if (res.data.success) {
        notify('success', `${selectedProduct.name} — ${quantity} adet transfer edildi.`);
        setSelectedProduct(null);
        setSearchQuery('');
        setQuantity(1);
        onDataChange?.();
      }
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'Transfer başarısız.';
      notify('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-teal-600 p-2.5 text-white">
          <ArrowLeftRight className="h-5 w-5" />
        </div>
        <div>
          <h1 className="page-title">Depo Transfer</h1>
          <p className="text-sm text-slate-500">
            {depotLabel('MERKEZ_DEPO')} ↔ {depotLabel('CIN_IADE_DEPO')}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Kaynak Depo
            </label>
            <select
              value={fromBranchId}
              onChange={(e) =>
                setFromBranchId(e.target.value ? Number(e.target.value) : '')
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {depotLabel(b.name)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Hedef Depo
            </label>
            <select
              value={toBranchId}
              onChange={(e) =>
                setToBranchId(e.target.value ? Number(e.target.value) : '')
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {depotLabel(b.name)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Ürün Ara
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SKU veya ürün adı..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm"
            />
          </div>
          {searchResults.length > 0 && !selectedProduct && (
            <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
              {searchResults.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(p);
                      setSearchResults([]);
                      setSearchQuery(`${p.sku} — ${p.name}`);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    {p.sku} — {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedProduct && (
          <div className="rounded-lg bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-medium text-slate-800">{selectedProduct.name}</p>
            <p className="text-xs text-slate-500">
              Kaynak stok: <strong>{sourceQty}</strong> adet
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Transfer Miktarı
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, toIntegerQty(e.target.value, 1)))}
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white hover:bg-teal-500 disabled:bg-slate-400"
            >
              <Save className="h-4 w-4" />
              {submitting ? 'Kaydediliyor...' : 'TRANSFER ET'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
