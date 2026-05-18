import type { AuditLogEntry } from "../types";
import type { Messages } from "../i18n";

export function StatusChip({ enabled, i18n }: { enabled: boolean; i18n: Messages }) {
  return (
    <span className={`chip ${enabled ? "chip-success" : "chip-warn"}`}>
      {enabled ? i18n.common.enabled : i18n.common.disabled}
    </span>
  );
}

export function ModelChips({ values, i18n }: { values: string[]; i18n: Messages }) {
  if (values.length === 0) {
    return <span className="chip">{i18n.common.noModels}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span key={value} className="chip chip-info">
          {value}
        </span>
      ))}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-44 place-items-center p-6 text-center">
      <div>
        <strong className="block text-sm font-black text-ink">{title}</strong>
        <span className="mt-2 block text-sm text-muted">{body}</span>
      </div>
    </div>
  );
}

export function LogList({
  logs,
  i18n,
  compact = false
}: {
  logs: AuditLogEntry[];
  i18n: Messages;
  compact?: boolean;
}) {
  const visible = [...logs].reverse();

  if (visible.length === 0) {
    return <EmptyState title={i18n.logs.emptyTitle} body={i18n.logs.emptyBody} />;
  }

  return (
    <div className="grid">
      {visible.map((item) => (
        <article key={item.id} className="grid gap-2 border-b border-slate-200 py-3 last:border-b-0">
          <div className="flex items-start justify-between gap-3">
            <strong className="text-sm font-extrabold text-ink">{item.message}</strong>
            {item.statusCode ? (
              <span className={`chip ${item.statusCode < 400 ? "chip-success" : "chip-warn"}`}>
                {item.statusCode}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>{new Date(item.timestamp).toLocaleString()}</span>
            {item.model ? <span>{i18n.logs.model} {item.model}</span> : null}
            {item.clientKeyName ? <span>{i18n.logs.client} {item.clientKeyName}</span> : null}
            {item.upstreamName ? <span>{i18n.logs.upstream} {item.upstreamName}</span> : null}
            {item.usageUnits !== undefined ? <span>{i18n.logs.usage} {item.usageUnits}</span> : null}
            {!compact && item.requestId ? <span className="font-mono">{i18n.logs.request} {item.requestId}</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
