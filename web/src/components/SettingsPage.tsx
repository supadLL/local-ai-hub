import { HardDrive, ShieldCheck } from "lucide-react";
import type { Messages } from "../i18n";
import type { AdminState } from "../types";

export function SettingsPage({ state, i18n }: { state: AdminState | null; i18n: Messages }) {
  return (
    <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
      <section className="panel overflow-hidden">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">{i18n.common.service}</h3>
            <p className="panel-copy">{i18n.settings.serviceCopy}</p>
          </div>
          <div className="grid size-10 place-items-center rounded-control bg-hub-50 text-hub-700">
            <HardDrive size={18} />
          </div>
        </div>
        <div className="grid gap-0 divide-y divide-line/80 p-5">
          <InfoLine label={i18n.common.host} value={state?.service.host ?? "-"} />
          <InfoLine label={i18n.common.port} value={String(state?.service.port ?? "-")} />
          <InfoLine label={i18n.common.dataFile} value={state?.service.dataFilePath ?? "-"} mono />
          <InfoLine label={i18n.common.logRetention} value={String(state?.service.logRetention ?? "-")} />
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">{i18n.settings.runtimeMode}</h3>
            <p className="panel-copy">{i18n.settings.runtimeModeCopy}</p>
          </div>
          <div className="grid size-10 place-items-center rounded-control bg-hub-50 text-hub-700">
            <ShieldCheck size={18} />
          </div>
        </div>
        <div className="grid gap-0 divide-y divide-line/80 p-5">
          <InfoLine label={i18n.common.boundary} value={i18n.common.localIntranetMvp} />
          <InfoLine label={i18n.common.storage} value={i18n.settings.jsonFile} />
          <InfoLine label={i18n.common.providerSupport} value={i18n.settings.openaiCompatible} />
          <InfoLine label={i18n.settings.upstreamManagement} value={i18n.settings.backendOnly} />
        </div>
      </section>
    </div>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-5 py-3 first:pt-0 last:pb-0 max-md:grid">
      <span className="text-sm font-bold text-muted">{label}</span>
      <strong className={["break-words text-right text-sm text-ink max-md:text-left", mono ? "font-mono" : ""].join(" ")}>
        {value}
      </strong>
    </div>
  );
}
