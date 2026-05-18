import {
  Braces,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  FlaskConical,
  KeyRound,
  LogIn,
  LockKeyhole,
  Upload
} from "lucide-react";
import { useState } from "react";
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
    } finally {
      setOauthBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(390px,0.78fr)] gap-5 max-xl:grid-cols-1">
      <div className="grid gap-5">
        <section className="panel overflow-hidden">
          <div className="relative overflow-hidden border-b border-slate-200 bg-[#101816] px-5 py-5 text-white">
            <div className="absolute -right-10 top-0 h-32 w-32 rounded-full bg-hub-500/25 blur-2xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-extrabold">
                  <LogIn size={14} />
                  {i18n.importPage.openaiLoginTitle}
                </div>
                <h3 className="m-0 text-lg font-black">{i18n.importPage.openaiLoginTitle}</h3>
                <p className="m-0 mt-1 max-w-xl text-sm text-white/75">{i18n.importPage.openaiLoginCopy}</p>
              </div>
              <ExternalLink className="shrink-0 text-white/70" size={24} />
            </div>
          </div>

          <div className="grid gap-4 p-5">
            <button
              className="button w-fit disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={oauthBusy !== null}
              onClick={() => handleOAuthLogin().catch((error) => onFeedback(error.message, true))}
            >
              <LogIn size={16} />
              {oauthBusy === "login" ? i18n.importPage.openaiLoginStarting : i18n.importPage.openaiLoginButton}
            </button>

            <div className="rounded-control border border-slate-200 bg-slate-50 p-3">
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
        </section>

        <section className="panel overflow-hidden">
          <div className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-hub-900 via-hub-600 to-[#d7a64a] px-5 py-5 text-white">
            <div className="absolute -right-8 -top-12 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-extrabold">
                  <LockKeyhole size={14} />
                  {i18n.importPage.credentialBadge}
                </div>
                <h3 className="m-0 text-lg font-black">{i18n.importPage.credentialTitle}</h3>
                <p className="m-0 mt-1 max-w-xl text-sm text-white/80">{i18n.importPage.credentialCopy}</p>
              </div>
              <KeyRound className="shrink-0 text-white/80" size={26} />
            </div>
          </div>

          <div className="grid gap-4 p-5">
            <div className="rounded-control border border-hub-100 bg-hub-50/80 p-3 text-xs leading-5 text-hub-900">
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
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-slate-100 hover:text-ink"
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

            <label className="flex items-center gap-2 text-sm font-extrabold text-ink">
              <input
                className="h-4 w-4 accent-hub-500"
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
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">{i18n.importPage.jsonTitle}</h3>
              <p className="panel-copy">{i18n.importPage.jsonCopy}</p>
            </div>
            <Braces className="text-hub-500" size={18} />
          </div>
          <div className="grid gap-3 p-5">
            <textarea
              className="input min-h-[260px] font-mono text-xs leading-6"
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
        </section>
      </div>

      <aside className="grid content-start gap-5">
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

        <section className="panel p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-control bg-hub-50 text-hub-600">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h3 className="m-0 text-sm font-black text-ink">{i18n.importPage.statusTitle}</h3>
              <p className="m-0 mt-1 text-xs text-muted">{i18n.importPage.statusCopy}</p>
            </div>
          </div>
          <div className="mb-5 grid gap-3">
            <StatusNumber label={i18n.importPage.importedCount} value={state?.counts.upstreams ?? 0} />
            <StatusNumber label={i18n.importPage.enabledCount} value={state?.counts.enabledUpstreams ?? 0} />
          </div>
          <h3 className="m-0 text-sm font-black text-ink">{i18n.importPage.loginNoteTitle}</h3>
          <p className="m-0 mt-2 text-sm leading-6 text-muted">{i18n.importPage.loginNoteCopy}</p>
        </section>
      </aside>
    </div>
  );
}

function StatusNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-control border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-xs font-extrabold text-muted">{label}</span>
      <strong className="text-lg font-black text-ink">{value}</strong>
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
