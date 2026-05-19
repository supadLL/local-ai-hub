import type { TokenUsageDetails, UpstreamAccount, UpstreamUsage } from "../types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUsageNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function usageRecordLooksValid(value: Record<string, unknown>): boolean {
  return (
    "input_tokens" in value ||
    "output_tokens" in value ||
    "prompt_tokens" in value ||
    "completion_tokens" in value ||
    "total_tokens" in value ||
    "cached_tokens" in value
  );
}

export function normalizeTokenUsage(value: unknown): TokenUsageDetails | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const inputDetails = isRecord(value.input_tokens_details) ? value.input_tokens_details : null;
  const outputDetails = isRecord(value.output_tokens_details) ? value.output_tokens_details : null;
  const promptDetails = isRecord(value.prompt_tokens_details) ? value.prompt_tokens_details : null;
  const completionDetails = isRecord(value.completion_tokens_details) ? value.completion_tokens_details : null;
  const inputTokens = parseUsageNumber(value.input_tokens) ?? parseUsageNumber(value.prompt_tokens);
  const outputTokens = parseUsageNumber(value.output_tokens) ?? parseUsageNumber(value.completion_tokens);
  const totalTokens = parseUsageNumber(value.total_tokens);
  const cachedTokens =
    parseUsageNumber(value.cached_tokens) ??
    parseUsageNumber(inputDetails?.cached_tokens) ??
    parseUsageNumber(promptDetails?.cached_tokens);
  const reasoningTokens =
    parseUsageNumber(value.reasoning_tokens) ??
    parseUsageNumber(outputDetails?.reasoning_tokens) ??
    parseUsageNumber(completionDetails?.reasoning_tokens);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cachedTokens === undefined &&
    reasoningTokens === undefined
  ) {
    return undefined;
  }

  const usage: TokenUsageDetails = {
    input_tokens: inputTokens ?? 0,
    output_tokens: outputTokens ?? 0
  };
  if (totalTokens !== undefined) {
    usage.total_tokens = totalTokens;
  }
  if (cachedTokens !== undefined) {
    usage.cached_tokens = cachedTokens;
  }
  if (reasoningTokens !== undefined) {
    usage.reasoning_tokens = reasoningTokens;
  }
  return usage;
}

export function extractTokenUsage(value: unknown): TokenUsageDetails | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const response = isRecord(value.response) ? value.response : null;
  const candidates = [
    response?.usage,
    value.usage,
    usageRecordLooksValid(value) ? value : null
  ];

  for (const candidate of candidates) {
    const usage = normalizeTokenUsage(candidate);
    if (usage) {
      return usage;
    }
  }
  return undefined;
}

export function tokenTotal(usage: TokenUsageDetails): number {
  const total = usage.total_tokens ?? usage.input_tokens + usage.output_tokens;
  return Number.isFinite(total) && total >= 0 ? total : 0;
}

export function usageUnitsFromDetails(usage: TokenUsageDetails | undefined): number {
  if (!usage) {
    return 1;
  }
  const total = tokenTotal(usage);
  return total > 0 ? total : 1;
}

export function createEmptyUpstreamUsage(): UpstreamUsage {
  return {
    request_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cached_tokens: 0,
    reasoning_tokens: 0,
    last_used: null,
    window_request_count: 0,
    window_input_tokens: 0,
    window_output_tokens: 0,
    window_total_tokens: 0,
    window_cached_tokens: 0,
    window_reasoning_tokens: 0,
    window_counters_reset_at: null
  };
}

export function normalizeUpstreamUsage(upstream: Pick<UpstreamAccount, "requestCount" | "lastUsedAt" | "usage">): UpstreamUsage {
  const usage = upstream.usage;
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  return {
    request_count: usage?.request_count ?? upstream.requestCount ?? 0,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: usage?.total_tokens ?? inputTokens + outputTokens,
    cached_tokens: usage?.cached_tokens ?? 0,
    reasoning_tokens: usage?.reasoning_tokens ?? 0,
    last_used: usage?.last_used ?? upstream.lastUsedAt ?? null,
    window_request_count: usage?.window_request_count ?? 0,
    window_input_tokens: usage?.window_input_tokens ?? 0,
    window_output_tokens: usage?.window_output_tokens ?? 0,
    window_total_tokens: usage?.window_total_tokens ?? 0,
    window_cached_tokens: usage?.window_cached_tokens ?? 0,
    window_reasoning_tokens: usage?.window_reasoning_tokens ?? 0,
    window_counters_reset_at: usage?.window_counters_reset_at ?? null
  };
}

export function applyRecordedUsage(
  upstream: UpstreamAccount,
  usage: TokenUsageDetails | undefined,
  usageUnits: number,
  usedAt: string
): void {
  const current = normalizeUpstreamUsage(upstream);
  current.request_count += 1;
  current.last_used = usedAt;
  current.window_request_count += 1;

  if (usage) {
    const total = tokenTotal(usage);
    current.input_tokens += usage.input_tokens;
    current.output_tokens += usage.output_tokens;
    current.total_tokens += total;
    current.cached_tokens += usage.cached_tokens ?? 0;
    current.reasoning_tokens += usage.reasoning_tokens ?? 0;
    current.window_input_tokens += usage.input_tokens;
    current.window_output_tokens += usage.output_tokens;
    current.window_total_tokens += total;
    current.window_cached_tokens += usage.cached_tokens ?? 0;
    current.window_reasoning_tokens += usage.reasoning_tokens ?? 0;
  }

  upstream.usage = current;
  upstream.requestCount = current.request_count;
  upstream.usedQuota = (upstream.usedQuota ?? 0) + usageUnits;
  upstream.lastUsedAt = usedAt;
}
