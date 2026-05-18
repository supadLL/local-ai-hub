import crypto from "node:crypto";
import { codexModelCatalog } from "../model-catalog.js";
import type { UpstreamQuotaSnapshot, UpstreamAccount } from "../types.js";
import type { ForwardOpenAIOptions, ForwardedStreamResult, UpstreamProbeResult } from "./openai-proxy.js";

const CODEX_CLIENT_VERSION = process.env.CODEX_CLIENT_VERSION || "26.506.31421";
const CODEX_ORIGINATOR = process.env.CODEX_ORIGINATOR || "Codex Desktop";
const CODEX_PLATFORM = process.env.CODEX_PLATFORM || "darwin";
const CODEX_ARCH = process.env.CODEX_ARCH || "arm64";
const CODEX_CHROMIUM_VERSION = process.env.CODEX_CHROMIUM_VERSION || "146";
const CODEX_INSTALLATION_ID = process.env.CODEX_INSTALLATION_ID || crypto.randomUUID();

export interface CodexUsageInfo {
  input_tokens: number;
  output_tokens: number;
  total_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
}

export interface CodexFunctionCall {
  callId: string;
  name: string;
  arguments: string;
}

export interface CodexCollectedResponse {
  responseId: string | null;
  text: string;
  reasoning: string;
  usage: CodexUsageInfo;
  usageUnits: number;
  functionCalls: CodexFunctionCall[];
}

export interface CodexExtractedEvent {
  type: string;
  responseId?: string;
  textDelta?: string;
  reasoningDelta?: string;
  usage?: CodexUsageInfo;
  error?: string;
  functionCallStart?: {
    callId: string;
    name: string;
  };
  functionCallDelta?: {
    callId: string;
    delta: string;
  };
  functionCallDone?: CodexFunctionCall;
}

interface CodexSSEEvent {
  event: string;
  data: unknown;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractChatGptAccountId(token: string): string | null {
  const payload = decodeJwtPayload(token);
  const auth = payload?.["https://api.openai.com/auth"];
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) {
    return null;
  }
  const accountId = (auth as Record<string, unknown>).chatgpt_account_id;
  return typeof accountId === "string" && accountId.trim() ? accountId : null;
}

function buildUserAgent(): string {
  return `Codex Desktop/${CODEX_CLIENT_VERSION} (${CODEX_PLATFORM}; ${CODEX_ARCH})`;
}

function extractHeaderMap(headers: Headers): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    next[key] = value;
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseUsage(value: unknown): CodexUsageInfo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const inputTokens = parseNumber(value.input_tokens) ?? 0;
  const outputTokens = parseNumber(value.output_tokens) ?? 0;
  const usage: CodexUsageInfo = {
    input_tokens: inputTokens,
    output_tokens: outputTokens
  };

  const totalTokens = parseNumber(value.total_tokens);
  if (totalTokens !== undefined) {
    usage.total_tokens = totalTokens;
  }

  const inputDetails = isRecord(value.input_tokens_details) ? value.input_tokens_details : null;
  const cachedTokens = parseNumber(value.cached_tokens) ?? parseNumber(inputDetails?.cached_tokens);
  if (cachedTokens !== undefined) {
    usage.cached_tokens = cachedTokens;
  }

  const outputDetails = isRecord(value.output_tokens_details) ? value.output_tokens_details : null;
  const reasoningTokens = parseNumber(value.reasoning_tokens) ?? parseNumber(outputDetails?.reasoning_tokens);
  if (reasoningTokens !== undefined) {
    usage.reasoning_tokens = reasoningTokens;
  }

  return usage;
}

function usageUnits(usage: CodexUsageInfo | undefined): number {
  if (!usage) {
    return 1;
  }
  const total = usage.total_tokens ?? usage.input_tokens + usage.output_tokens;
  return Number.isFinite(total) && total > 0 ? total : 1;
}

function readModelIds(value: unknown, models = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      readModelIds(item, models);
    }
    return models;
  }

  if (!isRecord(value)) {
    return models;
  }

  const directId = value.id ?? value.model ?? value.slug;
  if (typeof directId === "string" && directId.trim()) {
    models.add(directId.trim());
  }

  if (Array.isArray(value.models)) {
    readModelIds(value.models, models);
  }
  if (Array.isArray(value.data)) {
    readModelIds(value.data, models);
  }
  if (Array.isArray(value.categories)) {
    readModelIds(value.categories, models);
  }
  const chatModels = isRecord(value.chat_models) ? value.chat_models : null;
  if (chatModels) {
    readModelIds(chatModels.models, models);
  }

  return models;
}

export function buildCodexHeaders(
  upstream: UpstreamAccount,
  options: {
    accept?: string;
    contentType?: string;
    requestId?: string;
  } = {}
): Record<string, string> {
  const accountId = extractChatGptAccountId(upstream.apiKey) ?? upstream.accountSubject ?? null;
  const headers: Record<string, string> = {
    authorization: `Bearer ${upstream.apiKey}`,
    originator: CODEX_ORIGINATOR,
    "user-agent": buildUserAgent(),
    "sec-ch-ua": `"Chromium";v="${CODEX_CHROMIUM_VERSION}", "Not:A-Brand";v="24"`,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": `"macOS"`,
    "accept-language": "en-US,en;q=0.9",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    "openai-beta": "responses_websockets=2026-02-06",
    "x-openai-internal-codex-residency": "us",
    "x-client-request-id": options.requestId || crypto.randomUUID(),
    "x-codex-installation-id": CODEX_INSTALLATION_ID,
    ...upstream.headers
  };

  if (accountId) {
    headers["chatgpt-account-id"] = accountId;
  }
  if (options.accept) {
    headers.accept = options.accept;
  }
  if (options.contentType) {
    headers["content-type"] = options.contentType;
  }

  return headers;
}

function withClientMetadata(requestBody: unknown): unknown {
  if (!isRecord(requestBody)) {
    return requestBody;
  }
  const existing = isRecord(requestBody.client_metadata) ? requestBody.client_metadata : {};
  return {
    ...requestBody,
    client_metadata: {
      ...existing,
      "x-codex-installation-id": CODEX_INSTALLATION_ID
    }
  };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const raw = await response.text();
  try {
    return raw ? (JSON.parse(raw) as unknown) : {};
  } catch {
    return raw ? { raw } : {};
  }
}

export async function readStreamText(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) {
    return "";
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
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

export async function forwardCodexResponse(
  upstream: UpstreamAccount,
  requestBody: unknown,
  options: ForwardOpenAIOptions = {}
): Promise<ForwardedStreamResult> {
  const url = `${normalizeBaseUrl(upstream.baseUrl)}/codex/responses`;
  const response = await fetch(url, {
    method: "POST",
    headers: buildCodexHeaders(upstream, {
      accept: "text/event-stream",
      contentType: "application/json",
      requestId: options.requestId
    }),
    body: JSON.stringify(withClientMetadata(requestBody)),
    signal: options.signal
  });

  return {
    statusCode: response.status,
    responseHeaders: extractHeaderMap(response.headers),
    body: response.body
  };
}

export async function fetchCodexModels(
  upstream: UpstreamAccount,
  options: ForwardOpenAIOptions = {}
): Promise<UpstreamProbeResult> {
  const baseUrl = normalizeBaseUrl(upstream.baseUrl);
  const urls = [
    `${baseUrl}/codex/models?client_version=${encodeURIComponent(CODEX_CLIENT_VERSION)}`,
    `${baseUrl}/models`,
    `${baseUrl}/sentinel/chat-requirements`
  ];

  let lastStatusCode = 0;
  let lastHeaders: Record<string, string> = {};
  let lastBody: unknown = {};

  for (const url of urls) {
    const response = await fetch(url, {
      method: "GET",
      headers: buildCodexHeaders(upstream, {
        accept: "application/json",
        requestId: options.requestId
      }),
      signal: options.signal
    });
    lastStatusCode = response.status;
    lastHeaders = extractHeaderMap(response.headers);
    lastBody = await readResponseBody(response);

    const discovered = [...readModelIds(lastBody)].sort((left, right) => left.localeCompare(right));
    if (response.ok && discovered.length > 0) {
      return {
        ok: true,
        statusCode: response.status,
        responseHeaders: lastHeaders,
        body: lastBody,
        models: discovered
      };
    }
  }

  return {
    ok: lastStatusCode >= 200 && lastStatusCode < 300,
    statusCode: lastStatusCode || 502,
    responseHeaders: lastHeaders,
    body: lastBody,
    models: [...codexModelCatalog]
  };
}

function quotaStatusFromUsage(body: unknown, fetchedAt: string): UpstreamQuotaSnapshot | null {
  if (!isRecord(body) || !isRecord(body.rate_limit)) {
    return null;
  }

  const rateLimit = body.rate_limit;
  const primaryWindow = isRecord(rateLimit.primary_window) ? rateLimit.primary_window : null;
  const usedPercent = parseNumber(primaryWindow?.used_percent) ?? null;
  const resetAt = parseNumber(primaryWindow?.reset_at);
  const limitReached = rateLimit.limit_reached === true;
  const allowed = rateLimit.allowed !== false;
  const planType = typeof body.plan_type === "string" ? body.plan_type : "unknown plan";

  return {
    supported: true,
    status: limitReached ? "limited" : allowed ? "available" : "unavailable",
    source: "provider-api",
    message: `Codex quota reported by ChatGPT backend (${planType}).`,
    fetchedAt,
    limitRequests: null,
    remainingRequests: null,
    usedPercent,
    resetRequests: resetAt ? new Date(resetAt * 1000).toISOString() : null
  };
}

export async function fetchCodexUsageSnapshot(
  upstream: UpstreamAccount,
  fetchedAt: string,
  options: ForwardOpenAIOptions = {}
): Promise<UpstreamQuotaSnapshot | null> {
  const baseUrl = normalizeBaseUrl(upstream.baseUrl);
  const urls = [`${baseUrl}/wham/usage`, `${baseUrl}/codex/usage`];

  for (const url of urls) {
    const response = await fetch(url, {
      method: "GET",
      headers: buildCodexHeaders(upstream, {
        accept: "application/json",
        requestId: options.requestId
      }),
      signal: options.signal
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      continue;
    }
    const quota = quotaStatusFromUsage(body, fetchedAt);
    if (quota) {
      return quota;
    }
  }

  return null;
}

function parseSSEBlock(block: string): CodexSSEEvent | null {
  let event = "";
  const dataLines: string[] = [];

  for (const rawLine of block.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!event && dataLines.length === 0) {
    return null;
  }

  const raw = dataLines.join("\n");
  if (raw === "[DONE]") {
    return null;
  }

  try {
    return {
      event,
      data: raw ? (JSON.parse(raw) as unknown) : {}
    };
  } catch {
    return {
      event,
      data: raw
    };
  }
}

async function* parseCodexSSE(response: Response): AsyncGenerator<CodexSSEEvent> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const parsed = parseSSEBlock(block);
      if (parsed) {
        yield parsed;
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const parsed = parseSSEBlock(buffer);
    if (parsed) {
      yield parsed;
    }
  }
}

function eventType(event: CodexSSEEvent): string {
  if (event.event) {
    return event.event;
  }
  return isRecord(event.data) && typeof event.data.type === "string" ? event.data.type : "unknown";
}

function extractError(data: unknown): string {
  if (isRecord(data)) {
    const error = isRecord(data.error) ? data.error : data;
    const message = error.message ?? error.detail ?? data.message ?? data.detail;
    if (typeof message === "string") {
      return message;
    }
  }
  return typeof data === "string" ? data : JSON.stringify(data);
}

function responseUsage(data: unknown): CodexUsageInfo | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  const response = isRecord(data.response) ? data.response : data;
  return parseUsage(response.usage);
}

function responseId(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  const response = isRecord(data.response) ? data.response : data;
  return typeof response.id === "string" ? response.id : undefined;
}

export async function* iterateCodexEvents(response: Response): AsyncGenerator<CodexExtractedEvent> {
  const itemIdToCall = new Map<string, { callId: string; name: string }>();

  for await (const event of parseCodexSSE(response)) {
    const type = eventType(event);
    const data = event.data;
    const extracted: CodexExtractedEvent = {
      type
    };
    const id = responseId(data);
    if (id) {
      extracted.responseId = id;
    }

    if (type === "response.output_text.delta" && isRecord(data) && typeof data.delta === "string") {
      extracted.textDelta = data.delta;
    } else if (
      type === "response.reasoning_summary_text.delta" &&
      isRecord(data) &&
      typeof data.delta === "string"
    ) {
      extracted.reasoningDelta = data.delta;
    } else if (type === "response.completed" || type === "response.incomplete") {
      const usage = responseUsage(data);
      if (usage) {
        extracted.usage = usage;
      }
    } else if (type === "error" || type === "response.failed") {
      extracted.error = extractError(data);
    } else if (type === "response.output_item.added" && isRecord(data) && isRecord(data.item)) {
      const item = data.item;
      if (item.type === "function_call") {
        const itemId = typeof item.id === "string" ? item.id : "";
        const callId = typeof item.call_id === "string" ? item.call_id : itemId;
        const name = typeof item.name === "string" ? item.name : "tool";
        if (itemId) {
          itemIdToCall.set(itemId, { callId, name });
        }
        extracted.functionCallStart = { callId, name };
      }
    } else if (type === "response.function_call_arguments.delta" && isRecord(data)) {
      const itemId = typeof data.item_id === "string" ? data.item_id : "";
      const rawCallId = typeof data.call_id === "string" ? data.call_id : itemId;
      const known = itemIdToCall.get(rawCallId) ?? itemIdToCall.get(itemId);
      if (typeof data.delta === "string") {
        extracted.functionCallDelta = {
          callId: known?.callId ?? rawCallId,
          delta: data.delta
        };
      }
    } else if (type === "response.function_call_arguments.done" && isRecord(data)) {
      const itemId = typeof data.item_id === "string" ? data.item_id : "";
      const rawCallId = typeof data.call_id === "string" ? data.call_id : itemId;
      const known = itemIdToCall.get(rawCallId) ?? itemIdToCall.get(itemId);
      if (typeof data.arguments === "string") {
        extracted.functionCallDone = {
          callId: known?.callId ?? rawCallId,
          name: typeof data.name === "string" && data.name ? data.name : known?.name ?? "tool",
          arguments: data.arguments
        };
      }
    } else if (type === "response.output_item.done" && isRecord(data) && isRecord(data.item)) {
      const item = data.item;
      if (item.type === "function_call" && typeof item.arguments === "string") {
        extracted.functionCallDone = {
          callId: typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : "call",
          name: typeof item.name === "string" ? item.name : "tool",
          arguments: item.arguments
        };
      }
    }

    yield extracted;
  }
}

export async function collectCodexResponse(response: Response): Promise<CodexCollectedResponse> {
  let responseIdValue: string | null = null;
  let text = "";
  let reasoning = "";
  let usage: CodexUsageInfo = {
    input_tokens: 0,
    output_tokens: 0
  };
  const calls = new Map<string, CodexFunctionCall>();
  const argumentDeltas = new Map<string, string>();

  for await (const event of iterateCodexEvents(response)) {
    if (event.responseId) {
      responseIdValue = event.responseId;
    }
    if (event.error) {
      throw new Error(event.error);
    }
    if (event.textDelta) {
      text += event.textDelta;
    }
    if (event.reasoningDelta) {
      reasoning += event.reasoningDelta;
    }
    if (event.usage) {
      usage = event.usage;
    }
    if (event.functionCallStart) {
      calls.set(event.functionCallStart.callId, {
        callId: event.functionCallStart.callId,
        name: event.functionCallStart.name,
        arguments: ""
      });
    }
    if (event.functionCallDelta) {
      argumentDeltas.set(
        event.functionCallDelta.callId,
        `${argumentDeltas.get(event.functionCallDelta.callId) ?? ""}${event.functionCallDelta.delta}`
      );
    }
    if (event.functionCallDone) {
      calls.set(event.functionCallDone.callId, event.functionCallDone);
    }
  }

  for (const [callId, args] of argumentDeltas) {
    const existing = calls.get(callId);
    if (existing && !existing.arguments) {
      calls.set(callId, { ...existing, arguments: args });
    }
  }

  return {
    responseId: responseIdValue,
    text,
    reasoning,
    usage,
    usageUnits: usageUnits(usage),
    functionCalls: [...calls.values()]
  };
}

export function streamResultToResponse(forwarded: ForwardedStreamResult): Response {
  return new Response(forwarded.body, {
    status: forwarded.statusCode,
    headers: forwarded.responseHeaders
  });
}
