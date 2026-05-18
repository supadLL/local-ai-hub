import type { UpstreamAccount } from "../types.js";
import { codexModelCatalog, looksLikeCodexModel, resolveCodexModel } from "../model-catalog.js";
import { anyPatternMatches } from "./matching.js";

export class UpstreamSelector {
  private rrState = new Map<string, number>();

  pick(upstreams: UpstreamAccount[], model: string): UpstreamAccount | null {
    return this.pickSequence(upstreams, model)[0] ?? null;
  }

  pickSequence(upstreams: UpstreamAccount[], model: string): UpstreamAccount[] {
    const resolvedModel = resolveCodexModel(model);
    const candidates = upstreams.filter((upstream) => supportsModel(upstream, resolvedModel));
    if (candidates.length === 0) {
      return [];
    }

    const weightedPool: UpstreamAccount[] = [];
    for (const candidate of candidates) {
      const copies = Math.max(1, candidate.weight);
      for (let index = 0; index < copies; index += 1) {
        weightedPool.push(candidate);
      }
    }

    const cursor = this.rrState.get(model) ?? 0;
    this.rrState.set(model, (cursor + 1) % weightedPool.length);

    const ordered: UpstreamAccount[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < weightedPool.length; index += 1) {
      const candidate = weightedPool[(cursor + index) % weightedPool.length];
      if (seen.has(candidate.id)) {
        continue;
      }
      seen.add(candidate.id);
      ordered.push(candidate);
    }

    return ordered;
  }
}

function supportsModel(upstream: UpstreamAccount, model: string): boolean {
  if (!upstream.enabled) {
    return false;
  }

  const modelPatterns = upstream.discoveredModels?.length ? upstream.discoveredModels : upstream.models;
  if (anyPatternMatches(modelPatterns, model)) {
    return true;
  }

  if (upstream.provider !== "openai-oauth") {
    return false;
  }

  const legacyCodexImport = modelPatterns.includes("codex");
  if (legacyCodexImport && looksLikeCodexModel(model)) {
    return true;
  }

  return codexModelCatalog.some((catalogModel) => catalogModel === model);
}
