import { ArrowRight, Copy, Database, KeyRound, RadioTower, Server, Sparkles, ScrollText } from "lucide-react";
import type { Messages } from "../i18n";
import { defaultRequestModel } from "../model-catalog";
import type { AdminState } from "../types";
import { LogList } from "./shared";

interface OverviewProps {
  state: AdminState | null;
  i18n: Messages;
  onOpenActivity: () => void;
  onCopy: (text: string) => void;
}

const curlExample = `curl http://127.0.0.1:4100/v1/chat/completions \\
  -H "Authorization: Bearer lah_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${defaultRequestModel}","messages":[{"role":"user","content":"hello"}]}'`;

export function Overview({ state, i18n, onOpenActivity, onCopy }: OverviewProps) {
  const logs = state?.logs ?? [];
  const enabledUpstreams = state?.counts.enabledUpstreams ?? 0;
  const enabledKeys = state?.counts.enabledClientKeys ?? 0;

  return (
    <div className="page-stack">
      <section className="relative overflow-hidden rounded-control border border-line/80 bg-white/80 p-5 shadow-panel backdrop-blur">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#31a57f,#4c8bdc,#d99a2b)]" />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 max-lg:grid-cols-1">
          <div>
            <div className="section-kicker">
              <Sparkles size={13} />
              Local-first gateway
            </div>
            <h3 className="m-0 mt-4 font-display text-3xl font-black leading-tight text-ink max-md:text-2xl">
              Local AI Hub
            </h3>
            <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-muted">{i18n.pages.overview.subtitle}</p>
          </div>
          <div className="grid min-w-[280px] grid-cols-2 gap-3 max-sm:min-w-0">
            <InfoBlock label={i18n.common.host} value={state?.service.host ?? "-"} />
            <InfoBlock label={i18n.common.port} value={String(state?.service.port ?? "-")} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-4 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
        <StatCard
          icon={Server}
          label={i18n.common.service}
          value={state ? i18n.common.online : i18n.common.loading}
          hint={i18n.common.localIntranetMvp}
        />
        <StatCard
          icon={RadioTower}
          label={i18n.tabs.import}
          value={`${enabledUpstreams} / ${state?.counts.upstreams ?? 0}`}
          hint={i18n.importPage.accountStatusTitle}
        />
        <StatCard
          icon={KeyRound}
          label={i18n.sidebar.enabledKeys}
          value={enabledKeys}
          hint={`${state?.counts.clientKeys ?? 0} ${i18n.overview.totalIssued}`}
        />
        <StatCard icon={ScrollText} label={i18n.overview.recentLogs} value={logs.length} hint={i18n.overview.latest60} />
      </div>

      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] gap-5 max-xl:grid-cols-1">
        <section className="panel overflow-hidden">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">{i18n.overview.requestTemplate}</h3>
              <p className="panel-copy">{i18n.overview.requestTemplateCopy}</p>
            </div>
            <button className="button button-secondary button-small" type="button" onClick={() => onCopy(curlExample)}>
              <Copy size={14} />
              {i18n.common.copy}
            </button>
          </div>
          <div className="p-5">
            <pre className="code-card m-0">
              {curlExample}
            </pre>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">{i18n.overview.latestActivity}</h3>
              <p className="panel-copy">{i18n.overview.latestActivityCopy}</p>
            </div>
            <button className="button button-secondary button-small" type="button" onClick={onOpenActivity}>
              {i18n.overview.view}
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="p-5">
            <LogList logs={logs.slice(-4)} i18n={i18n} compact />
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">{i18n.overview.serviceSnapshot}</h3>
            <p className="panel-copy">{i18n.overview.serviceSnapshotCopy}</p>
          </div>
          <Database size={18} className="text-hub-600" />
        </div>
        <div className="grid grid-cols-4 gap-0 divide-x divide-line/80 p-0 max-xl:grid-cols-2 max-md:grid-cols-1 max-md:divide-x-0 max-md:divide-y">
          <InfoBlock label={i18n.common.host} value={state?.service.host ?? "-"} />
          <InfoBlock label={i18n.common.port} value={String(state?.service.port ?? "-")} />
          <InfoBlock label={i18n.common.logRetention} value={String(state?.service.logRetention ?? "-")} />
          <InfoBlock label={i18n.common.dataFile} value={state?.service.dataFilePath ?? "-"} mono />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint
}: {
  icon: typeof Server;
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <article className="metric-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-black text-muted">{label}</span>
        <span className="grid size-8 place-items-center rounded-control bg-hub-50 text-hub-700">
          <Icon size={17} />
        </span>
      </div>
      <strong className="font-display text-3xl font-black leading-none text-ink">{value}</strong>
      <small className="text-xs text-muted/80">{hint}</small>
    </article>
  );
}

function InfoBlock({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-2 rounded-control bg-white/50 p-4">
      <span className="text-xs font-black text-muted">{label}</span>
      <strong className={["break-words text-sm text-ink", mono ? "font-mono" : ""].join(" ")}>{value}</strong>
    </div>
  );
}
