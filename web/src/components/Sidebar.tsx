import {
  Activity,
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
    <aside className="sticky top-0 flex h-screen flex-col gap-6 border-r border-white/10 bg-hub-900 px-5 py-5 text-white max-lg:static max-lg:h-auto">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-control bg-[#e9fff7] text-hub-600">
          <ShieldCheck size={20} strokeWidth={2.4} />
        </div>
        <div>
          <h1 className="m-0 text-[17px] font-black leading-tight">Local AI Hub</h1>
          <p className="m-0 mt-1 text-xs text-[#9bb0a8]">{i18n.sidebar.subtitle}</p>
        </div>
      </div>

      <div className="grid gap-3 rounded-control border border-white/10 bg-white/[0.06] p-4">
        <div className="flex items-center justify-between gap-3 text-xs text-[#9bb0a8]">
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-hub-100 shadow-[0_0_0_5px_rgba(213,240,230,0.12)]" />
            {i18n.common.service}
          </span>
          <strong className="text-white">{state ? i18n.common.online : i18n.common.loading}</strong>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-[#9bb0a8]">
          <span>{i18n.sidebar.enabledKeys}</span>
          <strong className="text-white">{state?.counts.enabledClientKeys ?? 0}</strong>
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
                "flex min-h-11 items-center gap-3 rounded-control px-3 text-left text-sm font-extrabold transition max-lg:min-w-max",
                active
                  ? "bg-white/[0.13] text-white shadow-[inset_3px_0_0_#7ce0be]"
                  : "text-[#9bb0a8] hover:bg-white/[0.08] hover:text-white"
              ].join(" ")}
            >
              <Icon size={18} strokeWidth={2.2} />
              {i18n.tabs[tab.id]}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto grid gap-2 text-xs leading-6 text-[#9bb0a8] max-lg:hidden">
        <div className="flex items-center gap-2">
          <Gauge size={15} />
          {i18n.sidebar.controlPlane}
        </div>
        <p className="m-0">{i18n.sidebar.boundary}</p>
      </div>
    </aside>
  );
}
