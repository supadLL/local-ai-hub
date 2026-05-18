import type { UpstreamAccount } from "../types.js";
import { anyPatternMatches } from "./matching.js";

export class UpstreamSelector {
  private rrState = new Map<string, number>();

  pick(upstreams: UpstreamAccount[], model: string): UpstreamAccount | null {
    return this.pickSequence(upstreams, model)[0] ?? null;
  }

  pickSequence(upstreams: UpstreamAccount[], model: string): UpstreamAccount[] {
    const candidates = upstreams.filter(
      (upstream) =>
        upstream.provider === "openai-compatible" &&
        upstream.enabled &&
        anyPatternMatches(upstream.models, model)
    );
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
