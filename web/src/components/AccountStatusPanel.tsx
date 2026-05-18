import {
  Activity,
  Gauge,
  HeartPulse,
  RadioTower,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  WifiOff
} from "lucide-react";
import { useState } from "react";
import type { Messages } from "../i18n";
import type {
  AdminState,
  UpstreamAccount,
  UpstreamHealthCheckResponse,
  UpstreamQuotaLimitBucket,
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
      <div className="relative overflow-hidden border-b border-slate-200 bg-[#101816] px-5 py-5 text-white">
        <div className="absolute -right-14 -top-14 h-36 w-36 rounded-full bg-hub-500/35 blur-2xl" />
        <div className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-hub-100/50 to-transparent" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-extrabold text-white/85">
              <RadioTower size={14} />
              {i18n.importPage.accountStatusTitle}
            </div>
            <p className="m-0 max-w-md text-sm leading-6 text-white/72">{i18n.importPage.accountStatusCopy}</p>
          </div>
          <div className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10">
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
          <div className="rounded-[16px] border border-hub-100 bg-hub-50 px-3 py-2 text-xs font-extrabold text-hub-900">
            {i18n.importPage.healthSummary(summary.alive, summary.dead, summary.skipped)}
          </div>
        ) : null}

        {accounts.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <Server className="mx-auto mb-3 text-muted" size={26} />
            <h3 className="m-0 text-sm font-black text-ink">{i18n.importPage.noImportedAccounts}</h3>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-muted">{i18n.importPage.noImportedAccountsCopy}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {accounts.map((account, index) => (
              <AccountStatusCard
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

function AccountStatusCard({
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
  const status = deriveStatus(account, i18n);
  const quota = account.quota;
  const primaryQuota = quota?.rateLimit ?? legacyQuotaWindow(quota);
  const additionalRateLimits = visibleAdditionalRateLimits(quota?.additionalRateLimits ?? []);
  const initial = account.name.trim().charAt(0).toUpperCase() || String(index + 1);

  return (
    <article className="group relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-hub-100 hover:shadow-panel">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-hub-500 via-[#d7a64a] to-signal-blue opacity-80" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-[18px] bg-hub-900 text-sm font-black text-white shadow-sm">
            {initial}
          </div>
          <div className="min-w-0">
            <h3 className="m-0 truncate text-sm font-black text-ink">{account.name}</h3>
            <p className="m-0 mt-1 truncate text-xs text-muted">
              {account.endpointHost} · {account.provider}
            </p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${status.className}`}>
          {status.icon}
          {status.label}
        </span>
      </div>

      <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-black text-ink">
            <Gauge size={14} />
            {i18n.importPage.providerQuota}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${quotaTone(quota?.status)}`}>
              {quotaLabel(quota?.status, i18n)}
            </span>
            <button
              className="grid size-7 place-items-center rounded-lg border border-slate-200 bg-white text-muted transition hover:border-hub-100 hover:text-hub-600 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={blocked || !account.enabled}
              onClick={onQuotaRefresh}
              title={i18n.importPage.refreshQuota}
            >
              <RefreshCw size={13} className={quotaBusy ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {quota?.supported ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-1.5 text-[11px] font-extrabold">
              {quota.planType ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-muted">
                  {i18n.importPage.planType}: {quota.planType}
                </span>
              ) : null}
              {quota.fetchedAt ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-muted">
                  {i18n.importPage.quotaUpdated}: {formatDate(quota.fetchedAt)}
                </span>
              ) : null}
            </div>

            {primaryQuota ? (
              <QuotaBucket
                label={i18n.importPage.primaryRateLimit}
                quotaWindow={primaryQuota}
                i18n={i18n}
                tone="primary"
              />
            ) : null}
            {quota.secondaryRateLimit ? (
              <QuotaBucket
                label={i18n.importPage.secondaryRateLimit}
                quotaWindow={quota.secondaryRateLimit}
                i18n={i18n}
                tone="secondary"
              />
            ) : null}
            {quota.codeReviewRateLimit ? (
              <QuotaBucket
                label={i18n.importPage.codeReviewRateLimit}
                quotaWindow={quota.codeReviewRateLimit}
                i18n={i18n}
                tone="review"
              />
            ) : null}
            {additionalRateLimits.map((bucket) => (
              <QuotaBucket
                key={bucket.id}
                label={`${i18n.importPage.additionalRateLimit}: ${limitBucketLabel(bucket)}`}
                quotaWindow={bucket}
                i18n={i18n}
                tone="additional"
              />
            ))}

            {quota.limitRequests != null || quota.remainingRequests != null ? (
              <div className="grid grid-cols-3 gap-2 text-[11px] text-muted">
                <span>{i18n.importPage.remainingRequests}: {formatOptionalNumber(quota.remainingRequests)}</span>
                <span>{i18n.importPage.limitRequests}: {formatOptionalNumber(quota.limitRequests)}</span>
                <span>{i18n.importPage.resetAt}: {quota.resetRequests ?? "-"}</span>
              </div>
            ) : null}
            <p className="m-0 text-[11px] leading-4 text-muted">
              {quota.source === "provider-api" ? i18n.importPage.quotaFromProvider : i18n.importPage.quotaFromHeaders}
            </p>
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-slate-300 bg-white px-3 py-2">
            <p className="m-0 text-xs font-black text-ink">{i18n.importPage.quotaUnsupportedTitle}</p>
            <p className="m-0 mt-1 text-[11px] leading-5 text-muted">{i18n.importPage.quotaUnsupportedCopy}</p>
          </div>
        )}
      </div>

      {account.lastProbeError ? (
        <p className="mt-3 rounded-[14px] border border-red-100 bg-red-50 px-3 py-2 text-[11px] leading-5 text-signal-red">
          {account.lastProbeError}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="button button-secondary button-small disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={blocked || !account.enabled}
            onClick={onProbe}
          >
            <Activity size={14} className={busy ? "animate-pulse" : ""} />
            {busy ? i18n.importPage.healthChecking : i18n.importPage.checkThisAccount}
          </button>
          <button
            className="button button-danger button-small disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={blocked}
            onClick={onDelete}
          >
            <Trash2 size={14} className={deleting ? "animate-pulse" : ""} />
            {deleting ? i18n.common.loading : i18n.common.delete}
          </button>
        </div>
      </div>
    </article>
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
    <div className={`rounded-[18px] px-3 py-2 ${toneClass}`}>
      <div className="text-xl font-black leading-none">{value}</div>
      <div className="mt-1 text-[11px] font-extrabold">{label}</div>
    </div>
  );
}

function QuotaBucket({
  label,
  quotaWindow,
  i18n,
  tone
}: {
  label: string;
  quotaWindow: UpstreamQuotaWindow;
  i18n: Messages;
  tone: "primary" | "secondary" | "review" | "additional";
}) {
  const percent = quotaPercent(quotaWindow);
  const barClass = quotaBarClass(percent, quotaWindow.limitReached, tone);
  const percentClass = quotaPercentClass(percent, quotaWindow.limitReached, tone);
  const resetAt = quotaWindow.resetAt ? formatDate(quotaWindow.resetAt) : null;
  const windowDuration = formatWindowDuration(quotaWindow.limitWindowSeconds);
  const secondaryRateLimit = (quotaWindow as UpstreamQuotaLimitBucket).secondaryRateLimit;

  return (
    <div className="rounded-[14px] border border-slate-200 bg-white px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
        <span className="min-w-0 truncate font-black text-ink" title={label}>
          {label}
          {windowDuration ? <span className="ml-1 font-extrabold text-muted">({windowDuration})</span> : null}
        </span>
        <span className={`shrink-0 font-black ${percentClass}`}>
          {quotaWindow.limitReached
            ? i18n.importPage.limitReached
            : percent !== null
              ? `${percent}% ${i18n.importPage.used}`
              : quotaWindow.allowed === false
                ? i18n.common.disabled
                : i18n.importPage.quotaOk}
        </span>
      </div>
      {percent !== null ? (
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      {resetAt ? (
        <p className="m-0 mt-1 text-[11px] leading-4 text-muted">
          {i18n.importPage.resetAt}: {resetAt}
        </p>
      ) : null}
      {secondaryRateLimit ? (
        <div className="mt-2 border-l border-slate-200 pl-2">
          <QuotaBucket
            label={i18n.importPage.secondaryRateLimit}
            quotaWindow={secondaryRateLimit}
            i18n={i18n}
            tone="secondary"
          />
        </div>
      ) : null}
    </div>
  );
}

function deriveStatus(account: UpstreamAccount, i18n: Messages) {
  if (!account.enabled) {
    return {
      label: i18n.common.disabled,
      icon: <WifiOff size={12} />,
      className: "border-slate-200 bg-slate-100 text-muted"
    };
  }

  if (account.lastProbeOk === true) {
    return {
      label: i18n.importPage.healthy,
      icon: <ShieldCheck size={12} />,
      className: "border-hub-100 bg-hub-50 text-hub-600"
    };
  }

  if (account.lastProbeOk === false) {
    return {
      label: i18n.importPage.failed,
      icon: <WifiOff size={12} />,
      className: "border-red-100 bg-red-50 text-signal-red"
    };
  }

  return {
    label: i18n.importPage.untested,
    icon: <RadioTower size={12} />,
    className: "border-amber-100 bg-amber-50 text-signal-amber"
  };
}

function quotaLabel(status: string | undefined, i18n: Messages): string {
  if (status === "available") {
    return i18n.importPage.quotaAvailableLabel;
  }
  if (status === "limited") {
    return i18n.importPage.quotaLimitedLabel;
  }
  return i18n.importPage.quotaUnknownLabel;
}

function quotaTone(status: string | undefined): string {
  if (status === "available") {
    return "bg-hub-50 text-hub-600";
  }
  if (status === "limited") {
    return "bg-red-50 text-signal-red";
  }
  return "bg-slate-100 text-muted";
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

function quotaPercent(quotaWindow: UpstreamQuotaWindow): number | null {
  if (quotaWindow.limitReached) {
    return 100;
  }
  if (typeof quotaWindow.usedPercent !== "number") {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(quotaWindow.usedPercent)));
}

function quotaBarClass(
  percent: number | null,
  limitReached: boolean | undefined,
  tone: "primary" | "secondary" | "review" | "additional"
): string {
  if (limitReached || (percent ?? 0) >= 90) {
    return "bg-signal-red";
  }
  if ((percent ?? 0) >= 60) {
    return "bg-signal-amber";
  }
  if (tone === "secondary") {
    return "bg-signal-blue";
  }
  if (tone === "review") {
    return "bg-[#18a0a8]";
  }
  if (tone === "additional") {
    return "bg-[#5b8def]";
  }
  return "bg-hub-500";
}

function quotaPercentClass(
  percent: number | null,
  limitReached: boolean | undefined,
  tone: "primary" | "secondary" | "review" | "additional"
): string {
  if (limitReached || (percent ?? 0) >= 90) {
    return "text-signal-red";
  }
  if ((percent ?? 0) >= 60) {
    return "text-signal-amber";
  }
  if (tone === "secondary") {
    return "text-signal-blue";
  }
  if (tone === "review") {
    return "text-[#0f7d84]";
  }
  if (tone === "additional") {
    return "text-[#315fb9]";
  }
  return "text-hub-600";
}

function normalizedLimitName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_");
}

function isReviewLimitName(value: string | null | undefined): boolean {
  const normalized = normalizedLimitName(value);
  return (
    normalized === "review" ||
    normalized === "code_review" ||
    normalized === "codex_review" ||
    normalized === "codex_code_review" ||
    normalized.includes("code_review") ||
    normalized.includes("codex_review")
  );
}

function visibleAdditionalRateLimits(buckets: UpstreamQuotaLimitBucket[]): UpstreamQuotaLimitBucket[] {
  return buckets
    .filter((bucket) => {
      const id = normalizedLimitName(bucket.id);
      if (!id || id === "codex") {
        return false;
      }
      return !isReviewLimitName(bucket.id) && !isReviewLimitName(bucket.name);
    })
    .sort((left, right) => limitBucketLabel(left).localeCompare(limitBucketLabel(right)));
}

function limitBucketLabel(bucket: UpstreamQuotaLimitBucket): string {
  const label = (bucket.name || bucket.id || "").trim();
  return label ? label.replace(/_/g, " ") : "limit";
}

function formatProbe(account: UpstreamAccount, i18n: Messages): string {
  if (!account.lastProbeAt) {
    return i18n.importPage.neverChecked;
  }

  const status = account.lastProbeStatusCode ? `${i18n.importPage.responseStatus} ${account.lastProbeStatusCode}` : "";
  const latency =
    typeof account.lastProbeLatencyMs === "number"
      ? `${i18n.importPage.latency} ${account.lastProbeLatencyMs}ms`
      : "";
  return [formatDate(account.lastProbeAt), status, latency].filter(Boolean).join(" · ");
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

function formatOptionalNumber(value: number | null | undefined): string {
  return typeof value === "number" ? formatNumber(value) : "-";
}
