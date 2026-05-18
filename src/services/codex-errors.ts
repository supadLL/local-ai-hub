export type CodexErrorCategory =
  | "auth"
  | "quota"
  | "rate_limit"
  | "path_blocked"
  | "validation"
  | "overloaded"
  | "network"
  | "empty_stream"
  | "unknown";

export interface ClassifiedCodexError {
  category: CodexErrorCategory;
  retryable: boolean;
  cooldownMs: number;
  statusCode: number;
  message: string;
}

function bodyText(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }
  if (!body || typeof body !== "object") {
    return "";
  }
  const record = body as Record<string, unknown>;
  if (typeof record.raw === "string") {
    return record.raw;
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  const error = record.error;
  if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") {
    return (error as Record<string, unknown>).message as string;
  }
  try {
    return JSON.stringify(record);
  } catch {
    return "";
  }
}

export function classifyCodexError(statusCode: number, body: unknown, fallbackMessage?: string): ClassifiedCodexError {
  const text = bodyText(body) || fallbackMessage || `Upstream returned HTTP ${statusCode}.`;
  const normalized = text.toLowerCase();

  if (statusCode === 401 || statusCode === 403 || normalized.includes("unauthorized")) {
    return {
      category: "auth",
      retryable: false,
      cooldownMs: 10 * 60 * 1000,
      statusCode,
      message: text
    };
  }

  if (
    statusCode === 429 ||
    normalized.includes("rate limit") ||
    normalized.includes("usage_limit") ||
    normalized.includes("limit reached") ||
    normalized.includes("quota")
  ) {
    return {
      category: normalized.includes("quota") || normalized.includes("usage_limit") ? "quota" : "rate_limit",
      retryable: true,
      cooldownMs: 60 * 1000,
      statusCode,
      message: text
    };
  }

  if (statusCode === 404 && (!text.trim() || normalized.includes("not found"))) {
    return {
      category: "path_blocked",
      retryable: true,
      cooldownMs: 5 * 60 * 1000,
      statusCode,
      message: text
    };
  }

  if (statusCode === 400 || statusCode === 422) {
    return {
      category: "validation",
      retryable: false,
      cooldownMs: 0,
      statusCode,
      message: text
    };
  }

  if (statusCode === 408 || statusCode === 409 || statusCode === 425 || statusCode >= 500) {
    return {
      category: "overloaded",
      retryable: true,
      cooldownMs: 30 * 1000,
      statusCode,
      message: text
    };
  }

  if (statusCode === 0) {
    return {
      category: "network",
      retryable: true,
      cooldownMs: 30 * 1000,
      statusCode,
      message: text
    };
  }

  return {
    category: "unknown",
    retryable: false,
    cooldownMs: 0,
    statusCode,
    message: text
  };
}

export function classifyNetworkError(error: unknown): ClassifiedCodexError {
  const message = error instanceof Error ? error.message : "Unknown upstream network error.";
  return classifyCodexError(0, null, message);
}

export function isClassifiedRetryable(error: ClassifiedCodexError): boolean {
  return error.retryable;
}
