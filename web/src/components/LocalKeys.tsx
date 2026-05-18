import {
  Check,
  ChevronDown,
  ExternalLink,
  KeyRound,
  Plus,
  Power,
  Search,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react";
import { useState } from "react";
import type { FocusEvent } from "react";
import type { Messages } from "../i18n";
import {
  buildModelOptions,
  choosePreferredModel,
  defaultLocalKeyModelText,
  defaultRequestModel
} from "../model-catalog";
import type { AdminState, CCSwitchApp, CCSwitchImportPayload, ClientKey, ClientKeyCreateInput } from "../types";
import { EmptyState, ModelChips, StatusChip } from "./shared";

interface LocalKeysProps {
  state: AdminState | null;
  i18n: Messages;
  onCreate: (payload: ClientKeyCreateInput) => Promise<{ clientKey: ClientKey }>;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenCCSwitch: (id: string, payload: CCSwitchImportPayload) => Promise<void>;
  onFeedback: (message: string, isError?: boolean) => void;
}

const ccSwitchApps: Array<{ id: CCSwitchApp; labelKey: "ccCodex" | "ccClaudeCode" | "ccGemini"; defaultName: string }> = [
  { id: "claude", labelKey: "ccClaudeCode", defaultName: "My Claude" },
  { id: "codex", labelKey: "ccCodex", defaultName: "My Codex" },
  { id: "gemini", labelKey: "ccGemini", defaultName: "My Gemini" }
];

type CCSwitchDialogState = {
  app: CCSwitchApp;
  keyId: string;
  keyName: string;
  models: string[];
};

export function LocalKeys({ state, i18n, onCreate, onToggle, onDelete, onOpenCCSwitch, onFeedback }: LocalKeysProps) {
  const [form, setForm] = useState({
    name: "dev-client",
    allowedModels: defaultLocalKeyModelText,
    quotaLimit: "100000",
    requestsPerMinute: "60",
    note: "local development key"
  });
  const [lastCreated, setLastCreated] = useState<{ id: string; name: string; models: string[] } | null>(null);
  const [ccSwitchDialog, setCCSwitchDialog] = useState<CCSwitchDialogState | null>(null);
  const keys = state?.clientKeys ?? [];

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleCreate() {
    const payload: ClientKeyCreateInput = {
      name: form.name,
      allowedModels: form.allowedModels
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      quotaLimit: form.quotaLimit.trim() === "" ? null : Number(form.quotaLimit),
      requestsPerMinute: Number(form.requestsPerMinute),
      enabled: true,
      note: form.note
    };
    const result = await onCreate(payload);
    setLastCreated({
      id: result.clientKey.id,
      name: result.clientKey.name,
      models: result.clientKey.allowedModels
    });
    onFeedback(i18n.keys.created);
  }

  function openCCSwitchDialog(app: CCSwitchApp, keyId: string, models: string[], keyName: string) {
    setCCSwitchDialog({
      app,
      keyId,
      keyName,
      models
    });
  }

  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)] gap-5 max-2xl:grid-cols-1">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">{i18n.keys.createTitle}</h3>
            <p className="panel-copy">{i18n.keys.createCopy}</p>
          </div>
          <KeyRound size={18} className="text-hub-500" />
        </div>
        <div className="grid gap-4 p-5">
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <label className="field">
              <span className="field-label">{i18n.common.name}</span>
              <input className="input" value={form.name} onChange={(event) => updateField("name", event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">{i18n.keys.requestsPerMinute}</span>
              <input
                className="input"
                type="number"
                min={1}
                value={form.requestsPerMinute}
                onChange={(event) => updateField("requestsPerMinute", event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">{i18n.keys.allowedModels}</span>
              <input
                className="input"
                list="local-key-model-catalog"
                value={form.allowedModels}
                onChange={(event) => updateField("allowedModels", event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">{i18n.keys.quotaLimit}</span>
              <input
                className="input"
                type="number"
                min={0}
                value={form.quotaLimit}
                onChange={(event) => updateField("quotaLimit", event.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">{i18n.keys.note}</span>
            <input className="input" value={form.note} onChange={(event) => updateField("note", event.target.value)} />
          </label>
          <button className="button w-fit" type="button" onClick={() => handleCreate().catch((error) => onFeedback(error.message, true))}>
            <Plus size={16} />
            {i18n.keys.createTitle}
          </button>
          <datalist id="local-key-model-catalog">
            {buildModelOptions(collectKnownModels(state)).map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>

          {lastCreated ? (
            <section className="rounded-[20px] border border-hub-100 bg-hub-50/70 p-4">
              <div className="flex items-start justify-between gap-3 max-md:grid">
                <div>
                  <h4 className="m-0 text-sm font-black text-ink">{i18n.keys.ccSwitchTitle}</h4>
                  <p className="m-0 mt-1 text-xs leading-5 text-muted">{i18n.keys.ccSwitchCopy}</p>
                  <p className="m-0 mt-2 text-xs font-extrabold text-hub-600">{i18n.keys.ccNoRawKey}</p>
                </div>
              </div>
              <CCSwitchButtons
                i18n={i18n}
                onImport={(app) => openCCSwitchDialog(app, lastCreated.id, lastCreated.models, lastCreated.name)}
              />
            </section>
          ) : null}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">{i18n.keys.issuedTitle}</h3>
            <p className="panel-copy">{i18n.keys.issuedCopy}</p>
          </div>
        </div>
        {keys.length === 0 ? (
          <EmptyState title={i18n.keys.emptyTitle} body={i18n.keys.emptyBody} />
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-black text-muted">
                  <th className="border-b border-slate-200 px-4 py-3">{i18n.keys.key}</th>
                  <th className="border-b border-slate-200 px-4 py-3">{i18n.keys.scope}</th>
                  <th className="border-b border-slate-200 px-4 py-3">{i18n.keys.usage}</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-right">{i18n.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="border-b border-slate-200 px-4 py-3">
                      <div className="grid gap-1">
                        <strong className="text-sm font-black">{item.name}</strong>
                        <span className="font-mono text-xs text-muted">{item.key}</span>
                        <StatusChip enabled={item.enabled} i18n={i18n} />
                      </div>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <ModelChips values={item.allowedModels} i18n={i18n} />
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <div className="grid gap-1">
                        <strong className="text-sm font-black">
                          {item.usedQuota} / {item.quotaLimit ?? i18n.keys.unlimited}
                        </strong>
                        <span className="text-xs text-muted">
                          {item.requestsPerMinute} RPM{item.note ? ` · ${item.note}` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <CCSwitchButtons
                          compact
                          i18n={i18n}
                          onImport={(app) => openCCSwitchDialog(app, item.id, item.allowedModels, item.name)}
                        />
                        <button
                          className="button button-secondary button-small"
                          type="button"
                          onClick={() => onToggle(item.id, !item.enabled).catch((error) => onFeedback(error.message, true))}
                        >
                          <Power size={14} />
                          {item.enabled ? i18n.common.disable : i18n.common.enable}
                        </button>
                        <button
                          className="button button-danger button-small"
                          type="button"
                          onClick={() => onDelete(item.id).catch((error) => onFeedback(error.message, true))}
                        >
                          <Trash2 size={14} />
                          {i18n.common.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {ccSwitchDialog ? (
        <CCSwitchImportDialog
          dialog={ccSwitchDialog}
          state={state}
          i18n={i18n}
          onClose={() => setCCSwitchDialog(null)}
          onOpen={(id, payload) =>
            onOpenCCSwitch(id, payload)
              .then(() => setCCSwitchDialog(null))
              .catch((error) => onFeedback(error.message, true))
          }
          onFeedback={onFeedback}
        />
      ) : null}
    </div>
  );
}

function CCSwitchImportDialog({
  dialog,
  state,
  i18n,
  onClose,
  onOpen,
  onFeedback
}: {
  dialog: CCSwitchDialogState;
  state: AdminState | null;
  i18n: Messages;
  onClose: () => void;
  onOpen: (id: string, payload: CCSwitchImportPayload) => Promise<void>;
  onFeedback: (message: string, isError?: boolean) => void;
}) {
  const [app, setApp] = useState<CCSwitchApp>(dialog.app);
  const [name, setName] = useState(defaultAppName(dialog.app));
  const [models, setModels] = useState({
    model: choosePreferredModel(dialog.models),
    haikuModel: "",
    sonnetModel: "",
    opusModel: ""
  });
  const modelOptions = buildModelOptions([...dialog.models, ...collectKnownModels(state)]);
  const visibleFields = app === "claude" ? (["model", "haikuModel", "sonnetModel", "opusModel"] as const) : (["model"] as const);

  function updateApp(nextApp: CCSwitchApp) {
    setApp(nextApp);
    setName(defaultAppName(nextApp));
    setModels({
      model: choosePreferredModel(dialog.models),
      haikuModel: "",
      sonnetModel: "",
      opusModel: ""
    });
  }

  function updateModel(field: keyof typeof models, value: string) {
    setModels((current) => ({ ...current, [field]: value }));
  }

  function submit() {
    const primaryModel = models.model.trim() || defaultRequestModel;

    onOpen(dialog.keyId, {
      app,
      name: name.trim() || defaultAppName(app),
      model: primaryModel,
      haikuModel: models.haikuModel.trim() || undefined,
      sonnetModel: models.sonnetModel.trim() || undefined,
      opusModel: models.opusModel.trim() || undefined
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
      <section className="relative w-full max-w-[520px] overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
        <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_20%_0%,rgba(49,151,124,0.18),transparent_42%),radial-gradient(circle_at_90%_10%,rgba(215,166,74,0.18),transparent_38%)]" />
        <div className="relative flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="m-0 text-lg font-black text-ink">{i18n.keys.ccDialogTitle}</h3>
            <p className="m-0 mt-1 text-xs leading-5 text-muted">{i18n.keys.ccDialogHint}</p>
          </div>
          <button
            className="grid size-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-muted transition hover:border-slate-300 hover:text-ink"
            type="button"
            onClick={onClose}
            aria-label={i18n.common.cancel}
          >
            <X size={16} />
          </button>
        </div>

        <div className="relative grid gap-4 px-5 py-5">
          <div className="grid gap-2">
            <span className="field-label">{i18n.keys.ccDialogApp}</span>
            <div className="grid grid-cols-3 gap-2">
              {ccSwitchApps.map((item) => (
                <button
                  key={item.id}
                  className={[
                    "rounded-control border px-3 py-2 text-sm font-extrabold transition",
                    app === item.id
                      ? "border-hub-500 bg-hub-50 text-hub-700 shadow-sm"
                      : "border-slate-200 bg-white text-ink hover:border-hub-200 hover:bg-slate-50"
                  ].join(" ")}
                  type="button"
                  onClick={() => updateApp(item.id)}
                >
                  {appLabel(item.id)}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field-label">{i18n.common.name}</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          {visibleFields.map((field) => (
            <ModelPicker
              key={field}
              label={modelFieldLabel(field, i18n)}
              required={field === "model"}
              value={models[field]}
              options={modelOptions}
              placeholder={field === "model" ? defaultRequestModel : i18n.keys.ccDialogPlaceholder}
              i18n={i18n}
              onChange={(value) => updateModel(field, value)}
            />
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4">
          <button className="button button-secondary" type="button" onClick={onClose}>
            {i18n.common.cancel}
          </button>
          <button className="button" type="button" onClick={submit}>
            <SlidersHorizontal size={16} />
            {i18n.keys.ccDialogOpen}
          </button>
        </div>
      </section>
    </div>
  );
}

function CCSwitchButtons({
  i18n,
  onImport,
  compact = false
}: {
  i18n: Messages;
  onImport: (app: CCSwitchApp) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex flex-wrap justify-end gap-2" : "mt-3 flex flex-wrap gap-2"}>
      {ccSwitchApps.map((app) => (
        <button
          key={app.id}
          className="button button-secondary button-small"
          type="button"
          onClick={() => onImport(app.id)}
        >
          <ExternalLink size={14} />
          {i18n.keys[app.labelKey]}
        </button>
      ))}
    </div>
  );
}

function ModelPicker({
  label,
  required = false,
  value,
  options,
  placeholder,
  i18n,
  onChange
}: {
  label: string;
  required?: boolean;
  value: string;
  options: string[];
  placeholder: string;
  i18n: Messages;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((model) => model.toLowerCase().includes(normalizedQuery))
    : options;
  const visibleOptions =
    value && filteredOptions.includes(value)
      ? [value, ...filteredOptions.filter((model) => model !== value)]
      : filteredOptions;

  function closeIfFocusLeft(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
      setOpen(false);
      setQuery("");
    }
  }

  function selectModel(model: string) {
    onChange(model);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="field" onBlur={closeIfFocusLeft}>
      <div className="flex items-center justify-between gap-3">
        <span className="field-label">
          {label}
          {required ? <span className="ml-1 text-red-500">*</span> : null}
        </span>
        <span className="text-[11px] font-extrabold text-muted">{i18n.keys.ccModelDropdownHint}</span>
      </div>

      <div className="relative">
        <button
          className="input flex items-center justify-between gap-3 text-left"
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          <span className={value ? "truncate font-extrabold text-ink" : "truncate text-muted"}>
            {value || placeholder}
          </span>
          <ChevronDown size={16} className={["shrink-0 text-muted transition", open ? "rotate-180" : ""].join(" ")} />
        </button>

        {open ? (
          <div className="absolute inset-x-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
              <Search size={14} className="text-muted" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-muted"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={i18n.keys.ccModelSearchPlaceholder}
                autoFocus
                spellCheck={false}
              />
              {value && !required ? (
                <button
                  className="rounded-full px-2 py-1 text-[11px] font-black text-muted transition hover:bg-white hover:text-ink"
                  type="button"
                  onClick={() => selectModel("")}
                >
                  {i18n.common.clear}
                </button>
              ) : null}
            </div>

            <div className="max-h-[176px] overflow-y-auto p-1.5">
              {visibleOptions.length > 0 ? (
                visibleOptions.map((model) => (
                  <button
                    key={model}
                    className={[
                      "flex w-full items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 text-left text-sm font-extrabold transition",
                      model === value ? "bg-hub-50 text-hub-700" : "text-ink hover:bg-slate-50"
                    ].join(" ")}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectModel(model)}
                  >
                    <span className="truncate">{model}</span>
                    {model === value ? <Check size={15} className="shrink-0" /> : null}
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-xs font-extrabold text-muted">{i18n.common.noModels}</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function defaultAppName(app: CCSwitchApp): string {
  return ccSwitchApps.find((item) => item.id === app)?.defaultName ?? "My Provider";
}

function appLabel(app: CCSwitchApp): string {
  if (app === "claude") {
    return "Claude";
  }
  if (app === "codex") {
    return "Codex";
  }
  return "Gemini";
}

function modelFieldLabel(field: "model" | "haikuModel" | "sonnetModel" | "opusModel", i18n: Messages): string {
  if (field === "haikuModel") {
    return i18n.keys.ccDialogHaiku;
  }
  if (field === "sonnetModel") {
    return i18n.keys.ccDialogSonnet;
  }
  if (field === "opusModel") {
    return i18n.keys.ccDialogOpus;
  }
  return i18n.keys.ccDialogPrimary;
}

function collectKnownModels(state: AdminState | null): string[] {
  const values: string[] = [...(state?.service.availableModels ?? [])];
  for (const upstream of state?.upstreams ?? []) {
    values.push(...(upstream.discoveredModels?.length ? upstream.discoveredModels : upstream.models));
  }
  return values;
}
