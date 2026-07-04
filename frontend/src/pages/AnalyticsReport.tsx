import { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart3, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import {
  API_BASE,
  ensureArray,
  formatMoney,
} from '../lib/api';
import SimpleBarChart from '../components/SimpleBarChart';

const COLLAPSED_ROWS = 6;

type StaffTurnover = {
  userId: number;
  userName: string;
  daily: number;
  monthly: number;
  yearly: number;
};

type ProductSaleRow = {
  name: string;
  quantity: number;
  sku?: string;
  productId?: number;
};

type TopCustomerRow = {
  customerId: number;
  code: string;
  name: string;
  amount: number;
  invoiceCount: number;
};

type AnalyticsData = {
  staffTurnover: StaffTurnover[];
  charts: {
    dailySales: { label: string; total: number }[];
    monthlySales: { label: string; total: number }[];
    topProducts: ProductSaleRow[];
    bottomProducts: ProductSaleRow[];
    topCustomers?: TopCustomerRow[];
    staffComparison: { name: string; monthly: number }[];
  };
  lowStock: { id: number; sku: string; name: string; quantity: number }[];
};

function ExpandToggle({
  expanded,
  hiddenCount,
  onToggle,
}: {
  expanded: boolean;
  hiddenCount: number;
  onToggle: () => void;
}) {
  if (hiddenCount <= 0) return null;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
    >
      {expanded ? (
        <>
          <ChevronUp className="h-4 w-4" />
          Daha az göster
        </>
      ) : (
        <>
          <ChevronDown className="h-4 w-4" />
          Daha fazla göster ({hiddenCount} kalem daha)
        </>
      )}
    </button>
  );
}

function ExpandableBarSection({
  title,
  items,
  barColor,
  valueFormatter,
}: {
  title: string;
  items: { label: string; value: number }[];
  barColor: string;
  valueFormatter: (value: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, COLLAPSED_ROWS);
  const hiddenCount = Math.max(0, items.length - COLLAPSED_ROWS);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold text-slate-800">{title}</h2>
      <SimpleBarChart
        items={visible.map((item) => ({
          label: item.label,
          value: item.value,
          color: barColor,
        }))}
        valueFormatter={valueFormatter}
      />
      <ExpandToggle
        expanded={expanded}
        hiddenCount={hiddenCount}
        onToggle={() => setExpanded((prev) => !prev)}
      />
    </section>
  );
}

function ProductSalesSection({
  topProducts,
  bottomProducts,
}: {
  topProducts: ProductSaleRow[];
  bottomProducts: ProductSaleRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleTop = expanded ? topProducts : topProducts.slice(0, COLLAPSED_ROWS);
  const hiddenTopCount = Math.max(0, topProducts.length - COLLAPSED_ROWS);
  const canExpand = hiddenTopCount > 0 || bottomProducts.length > 0;
  const expandLabelCount =
    hiddenTopCount + (bottomProducts.length > 0 && expanded === false ? bottomProducts.length : 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold text-slate-800">
        En Çok Satan 10 Ürün (30 gün)
      </h2>
      <SimpleBarChart
        items={visibleTop.map((p) => ({
          label: p.name.length > 28 ? `${p.name.slice(0, 28)}…` : p.name,
          value: p.quantity,
          color: 'bg-violet-500',
        }))}
        valueFormatter={(v) => `${Math.round(v)} adet`}
        emptyLabel="Son 30 günde satış kaydı yok."
      />
      {canExpand && (
        <ExpandToggle
          expanded={expanded}
          hiddenCount={expandLabelCount || hiddenTopCount || bottomProducts.length}
          onToggle={() => setExpanded((prev) => !prev)}
        />
      )}

      {expanded && bottomProducts.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            En Az Satan Ürünler (30 gün)
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="pb-2 pr-3">Ürün</th>
                  <th className="pb-2 text-right">Adet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bottomProducts.map((row, index) => (
                  <tr key={`${row.name}-${index}`} className="hover:bg-slate-50/60">
                    <td className="py-2 pr-3 text-slate-800">{row.name}</td>
                    <td className="py-2 text-right font-medium text-slate-600">
                      {Math.round(row.quantity)} adet
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {expanded && topProducts.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            En çok satanlar — tam liste
          </h3>
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <tbody className="divide-y divide-slate-50">
              {topProducts.map((row, index) => (
                <tr key={`${row.name}-${index}`} className="hover:bg-slate-50/60">
                  <td className="w-8 py-1.5 text-xs text-slate-400">{index + 1}.</td>
                  <td className="py-1.5 text-slate-800">{row.name}</td>
                  <td className="py-1.5 text-right font-medium text-violet-700">
                    {Math.round(row.quantity)} adet
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AnalyticsReport() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get<{ success: boolean; data: AnalyticsData }>(
        `${API_BASE}/api/reports/analytics`
      )
      .then((res) => {
        if (res.data.success) {
          const payload = res.data.data;
          setData({
            staffTurnover: ensureArray(payload.staffTurnover),
            charts: {
              ...payload.charts,
              topProducts: ensureArray(payload.charts.topProducts),
              bottomProducts: ensureArray(payload.charts.bottomProducts),
            },
            lowStock: ensureArray(payload.lowStock),
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-slate-400">Yükleniyor...</p>
    );
  }

  if (!data) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
        Rapor yüklenemedi.
      </p>
    );
  }

  const totalStaffMonthly = data.staffTurnover.reduce(
    (sum, s) => sum + s.monthly,
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-indigo-600 p-2.5 text-white">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="page-title">İşletme Özeti</h1>
          <p className="text-sm text-slate-500">
            Ciro grafikleri, personel performansı ve stok uyarıları
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Personel Aylık Ciro</p>
          <p className="text-2xl font-bold text-indigo-700">
            {formatMoney(totalStaffMonthly)}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-700">Kritik Stok (≤5 adet)</p>
          <p className="text-2xl font-bold text-amber-900">
            {data.lowStock.length} ürün
          </p>
        </div>
      </div>

      {data.lowStock.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
          <h2 className="mb-3 font-semibold text-amber-900">Kritik Stok Listesi</h2>
          <div className="flex flex-wrap gap-2">
            {data.lowStock.map((item) => (
              <span
                key={item.id}
                className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs text-amber-900"
              >
                {item.sku} · {item.quantity} adet
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ExpandableBarSection
          title="Son 7 Gün Ciro"
          items={data.charts.dailySales.map((d) => ({
            label: d.label,
            value: d.total,
          }))}
          barColor="bg-emerald-500"
          valueFormatter={(v) => formatMoney(v)}
        />
        <ExpandableBarSection
          title="Aylık Ciro (6 Ay)"
          items={data.charts.monthlySales.map((d) => ({
            label: d.label,
            value: d.total,
          }))}
          barColor="bg-indigo-500"
          valueFormatter={(v) => formatMoney(v)}
        />
        <ProductSalesSection
          topProducts={data.charts.topProducts}
          bottomProducts={data.charts.bottomProducts}
        />
        <ExpandableBarSection
          title="Personel Ciroları (Aylık)"
          items={data.charts.staffComparison.map((s) => ({
            label: s.name.split(' ')[0],
            value: s.monthly,
          }))}
          barColor="bg-sky-500"
          valueFormatter={(v) => formatMoney(v)}
        />
      </div>

      {data.staffTurnover.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <TrendingUp className="h-4 w-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-800">Personel Ciroları Detay</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    Personel
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                    Günlük
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                    Aylık
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                    Yıllık
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.staffTurnover.map((staff) => (
                  <tr key={staff.userId} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-sm font-medium">{staff.userName}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      {formatMoney(staff.daily)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700">
                      {formatMoney(staff.monthly)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      {formatMoney(staff.yearly)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
