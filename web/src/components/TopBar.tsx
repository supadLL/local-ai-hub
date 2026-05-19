import { Languages, MonitorDot } from "lucide-react";
import type { Language, Messages } from "../i18n";
import type { TabId } from "../types";

interface TopBarProps {
  activeTab: TabId;
  language: Language;
  i18n: Messages;
  onToggleLanguage: () => void;
}

export function TopBar({
  activeTab,
  language,
  i18n,
  onToggleLanguage
}: TopBarProps) {
  const title = i18n.pages[activeTab];

  return (
    <header className="flex min-h-[76px] items-center justify-between gap-5 rounded-control border border-line/70 bg-white/70 px-5 py-4 shadow-sm backdrop-blur-xl max-md:grid">
      <div>
        <p className="m-0 mb-1 text-[11px] font-black uppercase text-hub-700">Breeze Console</p>
        <h2 className="m-0 font-display text-2xl font-black leading-tight text-ink">{title.title}</h2>
        <p className="m-0 mt-1 max-w-3xl text-sm leading-6 text-muted">{title.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 max-md:justify-start">
        <span className="inline-flex min-h-10 items-center gap-2 rounded-control border border-hub-100 bg-hub-50 px-3 text-sm font-black text-hub-700">
          <MonitorDot size={16} />
          {i18n.common.localIntranetMvp}
        </span>
        <button
          className="button button-secondary"
          type="button"
          onClick={onToggleLanguage}
          title={i18n.language.aria}
          aria-label={i18n.language.aria}
        >
          <Languages size={16} />
          <span className="min-w-5">{language === "zh" ? "EN" : i18n.language.toggle}</span>
        </button>
      </div>
    </header>
  );
}
