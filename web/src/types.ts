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
  lastUsedAt?: string | null;
  quota?: UpstreamQuotaSnapshot;
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
