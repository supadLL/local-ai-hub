import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { AccountImport } from "./components/AccountImport";
import { ActivityPage } from "./components/ActivityPage";
import { Feedback } from "./components/Feedback";
import { LocalKeys } from "./components/LocalKeys";
import { Overview } from "./components/Overview";
import { SettingsPage } from "./components/SettingsPage";
import { Shell } from "./components/Shell";
import { UsageStats } from "./components/UsageStats";
import { dictionaries, languageStorageKey, type Language } from "./i18n";
import type {
  AdminState,
  CCSwitchImportPayload,
  ClientKey,
  ClientKeyCreateInput,
  TabId,
  UpstreamCreateInput,
  UpstreamHealthCheckResponse,
  UpstreamProbeResult
} from "./types";

const visibleTabIds: TabId[] = ["overview", "import", "keys", "usage", "activity", "settings"];

function readTabFromHash(): TabId {
  const value = window.location.hash.replace("#", "");
  return visibleTabIds.includes(value as TabId) ? (value as TabId) : "overview";
}

function readLanguage(): Language {
  return localStorage.getItem(languageStorageKey) === "zh" ? "zh" : "en";
}

export function App() {
  const [activeTab, setActiveTabState] = useState<TabId>(() => readTabFromHash());
  const [language, setLanguage] = useState<Language>(() => readLanguage());
  const [adminState, setAdminState] = useState<AdminState | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const i18n = dictionaries[language];

  useEffect(() => {
    const onHashChange = () => setActiveTabState(readTabFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth-callback-success") {
        showFeedback(i18n.importPage.oauthImported);
        refreshState().catch((error) => showFeedback(error.message, true));
      }
      if (event.data?.type === "oauth-callback-error") {
        showFeedback(event.data.error || "OAuth callback failed.", true);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [i18n]);

  useEffect(() => {
    refreshState().catch((error) => {
      showFeedback(error instanceof Error ? error.message : i18n.feedback.refreshFailed, true);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) {
        window.clearTimeout(feedbackTimer.current);
      }
    };
  }, []);

  function setActiveTab(tab: TabId) {
    const nextTab = visibleTabIds.includes(tab) ? tab : "overview";
    setActiveTabState(nextTab);
    window.location.hash = nextTab === "overview" ? "" : nextTab;
  }

  function showFeedback(message: string, isError = false) {
    setFeedback({ message, isError });
    if (feedbackTimer.current) {
      window.clearTimeout(feedbackTimer.current);
    }
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 5200);
  }

  function toggleLanguage() {
    setLanguage((current) => {
      const next = current === "en" ? "zh" : "en";
      localStorage.setItem(languageStorageKey, next);
      return next;
    });
  }

  async function refreshState() {
    const next = await api.state();
    setAdminState(next);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      api
        .state()
        .then(setAdminState)
        .catch(() => undefined);
    }, 3500);
    return () => window.clearInterval(timer);
  }, []);

  async function createUpstream(payload: UpstreamCreateInput) {
    await api.createUpstream(payload);
    showFeedback(i18n.importPage.created(payload.name));
    await refreshState();
  }

  async function importUpstreams(items: UpstreamCreateInput[]) {
    const result = await api.importUpstreams(items);
    showFeedback(i18n.importPage.imported(result.imported.length));
    await refreshState();
  }

  async function testDraftUpstream(item: UpstreamCreateInput): Promise<UpstreamProbeResult> {
    const result = await api.testDraftUpstream(item);
    await refreshState();
    return result;
  }

  async function testSavedUpstream(id: string): Promise<UpstreamProbeResult> {
    const result = await api.testUpstream(id);
    await refreshState();
    return result;
  }

  async function healthCheckUpstreams(ids?: string[]): Promise<UpstreamHealthCheckResponse> {
    const result = await api.healthCheckUpstreams(ids);
    await refreshState();
    return result;
  }

  async function refreshUpstreamQuota(id: string) {
    await api.refreshUpstreamQuota(id);
    await refreshState();
  }

  async function deleteUpstream(id: string, name: string) {
    await api.deleteUpstream(id);
    showFeedback(i18n.importPage.deleted(name));
    await refreshState();
  }

  async function startOpenAIOAuthLogin() {
    const result = await api.startOpenAIOAuthLogin();
    window.open(result.authUrl, "local_ai_hub_openai_oauth", "width=620,height=760,scrollbars=yes");
    showFeedback(i18n.importPage.oauthStarted);

    const startedAtCount = adminState?.counts.upstreams ?? 0;
    const deadline = Date.now() + 5 * 60 * 1000;
    const timer = window.setInterval(() => {
      api
        .state()
        .then((next) => {
          setAdminState(next);
          if (next.counts.upstreams > startedAtCount || Date.now() > deadline) {
            window.clearInterval(timer);
          }
        })
        .catch(() => {
          if (Date.now() > deadline) {
            window.clearInterval(timer);
          }
        });
    }, 2500);
  }

  async function relayOpenAIOAuthCallback(callbackUrl: string) {
    await api.relayOpenAIOAuthCallback(callbackUrl.trim());
    showFeedback(i18n.importPage.oauthImported);
    await refreshState();
  }

  async function createClientKey(payload: ClientKeyCreateInput): Promise<{ clientKey: ClientKey }> {
    const result = await api.createClientKey(payload);
    await refreshState();
    return result;
  }

  async function toggleClientKey(id: string, enabled: boolean) {
    await api.updateClientKey(id, { enabled });
    showFeedback(i18n.keys.toggled(enabled));
    await refreshState();
  }

  async function openCCSwitchImport(id: string, payload: CCSwitchImportPayload) {
    const result = await api.openCCSwitchImport(id, payload);
    openExternalProtocol(result.importUrl);
    showFeedback(i18n.keys.ccImportOpened);
    await refreshState();
  }

  async function deleteClientKey(id: string) {
    await api.deleteClientKey(id);
    showFeedback(i18n.keys.deleted);
    await refreshState();
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    showFeedback(i18n.common.copied);
  }

  return (
    <>
      <Shell
        activeTab={activeTab}
        state={adminState}
        language={language}
        i18n={i18n}
        onToggleLanguage={toggleLanguage}
        onTabChange={setActiveTab}
      >
        {activeTab === "overview" ? (
          <Overview
            state={adminState}
            i18n={i18n}
            onOpenActivity={() => setActiveTab("activity")}
            onCopy={(text) => copyText(text).catch((error) => showFeedback(error.message, true))}
          />
        ) : null}

        {activeTab === "import" ? (
          <AccountImport
            state={adminState}
            i18n={i18n}
            onCreate={createUpstream}
            onImport={importUpstreams}
            onTestDraft={testDraftUpstream}
            onTestSaved={testSavedUpstream}
            onHealthCheck={healthCheckUpstreams}
            onDeleteSaved={deleteUpstream}
            onRefreshQuota={refreshUpstreamQuota}
            onRefreshState={refreshState}
            onOAuthLogin={startOpenAIOAuthLogin}
            onOAuthRelay={relayOpenAIOAuthCallback}
            onFeedback={showFeedback}
          />
        ) : null}

        {activeTab === "keys" ? (
          <LocalKeys
            state={adminState}
            i18n={i18n}
            onCreate={createClientKey}
            onToggle={toggleClientKey}
            onDelete={deleteClientKey}
            onOpenCCSwitch={openCCSwitchImport}
            onFeedback={showFeedback}
          />
        ) : null}

        {activeTab === "usage" ? <UsageStats state={adminState} i18n={i18n} /> : null}

        {activeTab === "activity" ? (
          <ActivityPage
            state={adminState}
            i18n={i18n}
            onRefresh={() => refreshState().catch((error) => showFeedback(error.message, true))}
          />
        ) : null}

        {activeTab === "settings" ? <SettingsPage state={adminState} i18n={i18n} /> : null}
      </Shell>

      <Feedback message={feedback?.message ?? null} isError={feedback?.isError ?? false} />
    </>
  );
}

function openExternalProtocol(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
