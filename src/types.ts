export type ProviderType = "openai-compatible" | "openai-oauth";

export interface UpstreamQuotaWindow {
  allowed?: boolean | null;
  limitReached?: boolean;
  usedPercent?: number | null;
  resetAt?: string | null;
  limitWindowSeconds?: number | null;
}

export interface UpstreamQuotaLimitBucket extends UpstreamQuotaWindow {
  id: string;
  name?: string | null;
  secondaryRateLimit?: UpstreamQuotaWindow | null;
}

export interface UpstreamQuotaSnapshot {
  supported: boolean;
  status: "unknown" | "available" | "limited" | "unavailable";
  source: "response-headers" | "provider-api" | "local";
  message: string;
  fetchedAt?: string | null;
  planType?: string | null;
  limitReached?: boolean;
  limitRequests?: number | null;
  remainingRequests?: number | null;
  usedPercent?: number | null;
  resetRequests?: string | null;
  rateLimit?: UpstreamQuotaWindow | null;
  secondaryRateLimit?: UpstreamQuotaWindow | null;
  codeReviewRateLimit?: UpstreamQuotaWindow | null;
  additionalRateLimits?: UpstreamQuotaLimitBucket[];
}

export interface UpstreamAccount {
  id: string;
  name: string;
  provider: ProviderType;
  baseUrl: string;
  apiKey: string;
  models: string[];
  enabled: boolean;
  weight: number;
  headers: Record<string, string>;
  note: string;
  createdAt: string;
  updatedAt: string;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  accountEmail?: string | null;
  accountSubject?: string | null;
  lastProbeAt?: string | null;
  lastProbeOk?: boolean | null;
  lastProbeStatusCode?: number | null;
  lastProbeLatencyMs?: number | null;
  lastProbeError?: string | null;
  discoveredModels?: string[];
  requestCount?: number;
  usedQuota?: number;
  usage?: UpstreamUsage;
  lastUsedAt?: string | null;
  quota?: UpstreamQuotaSnapshot;
  consecutiveFailures?: number;
  cooldownUntil?: string | null;
  lastErrorCategory?: string | null;
}

export interface UpstreamUsage {
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  last_used: string | null;
  window_request_count: number;
  window_input_tokens: number;
  window_output_tokens: number;
  window_total_tokens: number;
  window_cached_tokens: number;
  window_reasoning_tokens: number;
  window_counters_reset_at: string | null;
}

export interface ClientKey {
  id: string;
  name: string;
  key: string;
  allowedModels: string[];
  enabled: boolean;
  quotaLimit: number | null;
  usedQuota: number;
  requestsPerMinute: number;
  currentWindowStart: number;
  currentWindowCount: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  kind: "admin" | "proxy";
  message: string;
  requestId?: string;
  clientKeyName?: string;
  clientKeyId?: string;
  upstreamName?: string;
  upstreamId?: string;
  model?: string;
  statusCode?: number;
  usageUnits?: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

export interface AppState {
  version: 1;
  createdAt: string;
  updatedAt: string;
  upstreams: UpstreamAccount[];
  clientKeys: ClientKey[];
  logs: AuditLogEntry[];
}

export interface ProxyPreparation {
  requestId: string;
  model: string;
  clientKey: ClientKey;
  upstream: UpstreamAccount;
}

export interface TokenUsageDetails {
  input_tokens: number;
  output_tokens: number;
  total_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
}

export interface ForwardedResult {
  statusCode: number;
  responseHeaders: Record<string, string>;
  body: unknown;
  usageUnits: number;
  usage?: TokenUsageDetails;
  upstreamModel?: string;
  errorCategory?: string;
  retryable?: boolean;
}
