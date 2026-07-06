import { useEffect, useState } from 'react';
import axios from 'axios';
import { FileText, X } from 'lucide-react';
import {
  API_BASE,
  formatDate,
  formatMoney,
  invoiceTypeLabel,
  invoiceAmountUsd,
  roundPrice,
} from '../lib/api';

type InvoiceItemRow = {
  id: number;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  totalPrice: number;
  product: {
    id: number;
    sku: string;
    barcode: string | null;
    name: string;
  };
};

type InvoiceDetail = {
  id: number;
  invoiceNo: string;
  type: string;
  createdAt: string;
  paymentMethod: string;
  paymentType: string | null;
  processedBy: string | null;
  orderNotes: string | null;
  deliveryType: string | null;
  isPreOrder: boolean;
  exchangeRate: number;
  totalAmountTl: number;
  totalAmountUsd: number | null;
  customer: { id: number; code: string; name: string };
  branch: { id: number; name: string } | null;
  safe: { id: number; name: string } | null;
  items: InvoiceItemRow[];
};

type InvoiceDetailModalProps = {
  invoiceId: number | null;
  onClose: () => void;
};

export default function InvoiceDetailModal({ invoiceId, onClose }: InvoiceDetailModalProps) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setInvoice(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void axios
      .get<{ success: boolean; data: InvoiceDetail; message?: string }>(
        `${API_BASE}/api/sales/invoices/${invoiceId}`
      )
      .then((res) => {
        if (cancelled) return;
        if (res.data.success) {
          setInvoice(res.data.data);
        } else {
          setInvoice(null);
          setError('Fiş yüklenemedi.');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInvoice(null);
          setError('Fiş yüklenemedi.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  useEffect(() => {
    if (!invoiceId) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [invoiceId, onClose]);

  if (!invoiceId) return null;

  const rate = invoice && invoice.exchangeRate > 0 ? invoice.exchangeRate : 1;
  const totalUsd = invoice ? invoiceAmountUsd(invoice) : 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Fiş detayı"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,44rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-800 px-4 py-3 text-white sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-white/10 p-2">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold sm:text-lg">
                {invoice?.invoiceNo ?? 'Fiş detayı'}
              </h2>
              {invoice && (
                <>
                  <p className="text-sm text-slate-200">
                    {invoiceTypeLabel(invoice.type)}
                    {invoice.isPreOrder ? ' · Ön sipariş' : ''}
                  </p>
                  <p className="text-caption text-slate-300">{formatDate(invoice.createdAt)}</p>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 hover:bg-white/10"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
          {loading && (
            <p className="py-12 text-center text-sm text-slate-400">Yükleniyor...</p>
          )}
          {!loading && error && (
            <p className="py-12 text-center text-sm text-red-600">{error}</p>
          )}
          {!loading && invoice && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-caption font-semibold uppercase text-slate-500">Müşteri</p>
                  <p className="text-sm font-medium text-slate-900">{invoice.customer.name}</p>
                  <p className="text-caption text-slate-500">{invoice.customer.code}</p>
                </div>
                <div>
                  <p className="text-caption font-semibold uppercase text-slate-500">Ödeme</p>
                  <p className="text-sm text-slate-800">
                    {invoice.paymentMethod}
                    {invoice.paymentType ? ` · ${invoice.paymentType}` : ''}
                  </p>
                  {invoice.processedBy && (
                    <p className="text-caption text-slate-500">İşlem: {invoice.processedBy}</p>
                  )}
                </div>
                {invoice.branch && (
                  <div>
                    <p className="text-caption font-semibold uppercase text-slate-500">Şube</p>
                    <p className="text-sm text-slate-800">{invoice.branch.name}</p>
                  </div>
                )}
                {invoice.safe && (
                  <div>
                    <p className="text-caption font-semibold uppercase text-slate-500">Kasa</p>
                    <p className="text-sm text-slate-800">{invoice.safe.name}</p>
                  </div>
                )}
                {invoice.orderNotes?.trim() && (
                  <div className="sm:col-span-2">
                    <p className="text-caption font-semibold uppercase text-slate-500">Not</p>
                    <p className="text-sm text-slate-700">{invoice.orderNotes}</p>
                  </div>
                )}
              </div>

              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="pb-2 pr-2">Ürün</th>
                    <th className="pb-2 pr-2 text-right">Adet</th>
                    <th className="pb-2 pr-2 text-right">Birim</th>
                    <th className="pb-2 text-right">Toplam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((item) => {
                    const unitUsd = roundPrice(item.unitPrice / rate);
                    const lineUsd = roundPrice(item.totalPrice / rate);
                    return (
                      <tr key={item.id}>
                        <td className="py-2.5 pr-2">
                          <p className="text-sm font-medium text-slate-900">{item.product.name}</p>
                          <p className="text-caption text-slate-400">{item.product.sku}</p>
                        </td>
                        <td className="py-2.5 pr-2 text-right text-sm tabular-nums">{item.quantity}</td>
                        <td className="py-2.5 pr-2 text-right text-sm tabular-nums">
                          {formatMoney(unitUsd)}
                          {item.discountPercent > 0 && (
                            <span className="block text-caption text-amber-600">
                              %{item.discountPercent} ind.
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right text-sm font-semibold tabular-nums">
                          {formatMoney(lineUsd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex justify-end border-t border-slate-200 pt-3">
                <div className="text-right">
                  <p className="text-caption text-slate-500">Fiş toplamı</p>
                  <p className="text-lg font-bold tabular-nums text-slate-900">
                    {formatMoney(totalUsd)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
