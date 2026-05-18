import {
  Activity,
  Gauge,
  HeartPulse,
  KeyRound,
  RadioTower,
  RefreshCw,
  Server,
  ShieldCheck,
  Timer,
  Trash2,
  WifiOff
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { Messages } from "../i18n";
import type {
  AdminState,
  UpstreamAccount,
  UpstreamHealthCheckResponse,
  UpstreamProbeResult
} from "../types";

interface AccountStatusPanelProps {
  state: AdminState | null;
  i18n: Messages;
  onRefresh: () => Promise<void>;
  onHealthCheck: (ids?: string[]) => Promise<UpstreamHealthCheckResponse>;
  onTestSaved: (id: string) => Promise<UpstreamProbeResult>;
  onDeleteSaved: (id: string, name: string) => Promise<void>;
  onFeedback: (message: string, isError?: boolean) => void;
}

export function AccountStatusPanel({
  state,
  i18n,
  onRefresh,
  onHealthCheck,
  onTestSaved,
  onDeleteSaved,
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
                blocked={busy !== null}
                onProbe={() => runSingleProbe(account).catch((error) => onFeedback(error.message, true))}
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
  blocked,
  onProbe,
  onDelete
}: {
  account: UpstreamAccount;
  index: number;
  i18n: Messages;
  busy: boolean;
  deleting: boolean;
  blocked: boolean;
  onProbe: () => void;
  onDelete: () => void;
}) {
  const status = deriveStatus(account, i18n);
  const quota = account.quota;
  const usageUnits = account.usedQuota ?? 0;
  const requestCount = account.requestCount ?? 0;
  const models = account.discoveredModels?.length ? account.discoveredModels : account.models;
  const hiddenModelCount = Math.max(0, models.length - 4);
  const percent = quota?.usedPercent ?? null;
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

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label={i18n.importPage.requestCount} value={formatNumber(requestCount)} />
        <Metric label={i18n.importPage.usageUnits} value={formatNumber(usageUnits)} />
      </div>

      <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-black text-ink">
            <Gauge size={14} />
            {i18n.importPage.providerQuota}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${quotaTone(quota?.status)}`}>
            {quotaLabel(quota?.status, i18n)}
          </span>
        </div>

        {quota?.supported ? (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div
                className={`h-full rounded-full transition-all ${quota.status === "limited" ? "bg-signal-red" : "bg-hub-500"}`}
                style={{ width: `${percent ?? 0}%` }}
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted">
              <span>{i18n.importPage.remainingRequests}: {formatOptionalNumber(quota.remainingRequests)}</span>
              <span>{i18n.importPage.limitRequests}: {formatOptionalNumber(quota.limitRequests)}</span>
              <span>{i18n.importPage.resetAt}: {quota.resetRequests ?? "-"}</span>
            </div>
            <p className="m-0 mt-2 text-[11px] leading-4 text-muted">{i18n.importPage.quotaFromHeaders}</p>
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-slate-300 bg-white px-3 py-2">
            <p className="m-0 text-xs font-black text-ink">{i18n.importPage.quotaUnsupportedTitle}</p>
            <p className="m-0 mt-1 text-[11px] leading-5 text-muted">{i18n.importPage.quotaUnsupportedCopy}</p>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2 text-xs">
        <InfoRow icon={<Server size={14} />} label={i18n.importPage.endpoint} value={account.endpointHost} />
        {account.accountEmail ? (
          <InfoRow icon={<ShieldCheck size={14} />} label={i18n.importPage.accountIdentity} value={account.accountEmail} />
        ) : null}
        <InfoRow icon={<KeyRound size={14} />} label={i18n.importPage.maskedKey} value={account.apiKey} />
        {account.tokenExpiresAt ? (
          <InfoRow icon={<Timer size={14} />} label={i18n.importPage.tokenExpires} value={formatDate(account.tokenExpiresAt)} />
        ) : null}
        <InfoRow
          icon={<Timer size={14} />}
          label={i18n.importPage.lastProbe}
          value={formatProbe(account, i18n)}
        />
      </div>

      {account.lastProbeError ? (
        <p className="mt-3 rounded-[14px] border border-red-100 bg-red-50 px-3 py-2 text-[11px] leading-5 text-signal-red">
          {account.lastProbeError}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {models.slice(0, 4).map((model) => (
          <span key={model} className="chip max-w-full truncate">
            {model}
          </span>
        ))}
        {hiddenModelCount > 0 ? <span className="chip">+{hiddenModelCount}</span> : null}
        {models.length === 0 ? <span className="chip">{i18n.common.noModels}</span> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <span className="text-[11px] font-extrabold text-muted">
          {(account.discoveredModels?.length ?? 0) > 0 ? i18n.importPage.discoveredModels : i18n.importPage.configuredModels}
        </span>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-extrabold text-muted">{label}</div>
      <div className="mt-1 text-sm font-black tabular-nums text-ink">{value}</div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] bg-slate-50 px-3 py-2">
      <span className="inline-flex shrink-0 items-center gap-1.5 font-extrabold text-muted">
        {icon}
        {label}
      </span>
      <span className="min-w-0 truncate font-black text-ink">{value}</span>
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatOptionalNumber(value: number | null | undefined): string {
  return typeof value === "number" ? formatNumber(value) : "-";
}
