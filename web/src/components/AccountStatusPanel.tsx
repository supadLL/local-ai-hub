import {
  Activity,
  HeartPulse,
  RadioTower,
  RefreshCw,
  Server,
  Trash2,
  WifiOff
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Messages } from "../i18n";
import type {
  AdminState,
  UpstreamAccount,
  UpstreamHealthCheckResponse,
  UpstreamQuotaWindow,
  UpstreamProbeResult
} from "../types";

interface AccountStatusPanelProps {
  state: AdminState | null;
  i18n: Messages;
  onRefresh: () => Promise<void>;
  onHealthCheck: (ids?: string[]) => Promise<UpstreamHealthCheckResponse>;
  onTestSaved: (id: string) => Promise<UpstreamProbeResult>;
  onDeleteSaved: (id: string, name: string) => Promise<void>;
  onRefreshQuota: (id: string) => Promise<void>;
  onFeedback: (message: string, isError?: boolean) => void;
}

export function AccountStatusPanel({
  state,
  i18n,
  onRefresh,
  onHealthCheck,
  onTestSaved,
  onDeleteSaved,
  onRefreshQuota,
  onFeedback
}: AccountStatusPanelProps) {
  const accounts = state?.upstreams ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<UpstreamHealthCheckResponse["summary"] | null>(null);

  const healthyCount = accounts.filter((account) => account.enabled && account.lastProbeOk === true).length;
  const failedCount = accounts.filter((account) => account.enabled && account.lastProbeOk === false).length;
  const untestedCount = accounts.filter((account) => account.enabled && account.lastProbeOk == null).length;

  async function runHealthCheck(ids?: string[]) {
    const busyKey = ids?.length === 1 ? ids[0] : "all";
    setBusy(busyKey);
    try {
      const result = await onHealthCheck(ids);
      setSummary(result.summary);
      onFeedback(
        i18n.importPage.healthSummary(result.summary.alive, result.summary.dead, result.summary.skipped),
        result.summary.dead > 0
      );
    } finally {
      setBusy(null);
    }
  }

  async function runSingleProbe(account: UpstreamAccount) {
    setBusy(account.id);
    try {
      const result = await onTestSaved(account.id);
      if (result.ok) {
        const models = result.models?.length ? result.models.join(", ") : i18n.common.noModels;
        onFeedback(i18n.importPage.testPassed(account.name, result.statusCode, models));
      } else {
        onFeedback(i18n.importPage.testFailed(account.name, result.statusCode, result.error), true);
      }
    } finally {
      setBusy(null);
    }
  }

  async function refreshQuota(account: UpstreamAccount) {
    setBusy(`quota:${account.id}`);
    try {
      await onRefreshQuota(account.id);
      onFeedback(i18n.importPage.quotaRefreshed(account.name));
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount(account: UpstreamAccount) {
    if (!window.confirm(i18n.importPage.deleteConfirm(account.name))) {
      return;
    }

    setBusy(`delete:${account.id}`);
    try {
      await onDeleteSaved(account.id, account.name);
      setSummary(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="soft-grid border-b border-line/80 bg-white px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="section-kicker mb-3">
              <RadioTower size={14} />
              {i18n.importPage.accountStatusTitle}
            </div>
            <p className="m-0 max-w-md text-sm leading-6 text-muted">{i18n.importPage.accountStatusCopy}</p>
          </div>
          <div className="grid size-11 place-items-center rounded-control border border-hub-100 bg-hub-50 text-hub-700">
            <HeartPulse size={21} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5">
        <div className="grid grid-cols-3 gap-2">
          <SummaryTile label={i18n.importPage.healthy} value={healthyCount} tone="success" />
          <SummaryTile label={i18n.importPage.failed} value={failedCount} tone="danger" />
          <SummaryTile label={i18n.importPage.untested} value={untestedCount} tone="muted" />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="button button-small disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={busy !== null || accounts.length === 0}
            onClick={() => runHealthCheck().catch((error) => onFeedback(error.message, true))}
          >
            <HeartPulse size={15} className={busy === "all" ? "animate-pulse" : ""} />
            {busy === "all" ? i18n.importPage.healthChecking : i18n.importPage.healthCheckAll}
          </button>
          <button
            className="button button-secondary button-small disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={busy !== null}
            onClick={() => {
              setBusy("refresh");
              onRefresh()
                .catch((error) => onFeedback(error.message, true))
                .finally(() => setBusy(null));
            }}
          >
            <RefreshCw size={15} className={busy === "refresh" ? "animate-spin" : ""} />
            {i18n.importPage.refreshStatus}
          </button>
        </div>

        {summary ? (
          <div className="rounded-control border border-hub-100 bg-hub-50 px-3 py-2 text-xs font-black text-hub-900">
            {i18n.importPage.healthSummary(summary.alive, summary.dead, summary.skipped)}
          </div>
        ) : null}

        {accounts.length === 0 ? (
          <div className="rounded-control border border-dashed border-line bg-white/70 px-4 py-8 text-center">
            <Server className="mx-auto mb-3 text-muted" size={26} />
            <h3 className="m-0 text-sm font-black text-ink">{i18n.importPage.noImportedAccounts}</h3>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-muted">{i18n.importPage.noImportedAccountsCopy}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
            {accounts.map((account, index) => (
              <CompactAccountStatusCard
                key={account.id}
                account={account}
                index={index}
                i18n={i18n}
                busy={busy === account.id}
                deleting={busy === `delete:${account.id}`}
                quotaBusy={busy === `quota:${account.id}`}
                blocked={busy !== null}
                onProbe={() => runSingleProbe(account).catch((error) => onFeedback(error.message, true))}
                onQuotaRefresh={() => refreshQuota(account).catch((error) => onFeedback(error.message, true))}
                onDelete={() => deleteAccount(account).catch((error) => onFeedback(error.message, true))}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CompactAccountStatusCard({
  account,
  index,
  i18n,
  busy,
  deleting,
  quotaBusy,
  blocked,
  onProbe,
  onQuotaRefresh,
  onDelete
}: {
  account: UpstreamAccount;
  index: number;
  i18n: Messages;
  busy: boolean;
  deleting: boolean;
  quotaBusy: boolean;
  blocked: boolean;
  onProbe: () => void;
  onQuotaRefresh: () => void;
  onDelete: () => void;
}) {
  const quota = account.quota;
  const quotaMeters = compactQuotaMeters(quota, i18n);
  const usage = account.usage;
  const usedTokens = usage?.total_tokens ?? 0;
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const cachedTokens = usage?.cached_tokens ?? 0;
  const requestCount = usage?.request_count ?? account.requestCount ?? 0;
  const cacheHitRate = inputTokens > 0 ? `${formatDecimal((cachedTokens / inputTokens) * 100)}%` : "--";
  const initial = account.name.trim().charAt(0).toUpperCase() || String(index + 1);
  const status = deriveCompactStatus(account, i18n);
  const statusTitle = account.lastProbeError ?? status.label;

  return (
    <article className="group relative grid min-h-[270px] content-between overflow-hidden rounded-control border border-line/80 bg-white/95 p-3 text-ink shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-hub-100 hover:shadow-panel">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-hub-500 via-hub-200 to-signal-blue" />
      <div className="flex items-start gap-2 pt-1">
        <span
          className={`mt-3 size-3.5 shrink-0 rounded-[3px] border ${account.enabled ? "border-hub-500 bg-hub-50" : "border-slate-300 bg-slate-100"}`}
          title={account.enabled ? i18n.common.enabled : i18n.common.disabled}
        />
        <div className="grid size-10 shrink-0 place-items-center rounded-control border border-hub-100 bg-hub-50 text-lg font-black text-hub-700 shadow-inner">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="grid min-w-0 gap-0.5">
            <h3 className="m-0 truncate text-[13px] font-black leading-5 text-ink" title={account.name}>
              {account.name}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex max-w-full shrink-0 items-center truncate rounded-full border px-2 py-0.5 text-[11px] font-black ${status.className}`}
                title={statusTitle}
              >
                {status.label}
              </span>
              <AccountPlanBadge planType={quota?.planType} />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CompactIconButton disabled={blocked || !account.enabled} onClick={onProbe} title={i18n.importPage.checkThisAccount}>
            <Activity size={14} className={busy ? "animate-pulse" : ""} />
          </CompactIconButton>
          <CompactIconButton disabled={blocked || !account.enabled} onClick={onQuotaRefresh} title={i18n.importPage.refreshQuota}>
            <RefreshCw size={14} className={quotaBusy ? "animate-spin" : ""} />
          </CompactIconButton>
          <CompactIconButton disabled={blocked} onClick={onDelete} title={i18n.common.delete} danger>
            <Trash2 size={14} className={deleting ? "animate-pulse" : ""} />
          </CompactIconButton>
        </div>
      </div>

      <div className="mt-3 grid gap-1.5 rounded-control border border-line/80 bg-mist/45 p-2.5">
        <InfoRow label={i18n.importPage.requestCount} value={`${formatNumber(requestCount)} req`} />
        <InfoRow label={i18n.importPage.tokenUsage} value={formatTokenAmount(usedTokens, true)} />
        <InfoRow label={i18n.importPage.localUsage} value={`In ${formatTokenAmount(inputTokens, true)} / Out ${formatTokenAmount(outputTokens, true)}`} />
        <InfoRow label="Cache hit" value={`${cacheHitRate} · ${formatTokenAmount(cachedTokens, true)}`} muted={cachedTokens === 0} />
      </div>

      <div className="mt-3 grid gap-2">
        {quotaMeters.length > 0 ? (
          quotaMeters.map((item) => (
            <CompactQuotaMeter key={item.id} label={item.label} quotaWindow={item.quotaWindow} i18n={i18n} />
          ))
        ) : (
          <div className="rounded-control border border-dashed border-line/80 bg-white/70 px-2.5 py-2 text-[11px] font-black text-muted">
            {i18n.importPage.quotaUnknownLabel}
          </div>
        )}
      </div>
    </article>
  );
}

function AccountPlanBadge({ planType }: { planType?: string | null }) {
  const normalized = normalizePlanType(planType);
  const label = normalized ? normalized.toUpperCase() : "PLAN --";
  const className =
    normalized === "plus" || normalized === "pro" || normalized === "team"
      ? "border-signal-blue/25 bg-blue-50 text-signal-blue"
      : normalized === "free"
        ? "border-amber-100 bg-amber-50 text-signal-amber"
        : "border-line bg-white text-muted";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-black ${className}`}
      title={planType ? `Plan: ${planType}` : "Plan unknown"}
    >
      {label}
    </span>
  );
}

function CompactQuotaMeter({
  label,
  quotaWindow,
  i18n
}: {
  label: string;
  quotaWindow: UpstreamQuotaWindow;
  i18n: Messages;
}) {
  const percent = quotaPercent(quotaWindow);
  const resetAt = quotaWindow.resetAt ? formatDate(quotaWindow.resetAt) : "--";
  const quotaText = percent !== null ? `${percent}% ${i18n.importPage.used}` : i18n.importPage.quotaUnknownLabel;

  return (
    <div className="rounded-control border border-line/80 bg-white/80 px-2.5 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-black text-ink" title={label}>
          {label}
        </span>
        <span className={`shrink-0 font-black ${compactQuotaTextClass(percent, quotaWindow.limitReached)}`}>{quotaText}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line/70">
        <div className={`h-full rounded-full transition-all ${compactQuotaBarClass(percent, quotaWindow.limitReached)}`} style={{ width: `${percent ?? 0}%` }} />
      </div>
      <div className="mt-1.5 grid grid-cols-[54px_minmax(0,1fr)] items-center gap-2 text-[11px] leading-4 text-muted">
        <span className="shrink-0">{i18n.importPage.resetAt}</span>
        <span className="min-w-0 truncate text-right font-mono tabular-nums" title={resetAt}>
          {resetAt}
        </span>
      </div>
    </div>
  );
}

function CompactIconButton({
  children,
  disabled,
  onClick,
  title,
  danger = false
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      className={[
        "grid size-7 place-items-center rounded-control border border-transparent text-muted transition hover:border-hub-100 hover:bg-hub-50 hover:text-hub-700 disabled:cursor-not-allowed disabled:opacity-40",
        danger ? "hover:border-red-100 hover:bg-red-50 hover:text-signal-red" : ""
      ].join(" ")}
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

function InfoRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="grid min-h-5 grid-cols-[88px_minmax(0,1fr)] items-start gap-2 text-xs leading-5">
      <span className="shrink-0 text-muted">{label}</span>
      <span
        className={`min-w-0 break-words text-right font-mono tabular-nums ${muted ? "text-muted" : "font-black text-ink"}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "success" | "danger" | "muted" }) {
  const toneClass =
    tone === "success"
      ? "bg-hub-50 text-hub-600"
      : tone === "danger"
        ? "bg-red-50 text-signal-red"
        : "bg-slate-100 text-muted";
  return (
    <div className={`rounded-control border border-white/60 px-3 py-2 ${toneClass}`}>
      <div className="font-display text-xl font-black leading-none">{value}</div>
      <div className="mt-1 text-[11px] font-black">{label}</div>
    </div>
  );
}

function deriveCompactStatus(account: UpstreamAccount, i18n: Messages) {
  if (!account.enabled) {
    return {
      label: i18n.common.disabled,
      className: "border-slate-200 bg-slate-100 text-muted"
    };
  }

  if (account.lastProbeOk === true) {
    return {
      label: i18n.importPage.healthy,
      className: "border-hub-100 bg-hub-50 text-hub-700"
    };
  }

  if (account.lastProbeOk === false) {
    return {
      label: i18n.importPage.failed,
      className: "border-red-100 bg-red-50 text-signal-red"
    };
  }

  return {
    label: i18n.importPage.untested,
    className: "border-amber-100 bg-amber-50 text-signal-amber"
  };
}

function legacyQuotaWindow(quota: UpstreamAccount["quota"]): UpstreamQuotaWindow | null {
  if (!quota?.supported) {
    return null;
  }
  return {
    allowed: quota.status !== "unavailable",
    limitReached: quota.status === "limited" || quota.limitReached === true,
    usedPercent: quota.usedPercent ?? null,
    resetAt: quota.resetRequests ?? null,
    limitWindowSeconds: null
  };
}

function compactQuotaMeters(quota: UpstreamAccount["quota"], i18n: Messages): Array<{ id: string; label: string; quotaWindow: UpstreamQuotaWindow }> {
  if (!quota?.supported) {
    return [];
  }

  const meters: Array<{ id: string; label: string; quotaWindow: UpstreamQuotaWindow }> = [];
  const primaryQuota = quota.rateLimit ?? legacyQuotaWindow(quota);
  if (primaryQuota) {
    meters.push({
      id: "primary",
      label: quotaWindowLabel(i18n.importPage.providerQuota, primaryQuota),
      quotaWindow: primaryQuota
    });
  }
  if (quota.secondaryRateLimit) {
    meters.push({
      id: "secondary",
      label: quotaWindowLabel(i18n.importPage.secondaryRateLimit, quota.secondaryRateLimit),
      quotaWindow: quota.secondaryRateLimit
    });
  }
  if (quota.codeReviewRateLimit) {
    meters.push({
      id: "code-review",
      label: quotaWindowLabel(i18n.importPage.codeReviewRateLimit, quota.codeReviewRateLimit),
      quotaWindow: quota.codeReviewRateLimit
    });
  }
  for (const item of quota.additionalRateLimits ?? []) {
    meters.push({
      id: `additional-${item.id}`,
      label: quotaWindowLabel(limitBucketLabel(item), item),
      quotaWindow: item
    });
    if (item.secondaryRateLimit) {
      meters.push({
        id: `additional-${item.id}-secondary`,
        label: quotaWindowLabel(`${limitBucketLabel(item)} secondary`, item.secondaryRateLimit),
        quotaWindow: item.secondaryRateLimit
      });
    }
  }

  return meters;
}

function quotaWindowLabel(label: string, quotaWindow: UpstreamQuotaWindow): string {
  const duration = formatWindowDuration(quotaWindow.limitWindowSeconds);
  return duration ? `${label} (${duration})` : label;
}

function limitBucketLabel(bucket: { id?: string | null; name?: string | null }): string {
  const label = (bucket.name || bucket.id || "").trim();
  return label ? label.replace(/_/g, " ") : "limit";
}

function quotaPercent(quotaWindow: UpstreamQuotaWindow): number | null {
  if (quotaWindow.limitReached) {
    return 100;
  }
  if (typeof quotaWindow.usedPercent !== "number") {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(quotaWindow.usedPercent)));
}

function compactQuotaTextClass(percent: number | null, limitReached: boolean | undefined): string {
  if (limitReached || (percent ?? 0) >= 90) {
    return "text-signal-red";
  }
  if ((percent ?? 0) >= 60) {
    return "text-signal-amber";
  }
  return "text-hub-600";
}

function compactQuotaBarClass(percent: number | null, limitReached: boolean | undefined): string {
  if (limitReached || (percent ?? 0) >= 90) {
    return "bg-signal-red";
  }
  if ((percent ?? 0) >= 60) {
    return "bg-signal-amber";
  }
  return "bg-hub-500";
}

function normalizePlanType(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "unknown plan") {
    return null;
  }
  return normalized;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatWindowDuration(value: number | null | undefined): string | null {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const seconds = Math.round(value);
  if (seconds % 86400 === 0) {
    return `${seconds / 86400}d`;
  }
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 10 ? 1 : 2
  }).format(Number.isFinite(value) ? value : 0);
}

function formatTokenAmount(value: number, compact = false): string {
  const normalized = Number.isFinite(value) ? value : 0;
  if (!compact || Math.abs(normalized) < 10_000) {
    return `${new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(normalized)} Token`;
  }

  const units = [
    { value: 1_000_000_000, suffix: "B" },
    { value: 1_000_000, suffix: "M" },
    { value: 1_000, suffix: "K" }
  ];
  const unit = units.find((item) => Math.abs(normalized) >= item.value) ?? units.at(-1)!;
  return `${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(normalized / unit.value)}${unit.suffix} Token`;
}
