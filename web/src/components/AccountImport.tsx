import {
  Braces,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  LogIn,
  LockKeyhole,
  Upload,
  X,
  type LucideIcon
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Messages } from "../i18n";
import { buildModelOptions, defaultGatewayModels, defaultGatewayModelText } from "../model-catalog";
import type {
  AdminState,
  UpstreamCreateInput,
  UpstreamHealthCheckResponse,
  UpstreamProbeResult
} from "../types";
import { AccountStatusPanel } from "./AccountStatusPanel";

const defaultBatchJson = JSON.stringify(
  [
    {
      name: "OpenAI Main",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-your-own-upstream-key",
      models: defaultGatewayModels,
      enabled: true,
      weight: 1,
      headers: {},
      note: "primary route"
    }
  ],
  null,
  2
);

const defaultForm = {
  name: "OpenAI Main",
  baseUrl: "https://api.openai.com",
  apiKey: "",
  models: defaultGatewayModelText,
  enabled: true,
  weight: "1",
  headers: "{}",
  note: "primary route"
};

type CredentialForm = typeof defaultForm;
type BusyState = "test" | "save" | "batch-test" | "batch-import" | null;
type ImportDialog = "oauth" | "credential" | "batch" | null;

interface AccountImportProps {
  state: AdminState | null;
  i18n: Messages;
  onCreate: (item: UpstreamCreateInput) => Promise<void>;
  onImport: (items: UpstreamCreateInput[]) => Promise<void>;
  onTestDraft: (item: UpstreamCreateInput) => Promise<UpstreamProbeResult>;
  onTestSaved: (id: string) => Promise<UpstreamProbeResult>;
  onHealthCheck: (ids?: string[]) => Promise<UpstreamHealthCheckResponse>;
  onDeleteSaved: (id: string, name: string) => Promise<void>;
  onRefreshQuota: (id: string) => Promise<void>;
  onRefreshState: () => Promise<void>;
  onOAuthLogin: () => Promise<void>;
  onOAuthRelay: (callbackUrl: string) => Promise<void>;
  onFeedback: (message: string, isError?: boolean) => void;
}

export function AccountImport({
  state,
  i18n,
  onCreate,
  onImport,
  onTestDraft,
  onTestSaved,
  onHealthCheck,
  onDeleteSaved,
  onRefreshQuota,
  onRefreshState,
  onOAuthLogin,
  onOAuthRelay,
  onFeedback
}: AccountImportProps) {
  const [form, setForm] = useState<CredentialForm>(defaultForm);
  const [batchJson, setBatchJson] = useState(defaultBatchJson);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState<BusyState>(null);
  const [oauthBusy, setOauthBusy] = useState<"login" | "relay" | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [dialog, setDialog] = useState<ImportDialog>(null);
  const modelOptions = buildModelOptions(collectKnownModels(state));

  function updateField<K extends keyof CredentialForm>(name: K, value: CredentialForm[K]) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function buildPayload(): UpstreamCreateInput {
    const models = parseModels(form.models);
    if (!form.apiKey.trim()) {
      throw new Error(i18n.importPage.apiKeyRequired);
    }
    if (!models.length) {
      throw new Error(i18n.importPage.modelsRequired);
    }

    return {
      name: form.name.trim() || i18n.importPage.defaultAccountName,
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim(),
      models,
      enabled: form.enabled,
      weight: Number(form.weight.trim() || 1),
      headers: parseHeaders(form.headers, i18n),
      note: form.note.trim()
    };
  }

  function parseBatch(): UpstreamCreateInput[] {
    const payload = JSON.parse(batchJson) as UpstreamCreateInput[];
    if (!Array.isArray(payload) || payload.length === 0) {
      throw new Error(i18n.importPage.batchMustBeArray);
    }
    return payload;
  }

  async function handleTestCredential() {
    setBusy("test");
    try {
      const payload = buildPayload();
      const result = await onTestDraft(payload);
      showProbeResult(payload.name, result, i18n, onFeedback);
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveCredential() {
    setBusy("save");
    try {
      const payload = buildPayload();
      await onCreate(payload);
      setForm((current) => ({ ...current, apiKey: "" }));
      setDialog(null);
    } finally {
      setBusy(null);
    }
  }

  async function handleTestBatch() {
    setBusy("batch-test");
    try {
      const [first] = parseBatch();
      const result = await onTestDraft(first);
      showProbeResult(first.name, result, i18n, onFeedback);
    } finally {
      setBusy(null);
    }
  }

  async function handleImportBatch() {
    setBusy("batch-import");
    try {
      await onImport(parseBatch());
      setDialog(null);
    } finally {
      setBusy(null);
    }
  }

  async function handleOAuthLogin() {
    setOauthBusy("login");
    try {
      await onOAuthLogin();
    } finally {
      setOauthBusy(null);
    }
  }

  async function handleOAuthRelay() {
    setOauthBusy("relay");
    try {
      await onOAuthRelay(callbackUrl);
      setCallbackUrl("");
      setDialog(null);
    } finally {
      setOauthBusy(null);
    }
  }

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_330px] gap-5 max-xl:grid-cols-1">
        <main className="grid gap-5">
          <AccountStatusPanel
            state={state}
            i18n={i18n}
            onRefresh={onRefreshState}
            onHealthCheck={onHealthCheck}
            onTestSaved={onTestSaved}
            onDeleteSaved={onDeleteSaved}
            onRefreshQuota={onRefreshQuota}
            onFeedback={onFeedback}
          />
        </main>

        <aside className="grid content-start gap-5">
          <section className="panel overflow-hidden">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">{i18n.importPage.statusTitle}</h3>
                <p className="panel-copy">{i18n.importPage.statusCopy}</p>
              </div>
              <div className="grid size-10 place-items-center rounded-control bg-hub-50 text-hub-700">
                <CheckCircle2 size={20} />
              </div>
            </div>
            <div className="grid gap-3 p-5">
              <ImportButton
                icon={LogIn}
                title={i18n.importPage.openaiLoginTitle}
                description={i18n.importPage.openaiLoginCopy}
                onClick={() => setDialog("oauth")}
              />
              <ImportButton
                icon={KeyRound}
                title={i18n.importPage.credentialTitle}
                description={i18n.importPage.credentialCopy}
                onClick={() => setDialog("credential")}
              />
              <ImportButton
                icon={Braces}
                title={i18n.importPage.jsonTitle}
                description={i18n.importPage.jsonCopy}
                onClick={() => setDialog("batch")}
              />
            </div>
          </section>

          <section className="surface-tint p-5">
            <div className="mb-5 grid gap-3">
              <StatusNumber label={i18n.importPage.importedCount} value={state?.counts.upstreams ?? 0} />
              <StatusNumber label={i18n.importPage.enabledCount} value={state?.counts.enabledUpstreams ?? 0} />
            </div>
            <h3 className="m-0 text-sm font-black text-ink">{i18n.importPage.loginNoteTitle}</h3>
            <p className="m-0 mt-2 text-sm leading-6 text-muted">{i18n.importPage.loginNoteCopy}</p>
          </section>
        </aside>
      </div>

      {dialog === "oauth" ? (
        <ImportModal title={i18n.importPage.openaiLoginTitle} icon={LogIn} onClose={() => setDialog(null)}>
          <div className="grid gap-4">
            <p className="m-0 text-sm leading-6 text-muted">{i18n.importPage.openaiLoginCopy}</p>
            <button
              className="button w-fit disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={oauthBusy !== null}
              onClick={() => handleOAuthLogin().catch((error) => onFeedback(error.message, true))}
            >
              <LogIn size={16} />
              {oauthBusy === "login" ? i18n.importPage.openaiLoginStarting : i18n.importPage.openaiLoginButton}
            </button>

            <div className="surface-tint p-3">
              <h4 className="m-0 text-xs font-black text-ink">{i18n.importPage.openaiLoginRelayTitle}</h4>
              <p className="m-0 mt-1 text-xs leading-5 text-muted">{i18n.importPage.openaiLoginRelayCopy}</p>
              <div className="mt-3 flex gap-2 max-md:grid">
                <input
                  className="input font-mono text-xs"
                  value={callbackUrl}
                  onChange={(event) => setCallbackUrl(event.target.value)}
                  placeholder="http://localhost:1455/auth/callback?code=..."
                  spellCheck={false}
                />
                <button
                  className="button button-secondary shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  disabled={oauthBusy !== null || !callbackUrl.trim()}
                  onClick={() => handleOAuthRelay().catch((error) => onFeedback(error.message, true))}
                >
                  {oauthBusy === "relay" ? i18n.common.loading : i18n.importPage.submitCallback}
                </button>
              </div>
            </div>
          </div>
        </ImportModal>
      ) : null}

      {dialog === "credential" ? (
        <ImportModal title={i18n.importPage.credentialTitle} icon={LockKeyhole} onClose={() => setDialog(null)} wide>
          <div className="grid gap-4">
            <div className="surface-tint p-3 text-xs leading-5 text-hub-900">
              <strong className="mb-1 block">{i18n.importPage.selfUseHint}</strong>
              <span className="text-muted">{i18n.importPage.visibilityHint}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <label className="field">
                <span className="field-label">{i18n.common.name}</span>
                <input className="input" value={form.name} onChange={(event) => updateField("name", event.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">{i18n.importPage.baseUrl}</span>
                <input
                  className="input"
                  value={form.baseUrl}
                  onChange={(event) => updateField("baseUrl", event.target.value)}
                  placeholder="https://api.openai.com"
                />
              </label>
              <label className="field">
                <span className="field-label">{i18n.importPage.apiKey}</span>
                <div className="relative">
                  <input
                    className="input pr-11"
                    value={form.apiKey}
                    onChange={(event) => updateField("apiKey", event.target.value)}
                    type={showSecret ? "text" : "password"}
                    placeholder={i18n.importPage.apiKeyPlaceholder}
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <button
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-control text-muted transition hover:bg-hub-50 hover:text-hub-700"
                    type="button"
                    onClick={() => setShowSecret((value) => !value)}
                    aria-label={showSecret ? i18n.importPage.hideSecret : i18n.importPage.showSecret}
                  >
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <label className="field">
                <span className="field-label">{i18n.common.models}</span>
                <input
                  className="input"
                  list="upstream-model-catalog"
                  value={form.models}
                  onChange={(event) => updateField("models", event.target.value)}
                  placeholder={defaultGatewayModelText}
                />
              </label>
              <label className="field">
                <span className="field-label">{i18n.common.weight}</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={10}
                  value={form.weight}
                  onChange={(event) => updateField("weight", event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">{i18n.importPage.note}</span>
                <input className="input" value={form.note} onChange={(event) => updateField("note", event.target.value)} />
              </label>
            </div>

            <label className="field">
              <span className="field-label">{i18n.importPage.headersJson}</span>
              <textarea
                className="input min-h-20 font-mono text-xs leading-5"
                value={form.headers}
                onChange={(event) => updateField("headers", event.target.value)}
                spellCheck={false}
              />
            </label>
            <datalist id="upstream-model-catalog">
              {modelOptions.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>

            <label className="flex items-center gap-2 text-sm font-black text-ink">
              <input
                className="h-4 w-4 accent-hub-600"
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => updateField("enabled", event.target.checked)}
              />
              {i18n.importPage.enableAfterImport}
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                className="button disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={busy !== null}
                onClick={() => handleSaveCredential().catch((error) => onFeedback(error.message, true))}
              >
                <Upload size={16} />
                {i18n.importPage.saveCredential}
              </button>
              <button
                className="button button-secondary disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={busy !== null}
                onClick={() => handleTestCredential().catch((error) => onFeedback(error.message, true))}
              >
                <FlaskConical size={16} />
                {i18n.importPage.testConnection}
              </button>
            </div>
          </div>
        </ImportModal>
      ) : null}

      {dialog === "batch" ? (
        <ImportModal title={i18n.importPage.jsonTitle} icon={Braces} onClose={() => setDialog(null)} wide>
          <div className="grid gap-3">
            <p className="m-0 text-sm leading-6 text-muted">{i18n.importPage.jsonCopy}</p>
            <textarea
              className="input min-h-[320px] bg-[#fbfffd] font-mono text-xs leading-6"
              value={batchJson}
              onChange={(event) => setBatchJson(event.target.value)}
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <button
                className="button disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={busy !== null}
                onClick={() => handleImportBatch().catch((error) => onFeedback(error.message, true))}
              >
                <Upload size={16} />
                {i18n.importPage.importJson}
              </button>
              <button
                className="button button-secondary disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={busy !== null}
                onClick={() => handleTestBatch().catch((error) => onFeedback(error.message, true))}
              >
                <FlaskConical size={16} />
                {i18n.importPage.testFirstJson}
              </button>
            </div>
          </div>
        </ImportModal>
      ) : null}
    </>
  );
}

function ImportButton({
  icon: Icon,
  title,
  description,
  onClick
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      className="group grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-control border border-line/80 bg-white/90 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-hub-100 hover:bg-hub-50 hover:shadow-panel"
      type="button"
      onClick={onClick}
    >
      <span className="grid size-10 place-items-center rounded-control bg-hub-50 text-hub-700 transition group-hover:bg-white">
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-black text-ink">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-muted">{description}</span>
      </span>
      <ExternalLink size={16} className="text-muted transition group-hover:text-hub-700" />
    </button>
  );
}

function ImportModal({
  title,
  icon: Icon,
  children,
  onClose,
  wide = false
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4 py-6 backdrop-blur-sm">
      <section
        className={[
          "max-h-[86vh] w-full overflow-hidden rounded-control border border-line/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]",
          wide ? "max-w-[760px]" : "max-w-[560px]"
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line/80 bg-mist/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-control bg-white text-hub-700 shadow-sm">
              <Icon size={18} />
            </div>
            <h3 className="m-0 font-display text-lg font-black text-ink">{title}</h3>
          </div>
          <button
            className="grid size-9 shrink-0 place-items-center rounded-control border border-line bg-white text-muted transition hover:border-hub-100 hover:text-ink"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[calc(86vh-74px)] overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );
}

function StatusNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-control border border-line/80 bg-white/75 px-3 py-2">
      <span className="text-xs font-black text-muted">{label}</span>
      <strong className="font-display text-lg font-black text-ink">{value}</strong>
    </div>
  );
}

function parseModels(value: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const item of value.split(/[,\n]/)) {
    const model = item.trim();
    if (!model || seen.has(model)) {
      continue;
    }
    seen.add(model);
    values.push(model);
  }
  return values;
}

function collectKnownModels(state: AdminState | null): string[] {
  const values: string[] = [...(state?.service.availableModels ?? [])];
  for (const upstream of state?.upstreams ?? []) {
    values.push(...(upstream.discoveredModels?.length ? upstream.discoveredModels : upstream.models));
  }
  return values;
}

function parseHeaders(value: string, i18n: Messages): Record<string, string> {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(i18n.importPage.headersInvalid);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(i18n.importPage.headersMustBeObject);
  }

  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, headerValue]) => [key, String(headerValue)])
  );
}

function showProbeResult(
  label: string,
  result: UpstreamProbeResult,
  i18n: Messages,
  onFeedback: (message: string, isError?: boolean) => void
) {
  if (result.ok) {
    const models = result.models?.length ? result.models.join(", ") : i18n.common.noModels;
    onFeedback(i18n.importPage.testPassed(label, result.statusCode, models));
    return;
  }

  onFeedback(i18n.importPage.testFailed(label, result.statusCode, result.error), true);
}
