import type { ForwardedResult, TokenUsageDetails, UpstreamAccount } from "../types.js";
import { extractTokenUsage, usageUnitsFromDetails } from "./usage.js";

const RETRYABLE_STATUS_CODES = new Set([401, 403, 404, 408, 409, 425, 429, 500, 502, 503, 504]);

export interface UpstreamProbeResult {
  ok: boolean;
  statusCode: number;
  responseHeaders: Record<string, string>;
  body: unknown;
  models: string[];
}

export interface ForwardOpenAIOptions {
  requestId?: string;
  signal?: AbortSignal;
}

export type OpenAICompatibleEndpoint = "/v1/chat/completions" | "/v1/responses";

export interface ForwardedStreamResult {
  statusCode: number;
  responseHeaders: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
}

export class UpstreamRequestError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "UpstreamRequestError";
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  let normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized.endsWith("/v1")) {
    normalized = normalized.slice(0, -3);
  }
  return normalized;
}

function buildOpenAICompatibleUrl(baseUrl: string, endpoint: OpenAICompatibleEndpoint): string {
  return `${normalizeBaseUrl(baseUrl)}${endpoint}`;
}

function extractHeaderMap(headers: Headers): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    next[key] = value;
  }
  return next;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const raw = await response.text();
  try {
    return raw ? (JSON.parse(raw) as unknown) : {};
  } catch {
    return raw ? { raw } : {};
  }
}

function extractModels(body: unknown): string[] {
  if (!body || typeof body !== "object") {
    return [];
  }

  const data = (body as Record<string, unknown>).data;
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const id = (item as Record<string, unknown>).id;
      return typeof id === "string" && id.trim() ? id.trim() : null;
    })
    .filter((item): item is string => item !== null);
}

export function isRetryableUpstreamStatus(statusCode: number): boolean {
  return RETRYABLE_STATUS_CODES.has(statusCode) || statusCode >= 500;
}

export function normalizeUpstreamErrorBody(
  body: unknown,
  fallbackMessage: string
): Record<string, unknown> {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.raw === "string" && record.raw.trim()) {
      return {
        error: {
          message: record.raw,
          type: "upstream_error"
        }
      };
    }
    return record;
  }

  if (typeof body === "string" && body.trim()) {
    return {
      error: {
        message: body,
        type: "upstream_error"
      }
    };
  }

  return {
    error: {
      message: fallbackMessage,
      type: "upstream_error"
    }
  };
}

export async function forwardOpenAICompatibleRequest(
  upstream: UpstreamAccount,
  endpoint: OpenAICompatibleEndpoint,
  requestBody: unknown,
  options: ForwardOpenAIOptions = {}
): Promise<ForwardedResult> {
  const url = buildOpenAICompatibleUrl(upstream.baseUrl, endpoint);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${upstream.apiKey}`,
        ...(options.requestId ? { "x-request-id": options.requestId } : {}),
        ...upstream.headers
      },
      body: JSON.stringify(requestBody),
      signal: options.signal
    });

    const body = await readResponseBody(response);

    const upstreamModel =
      body && typeof body === "object" && typeof (body as Record<string, unknown>).model === "string"
        ? ((body as Record<string, unknown>).model as string)
        : undefined;

    const usage = response.ok ? extractTokenUsage(body) : undefined;

    return {
      statusCode: response.status,
      responseHeaders: extractHeaderMap(response.headers),
      body,
      usageUnits: response.ok ? usageUnitsFromDetails(usage) : 0,
      usage,
      upstreamModel
    };
  } catch (error) {
    throw new UpstreamRequestError(`Failed to reach upstream ${upstream.name}.`, error);
  }
}

export async function forwardOpenAICompatibleStream(
  upstream: UpstreamAccount,
  endpoint: OpenAICompatibleEndpoint,
  requestBody: unknown,
  options: ForwardOpenAIOptions = {}
): Promise<ForwardedStreamResult> {
  const url = buildOpenAICompatibleUrl(upstream.baseUrl, endpoint);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${upstream.apiKey}`,
        ...(options.requestId ? { "x-request-id": options.requestId } : {}),
        ...upstream.headers
      },
      body: JSON.stringify(requestBody),
      signal: options.signal
    });

    return {
      statusCode: response.status,
      responseHeaders: extractHeaderMap(response.headers),
      body: response.body
    };
  } catch (error) {
    throw new UpstreamRequestError(`Failed to reach upstream ${upstream.name}.`, error);
  }
}

export async function forwardOpenAICompatibleChat(
  upstream: UpstreamAccount,
  requestBody: unknown,
  options: ForwardOpenAIOptions = {}
): Promise<ForwardedResult> {
  return forwardOpenAICompatibleRequest(upstream, "/v1/chat/completions", requestBody, options);
}

export async function testOpenAICompatibleUpstream(
  upstream: UpstreamAccount,
  options: ForwardOpenAIOptions = {}
): Promise<UpstreamProbeResult> {
  const url = `${normalizeBaseUrl(upstream.baseUrl)}/v1/models`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${upstream.apiKey}`,
        ...(options.requestId ? { "x-request-id": options.requestId } : {}),
        ...upstream.headers
      },
      signal: options.signal
    });

    const body = await readResponseBody(response);
    return {
      ok: response.ok,
      statusCode: response.status,
      responseHeaders: extractHeaderMap(response.headers),
      body,
      models: extractModels(body)
    };
  } catch (error) {
    throw new UpstreamRequestError(`Failed to test upstream ${upstream.name}.`, error);
  }
}
