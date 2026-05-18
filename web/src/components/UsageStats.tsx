import { Activity, BarChart3, Gauge, KeyRound, RadioTower, Sigma, UsersRound, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import type { Messages } from "../i18n";
import type { AdminState, AuditLogEntry } from "../types";

type RangeId = "5m" | "1h" | "1d" | "6h" | "24h" | "3d" | "7d" | "30d" | "all";

interface RangeOption {
  id: RangeId;
  label: string;
  ms: number | null;
}

interface SeriesPoint {
  timestamp: number;
  units: number;
  requests: number;
}

export function UsageStats({ state, i18n }: { state: AdminState | null; i18n: Messages }) {
  const [rangeId, setRangeId] = useState<RangeId>("24h");
  const ranges = useMemo(() => rangeOptions(i18n), [i18n]);
  const activeRange = ranges.find((range) => range.id === rangeId) ?? ranges[4];
  const upstreams = state?.upstreams ?? [];
  const clientKeys = state?.clientKeys ?? [];
  const logs = state?.logs ?? [];

  const totalUnits = upstreams.reduce((sum, account) => sum + (account.usedQuota ?? 0), 0);
  const totalRequests = upstreams.reduce((sum, account) => sum + (account.requestCount ?? 0), 0);
  const activeAccounts = upstreams.filter((account) => account.enabled).length;
  const activeKeys = clientKeys.filter((key) => key.enabled).length;
  const quotaPercents = upstreams
    .map((account) => account.quota?.rateLimit?.usedPercent ?? account.quota?.usedPercent)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const quotaAverage = quotaPercents.length > 0 ? quotaPercents.reduce((sum, value) => sum + value, 0) / quotaPercents.length : null;
  const limitedAccounts = upstreams.filter((account) => account.quota?.status === "limited" || account.quota?.limitReached).length;
  const series = useMemo(() => buildSeries(logs, activeRange.ms), [logs, activeRange.ms]);
  const recentUnits = series.at(-1)?.units ?? 0;
  const averageUnits = totalRequests > 0 ? totalUnits / totalRequests : 0;

  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-3">
        <UsageMetric icon={Sigma} label={i18n.usagePage.totalUnits} value={formatCompact(totalUnits)} />
        <UsageMetric icon={Activity} label={i18n.usagePage.totalRequests} value={formatCompact(totalRequests)} />
        <UsageMetric icon={Zap} label={i18n.usagePage.averageUnits} value={formatCompact(averageUnits)} />
        <UsageMetric
          icon={UsersRound}
          label={i18n.usagePage.activeAccounts}
          value={`${activeAccounts} / ${state?.counts.upstreams ?? 0}`}
        />
        <UsageMetric
          icon={KeyRound}
          label={i18n.usagePage.activeKeys}
          value={`${activeKeys} / ${state?.counts.clientKeys ?? 0}`}
        />
        <UsageMetric
          icon={Gauge}
          label={i18n.usagePage.quotaAverage}
          value={quotaAverage === null ? "-" : `${Math.round(quotaAverage)}%`}
        />
        <UsageMetric icon={RadioTower} label={i18n.usagePage.limitedAccounts} value={limitedAccounts} />
        <UsageMetric icon={BarChart3} label={i18n.usagePage.recentUnits} value={formatCompact(recentUnits)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {ranges.map((range) => {
          const active = range.id === rangeId;
          return (
            <button
              key={range.id}
              type="button"
              onClick={() => setRangeId(range.id)}
              className={[
                "min-h-7 rounded-full border px-4 text-xs font-extrabold transition",
                active
                  ? "border-hub-500 bg-hub-500 text-white shadow-sm"
                  : "border-slate-200 bg-white text-ink hover:border-hub-100 hover:bg-hub-50"
              ].join(" ")}
            >
              {range.label}
            </button>
          );
        })}
      </div>

      <section className="rounded-control border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-xs font-extrabold text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full bg-signal-blue" />
              {i18n.usagePage.unitsLine}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full bg-hub-500" />
              {i18n.usagePage.requestsLine}
            </span>
          </div>
          <span className="text-xs font-extrabold text-muted">{i18n.usagePage.chartTitle}</span>
        </div>

        {series.length > 1 ? (
          <UsageChart points={series} />
        ) : (
          <div className="grid min-h-[280px] place-items-center rounded-control border border-dashed border-slate-200 bg-slate-50 text-sm font-extrabold text-muted">
            {i18n.usagePage.noUsage}
          </div>
        )}

        <p className="m-0 mt-4 text-xs leading-5 text-muted">{i18n.usagePage.sourceNote}</p>
      </section>
    </div>
  );
}

function UsageMetric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Sigma;
  label: string;
  value: number | string;
}) {
  return (
    <article className="grid min-h-[134px] content-between rounded-control border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="max-w-[8rem] text-xs font-extrabold leading-5 text-muted">{label}</span>
        <Icon size={16} className="text-hub-500" />
      </div>
      <strong className="text-2xl font-black leading-none tracking-normal text-[#071b35] tabular-nums">{value}</strong>
      <span className="h-1 w-12 rounded-full bg-hub-100" />
    </article>
  );
}

function UsageChart({ points }: { points: SeriesPoint[] }) {
  const width = 760;
  const height = 300;
  const padding = { top: 18, right: 26, bottom: 30, left: 62 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const start = points[0]?.timestamp ?? Date.now();
  const end = points.at(-1)?.timestamp ?? start + 1;
  const span = Math.max(1, end - start);
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.units, point.requests]));
  const unitLine = polyline(points, "units", start, span, maxValue, padding, plotWidth, plotHeight);
  const requestLine = polyline(points, "requests", start, span, maxValue, padding, plotWidth, plotHeight);
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => Math.round(maxValue * ratio));

  return (
    <svg className="h-[300px] w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img">
      {ticks.map((tick, index) => {
        const y = padding.top + plotHeight * (index / Math.max(1, ticks.length - 1));
        return (
          <g key={`${tick}-${index}`}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#edf1f3" strokeWidth="1" />
            <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-muted text-[11px] font-bold">
              {formatCompact(tick)}
            </text>
          </g>
        );
      })}
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={height - padding.bottom}
        y2={height - padding.bottom}
        stroke="#e2e8ec"
      />
      <polyline points={unitLine} fill="none" stroke="#2d6fc7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={requestLine} fill="none" stroke="#14735b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => {
        const [x, y] = pointXY(point, "units", start, span, maxValue, padding, plotWidth, plotHeight);
        return <circle key={`${point.timestamp}-${index}`} cx={x} cy={y} r="3.5" fill="#2d6fc7" />;
      })}
    </svg>
  );
}

function rangeOptions(i18n: Messages): RangeOption[] {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  return [
    { id: "5m", label: i18n.usagePage.minutes5, ms: 5 * minute },
    { id: "1h", label: i18n.usagePage.hour1, ms: hour },
    { id: "1d", label: i18n.usagePage.day1, ms: day },
    { id: "6h", label: i18n.usagePage.last6h, ms: 6 * hour },
    { id: "24h", label: i18n.usagePage.last24h, ms: day },
    { id: "3d", label: i18n.usagePage.last3d, ms: 3 * day },
    { id: "7d", label: i18n.usagePage.last7d, ms: 7 * day },
    { id: "30d", label: i18n.usagePage.last30d, ms: 30 * day },
    { id: "all", label: i18n.usagePage.all, ms: null }
  ];
}

function buildSeries(logs: AuditLogEntry[], rangeMs: number | null): SeriesPoint[] {
  const now = Date.now();
  const events = logs
    .map((log) => ({
      timestamp: Date.parse(log.timestamp),
      units: typeof log.usageUnits === "number" && Number.isFinite(log.usageUnits) ? log.usageUnits : 0,
      requests: log.kind === "proxy" ? 1 : 0
    }))
    .filter((event) => Number.isFinite(event.timestamp) && (event.units > 0 || event.requests > 0))
    .filter((event) => rangeMs === null || event.timestamp >= now - rangeMs)
    .sort((left, right) => left.timestamp - right.timestamp);

  if (events.length === 0) {
    return [];
  }

  const start = rangeMs === null ? events[0].timestamp : now - rangeMs;
  const end = rangeMs === null ? Math.max(events.at(-1)?.timestamp ?? now, start + 1) : now;
  const points: SeriesPoint[] = [{ timestamp: start, units: 0, requests: 0 }];
  let units = 0;
  let requests = 0;
  for (const event of events) {
    units += event.units;
    requests += event.requests;
    points.push({ timestamp: event.timestamp, units, requests });
  }
  points.push({ timestamp: end, units, requests });
  return points;
}

function polyline(
  points: SeriesPoint[],
  key: "units" | "requests",
  start: number,
  span: number,
  maxValue: number,
  padding: { top: number; left: number },
  plotWidth: number,
  plotHeight: number
): string {
  return points
    .map((point) => pointXY(point, key, start, span, maxValue, padding, plotWidth, plotHeight).join(","))
    .join(" ");
}

function pointXY(
  point: SeriesPoint,
  key: "units" | "requests",
  start: number,
  span: number,
  maxValue: number,
  padding: { top: number; left: number },
  plotWidth: number,
  plotHeight: number
): [number, number] {
  const x = padding.left + ((point.timestamp - start) / span) * plotWidth;
  const y = padding.top + plotHeight - (point[key] / maxValue) * plotHeight;
  return [Math.max(padding.left, Math.min(padding.left + plotWidth, x)), Math.max(padding.top, Math.min(padding.top + plotHeight, y))];
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0
  }).format(value);
}
