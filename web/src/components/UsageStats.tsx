import {
  Activity,
  Boxes,
  CircleGauge,
  Database,
  Gauge,
  Hash,
  Layers3,
  RefreshCw,
  Sigma,
  WalletCards,
  Zap,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Messages } from "../i18n";
import type {
  AdminState,
  UsageDataPoint,
  UsageGranularity,
  UsageHistoryRange,
  UsageSummary
} from "../types";

interface RangeOption {
  id: UsageHistoryRange;
  label: string;
}

const ranges: RangeOption[] = [
  { id: 1, label: "1h" },
  { id: 6, label: "6h" },
  { id: 24, label: "24h" },
  { id: 72, label: "3d" },
  { id: 168, label: "7d" },
  { id: 720, label: "30d" },
  { id: "all", label: "All" }
];

const granularities: Array<{ id: UsageGranularity; label: string }> = [
  { id: "five_min", label: "5 min" },
  { id: "hourly", label: "Hourly" },
  { id: "daily", label: "Daily" }
];

const emptySummary: UsageSummary = {
  total_input_tokens: 0,
  total_output_tokens: 0,
  total_tokens: 0,
  total_cached_tokens: 0,
  total_reasoning_tokens: 0,
  total_request_count: 0,
  total_accounts: 0,
  active_accounts: 0
};

export function UsageStats({ state, i18n }: { state: AdminState | null; i18n: Messages }) {
  const [summary, setSummary] = useState<UsageSummary>(emptySummary);
  const [points, setPoints] = useState<UsageDataPoint[]>([]);
  const [granularity, setGranularity] = useState<UsageGranularity>("hourly");
  const [range, setRange] = useState<UsageHistoryRange>(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const copy = usageCopy(i18n);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.usageSummary(), api.usageHistory(granularity, range)])
      .then(([nextSummary, history]) => {
        if (cancelled) {
          return;
        }
        setSummary(nextSummary);
        setPoints(history.data_points);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [granularity, range, state?.service.dataFilePath]);

  const windowTotals = useMemo(() => sumPoints(points), [points]);
  const activeAccounts = summary.active_accounts || state?.counts.enabledUpstreams || 0;
  const totalAccounts = summary.total_accounts || state?.counts.upstreams || 0;
  const totalHitRate = formatHitRate(summary.total_cached_tokens, summary.total_input_tokens);
  const rangeHitRate = formatHitRate(windowTotals.cached_tokens, windowTotals.input_tokens);
  const averageTokens =
    windowTotals.request_count > 0 ? windowTotals.total_tokens / windowTotals.request_count : 0;

  function updateGranularity(next: UsageGranularity) {
    setGranularity(next);
    if (next === "daily" && typeof range === "number" && range < 72) {
      setRange(72);
    }
    if (next === "five_min" && (range === "all" || (typeof range === "number" && range > 24))) {
      setRange(24);
    }
  }

  return (
    <div className="page-stack">
      <section className="overflow-hidden rounded-control border border-line/80 bg-white/90 shadow-sm backdrop-blur">
        <div className="grid grid-cols-2 divide-x divide-y divide-line/70 max-sm:grid-cols-1 sm:grid-cols-4 xl:grid-cols-8 xl:divide-y-0">
          <SummaryCard icon={Sigma} label={copy.totalTokens} value={formatTokenTotal(summary.total_tokens)} hint={copy.realBackend} />
          <SummaryCard icon={Layers3} label={copy.inputTokens} value={formatTokenTotal(summary.total_input_tokens)} hint={copy.accumulated} />
          <SummaryCard icon={Database} label={copy.outputTokens} value={formatTokenTotal(summary.total_output_tokens)} hint={copy.accumulated} />
          <SummaryCard icon={CircleGauge} label={copy.cacheHitRate} value={totalHitRate} hint={formatTokenTotal(summary.total_cached_tokens)} />
          <SummaryCard icon={WalletCards} label={copy.windowTokens} value={formatTokenTotal(windowTotals.total_tokens)} hint={rangeLabel(range)} />
          <SummaryCard icon={Gauge} label={copy.windowHitRate} value={rangeHitRate} hint={formatTokenTotal(windowTotals.cached_tokens)} />
          <SummaryCard icon={Hash} label={copy.requests} value={formatNumber(summary.total_request_count)} hint={`${formatNumber(windowTotals.request_count)} ${copy.inWindow}`} />
          <SummaryCard icon={Boxes} label={copy.accounts} value={`${activeAccounts}/${totalAccounts}`} hint={copy.availableAccounts} />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl label={copy.granularity} items={granularities} value={granularity} onChange={updateGranularity} />
          <SegmentedControl
            label={copy.range}
            items={ranges.filter((item) => rangeAllowed(item.id, granularity))}
            value={range}
            onChange={setRange}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatBadge icon={Zap} label={copy.avgTokens} value={formatTokenTotal(averageTokens)} />
          <StatBadge icon={Activity} label={copy.reasoning} value={formatTokenTotal(windowTotals.reasoning_tokens)} />
          <button
            className="button button-secondary button-small"
            type="button"
            disabled={loading}
            onClick={() => {
              setRange((current) => current);
              void api.usageSummary().then(setSummary);
              void api.usageHistory(granularity, range).then((history) => setPoints(history.data_points));
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {copy.refresh}
          </button>
        </div>
      </div>

      <section className="panel overflow-hidden">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">{copy.trendTitle}</h3>
            <p className="panel-copy">{copy.trendCopy}</p>
          </div>
          <span className="badge">{rangeLabel(range)}</span>
        </div>
        <div className="p-5">
          {error ? (
            <div className="rounded-control border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-signal-red">{error}</div>
          ) : loading ? (
            <EmptyUsage label={copy.loading} />
          ) : points.length > 0 ? (
            <UsageChart points={points} />
          ) : (
            <EmptyUsage label={copy.noUsage} />
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="grid min-h-[104px] content-between bg-white/70 px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon size={14} className="shrink-0 text-muted" />
        <span className="truncate text-[11px] font-black uppercase tracking-normal text-muted">{label}</span>
      </div>
      <strong className="mt-2 font-mono text-xl font-black leading-none text-ink tabular-nums">{value}</strong>
      <span className="mt-1 truncate text-[11px] leading-4 text-muted">{hint}</span>
    </article>
  );
}

function SegmentedControl<T extends string | number>({
  label,
  items,
  value,
  onChange
}: {
  label: string;
  items: Array<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex max-w-full items-center gap-2">
      <span className="text-xs font-black text-muted">{label}</span>
      <div className="flex max-w-full flex-wrap gap-1 rounded-control border border-line/80 bg-white/75 p-1 shadow-sm">
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={String(item.id)}
              type="button"
              onClick={() => onChange(item.id)}
              className={[
                "min-h-7 rounded-control border px-3 text-xs font-black transition",
                active
                  ? "border-hub-600 bg-hub-600 text-white shadow-sm"
                  : "border-transparent bg-transparent text-muted hover:bg-hub-50 hover:text-hub-700"
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatBadge({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-control border border-line/70 bg-white/75 px-2.5 text-xs shadow-sm">
      <Icon size={13} className="text-muted" />
      <span className="text-muted">{label}</span>
      <span className="font-mono font-black text-ink tabular-nums">{value}</span>
    </span>
  );
}

function UsageChart({ points }: { points: UsageDataPoint[] }) {
  const width = 900;
  const height = 340;
  const padding = { top: 24, right: 28, bottom: 46, left: 72 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxTokens = Math.max(1, ...points.map((point) => Math.max(point.input_tokens, point.output_tokens, point.cached_tokens)));
  const x = (index: number) => padding.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const y = (value: number) => padding.top + plotHeight - (value / maxTokens) * plotHeight;
  const input = points.map((point, index) => `${x(index)},${y(point.input_tokens)}`).join(" ");
  const output = points.map((point, index) => `${x(index)},${y(point.output_tokens)}`).join(" ");
  const cached = points.map((point, index) => `${x(index)},${y(point.cached_tokens)}`).join(" ");
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => Math.round(maxTokens * ratio));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-black text-muted">
        <Legend color="#2563eb" label="Input tokens" />
        <Legend color="#16a34a" label="Output tokens" />
        <Legend color="#a855f7" label="Cached tokens" dashed />
      </div>
      <svg className="h-[340px] w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img">
        {ticks.map((tick, index) => {
          const yPos = padding.top + plotHeight * (index / Math.max(1, ticks.length - 1));
          return (
            <g key={`${tick}-${index}`}>
              <line x1={padding.left} x2={width - padding.right} y1={yPos} y2={yPos} stroke="#dde8e3" strokeWidth="1" />
              <text x={padding.left - 10} y={yPos + 4} textAnchor="end" className="fill-muted text-[11px] font-bold">
                {formatTokenTotal(tick)}
              </text>
            </g>
          );
        })}
        <polyline points={input} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" />
        <polyline points={output} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round" />
        <polyline points={cached} fill="none" stroke="#a855f7" strokeWidth="2.5" strokeDasharray="5 4" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={`${point.timestamp}-${index}`}>
            <circle cx={x(index)} cy={y(point.input_tokens)} r="2.5" fill="#2563eb" />
            <circle cx={x(index)} cy={y(point.output_tokens)} r="2.5" fill="#16a34a" />
            <circle cx={x(index)} cy={y(point.cached_tokens)} r="2.5" fill="#a855f7" />
          </g>
        ))}
        {axisLabels(points).map((tick) => (
          <text key={tick.index} x={x(tick.index)} y={height - 14} textAnchor="middle" className="fill-muted text-[11px] font-bold">
            {tick.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={["inline-block h-0.5 w-5 rounded-full", dashed ? "border-t-2 border-dashed bg-transparent" : ""].join(" ")} style={{ backgroundColor: dashed ? "transparent" : color, borderColor: color }} />
      {label}
    </span>
  );
}

function EmptyUsage({ label }: { label: string }) {
  return (
    <div className="grid min-h-[300px] place-items-center rounded-control border border-dashed border-line bg-mist/50 text-sm font-black text-muted">
      {label}
    </div>
  );
}

function sumPoints(points: UsageDataPoint[]): UsageDataPoint {
  return points.reduce<UsageDataPoint>(
    (total, point) => ({
      timestamp: point.timestamp,
      input_tokens: total.input_tokens + point.input_tokens,
      output_tokens: total.output_tokens + point.output_tokens,
      total_tokens: total.total_tokens + point.total_tokens,
      cached_tokens: total.cached_tokens + point.cached_tokens,
      reasoning_tokens: total.reasoning_tokens + point.reasoning_tokens,
      request_count: total.request_count + point.request_count
    }),
    {
      timestamp: "",
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cached_tokens: 0,
      reasoning_tokens: 0,
      request_count: 0
    }
  );
}

function axisLabels(points: UsageDataPoint[]) {
  const step = Math.max(1, Math.ceil(points.length / 6));
  return points
    .map((point, index) => ({ index, label: formatTime(point.timestamp) }))
    .filter((_, index) => index % step === 0 || index === points.length - 1);
}

function rangeAllowed(range: UsageHistoryRange, granularity: UsageGranularity): boolean {
  if (granularity === "daily") {
    return range === "all" || (typeof range === "number" && range >= 72);
  }
  if (granularity === "five_min") {
    return typeof range === "number" && range <= 24;
  }
  return range !== 1;
}

function rangeLabel(range: UsageHistoryRange): string {
  if (range === "all") {
    return "All history";
  }
  if (range < 24) {
    return `${range}h`;
  }
  return `${Math.round(range / 24)}d`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(Number.isFinite(value) ? value : 0));
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 10 ? 1 : 2
  }).format(Number.isFinite(value) ? value : 0);
}

function formatHitRate(cached: number, input: number): string {
  if (!input) {
    return "--";
  }
  return `${formatDecimal((cached / input) * 100)}%`;
}

function formatTokenTotal(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0
  }).format(Math.round(Number.isFinite(value) ? value : 0));
}

function usageCopy(i18n: Messages) {
  const chinese = i18n.common.service !== "Service";
  return chinese
    ? {
        totalTokens: "总 Token",
        inputTokens: "输入 Token",
        outputTokens: "输出 Token",
        cacheHitRate: "缓存命中率",
        windowTokens: "窗口消耗",
        windowHitRate: "窗口命中率",
        requests: "请求数",
        accounts: "账号",
        realBackend: "后端真实 usage 汇总",
        accumulated: "账号累计",
        inWindow: "窗口内",
        availableAccounts: "可用/全部",
        granularity: "粒度",
        range: "范围",
        avgTokens: "均值",
        reasoning: "Reasoning",
        refresh: "刷新",
        trendTitle: "Token 用量趋势",
        trendCopy: "来自 usage-history.json 快照，不再从 usageUnits 或旧日志推算。",
        loading: "正在读取真实用量...",
        noUsage: "当前时间窗口内暂无真实 Token 用量。"
      }
    : {
        totalTokens: "Total tokens",
        inputTokens: "Input tokens",
        outputTokens: "Output tokens",
        cacheHitRate: "Cache hit rate",
        windowTokens: "Window tokens",
        windowHitRate: "Window hit rate",
        requests: "Requests",
        accounts: "Accounts",
        realBackend: "Real backend usage",
        accumulated: "Account cumulative",
        inWindow: "in window",
        availableAccounts: "available / total",
        granularity: "Granularity",
        range: "Range",
        avgTokens: "Avg tokens",
        reasoning: "Reasoning",
        refresh: "Refresh",
        trendTitle: "Token Usage Trend",
        trendCopy: "Backed by usage-history.json snapshots, not inferred from usageUnits or legacy logs.",
        loading: "Loading real usage...",
        noUsage: "No real token usage in this window yet."
      };
}
