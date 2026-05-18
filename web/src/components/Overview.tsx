import { ArrowRight, Copy, Database, KeyRound, Server, ScrollText } from "lucide-react";
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

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <StatCard
          icon={Server}
          label={i18n.common.service}
          value={state ? i18n.common.online : i18n.common.loading}
          hint={i18n.common.localIntranetMvp}
        />
        <StatCard
          icon={KeyRound}
          label={i18n.sidebar.enabledKeys}
          value={state?.counts.enabledClientKeys ?? 0}
          hint={`${state?.counts.clientKeys ?? 0} ${i18n.overview.totalIssued}`}
        />
        <StatCard icon={ScrollText} label={i18n.overview.recentLogs} value={logs.length} hint={i18n.overview.latest60} />
      </div>

      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] gap-5 max-xl:grid-cols-1">
        <section className="panel">
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
            <pre className="m-0 overflow-auto rounded-control border border-slate-800 bg-[#111815] p-4 font-mono text-xs leading-6 text-[#d9f3e9]">
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
          <Database size={18} className="text-hub-500" />
        </div>
        <div className="grid grid-cols-4 gap-0 divide-x divide-slate-200 p-0 max-xl:grid-cols-2 max-md:grid-cols-1 max-md:divide-x-0 max-md:divide-y">
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
    <article className="grid min-h-28 content-between rounded-control border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-extrabold text-muted">{label}</span>
        <Icon size={17} className="text-hub-500" />
      </div>
      <strong className="text-3xl font-black leading-none text-ink">{value}</strong>
      <small className="text-xs text-slate-400">{hint}</small>
    </article>
  );
}

function InfoBlock({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-2 p-4">
      <span className="text-xs font-extrabold text-muted">{label}</span>
      <strong className={["break-words text-sm text-ink", mono ? "font-mono" : ""].join(" ")}>{value}</strong>
    </div>
  );
}
