type ChartPoint = {
  label: string;
  value: number;
};

type AreaTrendChartProps = {
  items: ChartPoint[];
  valueFormatter?: (value: number) => string;
  emptyLabel?: string;
  accent?: 'indigo' | 'emerald' | 'sky';
};

const ACCENTS = {
  indigo: {
    stroke: '#4f46e5',
    fillFrom: 'rgba(79, 70, 229, 0.35)',
    fillTo: 'rgba(79, 70, 229, 0.02)',
    dot: '#6366f1',
    grid: '#e2e8f0',
  },
  emerald: {
    stroke: '#059669',
    fillFrom: 'rgba(5, 150, 105, 0.35)',
    fillTo: 'rgba(5, 150, 105, 0.02)',
    dot: '#10b981',
    grid: '#e2e8f0',
  },
  sky: {
    stroke: '#0284c7',
    fillFrom: 'rgba(2, 132, 199, 0.35)',
    fillTo: 'rgba(2, 132, 199, 0.02)',
    dot: '#0ea5e9',
    grid: '#e2e8f0',
  },
} as const;

export function AreaTrendChart({
  items,
  valueFormatter = (v) => String(Math.round(v)),
  emptyLabel = 'Veri yok',
  accent = 'indigo',
}: AreaTrendChartProps) {
  if (items.length === 0) {
    return (
      <p className="flex h-48 items-center justify-center text-sm text-slate-400">
        {emptyLabel}
      </p>
    );
  }

  const colors = ACCENTS[accent];
  const width = 560;
  const height = 200;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const max = Math.max(...items.map((i) => i.value), 1);
  const min = 0;
  const range = max - min || 1;

  const points = items.map((item, index) => {
    const x =
      items.length === 1
        ? padL + plotW / 2
        : padL + (index / (items.length - 1)) * plotW;
    const y = padT + plotH - ((item.value - min) / range) * plotH;
    return { ...item, x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  const gradientId = `area-fill-${accent}`;
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const peak = items.reduce((best, item) => (item.value > best.value ? item : best), items[0]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-caption font-medium uppercase tracking-wide text-slate-400">
            Dönem toplamı
          </p>
          <p className="text-xl font-bold tabular-nums text-slate-900">
            {valueFormatter(total)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-caption font-medium uppercase tracking-wide text-slate-400">
            Zirve
          </p>
          <p className="text-sm font-semibold text-slate-700">
            {peak.label} · {valueFormatter(peak.value)}
          </p>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-48 w-full"
          role="img"
          aria-label="Trend grafiği"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.fillFrom} />
              <stop offset="100%" stopColor={colors.fillTo} />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padT + plotH * (1 - ratio);
            return (
              <line
                key={ratio}
                x1={padL}
                y1={y}
                x2={padL + plotW}
                y2={y}
                stroke={colors.grid}
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            );
          })}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((point) => (
            <g key={point.label}>
              <circle
                cx={point.x}
                cy={point.y}
                r="4.5"
                fill="#fff"
                stroke={colors.dot}
                strokeWidth="2"
              />
              <title>
                {point.label}: {valueFormatter(point.value)}
              </title>
            </g>
          ))}

          {points.map((point) => (
            <text
              key={`lbl-${point.label}`}
              x={point.x}
              y={height - 8}
              textAnchor="middle"
              className="fill-slate-500"
              fontSize="11"
            >
              {point.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

type RankingChartProps = {
  items: Array<{ label: string; sublabel?: string; value: number }>;
  valueFormatter?: (value: number) => string;
  emptyLabel?: string;
  accent?: 'indigo' | 'emerald' | 'sky' | 'amber';
};

const RANK_ACCENTS = {
  indigo: {
    bar: 'from-indigo-500 to-violet-400',
    badge: 'bg-indigo-100 text-indigo-700',
    track: 'bg-indigo-50',
  },
  emerald: {
    bar: 'from-emerald-500 to-teal-400',
    badge: 'bg-emerald-100 text-emerald-700',
    track: 'bg-emerald-50',
  },
  sky: {
    bar: 'from-sky-500 to-cyan-400',
    badge: 'bg-sky-100 text-sky-700',
    track: 'bg-sky-50',
  },
  amber: {
    bar: 'from-amber-500 to-orange-400',
    badge: 'bg-amber-100 text-amber-800',
    track: 'bg-amber-50',
  },
} as const;

export function RankingChart({
  items,
  valueFormatter = (v) => String(Math.round(v)),
  emptyLabel = 'Veri yok',
  accent = 'emerald',
}: RankingChartProps) {
  if (items.length === 0) {
    return (
      <p className="flex h-48 items-center justify-center text-sm text-slate-400">
        {emptyLabel}
      </p>
    );
  }

  const colors = RANK_ACCENTS[accent];
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const widthPct = Math.max((item.value / max) * 100, item.value > 0 ? 6 : 0);
        return (
          <div key={`${item.label}-${index}`} className="group">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-bold ${colors.badge}`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800" title={item.label}>
                    {item.label}
                  </p>
                  {item.sublabel && (
                    <p className="truncate text-caption text-slate-400">{item.sublabel}</p>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                {valueFormatter(item.value)}
              </span>
            </div>
            <div className={`h-2.5 overflow-hidden rounded-full ${colors.track}`}>
              <div
                className={`h-full rounded-full bg-gradient-to-r ${colors.bar} transition-all duration-500`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

type LowStockMeterProps = {
  items: Array<{ id: number; label: string; sublabel?: string; value: number }>;
  emptyLabel?: string;
  threshold?: number;
};

export function LowStockMeter({
  items,
  emptyLabel = 'Kritik stok yok',
  threshold = 5,
}: LowStockMeterProps) {
  if (items.length === 0) {
    if (!emptyLabel) return null;
    return (
      <p className="flex h-48 items-center justify-center text-sm text-slate-400">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const ratio = Math.min(item.value / threshold, 1);
        const severity =
          item.value <= 0
            ? 'from-red-500 to-rose-400'
            : item.value <= 2
              ? 'from-orange-500 to-amber-400'
              : 'from-amber-400 to-yellow-300';
        const badge =
          item.value <= 0
            ? 'bg-red-50 text-red-700 ring-red-200'
            : item.value <= 2
              ? 'bg-orange-50 text-orange-800 ring-orange-200'
              : 'bg-amber-50 text-amber-800 ring-amber-200';

        return (
          <div key={item.id}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{item.label}</p>
                {item.sublabel && (
                  <p className="font-mono text-caption text-slate-400">{item.sublabel}</p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ring-1 ${badge}`}
              >
                {item.value} adet
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${severity}`}
                style={{ width: `${Math.max(ratio * 100, 8)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
