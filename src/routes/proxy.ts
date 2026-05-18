import express from "express";
import { expandModelPatterns } from "../model-catalog.js";
import { createId, extractBearerToken, nowIso } from "../services/keys.js";
import { anyPatternMatches } from "../services/matching.js";
import {
  forwardOpenAICompatibleRequest,
  forwardOpenAICompatibleStream,
  isRetryableUpstreamStatus,
  normalizeUpstreamErrorBody,
  type OpenAICompatibleEndpoint
} from "../services/openai-proxy.js";
import { createUnknownQuotaSnapshot, quotaSnapshotFromHeaders } from "../services/upstream-status.js";
import type { UpstreamSelector } from "../services/upstreams.js";
import type { FileStore } from "../store/file-store.js";
import type {
  AuditLogEntry,
  ClientKey,
  ForwardedResult,
  ProxyPreparation,
  UpstreamAccount
} from "../types.js";

const PASSTHROUGH_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "retry-after",
  "x-ratelimit-limit-requests",
  "x-ratelimit-remaining-requests",
  "x-ratelimit-reset-requests",
  "openai-processing-ms"
] as const;

interface ProxyAttemptSummary {
  upstreamId: string;
  upstreamName: string;
  statusCode: number;
  ok: boolean;
  upstreamModel?: string;
  error?: string;
}

class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

function proxyLog(
  prep: ProxyPreparation,
  statusCode: number,
  usageUnits: number,
  latencyMs: number,
  message: string,
  metadata?: Record<string, unknown>
): AuditLogEntry {
  return {
    id: createId("log"),
    timestamp: nowIso(),
    kind: "proxy",
    message,
    requestId: prep.requestId,
    clientKeyId: prep.clientKey.id,
    clientKeyName: prep.clientKey.name,
    upstreamId: prep.upstream.id,
    upstreamName: prep.upstream.name,
    model: prep.model,
    statusCode,
    usageUnits,
    latencyMs,
    metadata
  };
}

function prepareProxyRequest(
  clientKey: ClientKey,
  upstream: UpstreamAccount,
  model: string,
  requestId: string
): ProxyPreparation {
  return {
    requestId,
    model,
    clientKey: structuredClone(clientKey),
    upstream: structuredClone(upstream)
  };
}

async function selectPreparations(
  store: FileStore,
  selector: UpstreamSelector,
  bearerToken: string,
  model: string,
  requestId: string
): Promise<ProxyPreparation[]> {
  return store.mutate((state) => {
    const clientKey = state.clientKeys.find((item) => item.key === bearerToken);
    if (!clientKey) {
      throw new HttpError("Local API key is invalid.", 401);
    }
    if (!clientKey.enabled) {
      throw new HttpError("Local API key is disabled.", 403);
    }
    if (!anyPatternMatches(clientKey.allowedModels, model)) {
      throw new HttpError(`Model ${model} is not allowed for this local key.`, 403);
    }
    if (clientKey.quotaLimit !== null && clientKey.usedQuota >= clientKey.quotaLimit) {
      throw new HttpError("Quota limit reached for this local key.", 403);
    }

    const candidates = selector.pickSequence(state.upstreams, model);
    if (candidates.length === 0) {
      throw new HttpError(`No enabled upstream supports model ${model}.`, 503);
    }

    const windowStart = Math.floor(Date.now() / 60000) * 60000;
    if (clientKey.currentWindowStart !== windowStart) {
      clientKey.currentWindowStart = windowStart;
      clientKey.currentWindowCount = 0;
    }
    if (clientKey.currentWindowCount >= clientKey.requestsPerMinute) {
      throw new HttpError("Per-minute request limit exceeded for this local key.", 429);
    }
    clientKey.currentWindowCount += 1;
    clientKey.updatedAt = nowIso();

    return candidates.map((upstream) => prepareProxyRequest(clientKey, upstream, model, requestId));
  });
}

function appendAttempts(metadata: ProxyAttemptSummary[]): Record<string, unknown> {
  return {
    attempts: metadata,
    attemptCount: metadata.length,
    failoverCount: Math.max(0, metadata.length - 1)
  };
}

function applyPassthroughHeaders(
  res: express.Response,
  forwarded: { responseHeaders: Record<string, string> }
): void {
  for (const headerName of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = forwarded.responseHeaders[headerName];
    if (typeof value === "string" && value) {
      res.setHeader(headerName, value);
    }
  }
}

function upstreamFailureMessage(model: string, attempts: ProxyAttemptSummary[]): string {
  if (attempts.length <= 1) {
    return `Upstream request failed for ${model}.`;
  }
  return `All ${attempts.length} upstream attempts failed for ${model}.`;
}

function buildNetworkErrorResponse(attempts: ProxyAttemptSummary[]) {
  const detail = attempts.at(-1)?.error;
  return {
    error: {
      message: detail
        ? `Upstream request failed after failover attempts. Last error: ${detail}`
        : "Upstream request failed after failover attempts.",
      type: "upstream_error"
    }
  };
}

async function readStreamBody(body: ReadableStream<Uint8Array> | null): Promise<unknown> {
  if (!body) {
    return {};
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
    }
  }

  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  try {
    return raw ? (JSON.parse(raw) as unknown) : {};
  } catch {
    return raw ? { raw } : {};
  }
}

async function pipeWebStreamToResponse(
  body: ReadableStream<Uint8Array> | null,
  res: express.Response
): Promise<void> {
  if (!body) {
    res.end();
    return;
  }

  const reader = body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value && value.byteLength > 0) {
      res.write(Buffer.from(value));
    }
  }
  res.end();
}

async function recordSuccessfulProxy(
  store: FileStore,
  prep: ProxyPreparation,
  forwarded: ForwardedResult,
  model: string,
  latencyMs: number,
  attempts: ProxyAttemptSummary[]
): Promise<void> {
  await store.mutate((state) => {
    const completedAt = nowIso();
    const key = state.clientKeys.find((item) => item.id === prep.clientKey.id);
    if (key) {
      key.usedQuota += forwarded.usageUnits;
      key.updatedAt = completedAt;
    }

    const upstream = state.upstreams.find((item) => item.id === prep.upstream.id);
    if (upstream) {
      upstream.requestCount = (upstream.requestCount ?? 0) + 1;
      upstream.usedQuota = (upstream.usedQuota ?? 0) + forwarded.usageUnits;
      upstream.lastUsedAt = completedAt;
      upstream.quota =
        quotaSnapshotFromHeaders(forwarded.responseHeaders, completedAt) ??
        upstream.quota ??
        createUnknownQuotaSnapshot(completedAt);
      upstream.updatedAt = completedAt;
    }

    state.logs.unshift(
      proxyLog(
        prep,
        forwarded.statusCode,
        forwarded.usageUnits,
        latencyMs,
        attempts.length > 1
          ? `Forwarded ${model} through ${prep.upstream.name} after ${attempts.length - 1} failed upstream attempt(s).`
          : `Forwarded ${model} through ${prep.upstream.name}.`,
        {
          upstreamModel: forwarded.upstreamModel,
          ...appendAttempts(attempts)
        }
      )
    );
  });
}

async function handleOpenAICompatibleStream(
  store: FileStore,
  endpoint: OpenAICompatibleEndpoint,
  preparations: ProxyPreparation[],
  model: string,
  requestId: string,
  body: Record<string, unknown>,
  startedAt: number,
  res: express.Response
): Promise<void> {
  const attempts: ProxyAttemptSummary[] = [];
  let terminalResult: { prep: ProxyPreparation; forwarded: ForwardedResult } | null = null;

  for (let index = 0; index < preparations.length; index += 1) {
    const prep = preparations[index];
    const hasFallback = index < preparations.length - 1;

    try {
      const forwarded = await forwardOpenAICompatibleStream(prep.upstream, endpoint, body, { requestId });
      attempts.push({
        upstreamId: prep.upstream.id,
        upstreamName: prep.upstream.name,
        statusCode: forwarded.statusCode,
        ok: forwarded.statusCode < 400
      });

      if (forwarded.statusCode < 400) {
        const latencyMs = Date.now() - startedAt;
        applyPassthroughHeaders(res, forwarded);
        res.status(forwarded.statusCode);
        await pipeWebStreamToResponse(forwarded.body, res);
        await recordSuccessfulProxy(
          store,
          prep,
          {
            statusCode: forwarded.statusCode,
            responseHeaders: forwarded.responseHeaders,
            body: {},
            usageUnits: 1
          },
          model,
          latencyMs,
          attempts
        );
        return;
      }

      const errorBody = await readStreamBody(forwarded.body);
      terminalResult = {
        prep,
        forwarded: {
          statusCode: forwarded.statusCode,
          responseHeaders: forwarded.responseHeaders,
          body: errorBody,
          usageUnits: 0
        }
      };
      if (hasFallback && isRetryableUpstreamStatus(forwarded.statusCode)) {
        continue;
      }
      break;
    } catch (error) {
      attempts.push({
        upstreamId: prep.upstream.id,
        upstreamName: prep.upstream.name,
        statusCode: 502,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown upstream error"
      });

      if (!hasFallback) {
        terminalResult = null;
      }
    }
  }

  const latencyMs = Date.now() - startedAt;

  if (terminalResult) {
    await store.mutate((state) => {
      state.logs.unshift(
        proxyLog(
          terminalResult.prep,
          terminalResult.forwarded.statusCode,
          0,
          latencyMs,
          upstreamFailureMessage(model, attempts),
          appendAttempts(attempts)
        )
      );
    });

    applyPassthroughHeaders(res, terminalResult.forwarded);
    res.status(terminalResult.forwarded.statusCode).json(
      normalizeUpstreamErrorBody(
        terminalResult.forwarded.body,
        `Upstream ${terminalResult.prep.upstream.name} returned status ${terminalResult.forwarded.statusCode}.`
      )
    );
    return;
  }

  const lastAttempt = preparations.at(-1);
  if (lastAttempt) {
    await store.mutate((state) => {
      state.logs.unshift(
        proxyLog(lastAttempt, 502, 0, latencyMs, upstreamFailureMessage(model, attempts), appendAttempts(attempts))
      );
    });
  }

  res.status(502).json(buildNetworkErrorResponse(attempts));
}

async function handleOpenAICompatiblePost(
  store: FileStore,
  selector: UpstreamSelector,
  endpoint: OpenAICompatibleEndpoint,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
    const startedAt = Date.now();
    const requestId =
      typeof res.locals.requestId === "string" ? res.locals.requestId : createId("req");
    const bearerToken = extractBearerToken(req);
    if (!bearerToken) {
      res.status(401).json({
        error: {
          message: "Missing local API key in Authorization header.",
          type: "invalid_request_error"
        }
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== "object") {
      res.status(400).json({
        error: {
          message: "Request body must be JSON.",
          type: "invalid_request_error"
        }
      });
      return;
    }

    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (!model) {
      res.status(400).json({
        error: {
          message: "Request body must include a model name.",
          type: "invalid_request_error"
        }
      });
      return;
    }

    let preparations: ProxyPreparation[];
    try {
      preparations = await selectPreparations(store, selector, bearerToken, model, requestId);
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.statusCode).json({
          error: {
            message: error.message,
            type: "proxy_guard_error"
          }
        });
        return;
      }
      next(error);
      return;
    }

    if (body.stream === true) {
      await handleOpenAICompatibleStream(store, endpoint, preparations, model, requestId, body, startedAt, res);
      return;
    }

    const attempts: ProxyAttemptSummary[] = [];
    let successfulResult: { prep: ProxyPreparation; forwarded: ForwardedResult } | null = null;
    let terminalResult: { prep: ProxyPreparation; forwarded: ForwardedResult } | null = null;

    for (let index = 0; index < preparations.length; index += 1) {
      const prep = preparations[index];
      const hasFallback = index < preparations.length - 1;

      try {
        const forwarded = await forwardOpenAICompatibleRequest(prep.upstream, endpoint, body, { requestId });
        attempts.push({
          upstreamId: prep.upstream.id,
          upstreamName: prep.upstream.name,
          statusCode: forwarded.statusCode,
          ok: forwarded.statusCode < 400,
          upstreamModel: forwarded.upstreamModel
        });

        if (forwarded.statusCode < 400) {
          successfulResult = { prep, forwarded };
          break;
        }

        terminalResult = { prep, forwarded };
        if (hasFallback && isRetryableUpstreamStatus(forwarded.statusCode)) {
          continue;
        }
        break;
      } catch (error) {
        attempts.push({
          upstreamId: prep.upstream.id,
          upstreamName: prep.upstream.name,
          statusCode: 502,
          ok: false,
          error: error instanceof Error ? error.message : "Unknown upstream error"
        });

        if (!hasFallback) {
          terminalResult = null;
        }
      }
    }

    const latencyMs = Date.now() - startedAt;

    if (successfulResult) {
      await recordSuccessfulProxy(
        store,
        successfulResult.prep,
        successfulResult.forwarded,
        model,
        latencyMs,
        attempts
      );

      applyPassthroughHeaders(res, successfulResult.forwarded);
      res.status(successfulResult.forwarded.statusCode).json(successfulResult.forwarded.body);
      return;
    }

    if (terminalResult) {
      await store.mutate((state) => {
        state.logs.unshift(
          proxyLog(
            terminalResult.prep,
            terminalResult.forwarded.statusCode,
            0,
            latencyMs,
            upstreamFailureMessage(model, attempts),
            {
              upstreamModel: terminalResult.forwarded.upstreamModel,
              ...appendAttempts(attempts)
            }
          )
        );
      });

      applyPassthroughHeaders(res, terminalResult.forwarded);
      res.status(terminalResult.forwarded.statusCode).json(
        normalizeUpstreamErrorBody(
          terminalResult.forwarded.body,
          `Upstream ${terminalResult.prep.upstream.name} returned status ${terminalResult.forwarded.statusCode}.`
        )
      );
      return;
    }

    const lastAttempt = preparations.at(-1);
    if (lastAttempt) {
      await store.mutate((state) => {
        state.logs.unshift(
          proxyLog(lastAttempt, 502, 0, latencyMs, upstreamFailureMessage(model, attempts), appendAttempts(attempts))
        );
      });
    }

    res.status(502).json(buildNetworkErrorResponse(attempts));
}

export function createProxyRouter(store: FileStore, selector: UpstreamSelector): express.Router {
  const router = express.Router();

  router.get("/v1/models", async (_req, res, next) => {
    try {
      const state = await store.readState();
      const models = new Set<string>();
      for (const upstream of state.upstreams) {
        if (!upstream.enabled || upstream.provider !== "openai-compatible") {
          continue;
        }
        const upstreamModels = upstream.discoveredModels?.length ? upstream.discoveredModels : upstream.models;
        for (const model of expandModelPatterns(upstreamModels)) {
          models.add(model);
        }
      }
      res.json({
        object: "list",
        data: [...models].sort().map((model) => ({
          id: model,
          object: "model",
          owned_by: "local-ai-hub"
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/chat/completions", (req, res, next) => {
    void handleOpenAICompatiblePost(store, selector, "/v1/chat/completions", req, res, next).catch(next);
  });

  router.post("/v1/responses", (req, res, next) => {
    void handleOpenAICompatiblePost(store, selector, "/v1/responses", req, res, next).catch(next);
  });

  return router;
}
