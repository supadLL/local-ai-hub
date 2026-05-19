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

export interface UpstreamAccount {
  id: string;
  name: string;
  provider: "openai-compatible" | "openai-oauth";
  endpointHost: string;
  accountEmail?: string | null;
  apiKey: string;
  models: string[];
  enabled: boolean;
  tokenExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface AdminState {
  service: {
    host: string;
    port: number;
    dataFilePath: string;
    logRetention: number;
    usageHistoryRetentionDays: number | null;
    availableModels: string[];
  };
  counts: {
    upstreams: number;
    clientKeys: number;
    enabledUpstreams: number;
    enabledClientKeys: number;
  };
  upstreams: UpstreamAccount[];
  clientKeys: ClientKey[];
  logs: AuditLogEntry[];
}

export interface ClientKeyCreateInput {
  name: string;
  allowedModels: string[];
  enabled: boolean;
  quotaLimit: number | null;
  requestsPerMinute: number;
  note: string;
}

export interface UpstreamCreateInput {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  enabled: boolean;
  weight: number;
  headers: Record<string, string>;
  note: string;
}

export interface UpstreamProbeResult {
  ok: boolean;
  statusCode?: number;
  models?: string[];
  body?: unknown;
  error?: string;
  latencyMs?: number;
}

export interface UpstreamHealthCheckResponse {
  summary: {
    alive: number;
    dead: number;
    skipped: number;
  };
  results: Array<{
    id: string;
    name: string;
    ok: boolean;
    skipped?: boolean;
    statusCode?: number;
    latencyMs?: number;
    models?: string[];
    error?: string;
  }>;
}

export type UsageGranularity = "raw" | "five_min" | "hourly" | "daily";
export type UsageHistoryRange = number | "all";

export interface UsageSummary {
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cached_tokens: number;
  total_reasoning_tokens: number;
  total_request_count: number;
  total_accounts: number;
  active_accounts: number;
}

export interface UsageDataPoint {
  timestamp: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  request_count: number;
}

export interface UsageHistoryResponse {
  granularity: UsageGranularity;
  hours: UsageHistoryRange;
  data_points: UsageDataPoint[];
}

export interface OAuthLoginStartResponse {
  authUrl: string;
  state: string;
  redirectUri: string;
}

export type CCSwitchApp = "codex" | "claude" | "gemini";

export interface CCSwitchImportPayload {
  app: CCSwitchApp;
  model: string;
  name?: string;
  haikuModel?: string;
  sonnetModel?: string;
  opusModel?: string;
}

export interface CCSwitchOpenResponse {
  success: true;
  importUrl: string;
}

export type TabId = "overview" | "import" | "keys" | "usage" | "activity" | "settings";
