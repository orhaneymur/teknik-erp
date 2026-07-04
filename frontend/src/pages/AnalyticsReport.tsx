import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  BarChart3,
  Package,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  API_BASE,
  ensureArray,
  formatMoney,
} from '../lib/api';
import {
  AreaTrendChart,
  LowStockMeter,
  RankingChart,
} from '../components/DashboardCharts';

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

function SectionCard({
  icon,
  iconClass,
  title,
  subtitle,
  children,
  className = '',
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-900/5 ${className}`}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className={`rounded-xl p-2.5 ${iconClass}`}>{icon}</div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {subtitle && (
            <p className="text-caption text-slate-400">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
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
              dailySales: ensureArray(payload.charts?.dailySales),
              monthlySales: ensureArray(payload.charts?.monthlySales),
              topProducts: ensureArray(payload.charts?.topProducts),
              bottomProducts: ensureArray(payload.charts?.bottomProducts),
              topCustomers: ensureArray(payload.charts?.topCustomers),
              staffComparison: ensureArray(payload.charts?.staffComparison),
            },
            lowStock: ensureArray(payload.lowStock),
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    if (!data) {
      return { monthly: 0, weekly: 0, lowStock: 0, staff: 0 };
    }
    return {
      monthly: data.staffTurnover.reduce((sum, s) => sum + s.monthly, 0),
      weekly: data.charts.dailySales.reduce((sum, d) => sum + d.total, 0),
      lowStock: data.lowStock.length,
      staff: data.staffTurnover.length,
    };
  }, [data]);

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-slate-400">Yükleniyor...</p>
    );
  }

  if (!data) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Rapor yüklenemedi.
      </p>
    );
  }

  const topCustomers = data.charts.topCustomers ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-slate-900 p-2.5 text-white">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="page-title">İşletme Özeti</h1>
          <p className="page-subtitle">
            Ciro, ürün, müşteri ve stok görünümü
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
          <p className="text-caption font-medium uppercase tracking-wide text-slate-400">
            Son 7 gün
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {formatMoney(summary.weekly)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
          <p className="text-caption font-medium uppercase tracking-wide text-slate-400">
            Personel aylık
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {formatMoney(summary.monthly)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
          <p className="text-caption font-medium uppercase tracking-wide text-slate-400">
            Personel
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {summary.staff}
          </p>
        </div>
        <div
          className={`rounded-2xl border px-4 py-3 shadow-sm ${
            summary.lowStock > 0
              ? 'border-amber-200 bg-amber-50'
              : 'border-slate-200/80 bg-white'
          }`}
        >
          <p
            className={`text-caption font-medium uppercase tracking-wide ${
              summary.lowStock > 0 ? 'text-amber-700' : 'text-slate-400'
            }`}
          >
            Kritik stok
          </p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums ${
              summary.lowStock > 0 ? 'text-amber-900' : 'text-slate-900'
            }`}
          >
            {summary.lowStock} ürün
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          icon={<TrendingUp className="h-4 w-4" />}
          iconClass="bg-emerald-50 text-emerald-700"
          title="Son 7 Gün Ciro"
          subtitle="Günlük satış trendi"
        >
          <AreaTrendChart
            items={data.charts.dailySales.map((d) => ({
              label: d.label,
              value: d.total,
            }))}
            valueFormatter={(v) => formatMoney(v)}
            emptyLabel="Satış verisi yok"
            accent="emerald"
          />
        </SectionCard>

        <SectionCard
          icon={<TrendingUp className="h-4 w-4" />}
          iconClass="bg-indigo-50 text-indigo-700"
          title="Aylık Ciro"
          subtitle="Son 6 ay"
        >
          <AreaTrendChart
            items={data.charts.monthlySales.map((d) => ({
              label: d.label,
              value: d.total,
            }))}
            valueFormatter={(v) => formatMoney(v)}
            emptyLabel="Aylık satış verisi yok"
            accent="indigo"
          />
        </SectionCard>

        <SectionCard
          icon={<Package className="h-4 w-4" />}
          iconClass="bg-violet-50 text-violet-700"
          title="En Çok Satan Ürünler"
          subtitle="Son 30 gün · adet"
        >
          <RankingChart
            items={data.charts.topProducts.map((p) => ({
              label: p.name,
              sublabel: p.sku,
              value: p.quantity,
            }))}
            valueFormatter={(v) => `${Math.round(v)} adet`}
            emptyLabel="Son 30 günde satış yok"
            accent="indigo"
          />
        </SectionCard>

        <SectionCard
          icon={<Package className="h-4 w-4" />}
          iconClass="bg-slate-100 text-slate-600"
          title="En Az Satan Ürünler"
          subtitle="Son 30 gün · adet"
        >
          <RankingChart
            items={data.charts.bottomProducts.map((p) => ({
              label: p.name,
              sublabel: p.sku,
              value: p.quantity,
            }))}
            valueFormatter={(v) => `${Math.round(v)} adet`}
            emptyLabel="Veri yok"
            accent="amber"
          />
        </SectionCard>

        {topCustomers.length > 0 && (
          <SectionCard
            icon={<Users className="h-4 w-4" />}
            iconClass="bg-sky-50 text-sky-700"
            title="En Çok Alış Yapan Müşteriler"
            subtitle="Son 30 gün · ciro"
          >
            <RankingChart
              items={topCustomers.map((c) => ({
                label: c.name,
                sublabel: `${c.code} · ${c.invoiceCount} fiş`,
                value: c.amount,
              }))}
              valueFormatter={(v) => formatMoney(v)}
              emptyLabel="Müşteri satışı yok"
              accent="sky"
            />
          </SectionCard>
        )}

        <SectionCard
          icon={<Users className="h-4 w-4" />}
          iconClass="bg-emerald-50 text-emerald-700"
          title="Personel Ciroları"
          subtitle="Bu ay"
          className={topCustomers.length > 0 ? '' : 'lg:col-span-2'}
        >
          <RankingChart
            items={data.charts.staffComparison.map((s) => ({
              label: s.name,
              value: s.monthly,
            }))}
            valueFormatter={(v) => formatMoney(v)}
            emptyLabel="Personel cirosu yok"
            accent="emerald"
          />
        </SectionCard>
      </div>

      <SectionCard
        icon={<AlertTriangle className="h-4 w-4" />}
        iconClass={
          data.lowStock.length > 0
            ? 'bg-amber-100 text-amber-800'
            : 'bg-slate-100 text-slate-500'
        }
        title="Kritik Stok Uyarısı"
        subtitle="MERKEZ_DEPO · 5 adet ve altı"
      >
        {data.lowStock.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Kritik stokta ürün yok
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-10 gap-y-1 md:grid-cols-2">
            <LowStockMeter
              items={data.lowStock
                .slice(0, Math.ceil(data.lowStock.length / 2))
                .map((item) => ({
                  id: item.id,
                  label: item.name || item.sku,
                  sublabel: item.name ? item.sku : undefined,
                  value: item.quantity,
                }))}
            />
            <LowStockMeter
              items={data.lowStock
                .slice(Math.ceil(data.lowStock.length / 2))
                .map((item) => ({
                  id: item.id,
                  label: item.name || item.sku,
                  sublabel: item.name ? item.sku : undefined,
                  value: item.quantity,
                }))}
              emptyLabel=""
            />
          </div>
        )}
      </SectionCard>

      {data.staffTurnover.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/5">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <TrendingUp className="h-4 w-4 text-slate-500" />
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                Personel Detay
              </h2>
              <p className="text-caption text-slate-400">
                Günlük · aylık · yıllık ciro
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-100 text-left text-caption font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">Personel</th>
                  <th className="px-5 py-3 text-right">Günlük</th>
                  <th className="px-5 py-3 text-right">Aylık</th>
                  <th className="px-5 py-3 text-right">Yıllık</th>
                </tr>
              </thead>
              <tbody>
                {data.staffTurnover.map((staff) => (
                  <tr
                    key={staff.userId}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="px-5 py-3 text-sm font-medium text-slate-800">
                      {staff.userName}
                    </td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-600">
                      {formatMoney(staff.daily)}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-emerald-700">
                      {formatMoney(staff.monthly)}
                    </td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-600">
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
