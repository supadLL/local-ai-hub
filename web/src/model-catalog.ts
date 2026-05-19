export const gptModelCatalog = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-codex",
  "gpt-5-codex-mini",
  "codex-mini-latest",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-4-32k",
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k"
] as const;

export const preferredCCSwitchModels = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.2",
  "gpt-5.1",
  "gpt-5",
  "gpt-5-mini",
  "gpt-4.1",
  "gpt-4o",
  "gpt-3.5-turbo"
] as const;

export const defaultGatewayModels = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-codex",
  "gpt-5-codex-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo"
];

export const defaultGatewayModelText = defaultGatewayModels.join(", ");
export const defaultLocalKeyModelText = defaultGatewayModels.join(", ");
export const defaultRequestModel = "gpt-5.5";

export function choosePreferredModel(models: string[]): string {
  const normalized = buildModelOptions(models);

  for (const preferred of preferredCCSwitchModels) {
    if (normalized.some((model) => modelMatches(model, preferred))) {
      return preferred;
    }
  }

  const model = normalized.find((item) => item !== "*" && !item.endsWith("*"));
  return model?.trim() || defaultRequestModel;
}

export function buildModelOptions(extraModels: string[] = []): string[] {
  const values = new Set<string>(gptModelCatalog);
  for (const model of extraModels) {
    addConcreteModelOption(values, model);
  }
  return [...values].sort(sortModels);
}

function addConcreteModelOption(values: Set<string>, rawModel: string) {
  const model = rawModel.trim();
  if (!model || model === "*") {
    return;
  }

  if (model.endsWith("*")) {
    for (const catalogModel of gptModelCatalog) {
      if (modelMatches(model, catalogModel)) {
        values.add(catalogModel);
      }
    }
    return;
  }

  const normalized = normalizeMainstreamModel(model);
  if (normalized) {
    values.add(normalized);
  }
}

function normalizeMainstreamModel(model: string): string | null {
  const lower = model.trim().toLowerCase();
  if (!lower || lower === "*") {
    return null;
  }

  const catalogMatch = gptModelCatalog.find((item) => item === lower);
  if (catalogMatch) {
    return catalogMatch;
  }

  const datedCodexMini = lower.match(/^(gpt-[345](?:\.\d+)?-codex-mini)-\d{4}-\d{2}-\d{2}$/);
  if (datedCodexMini) {
    return datedCodexMini[1];
  }

  const datedCodex = lower.match(/^(gpt-[345](?:\.\d+)?-codex)-\d{4}-\d{2}-\d{2}$/);
  if (datedCodex) {
    return datedCodex[1];
  }

  const datedMini = lower.match(/^(gpt-(?:3\.5|4(?:\.1|o)?|5(?:\.\d+)?)-mini)-\d{4}-\d{2}-\d{2}$/);
  if (datedMini) {
    return datedMini[1];
  }

  const datedNumeric = lower.match(/^(gpt-(?:3\.5|4(?:\.1|o)?|5(?:\.\d+)?))-\d{4}-\d{2}-\d{2}$/);
  if (datedNumeric) {
    return datedNumeric[1];
  }

  const datedLegacy = lower.match(/^(gpt-(?:3\.5-turbo(?:-16k)?|4(?:-32k|-turbo)?))-\d{4}(?:-\d{2}-\d{2})?$/);
  if (datedLegacy) {
    return datedLegacy[1];
  }

  const proNumeric = lower.match(/^(gpt-[345](?:\.\d+)?)-pro$/);
  if (proNumeric) {
    return proNumeric[1];
  }

  if (/^gpt-[345](?:\.\d+)?$/.test(lower)) {
    return lower;
  }
  if (/^gpt-[345](?:\.\d+)?-(?:mini|codex|codex-mini|turbo|32k|16k)$/.test(lower)) {
    return lower;
  }
  if (/^gpt-4o(?:-mini)?$/.test(lower)) {
    return lower;
  }
  if (/^gpt-3\.5-turbo(?:-16k)?$/.test(lower)) {
    return lower;
  }
  if (lower === "codex-mini-latest") {
    return lower;
  }

  return null;
}

function sortModels(left: string, right: string): number {
  const leftIndex = gptModelCatalog.findIndex((item) => item === left);
  const rightIndex = gptModelCatalog.findIndex((item) => item === right);
  if (leftIndex >= 0 && rightIndex >= 0) {
    return leftIndex - rightIndex;
  }
  if (leftIndex >= 0) {
    return -1;
  }
  if (rightIndex >= 0) {
    return 1;
  }
  return left.localeCompare(right);
}

function modelMatches(pattern: string, candidate: string): boolean {
  if (pattern === "*") {
    return true;
  }
  if (pattern.endsWith("*")) {
    return candidate.startsWith(pattern.slice(0, -1));
  }
  return pattern === candidate;
}
