import {
  Activity,
  BarChart3,
  DownloadCloud,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Settings,
  ShieldCheck
} from "lucide-react";
import type { Messages } from "../i18n";
import type { AdminState, TabId } from "../types";

const tabs: Array<{ id: TabId; icon: typeof LayoutDashboard }> = [
  { id: "overview", icon: LayoutDashboard },
  { id: "import", icon: DownloadCloud },
  { id: "keys", icon: KeyRound },
  { id: "usage", icon: BarChart3 },
  { id: "activity", icon: Activity },
  { id: "settings", icon: Settings }
];

interface SidebarProps {
  activeTab: TabId;
  state: AdminState | null;
  i18n: Messages;
  onTabChange: (tab: TabId) => void;
}

export function Sidebar({ activeTab, state, i18n, onTabChange }: SidebarProps) {
  return (
    <aside className="sticky top-0 flex h-screen flex-col gap-5 border-r border-line/70 bg-white/75 px-5 py-5 shadow-[8px_0_30px_rgba(28,61,49,0.04)] backdrop-blur-xl max-lg:static max-lg:h-auto max-lg:border-b max-lg:border-r-0">
      <div className="flex items-center gap-3 rounded-control border border-line/80 bg-white/80 p-3 shadow-sm">
        <div className="grid size-10 place-items-center rounded-control bg-hub-50 text-hub-700 shadow-inner">
          <ShieldCheck size={20} strokeWidth={2.4} />
        </div>
        <div>
          <h1 className="m-0 font-display text-[17px] font-black leading-tight text-ink">Local AI Hub</h1>
          <p className="m-0 mt-1 text-xs font-bold text-muted">{i18n.sidebar.subtitle}</p>
        </div>
      </div>

      <div className="grid gap-3 rounded-control border border-hub-100/80 bg-mist/80 p-4">
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-hub-500 shadow-[0_0_0_5px_rgba(49,165,127,0.12)]" />
            {i18n.common.service}
          </span>
          <strong className="text-ink">{state ? i18n.common.online : i18n.common.loading}</strong>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>{i18n.sidebar.enabledKeys}</span>
          <strong className="text-ink">{state?.counts.enabledClientKeys ?? 0}</strong>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#31a57f,#4c8bdc)] transition-all"
            style={{ width: state ? `${Math.min(100, Math.max(12, (state.counts.enabledClientKeys || 0) * 18))}%` : "18%" }}
          />
        </div>
      </div>

      <nav className="grid gap-1.5 max-lg:flex max-lg:overflow-x-auto max-lg:pb-1" aria-label="Console sections">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-selected={active}
              onClick={() => onTabChange(tab.id)}
              className={[
                "flex min-h-11 items-center gap-3 rounded-control border px-3 text-left text-sm font-black transition max-lg:min-w-max",
                active
                  ? "border-hub-100 bg-hub-50 text-hub-700 shadow-sm"
                  : "border-transparent text-muted hover:border-line hover:bg-white/70 hover:text-ink"
              ].join(" ")}
            >
              <Icon size={18} strokeWidth={2.2} />
              {i18n.tabs[tab.id]}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto grid gap-2 rounded-control border border-line/70 bg-white/60 p-3 text-xs leading-6 text-muted max-lg:hidden">
        <div className="flex items-center gap-2">
          <Gauge size={15} />
          {i18n.sidebar.controlPlane}
        </div>
        <p className="m-0">{i18n.sidebar.boundary}</p>
      </div>
    </aside>
  );
}
