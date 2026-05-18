import type {
  AdminState,
  CCSwitchImportPayload,
  CCSwitchOpenResponse,
  ClientKey,
  ClientKeyCreateInput,
  OAuthLoginStartResponse,
  UpstreamHealthCheckResponse,
  UpstreamCreateInput,
  UpstreamProbeResult
} from "./types";

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  if (response.status === 204) {
    return null as T;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.message || payload?.error?.message || payload?.error || JSON.stringify(payload);
    throw new Error(message);
  }

  return payload as T;
}

export const api = {
  state: () => requestJson<AdminState>("/api/admin/state"),

  createUpstream: (upstream: UpstreamCreateInput) =>
    requestJson<{ upstream: unknown }>("/api/admin/upstreams", {
      method: "POST",
      body: JSON.stringify(upstream)
    }),

  importUpstreams: (upstreams: UpstreamCreateInput[]) =>
    requestJson<{ imported: unknown[] }>("/api/admin/upstreams/import", {
      method: "POST",
      body: JSON.stringify(upstreams)
    }),

  testDraftUpstream: (upstream: UpstreamCreateInput) =>
    requestJson<UpstreamProbeResult>("/api/admin/upstreams/test", {
      method: "POST",
      body: JSON.stringify(upstream)
    }),

  testUpstream: (id: string) =>
    requestJson<UpstreamProbeResult>(`/api/admin/upstreams/${id}/test`, {
      method: "POST"
    }),

  healthCheckUpstreams: (ids?: string[]) =>
    requestJson<UpstreamHealthCheckResponse>("/api/admin/upstreams/health-check", {
      method: "POST",
      body: JSON.stringify(ids?.length ? { ids } : {})
    }),

  deleteUpstream: (id: string) =>
    requestJson<void>(`/api/admin/upstreams/${id}`, {
      method: "DELETE"
    }),

  startOpenAIOAuthLogin: () =>
    requestJson<OAuthLoginStartResponse>("/api/admin/upstreams/oauth/login-start", {
      method: "POST"
    }),

  relayOpenAIOAuthCallback: (callbackUrl: string) =>
    requestJson<{ success: true }>("/api/admin/upstreams/oauth/code-relay", {
      method: "POST",
      body: JSON.stringify({ callbackUrl })
    }),

  createClientKey: (payload: ClientKeyCreateInput) =>
    requestJson<{ clientKey: ClientKey }>("/api/admin/client-keys", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateClientKey: (id: string, patch: Partial<ClientKeyCreateInput>) =>
    requestJson<{ clientKey: unknown }>(`/api/admin/client-keys/${id}`, {
      method: "PUT",
      body: JSON.stringify(patch)
    }),

  openCCSwitchImport: (id: string, payload: CCSwitchImportPayload) =>
    requestJson<CCSwitchOpenResponse>(`/api/admin/client-keys/${id}/ccswitch/open`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  deleteClientKey: (id: string) =>
    requestJson<void>(`/api/admin/client-keys/${id}`, {
      method: "DELETE"
    })
};
