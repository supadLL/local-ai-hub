export type ProviderType = "openai-compatible" | "openai-oauth";

export interface UpstreamQuotaSnapshot {
  supported: boolean;
  status: "unknown" | "available" | "limited" | "unavailable";
  source: "response-headers" | "provider-api" | "local";
  message: string;
  fetchedAt?: string | null;
  limitRequests?: number | null;
  remainingRequests?: number | null;
  usedPercent?: number | null;
  resetRequests?: string | null;
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
  lastUsedAt?: string | null;
  quota?: UpstreamQuotaSnapshot;
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

export interface ForwardedResult {
  statusCode: number;
  responseHeaders: Record<string, string>;
  body: unknown;
  usageUnits: number;
  upstreamModel?: string;
}
