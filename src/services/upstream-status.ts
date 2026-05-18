import type { UpstreamQuotaSnapshot, UpstreamQuotaWindow } from "../types.js";

function parseHeaderNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isoFromUnixSeconds(value: number | null): string | null {
  if (value === null || value <= 0) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function parseCodexWindow(
  headers: Record<string, string>,
  prefix: string
): UpstreamQuotaWindow | null {
  const usedPercent = parseHeaderNumber(headers[`${prefix}-used-percent`]);
  if (usedPercent === null) {
    return null;
  }

  const windowMinutes = parseHeaderNumber(headers[`${prefix}-window-minutes`]);
  const resetAt = parseHeaderNumber(headers[`${prefix}-reset-at`]);
  const roundedPercent = Math.min(100, Math.max(0, Math.round(usedPercent)));

  return {
    allowed: roundedPercent < 100,
    limitReached: roundedPercent >= 100,
    usedPercent: roundedPercent,
    resetAt: isoFromUnixSeconds(resetAt),
    limitWindowSeconds: windowMinutes !== null ? windowMinutes * 60 : null
  };
}

function parseCodexCodeReviewWindow(headers: Record<string, string>): UpstreamQuotaWindow | null {
  for (const prefix of ["x-codex-code-review", "x-codex-review", "x-code-review"]) {
    const quota = parseCodexWindow(headers, `${prefix}-primary`);
    if (quota) {
      return quota;
    }
  }
  return null;
}

function quotaSnapshotFromCodexHeaders(
  headers: Record<string, string>,
  fetchedAt: string
): UpstreamQuotaSnapshot | null {
  const rateLimit = parseCodexWindow(headers, "x-codex-primary");
  const secondaryRateLimit = parseCodexWindow(headers, "x-codex-secondary");
  const codeReviewRateLimit = parseCodexCodeReviewWindow(headers);

  if (!rateLimit && !secondaryRateLimit && !codeReviewRateLimit) {
    return null;
  }

  const limitReached =
    rateLimit?.limitReached === true ||
    secondaryRateLimit?.limitReached === true ||
    codeReviewRateLimit?.limitReached === true;
  const primaryAllowed = rateLimit?.allowed !== false;

  return {
    supported: true,
    status: limitReached ? "limited" : primaryAllowed ? "available" : "unavailable",
    source: "response-headers",
    message: "Codex quota inferred from x-codex rate-limit response headers.",
    fetchedAt,
    planType: null,
    limitReached,
    limitRequests: null,
    remainingRequests: null,
    usedPercent: rateLimit?.usedPercent ?? null,
    resetRequests: rateLimit?.resetAt ?? null,
    rateLimit,
    secondaryRateLimit,
    codeReviewRateLimit,
    additionalRateLimits: []
  };
}

export function createUnknownQuotaSnapshot(fetchedAt?: string): UpstreamQuotaSnapshot {
  return {
    supported: false,
    status: "unknown",
    source: "local",
    message:
      "Generic OpenAI-compatible providers do not expose a standard quota endpoint. Local usage is tracked by the gateway.",
    fetchedAt: fetchedAt ?? null,
    planType: null,
    limitReached: false,
    limitRequests: null,
    remainingRequests: null,
    usedPercent: null,
    resetRequests: null,
    rateLimit: null,
    secondaryRateLimit: null,
    codeReviewRateLimit: null,
    additionalRateLimits: []
  };
}

export function quotaSnapshotFromHeaders(
  headers: Record<string, string>,
  fetchedAt: string
): UpstreamQuotaSnapshot | null {
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  const codexQuota = quotaSnapshotFromCodexHeaders(lowerHeaders, fetchedAt);
  if (codexQuota) {
    return codexQuota;
  }

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
    planType: null,
    limitReached: remainingRequests === 0,
    limitRequests,
    remainingRequests,
    usedPercent,
    resetRequests,
    rateLimit: {
      allowed: remainingRequests !== 0,
      limitReached: remainingRequests === 0,
      usedPercent,
      resetAt: resetRequests,
      limitWindowSeconds: null
    },
    secondaryRateLimit: null,
    codeReviewRateLimit: null,
    additionalRateLimits: []
  };
}
