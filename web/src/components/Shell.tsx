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
    <div className="grid min-h-screen grid-cols-[268px_minmax(0,1fr)] max-lg:grid-cols-1">
      <Sidebar activeTab={activeTab} state={state} i18n={i18n} onTabChange={onTabChange} />
      <main className="min-w-0 px-8 py-6 max-md:px-5">
        <TopBar
          activeTab={activeTab}
          language={language}
          i18n={i18n}
          onToggleLanguage={onToggleLanguage}
        />
        {children}
      </main>
    </div>
  );
}
