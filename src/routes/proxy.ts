import express from "express";
import { codexModelCatalog, expandModelPatterns, resolveCodexModel } from "../model-catalog.js";
import {
  collectCodexResponse,
  forwardCodexResponse,
  readStreamText,
  streamResultToResponse
} from "../services/codex-backend.js";
import {
  classifyCodexError,
  classifyNetworkError,
  isClassifiedRetryable,
  type ClassifiedCodexError
} from "../services/codex-errors.js";
import {
  anthropicToCodexRequest,
  chatCompletionToCodexRequest,
  codexToAnthropicBody,
  codexToChatCompletionBody,
  codexToResponsesBody,
  responsesToCodexRequest,
  streamCodexToAnthropicSSE,
  streamCodexToChatCompletionSSE
} from "../services/codex-translation.js";
import { createId, extractLocalApiKey, nowIso } from "../services/keys.js";
import { anyPatternMatches } from "../services/matching.js";
import { ensureFreshOAuthUpstream } from "../services/openai-oauth.js";
import {
  forwardOpenAICompatibleRequest,
  forwardOpenAICompatibleStream,
  isRetryableUpstreamStatus,
  normalizeUpstreamErrorBody,
  type OpenAICompatibleEndpoint
} from "../services/openai-proxy.js";
import { createUnknownQuotaSnapshot, quotaSnapshotFromHeaders } from "../services/upstream-status.js";
import { applyRecordedUsage, extractTokenUsage, usageUnitsFromDetails } from "../services/usage.js";
import type { UsageStatsStore } from "../services/usage-stats.js";
import type { UpstreamSelector } from "../services/upstreams.js";
import type { FileStore } from "../store/file-store.js";
import type {
  AuditLogEntry,
  ClientKey,
  ForwardedResult,
  ProxyPreparation,
  TokenUsageDetails,
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
  errorCategory?: string;
  retryable?: boolean;
}

class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    const resolvedModel = resolveCodexModel(model);
    if (!anyPatternMatches(clientKey.allowedModels, model) && !anyPatternMatches(clientKey.allowedModels, resolvedModel)) {
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

async function recordFailedUpstream(
  store: FileStore,
  prep: ProxyPreparation,
  error: ClassifiedCodexError
): Promise<void> {
  await store.mutate((state) => {
    const upstream = state.upstreams.find((item) => item.id === prep.upstream.id);
    if (!upstream) {
      return;
    }

    const now = nowIso();
    upstream.consecutiveFailures = (upstream.consecutiveFailures ?? 0) + 1;
    upstream.lastErrorCategory = error.category;
    upstream.lastProbeOk = false;
    upstream.lastProbeStatusCode = error.statusCode || null;
    upstream.lastProbeError = error.message;
    upstream.updatedAt = now;

    if (error.cooldownMs > 0) {
      const scaledCooldown = error.cooldownMs * Math.max(1, Math.min(5, upstream.consecutiveFailures));
      upstream.cooldownUntil = new Date(Date.now() + scaledCooldown).toISOString();
    }

    if (error.category === "quota" || error.category === "rate_limit") {
      upstream.quota = {
        supported: true,
        status: "limited",
        source: "provider-api",
        message: error.message,
        fetchedAt: now,
        limitRequests: null,
        remainingRequests: 0,
        usedPercent: 100,
        resetRequests: upstream.cooldownUntil ?? null
      };
    }
  });
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

function usageFromSseBlock(block: string): TokenUsageDetails | undefined {
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  const raw = dataLines.join("\n").trim();
  if (!raw || raw === "[DONE]") {
    return undefined;
  }

  try {
    return extractTokenUsage(JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

function collectUsageFromStreamText(
  text: string,
  onUsage: (usage: TokenUsageDetails) => void,
  flush = false
): string {
  let buffer = text;
  while (true) {
    const separator = buffer.indexOf("\n\n");
    if (separator < 0) {
      break;
    }
    const block = buffer.slice(0, separator);
    buffer = buffer.slice(separator + 2);
    const usage = usageFromSseBlock(block);
    if (usage) {
      onUsage(usage);
    }
  }

  if (flush && buffer.trim()) {
    const usage = usageFromSseBlock(buffer);
    if (usage) {
      onUsage(usage);
    }
    return "";
  }

  return buffer;
}

async function pipeWebStreamToResponse(
  body: ReadableStream<Uint8Array> | null,
  res: express.Response,
  onUsage?: (usage: TokenUsageDetails) => void
): Promise<void> {
  if (!body) {
    res.end();
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value && value.byteLength > 0) {
      if (onUsage) {
        sseBuffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        sseBuffer = collectUsageFromStreamText(sseBuffer, onUsage);
      }
      res.write(Buffer.from(value));
    }
  }
  if (onUsage) {
    sseBuffer += decoder.decode().replace(/\r\n/g, "\n");
    collectUsageFromStreamText(sseBuffer, onUsage, true);
  }
  res.end();
}

async function writeTextChunksToResponse(chunks: AsyncGenerator<string>, res: express.Response): Promise<void> {
  for await (const chunk of chunks) {
    res.write(chunk);
  }
  res.end();
}

async function freshenOAuthPreparation(store: FileStore, prep: ProxyPreparation): Promise<ProxyPreparation> {
  if (prep.upstream.provider !== "openai-oauth") {
    return prep;
  }
  const upstream = await ensureFreshOAuthUpstream(store, prep.upstream);
  return {
    ...prep,
    upstream
  };
}

function codexRequestForOpenAIEndpoint(
  endpoint: OpenAICompatibleEndpoint,
  body: Record<string, unknown>
): Record<string, unknown> {
  return endpoint === "/v1/chat/completions"
    ? (chatCompletionToCodexRequest(body) as unknown as Record<string, unknown>)
    : (responsesToCodexRequest(body) as unknown as Record<string, unknown>);
}

function openAIEndpointBodyFromCodex(
  endpoint: OpenAICompatibleEndpoint,
  collected: Awaited<ReturnType<typeof collectCodexResponse>>,
  requestedModel: string
): Record<string, unknown> {
  return endpoint === "/v1/chat/completions"
    ? codexToChatCompletionBody(collected, requestedModel)
    : codexToResponsesBody(collected, requestedModel);
}

async function forwardProviderRequest(
  store: FileStore,
  prep: ProxyPreparation,
  endpoint: OpenAICompatibleEndpoint,
  body: Record<string, unknown>,
  requestId: string
): Promise<{ prep: ProxyPreparation; forwarded: ForwardedResult }> {
  const activePrep = await freshenOAuthPreparation(store, prep);
  if (activePrep.upstream.provider !== "openai-oauth") {
    return {
      prep: activePrep,
      forwarded: await forwardOpenAICompatibleRequest(activePrep.upstream, endpoint, body, { requestId })
    };
  }

  const codexRequest = codexRequestForOpenAIEndpoint(endpoint, body);
  const forwardedStream = await forwardCodexResponse(activePrep.upstream, codexRequest, { requestId });
  if (forwardedStream.statusCode >= 400) {
    const errorBody = await readStreamBody(forwardedStream.body);
    const classified = classifyCodexError(forwardedStream.statusCode, errorBody);
    return {
      prep: activePrep,
      forwarded: {
        statusCode: forwardedStream.statusCode,
        responseHeaders: forwardedStream.responseHeaders,
        body: errorBody,
        usageUnits: 0,
        upstreamModel: typeof codexRequest.model === "string" ? codexRequest.model : undefined,
        errorCategory: classified.category,
        retryable: classified.retryable
      }
    };
  }

  const collected = await collectCodexResponse(streamResultToResponse(forwardedStream));
  return {
    prep: activePrep,
    forwarded: {
      statusCode: forwardedStream.statusCode,
      responseHeaders: forwardedStream.responseHeaders,
      body: openAIEndpointBodyFromCodex(endpoint, collected, resolveCodexModel(String(body.model))),
      usageUnits: collected.usageUnits,
      usage: collected.usage,
      upstreamModel: typeof codexRequest.model === "string" ? codexRequest.model : undefined
    }
  };
}

async function recordSuccessfulProxy(
  store: FileStore,
  usageStats: UsageStatsStore,
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
      applyRecordedUsage(upstream, forwarded.usage, forwarded.usageUnits, completedAt);
      upstream.consecutiveFailures = 0;
      upstream.cooldownUntil = null;
      upstream.lastErrorCategory = null;
      upstream.lastProbeOk = true;
      upstream.lastProbeError = null;
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
          ...(forwarded.usage ? { usage: forwarded.usage } : {}),
          ...appendAttempts(attempts)
        }
      )
    );

    usageStats.recordSnapshot(state);
  });
}

async function handleOpenAICompatibleStream(
  store: FileStore,
  usageStats: UsageStatsStore,
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
    let prep = preparations[index];
    const hasFallback = index < preparations.length - 1;

    try {
      prep = await freshenOAuthPreparation(store, prep);
      const forwarded =
        prep.upstream.provider === "openai-oauth"
          ? await forwardCodexResponse(prep.upstream, codexRequestForOpenAIEndpoint(endpoint, body), { requestId })
          : await forwardOpenAICompatibleStream(prep.upstream, endpoint, body, { requestId });
      const classified = forwarded.statusCode >= 400 ? classifyCodexError(forwarded.statusCode, null) : null;
      attempts.push({
        upstreamId: prep.upstream.id,
        upstreamName: prep.upstream.name,
        statusCode: forwarded.statusCode,
        ok: forwarded.statusCode < 400,
        errorCategory: classified?.category,
        retryable: classified?.retryable
      });

      if (forwarded.statusCode < 400) {
        const latencyMs = Date.now() - startedAt;
        let streamUsage: TokenUsageDetails | undefined;
        const captureUsage = (usage: TokenUsageDetails) => {
          streamUsage = usage;
        };
        applyPassthroughHeaders(res, forwarded);
        res.status(forwarded.statusCode);
        if (prep.upstream.provider === "openai-oauth" && endpoint === "/v1/chat/completions") {
          res.setHeader("content-type", "text/event-stream; charset=utf-8");
          await writeTextChunksToResponse(
            streamCodexToChatCompletionSSE(streamResultToResponse(forwarded), resolveCodexModel(model), {
              onUsage: captureUsage
            }),
            res
          );
        } else {
          await pipeWebStreamToResponse(forwarded.body, res, captureUsage);
        }
        await recordSuccessfulProxy(
          store,
          usageStats,
          prep,
          {
            statusCode: forwarded.statusCode,
            responseHeaders: forwarded.responseHeaders,
            body: {},
            usageUnits: usageUnitsFromDetails(streamUsage),
            ...(streamUsage ? { usage: streamUsage } : {})
          },
          model,
          latencyMs,
          attempts
        );
        return;
      }

      const errorBody = await readStreamBody(forwarded.body);
      const errorInfo = classifyCodexError(forwarded.statusCode, errorBody);
      await recordFailedUpstream(store, prep, errorInfo);
      terminalResult = {
        prep,
        forwarded: {
          statusCode: forwarded.statusCode,
          responseHeaders: forwarded.responseHeaders,
          body: errorBody,
          usageUnits: 0,
          errorCategory: errorInfo.category,
          retryable: errorInfo.retryable
        }
      };
      if (hasFallback && (isClassifiedRetryable(errorInfo) || isRetryableUpstreamStatus(forwarded.statusCode))) {
        continue;
      }
      break;
    } catch (error) {
      const errorInfo = classifyNetworkError(error);
      await recordFailedUpstream(store, prep, errorInfo);
      attempts.push({
        upstreamId: prep.upstream.id,
        upstreamName: prep.upstream.name,
        statusCode: 502,
        ok: false,
        error: errorInfo.message,
        errorCategory: errorInfo.category,
        retryable: errorInfo.retryable
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
  usageStats: UsageStatsStore,
  selector: UpstreamSelector,
  endpoint: OpenAICompatibleEndpoint,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
    const startedAt = Date.now();
    const requestId =
      typeof res.locals.requestId === "string" ? res.locals.requestId : createId("req");
    const localApiKey = extractLocalApiKey(req);
    if (!localApiKey) {
      res.status(401).json({
        error: {
          message: "Missing local API key in Authorization Bearer or x-api-key header.",
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
      preparations = await selectPreparations(store, selector, localApiKey, model, requestId);
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
      await handleOpenAICompatibleStream(store, usageStats, endpoint, preparations, model, requestId, body, startedAt, res);
      return;
    }

    const attempts: ProxyAttemptSummary[] = [];
    let successfulResult: { prep: ProxyPreparation; forwarded: ForwardedResult } | null = null;
    let terminalResult: { prep: ProxyPreparation; forwarded: ForwardedResult } | null = null;

    for (let index = 0; index < preparations.length; index += 1) {
      const prep = preparations[index];
      const hasFallback = index < preparations.length - 1;

      try {
        const result = await forwardProviderRequest(store, prep, endpoint, body, requestId);
        const { forwarded } = result;
        attempts.push({
          upstreamId: result.prep.upstream.id,
          upstreamName: result.prep.upstream.name,
          statusCode: forwarded.statusCode,
          ok: forwarded.statusCode < 400,
          upstreamModel: forwarded.upstreamModel,
          errorCategory: forwarded.errorCategory,
          retryable: forwarded.retryable
        });

        if (forwarded.statusCode < 400) {
          successfulResult = result;
          break;
        }

        const errorInfo = classifyCodexError(forwarded.statusCode, forwarded.body);
        await recordFailedUpstream(store, result.prep, errorInfo);
        terminalResult = result;
        if (hasFallback && (isClassifiedRetryable(errorInfo) || isRetryableUpstreamStatus(forwarded.statusCode))) {
          continue;
        }
        break;
      } catch (error) {
        const errorInfo = classifyNetworkError(error);
        await recordFailedUpstream(store, prep, errorInfo);
        attempts.push({
          upstreamId: prep.upstream.id,
          upstreamName: prep.upstream.name,
          statusCode: 502,
          ok: false,
          error: errorInfo.message,
          errorCategory: errorInfo.category,
          retryable: errorInfo.retryable
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
        usageStats,
        successfulResult.prep,
        successfulResult.forwarded,
        model,
        latencyMs,
        attempts
      );

      applyPassthroughHeaders(res, successfulResult.forwarded);
      res.setHeader("content-type", "application/json; charset=utf-8");
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
      res.setHeader("content-type", "application/json; charset=utf-8");
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

function anthropicError(type: string, message: string): Record<string, unknown> {
  return {
    type: "error",
    error: {
      type,
      message
    }
  };
}

async function handleAnthropicMessagesPost(
  store: FileStore,
  usageStats: UsageStatsStore,
  selector: UpstreamSelector,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const startedAt = Date.now();
  const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : createId("req");
  const localApiKey = extractLocalApiKey(req);
  if (!localApiKey) {
    res.status(401).json(anthropicError("authentication_error", "Missing local API key."));
    return;
  }

  const body = req.body as Record<string, unknown>;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json(anthropicError("invalid_request_error", "Request body must be JSON."));
    return;
  }

  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) {
    res.status(400).json(anthropicError("invalid_request_error", "Request body must include a model name."));
    return;
  }
  if (!Array.isArray(body.messages)) {
    res.status(400).json(anthropicError("invalid_request_error", "Request body must include messages."));
    return;
  }

  let preparations: ProxyPreparation[];
  try {
    preparations = await selectPreparations(store, selector, localApiKey, model, requestId);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.statusCode).json(anthropicError("api_error", error.message));
      return;
    }
    next(error);
    return;
  }

  const attempts: ProxyAttemptSummary[] = [];
  let terminalResult: { prep: ProxyPreparation; statusCode: number; body: unknown; headers: Record<string, string> } | null =
    null;
  const wantThinking =
    isRecord(body.thinking) && (body.thinking.type === "enabled" || body.thinking.type === "adaptive");

  for (let index = 0; index < preparations.length; index += 1) {
    let prep = preparations[index];
    const hasFallback = index < preparations.length - 1;

    try {
      prep = await freshenOAuthPreparation(store, prep);
      if (prep.upstream.provider !== "openai-oauth") {
        attempts.push({
          upstreamId: prep.upstream.id,
          upstreamName: prep.upstream.name,
          statusCode: 503,
          ok: false,
          error: "/v1/messages requires an OpenAI OAuth Codex upstream."
        });
        if (hasFallback) {
          continue;
        }
        terminalResult = {
          prep,
          statusCode: 503,
          body: anthropicError("api_error", "/v1/messages requires an OpenAI OAuth Codex upstream."),
          headers: {}
        };
        break;
      }

      const codexRequest = anthropicToCodexRequest(
        body as unknown as Parameters<typeof anthropicToCodexRequest>[0]
      );
      const forwarded = await forwardCodexResponse(prep.upstream, codexRequest, { requestId });
      const classified = forwarded.statusCode >= 400 ? classifyCodexError(forwarded.statusCode, null) : null;
      attempts.push({
        upstreamId: prep.upstream.id,
        upstreamName: prep.upstream.name,
        statusCode: forwarded.statusCode,
        ok: forwarded.statusCode < 400,
        upstreamModel: codexRequest.model,
        errorCategory: classified?.category,
        retryable: classified?.retryable
      });

      if (forwarded.statusCode < 400) {
        const latencyMs = Date.now() - startedAt;
        applyPassthroughHeaders(res, forwarded);

        if (body.stream === true) {
          let streamUsage: TokenUsageDetails | undefined;
          res.status(forwarded.statusCode);
          res.setHeader("content-type", "text/event-stream; charset=utf-8");
          await writeTextChunksToResponse(
            streamCodexToAnthropicSSE(streamResultToResponse(forwarded), resolveCodexModel(model), wantThinking, {
              onUsage: (usage) => {
                streamUsage = usage;
              }
            }),
            res
          );
          await recordSuccessfulProxy(
            store,
            usageStats,
            prep,
            {
              statusCode: forwarded.statusCode,
              responseHeaders: forwarded.responseHeaders,
              body: {},
              usageUnits: usageUnitsFromDetails(streamUsage),
              ...(streamUsage ? { usage: streamUsage } : {}),
              upstreamModel: codexRequest.model
            },
            model,
            latencyMs,
            attempts
          );
          return;
        }

        const collected = await collectCodexResponse(streamResultToResponse(forwarded));
        const responseBody = codexToAnthropicBody(collected, resolveCodexModel(model), wantThinking);
        await recordSuccessfulProxy(
          store,
          usageStats,
          prep,
          {
            statusCode: forwarded.statusCode,
            responseHeaders: forwarded.responseHeaders,
            body: responseBody,
            usageUnits: collected.usageUnits,
            usage: collected.usage,
            upstreamModel: codexRequest.model
          },
          model,
          latencyMs,
          attempts
        );
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.status(forwarded.statusCode).json(responseBody);
        return;
      }

      const errorText = await readStreamText(forwarded.body);
      const errorInfo = classifyCodexError(forwarded.statusCode, errorText);
      await recordFailedUpstream(store, prep, errorInfo);
      terminalResult = {
        prep,
        statusCode: forwarded.statusCode,
        body: anthropicError("api_error", errorText || `Codex upstream returned HTTP ${forwarded.statusCode}.`),
        headers: forwarded.responseHeaders
      };
      if (hasFallback && (isClassifiedRetryable(errorInfo) || isRetryableUpstreamStatus(forwarded.statusCode))) {
        continue;
      }
      break;
    } catch (error) {
      const errorInfo = classifyNetworkError(error);
      await recordFailedUpstream(store, prep, errorInfo);
      attempts.push({
        upstreamId: prep.upstream.id,
        upstreamName: prep.upstream.name,
        statusCode: 502,
        ok: false,
        error: errorInfo.message,
        errorCategory: errorInfo.category,
        retryable: errorInfo.retryable
      });

      if (!hasFallback) {
        terminalResult = {
          prep,
          statusCode: 502,
          body: anthropicError("api_error", error instanceof Error ? error.message : "Unknown upstream error"),
          headers: {}
        };
      }
    }
  }

  const latencyMs = Date.now() - startedAt;
  const terminalPrep = terminalResult?.prep ?? preparations.at(-1);
  if (terminalPrep) {
    await store.mutate((state) => {
      state.logs.unshift(
        proxyLog(
          terminalPrep,
          terminalResult?.statusCode ?? 502,
          0,
          latencyMs,
          upstreamFailureMessage(model, attempts),
          appendAttempts(attempts)
        )
      );
    });
  }

  if (terminalResult) {
    applyPassthroughHeaders(res, { responseHeaders: terminalResult.headers });
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(terminalResult.statusCode).json(terminalResult.body);
    return;
  }

  res.status(502).json(anthropicError("api_error", buildNetworkErrorResponse(attempts).error.message));
}

export function createProxyRouter(
  store: FileStore,
  selector: UpstreamSelector,
  usageStats: UsageStatsStore
): express.Router {
  const router = express.Router();

  router.get("/v1/models", async (_req, res, next) => {
    try {
      const state = await store.readState();
      const models = new Set<string>();
      for (const upstream of state.upstreams) {
        if (!upstream.enabled) {
          continue;
        }
        const upstreamModels = upstream.discoveredModels?.length ? upstream.discoveredModels : upstream.models;
        const modelPatterns =
          upstream.provider === "openai-oauth" && upstreamModels.includes("codex")
            ? [...codexModelCatalog]
            : upstreamModels;
        for (const model of expandModelPatterns(modelPatterns)) {
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
    void handleOpenAICompatiblePost(store, usageStats, selector, "/v1/chat/completions", req, res, next).catch(next);
  });

  router.post("/v1/responses", (req, res, next) => {
    void handleOpenAICompatiblePost(store, usageStats, selector, "/v1/responses", req, res, next).catch(next);
  });

  router.post("/v1/messages", (req, res, next) => {
    void handleAnthropicMessagesPost(store, usageStats, selector, req, res, next).catch(next);
  });

  return router;
}
