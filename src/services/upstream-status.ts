import type { UpstreamQuotaSnapshot } from "../types.js";

function parseHeaderNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function createUnknownQuotaSnapshot(fetchedAt?: string): UpstreamQuotaSnapshot {
  return {
    supported: false,
    status: "unknown",
    source: "local",
    message:
      "Generic OpenAI-compatible providers do not expose a standard quota endpoint. Local usage is tracked by the gateway.",
    fetchedAt: fetchedAt ?? null,
    limitRequests: null,
    remainingRequests: null,
    usedPercent: null,
    resetRequests: null
  };
}

export function quotaSnapshotFromHeaders(
  headers: Record<string, string>,
  fetchedAt: string
): UpstreamQuotaSnapshot | null {
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  const limitRequests = parseHeaderNumber(lowerHeaders["x-ratelimit-limit-requests"]);
  const remainingRequests = parseHeaderNumber(lowerHeaders["x-ratelimit-remaining-requests"]);
  const resetRequests = lowerHeaders["x-ratelimit-reset-requests"] ?? null;

  if (limitRequests === null && remainingRequests === null && !resetRequests) {
    return null;
  }

  const usedPercent =
    limitRequests !== null && remainingRequests !== null && limitRequests > 0
      ? Math.min(100, Math.max(0, Math.round(((limitRequests - remainingRequests) / limitRequests) * 100)))
      : null;

  return {
    supported: true,
    status: remainingRequests === 0 ? "limited" : "available",
    source: "response-headers",
    message: "Quota window inferred from upstream rate-limit response headers.",
    fetchedAt,
    limitRequests,
    remainingRequests,
    usedPercent,
    resetRequests
  };
}
