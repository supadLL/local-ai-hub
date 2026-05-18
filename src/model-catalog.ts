import { patternMatches } from "./services/matching.js";

export const gptModelCatalog = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-pro",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.4-2026-03-05",
  "gpt-5.3-codex",
  "gpt-5.3-chat-latest",
  "gpt-5.2",
  "gpt-5.2-pro",
  "gpt-5.2-codex",
  "gpt-5.2-chat-latest",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.1-chat-latest",
  "gpt-5",
  "gpt-5-pro",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-codex",
  "gpt-5-codex-mini",
  "gpt-5-chat-latest",
  "codex-mini-latest",
  "chat-latest",
  "gpt-4.5-preview",
  "gpt-4.5-preview-2025-02-27",
  "gpt-4.1",
  "gpt-4.1-2025-04-14",
  "gpt-4.1-mini",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4.1-nano",
  "gpt-4.1-nano-2025-04-14",
  "gpt-4o",
  "gpt-4o-2024-05-13",
  "gpt-4o-2024-08-06",
  "gpt-4o-2024-11-20",
  "chatgpt-4o-latest",
  "gpt-4o-mini",
  "gpt-4o-mini-2024-07-18",
  "gpt-4o-search-preview",
  "gpt-4o-search-preview-2025-03-11",
  "gpt-4o-mini-search-preview",
  "gpt-4o-mini-search-preview-2025-03-11",
  "gpt-4-turbo",
  "gpt-4-turbo-2024-04-09",
  "gpt-4-turbo-preview",
  "gpt-4-0125-preview",
  "gpt-4-1106-preview",
  "gpt-4-1106-vision-preview",
  "gpt-4-vision-preview",
  "gpt-4",
  "gpt-4-0613",
  "gpt-4-0314",
  "gpt-4-32k",
  "gpt-4-32k-0613",
  "gpt-4-32k-0314",
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-0125",
  "gpt-3.5-turbo-1106",
  "gpt-3.5-turbo-0613",
  "gpt-3.5-turbo-16k",
  "gpt-3.5-turbo-16k-0613",
  "gpt-3.5-turbo-instruct",
  "gpt-3.5-turbo-instruct-0914",
  "davinci-002",
  "babbage-002",
  "text-davinci-003",
  "text-davinci-002",
  "text-curie-001",
  "text-babbage-001",
  "text-ada-001",
  "davinci",
  "curie",
  "babbage",
  "ada",
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",
  "chatgpt-image-latest",
  "gpt-oss-120b",
  "gpt-oss-20b"
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
