import { patternMatches } from "./services/matching.js";

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

export const codexModelCatalog = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.2",
  "gpt-5-codex",
  "gpt-5-codex-mini",
  "codex-mini-latest"
] as const;

const codexModelAliases: Record<string, string> = {
  "gpt-5.5-pro": "gpt-5.5",
  "claude-opus-4-7": "gpt-5.5",
  "claude-sonnet-4-6": "gpt-5.4",
  "claude-haiku-4-5": "gpt-5.3-codex"
};

export function resolveCodexModel(model: string): string {
  const normalized = model.trim();
  return codexModelAliases[normalized] ?? normalized;
}

export function looksLikeCodexModel(model: string): boolean {
  const resolved = resolveCodexModel(model);
  return (
    resolved.startsWith("gpt-") ||
    resolved.startsWith("codex") ||
    resolved === "chat-latest" ||
    resolved === "chatgpt-4o-latest"
  );
}

export function expandModelPatterns(patterns: string[]): string[] {
  const values = new Set<string>();

  for (const pattern of patterns) {
    const model = pattern.trim();
    if (!model) {
      continue;
    }

    if (model === "*") {
      for (const catalogModel of gptModelCatalog) {
        values.add(catalogModel);
      }
      continue;
    }

    if (model.endsWith("*")) {
      let matchedCatalogModel = false;
      for (const catalogModel of gptModelCatalog) {
        if (patternMatches(model, catalogModel)) {
          values.add(catalogModel);
          matchedCatalogModel = true;
        }
      }

      if (!matchedCatalogModel) {
        values.add(model);
      }
      continue;
    }

    values.add(model);
  }

  return [...values].sort((left, right) => left.localeCompare(right));
}
