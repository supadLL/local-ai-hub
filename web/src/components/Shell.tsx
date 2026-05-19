import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { Language, Messages } from "../i18n";
import type { ReactNode } from "react";
import type { AdminState, TabId } from "../types";

interface ShellProps {
  activeTab: TabId;
  state: AdminState | null;
  language: Language;
  i18n: Messages;
  onToggleLanguage: () => void;
  onTabChange: (tab: TabId) => void;
  children: ReactNode;
}

export function Shell({
  activeTab,
  state,
  language,
  i18n,
  onToggleLanguage,
  onTabChange,
  children
}: ShellProps) {
  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-44 bg-[linear-gradient(135deg,rgba(49,165,127,0.18),rgba(76,139,220,0.08)_48%,transparent_76%)]" />
      <div className="relative grid min-h-screen grid-cols-[286px_minmax(0,1fr)] gap-0 max-lg:grid-cols-1">
        <Sidebar activeTab={activeTab} state={state} i18n={i18n} onTabChange={onTabChange} />
        <main className="min-w-0 px-8 py-6 max-md:px-4">
          <div className="mx-auto grid w-full max-w-[1480px] gap-5">
            <TopBar
              activeTab={activeTab}
              language={language}
              i18n={i18n}
              onToggleLanguage={onToggleLanguage}
            />
            <div className="animate-[fadeIn_360ms_ease-out]">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
