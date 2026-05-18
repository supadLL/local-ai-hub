import express from "express";
import { z } from "zod";
import { appConfig } from "../config.js";
import { codexModelCatalog, gptModelCatalog } from "../model-catalog.js";
import { buildCCSwitchImportUrl } from "../services/ccswitch.js";
import { fetchCodexModels, fetchCodexUsageSnapshot } from "../services/codex-backend.js";
import { createId, createOpaqueKey, maskSecret, nowIso } from "../services/keys.js";
import {
  probeOAuthUpstream,
  relayOpenAIOAuthCallback,
  startOpenAIOAuthLogin
} from "../services/openai-oauth.js";
import { testOpenAICompatibleUpstream, UpstreamRequestError } from "../services/openai-proxy.js";
import { createUnknownQuotaSnapshot, quotaSnapshotFromHeaders } from "../services/upstream-status.js";
import type { FileStore } from "../store/file-store.js";
import type { AuditLogEntry, ClientKey, UpstreamAccount } from "../types.js";

const upstreamCreateSchema = z.object({
  name: z.string().min(1).max(80),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  models: z.array(z.string().min(1)).min(1),
  enabled: z.boolean().default(true),
  weight: z.coerce.number().int().min(1).max(10).default(1),
  headers: z.record(z.string()).default({}),
  note: z.string().max(240).default("")
});

const upstreamUpdateSchema = upstreamCreateSchema.partial();

const clientKeyCreateSchema = z.object({
  name: z.string().min(1).max(80),
  allowedModels: z.array(z.string().min(1)).min(1).default(["*"]),
  enabled: z.boolean().default(true),
  quotaLimit: z.union([z.coerce.number().int().min(0), z.null()]).default(null),
  requestsPerMinute: z.coerce.number().int().min(1).max(10000).default(60),
  note: z.string().max(240).default("")
});

const clientKeyUpdateSchema = clientKeyCreateSchema.partial();

const healthCheckSchema = z.object({
  ids: z.array(z.string().min(1)).optional()
});

const oauthRelaySchema = z.object({
  callbackUrl: z.string().url()
});

const ccSwitchOpenSchema = z.object({
  app: z.enum(["codex", "claude", "gemini"]),
  model: z.string().min(1).max(120),
  name: z.string().min(1).max(120).optional(),
  haikuModel: z.string().max(120).optional(),
  sonnetModel: z.string().max(120).optional(),
  opusModel: z.string().max(120).optional()
});

type UpstreamCreateInput = z.infer<typeof upstreamCreateSchema>;

function normalizeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const item = value.trim();
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

function adminLog(message: string, metadata?: Record<string, unknown>): AuditLogEntry {
  return {
    id: createId("log"),
    timestamp: nowIso(),
    kind: "admin",
    message,
    metadata
  };
}

function endpointHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "custom-endpoint";
  }
}

function runtimeDefaults(upstream: UpstreamAccount, fetchedAt?: string) {
  return {
    lastProbeAt: upstream.lastProbeAt ?? null,
    lastProbeOk: upstream.lastProbeOk ?? null,
    lastProbeStatusCode: upstream.lastProbeStatusCode ?? null,
    lastProbeLatencyMs: upstream.lastProbeLatencyMs ?? null,
    lastProbeError: upstream.lastProbeError ?? null,
    discoveredModels: upstream.discoveredModels ?? [],
    requestCount: upstream.requestCount ?? 0,
    usedQuota: upstream.usedQuota ?? 0,
    lastUsedAt: upstream.lastUsedAt ?? null,
    quota: upstream.quota ?? createUnknownQuotaSnapshot(fetchedAt)
  };
}

function oauthTokenExpiresAt(expiresIn: number | undefined): string | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) {
    return null;
  }
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function sanitizeUpstream(upstream: UpstreamAccount) {
  const runtime = runtimeDefaults(upstream);
  return {
    id: upstream.id,
    name: upstream.name,
    provider: upstream.provider,
    endpointHost: endpointHost(upstream.baseUrl),
    accountEmail: upstream.accountEmail ?? null,
    apiKey: maskSecret(upstream.apiKey),
    models: upstream.models,
    enabled: upstream.enabled,
    tokenExpiresAt: upstream.tokenExpiresAt ?? null,
    createdAt: upstream.createdAt,
    updatedAt: upstream.updatedAt,
    ...runtime
  };
}

function sanitizeClientKey(clientKey: ClientKey) {
  return {
    ...clientKey,
    key: maskSecret(clientKey.key)
  };
}

function createUpstream(payload: UpstreamCreateInput): UpstreamAccount {
  const now = nowIso();
  return {
    id: createId("upstream"),
    name: payload.name.trim(),
    provider: "openai-compatible",
    baseUrl: payload.baseUrl.trim(),
    apiKey: payload.apiKey.trim(),
    models: normalizeStringList(payload.models),
    enabled: payload.enabled,
    weight: payload.weight,
    headers: payload.headers,
    note: payload.note.trim(),
    createdAt: now,
    updatedAt: now,
    lastProbeAt: null,
    lastProbeOk: null,
    lastProbeStatusCode: null,
    lastProbeLatencyMs: null,
    lastProbeError: null,
    discoveredModels: [],
    requestCount: 0,
    usedQuota: 0,
    lastUsedAt: null,
    quota: createUnknownQuotaSnapshot(now)
  };
}

function getRequestId(res: express.Response): string {
  return typeof res.locals.requestId === "string" ? res.locals.requestId : createId("req");
}

async function probeUpstream(
  store: FileStore,
  upstream: UpstreamAccount,
  requestId: string,
  logMessage: string,
  options: { persistStatus?: boolean } = {}
): Promise<{
  ok: boolean;
  statusCode?: number;
  models?: string[];
  body?: unknown;
  error?: string;
  latencyMs?: number;
}> {
  const startedAt = Date.now();
  if (upstream.provider === "openai-oauth") {
    const result = await probeOAuthUpstream(upstream);
    const latencyMs = Date.now() - startedAt;
    const checkedAt = nowIso();
    let models: string[] = [...codexModelCatalog];
    let statusCode = result.ok ? 200 : undefined;
    let body: unknown;
    let quota = upstream.quota ?? createUnknownQuotaSnapshot(checkedAt);

    if (result.ok && result.tokens) {
      const freshUpstream: UpstreamAccount = {
        ...upstream,
        apiKey: result.tokens.access_token,
        refreshToken: result.tokens.refresh_token ?? upstream.refreshToken ?? null,
        tokenExpiresAt: oauthTokenExpiresAt(result.tokens.expires_in)
      };
      try {
        const modelProbe = await fetchCodexModels(freshUpstream, { requestId });
        models = modelProbe.models.length > 0 ? modelProbe.models : models;
        statusCode = modelProbe.statusCode;
        body = modelProbe.body;
      } catch (error) {
        body = {
          warning: error instanceof Error ? error.message : "Codex model discovery failed."
        };
      }
      try {
        quota = (await fetchCodexUsageSnapshot(freshUpstream, checkedAt, { requestId })) ?? quota;
      } catch {
        quota = quota ?? createUnknownQuotaSnapshot(checkedAt);
      }
    }

    await store.mutate((state) => {
      const persisted = state.upstreams.find((item) => item.id === upstream.id);
      if (persisted && options.persistStatus) {
        persisted.lastProbeAt = checkedAt;
        persisted.lastProbeOk = result.ok;
        persisted.lastProbeStatusCode = statusCode ?? null;
        persisted.lastProbeLatencyMs = latencyMs;
        persisted.lastProbeError = result.ok ? null : result.error ?? "OAuth refresh failed.";
        persisted.discoveredModels = result.ok ? models : persisted.discoveredModels ?? [];
        persisted.models = result.ok ? models : persisted.models;
        persisted.quota = quota;
        persisted.updatedAt = checkedAt;

        if (result.tokens) {
          persisted.apiKey = result.tokens.access_token;
          persisted.refreshToken = result.tokens.refresh_token ?? persisted.refreshToken ?? null;
          persisted.tokenExpiresAt = oauthTokenExpiresAt(result.tokens.expires_in);
        }
      }

      state.logs.unshift(
        adminLog(logMessage, {
          upstreamId: upstream.id,
          ok: result.ok,
          provider: upstream.provider,
          latencyMs,
          modelCount: result.ok ? models.length : 0,
          error: result.error
        })
      );
    });

    return {
      ok: result.ok,
      statusCode,
      models: result.ok ? models : undefined,
      body,
      error: result.error,
      latencyMs
    };
  }

  try {
    const result = await testOpenAICompatibleUpstream(upstream, { requestId });
    const latencyMs = Date.now() - startedAt;
    const checkedAt = nowIso();
    const quota = quotaSnapshotFromHeaders(result.responseHeaders, checkedAt);
    await store.mutate((state) => {
      if (options.persistStatus) {
        const persisted = state.upstreams.find((item) => item.id === upstream.id);
        if (persisted) {
          persisted.lastProbeAt = checkedAt;
          persisted.lastProbeOk = result.ok;
          persisted.lastProbeStatusCode = result.statusCode;
          persisted.lastProbeLatencyMs = latencyMs;
          persisted.lastProbeError = result.ok ? null : `HTTP ${result.statusCode}`;
          persisted.discoveredModels = result.models;
          persisted.quota = quota ?? persisted.quota ?? createUnknownQuotaSnapshot(checkedAt);
          persisted.updatedAt = checkedAt;
        }
      }

      state.logs.unshift(
        adminLog(logMessage, {
          upstreamId: upstream.id,
          ok: result.ok,
          statusCode: result.statusCode,
          modelCount: result.models.length,
          latencyMs
        })
      );
    });
    return {
      ok: result.ok,
      statusCode: result.statusCode,
      models: result.models,
      body: result.body,
      latencyMs
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const checkedAt = nowIso();
    const message =
      error instanceof UpstreamRequestError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unknown upstream probe error";

    await store.mutate((state) => {
      if (options.persistStatus) {
        const persisted = state.upstreams.find((item) => item.id === upstream.id);
        if (persisted) {
          persisted.lastProbeAt = checkedAt;
          persisted.lastProbeOk = false;
          persisted.lastProbeStatusCode = null;
          persisted.lastProbeLatencyMs = latencyMs;
          persisted.lastProbeError = message;
          persisted.quota = persisted.quota ?? createUnknownQuotaSnapshot(checkedAt);
          persisted.updatedAt = checkedAt;
        }
      }

      state.logs.unshift(
        adminLog(logMessage, {
          upstreamId: upstream.id,
          ok: false,
          error: message,
          latencyMs
        })
      );
    });
    return {
      ok: false,
      error: message,
      latencyMs
    };
  }
}

export function createAdminRouter(store: FileStore): express.Router {
  const router = express.Router();

  router.get("/state", async (_req, res, next) => {
    try {
      const state = await store.readState();
      res.json({
        service: {
          host: appConfig.host,
          port: appConfig.port,
          dataFilePath: appConfig.dataFilePath,
          logRetention: appConfig.logRetention,
          availableModels: [...gptModelCatalog]
        },
        counts: {
          upstreams: state.upstreams.length,
          clientKeys: state.clientKeys.length,
          enabledUpstreams: state.upstreams.filter((item) => item.enabled).length,
          enabledClientKeys: state.clientKeys.filter((item) => item.enabled).length
        },
        upstreams: state.upstreams.map(sanitizeUpstream),
        clientKeys: state.clientKeys.map(sanitizeClientKey),
        logs: [...state.logs].reverse().slice(-60)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/upstreams/oauth/login-start", async (_req, res, next) => {
    try {
      const result = startOpenAIOAuthLogin(store);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/upstreams/oauth/code-relay", async (req, res, next) => {
    try {
      const payload = oauthRelaySchema.parse(req.body);
      const result = await relayOpenAIOAuthCallback(store, payload.callbackUrl);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/upstreams/test", async (req, res, next) => {
    try {
      const payload = upstreamCreateSchema.parse(req.body);
      const draftUpstream = createUpstream(payload);
      const result = await probeUpstream(
        store,
        draftUpstream,
        getRequestId(res),
        `Tested draft upstream ${draftUpstream.name}.`
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/upstreams", async (req, res, next) => {
    try {
      const payload = upstreamCreateSchema.parse(req.body);
      const upstream = createUpstream(payload);

      await store.mutate((state) => {
        state.upstreams.push(upstream);
        state.logs.unshift(
          adminLog(`Created upstream ${upstream.name}.`, {
            upstreamId: upstream.id,
            models: upstream.models
          })
        );
      });

      res.status(201).json({
        upstream: sanitizeUpstream(upstream)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/upstreams/import", async (req, res, next) => {
    try {
      const payload = z.array(upstreamCreateSchema).min(1).parse(req.body);
      const created = payload.map((item) => createUpstream(item));

      await store.mutate((state) => {
        state.upstreams.push(...created);
        state.logs.unshift(
          adminLog(`Imported ${created.length} upstream account(s).`, {
            upstreamIds: created.map((item) => item.id)
          })
        );
      });

      res.status(201).json({
        imported: created.map(sanitizeUpstream)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/upstreams/health-check", async (req, res, next) => {
    try {
      const payload = healthCheckSchema.parse(req.body ?? {});
      const state = await store.readState();
      const targetIds = payload.ids ?? null;
      const targets = targetIds
        ? targetIds
            .map((id) => state.upstreams.find((item) => item.id === id))
            .filter((item): item is UpstreamAccount => Boolean(item))
        : state.upstreams.filter((item) => item.enabled);

      const results: Array<{
        id: string;
        name: string;
        ok: boolean;
        skipped?: boolean;
        statusCode?: number;
        latencyMs?: number;
        models?: string[];
        error?: string;
      }> = [];
      let alive = 0;
      let dead = 0;
      let skipped = targetIds ? targetIds.filter((id) => !targets.some((item) => item.id === id)).length : 0;

      for (const upstream of targets) {
        if (!upstream.enabled) {
          skipped += 1;
          results.push({
            id: upstream.id,
            name: upstream.name,
            ok: false,
            skipped: true,
            error: "upstream_disabled"
          });
          continue;
        }

        const result = await probeUpstream(
          store,
          upstream,
          getRequestId(res),
          `Health checked upstream ${upstream.name}.`,
          { persistStatus: true }
        );
        if (result.ok) {
          alive += 1;
        } else {
          dead += 1;
        }
        results.push({
          id: upstream.id,
          name: upstream.name,
          ok: result.ok,
          statusCode: result.statusCode,
          latencyMs: result.latencyMs,
          models: result.models,
          error: result.error
        });
      }

      res.json({
        summary: { alive, dead, skipped },
        results
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/upstreams/:id/test", async (req, res, next) => {
    try {
      const state = await store.readState();
      const upstream = state.upstreams.find((item) => item.id === req.params.id);
      if (!upstream) {
        throw Object.assign(new Error("upstream_not_found"), { statusCode: 404 });
      }

      const result = await probeUpstream(
        store,
        upstream,
        getRequestId(res),
        `Tested upstream ${upstream.name}.`,
        { persistStatus: true }
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.put("/upstreams/:id", async (req, res, next) => {
    try {
      const payload = upstreamUpdateSchema.parse(req.body);
      const updated = await store.mutate((state) => {
        const upstream = state.upstreams.find((item) => item.id === req.params.id);
        if (!upstream) {
          throw Object.assign(new Error("upstream_not_found"), { statusCode: 404 });
        }
        if (payload.name !== undefined) upstream.name = payload.name.trim();
        if (payload.baseUrl !== undefined) upstream.baseUrl = payload.baseUrl.trim();
        if (payload.apiKey !== undefined) upstream.apiKey = payload.apiKey.trim();
        if (payload.models !== undefined) upstream.models = normalizeStringList(payload.models);
        if (payload.enabled !== undefined) upstream.enabled = payload.enabled;
        if (payload.weight !== undefined) upstream.weight = payload.weight;
        if (payload.headers !== undefined) upstream.headers = payload.headers;
        if (payload.note !== undefined) upstream.note = payload.note.trim();
        upstream.updatedAt = nowIso();
        state.logs.unshift(adminLog(`Updated upstream ${upstream.name}.`, { upstreamId: upstream.id }));
        return sanitizeUpstream(upstream);
      });

      res.json({ upstream: updated });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/upstreams/:id", async (req, res, next) => {
    try {
      await store.mutate((state) => {
        const target = state.upstreams.find((item) => item.id === req.params.id);
        state.upstreams = state.upstreams.filter((item) => item.id !== req.params.id);
        state.logs.unshift(
          adminLog(`Deleted upstream ${target?.name ?? req.params.id}.`, {
            upstreamId: req.params.id
          })
        );
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/client-keys", async (req, res, next) => {
    try {
      const payload = clientKeyCreateSchema.parse(req.body);
      const now = nowIso();
      const rawKey = createOpaqueKey("lah");
      const clientKey: ClientKey = {
        id: createId("ck"),
        name: payload.name.trim(),
        key: rawKey,
        allowedModels: normalizeStringList(payload.allowedModels),
        enabled: payload.enabled,
        quotaLimit: payload.quotaLimit,
        usedQuota: 0,
        requestsPerMinute: payload.requestsPerMinute,
        currentWindowStart: 0,
        currentWindowCount: 0,
        note: payload.note.trim(),
        createdAt: now,
        updatedAt: now
      };

      await store.mutate((state) => {
        state.clientKeys.push(clientKey);
        state.logs.unshift(
          adminLog(`Issued client key ${clientKey.name}.`, {
            clientKeyId: clientKey.id
          })
        );
      });

      res.status(201).json({
        clientKey: sanitizeClientKey(clientKey)
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/client-keys/:id", async (req, res, next) => {
    try {
      const payload = clientKeyUpdateSchema.parse(req.body);
      const updated = await store.mutate((state) => {
        const clientKey = state.clientKeys.find((item) => item.id === req.params.id);
        if (!clientKey) {
          throw Object.assign(new Error("client_key_not_found"), { statusCode: 404 });
        }
        if (payload.name !== undefined) clientKey.name = payload.name.trim();
        if (payload.allowedModels !== undefined) {
          clientKey.allowedModels = normalizeStringList(payload.allowedModels);
        }
        if (payload.enabled !== undefined) clientKey.enabled = payload.enabled;
        if (payload.quotaLimit !== undefined) clientKey.quotaLimit = payload.quotaLimit;
        if (payload.requestsPerMinute !== undefined) {
          clientKey.requestsPerMinute = payload.requestsPerMinute;
        }
        if (payload.note !== undefined) clientKey.note = payload.note.trim();
        clientKey.updatedAt = nowIso();
        state.logs.unshift(
          adminLog(`Updated client key ${clientKey.name}.`, {
            clientKeyId: clientKey.id
          })
        );
        return sanitizeClientKey(clientKey);
      });
      res.json({ clientKey: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post("/client-keys/:id/regenerate", async (req, res, next) => {
    try {
      const rawKey = createOpaqueKey("lah");
      const updated = await store.mutate((state) => {
        const clientKey = state.clientKeys.find((item) => item.id === req.params.id);
        if (!clientKey) {
          throw Object.assign(new Error("client_key_not_found"), { statusCode: 404 });
        }
        clientKey.key = rawKey;
        clientKey.updatedAt = nowIso();
        state.logs.unshift(
          adminLog(`Regenerated client key ${clientKey.name}.`, {
            clientKeyId: clientKey.id
          })
        );
        return sanitizeClientKey(clientKey);
      });
      res.json({
        clientKey: updated
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/client-keys/:id/ccswitch/open", async (req, res, next) => {
    try {
      const payload = ccSwitchOpenSchema.parse(req.body);
      const state = await store.readState();
      const clientKey = state.clientKeys.find((item) => item.id === req.params.id);
      if (!clientKey) {
        throw Object.assign(new Error("client_key_not_found"), { statusCode: 404 });
      }

      const launchInput = {
        app: payload.app,
        name: payload.name ?? `Local AI Hub ${payload.app}`,
        apiKey: clientKey.key,
        model: payload.model,
        haikuModel: payload.haikuModel?.trim() || undefined,
        sonnetModel: payload.sonnetModel?.trim() || undefined,
        opusModel: payload.opusModel?.trim() || undefined
      };
      const importUrl = buildCCSwitchImportUrl(launchInput);

      await store.mutate((draft) => {
        draft.logs.unshift(
          adminLog(`Opened CCSwitch import for ${clientKey.name}.`, {
            clientKeyId: clientKey.id,
            app: payload.app,
            model: payload.model
          })
        );
      });

      res.json({ success: true, importUrl });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/client-keys/:id", async (req, res, next) => {
    try {
      await store.mutate((state) => {
        const target = state.clientKeys.find((item) => item.id === req.params.id);
        state.clientKeys = state.clientKeys.filter((item) => item.id !== req.params.id);
        state.logs.unshift(
          adminLog(`Deleted client key ${target?.name ?? req.params.id}.`, {
            clientKeyId: req.params.id
          })
        );
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
