import { RefreshCw } from "lucide-react";
import type { Messages } from "../i18n";
import type { AdminState } from "../types";
import { LogList } from "./shared";

export function ActivityPage({ state, i18n, onRefresh }: { state: AdminState | null; i18n: Messages; onRefresh: () => void }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3 className="panel-title">{i18n.activity.title}</h3>
          <p className="panel-copy">{i18n.activity.copy}</p>
        </div>
        <button className="button button-secondary button-small" type="button" onClick={onRefresh}>
          <RefreshCw size={14} />
          {i18n.common.refresh}
        </button>
      </div>
      <div className="p-5">
        <LogList logs={state?.logs ?? []} i18n={i18n} />
      </div>
    </section>
  );
}
