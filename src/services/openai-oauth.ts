import crypto from "node:crypto";
import { createServer, type Server } from "node:http";
import { createId, nowIso } from "./keys.js";
import { createUnknownQuotaSnapshot } from "./upstream-status.js";
import type { FileStore } from "../store/file-store.js";
import type { UpstreamAccount } from "../types.js";

const OAUTH_CLIENT_ID = process.env.OPENAI_OAUTH_CLIENT_ID || "app_EMoamEEZ73f0CkXaXp7hrann";
const OAUTH_AUTH_ENDPOINT =
  process.env.OPENAI_OAUTH_AUTH_ENDPOINT || "https://auth.openai.com/oauth/authorize";
const OAUTH_TOKEN_ENDPOINT =
  process.env.OPENAI_OAUTH_TOKEN_ENDPOINT || "https://auth.openai.com/oauth/token";
const OAUTH_CALLBACK_PORT = Number.parseInt(process.env.OPENAI_OAUTH_CALLBACK_PORT || "1455", 10);
const OAUTH_SESSION_TTL_MS = 5 * 60 * 1000;

interface OAuthSession {
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
  exchanging: boolean;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in?: number;
}

const pendingSessions = new Map<string, OAuthSession>();
const completedSessions = new Map<string, number>();
let activeCallbackServer: Server | null = null;

setInterval(() => {
  const now = Date.now();
  for (const [state, session] of pendingSessions) {
    if (now - session.createdAt > OAUTH_SESSION_TTL_MS) {
      pendingSessions.delete(state);
    }
  }
  for (const [state, completedAt] of completedSessions) {
    if (now - completedAt > OAUTH_SESSION_TTL_MS) {
      completedSessions.delete(state);
    }
  }
}, 60_000).unref();

function generatePkce() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

function buildAuthUrl(redirectUri: string, state: string, codeChallenge: string): string {
  const params: Record<string, string> = {
    response_type: "code",
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "codex_cli_rs"
  };

  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `${OAUTH_AUTH_ENDPOINT}?${query}`;
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> {
  if (!token) {
    return {};
  }

  const [, payload] = token.split(".");
  if (!payload) {
    return {};
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function tokenExpiresAt(expiresIn: number | undefined): string | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) {
    return null;
  }
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function createOAuthUpstream(tokens: OAuthTokenResponse): UpstreamAccount {
  const now = nowIso();
  const identity = decodeJwtPayload(tokens.id_token || tokens.access_token);
  const email = typeof identity.email === "string" ? identity.email : null;
  const subject = typeof identity.sub === "string" ? identity.sub : null;
  const shortSubject = subject ? subject.slice(0, 8) : "account";

  return {
    id: createId("upstream"),
    name: email ? `OpenAI Login (${email})` : `OpenAI Login (${shortSubject})`,
    provider: "openai-oauth",
    baseUrl: "https://chatgpt.com/backend-api",
    apiKey: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    tokenExpiresAt: tokenExpiresAt(tokens.expires_in),
    accountEmail: email,
    accountSubject: subject,
    models: ["codex"],
    enabled: true,
    weight: 1,
    headers: {},
    note: "Imported through local OpenAI OAuth login.",
    createdAt: now,
    updatedAt: now,
    lastProbeAt: now,
    lastProbeOk: true,
    lastProbeStatusCode: 200,
    lastProbeLatencyMs: null,
    lastProbeError: null,
    discoveredModels: ["codex"],
    requestCount: 0,
    usedQuota: 0,
    lastUsedAt: null,
    quota: createUnknownQuotaSnapshot(now)
  };
}

export async function exchangeOAuthCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: OAUTH_CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  const response = await fetch(OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }
  return JSON.parse(text) as OAuthTokenResponse;
}

export async function refreshOAuthToken(refreshToken: string): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: OAUTH_CLIENT_ID,
    refresh_token: refreshToken
  });

  const response = await fetch(OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }
  return JSON.parse(text) as OAuthTokenResponse;
}

async function saveOAuthAccount(store: FileStore, tokens: OAuthTokenResponse): Promise<UpstreamAccount> {
  return store.mutate((state) => {
    const next = createOAuthUpstream(tokens);
    const existingIndex = next.accountSubject
      ? state.upstreams.findIndex(
          (item) => item.provider === "openai-oauth" && item.accountSubject === next.accountSubject
        )
      : -1;

    if (existingIndex >= 0) {
      const current = state.upstreams[existingIndex];
      const updated: UpstreamAccount = {
        ...current,
        name: next.name,
        apiKey: next.apiKey,
        refreshToken: next.refreshToken ?? current.refreshToken ?? null,
        tokenExpiresAt: next.tokenExpiresAt,
        accountEmail: next.accountEmail,
        accountSubject: next.accountSubject,
        enabled: true,
        lastProbeAt: next.lastProbeAt,
        lastProbeOk: true,
        lastProbeStatusCode: 200,
        lastProbeLatencyMs: next.lastProbeLatencyMs,
        lastProbeError: null,
        updatedAt: nowIso()
      };
      state.upstreams[existingIndex] = updated;
      return updated;
    }

    state.upstreams.push(next);
    return next;
  });
}

function callbackHtml(success: boolean, message?: string): string {
  const safeMessage = (message || "").replace(/[&<>"']/g, (char) => {
    const escaped: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };
    return escaped[char] || char;
  });
  const type = success ? "oauth-callback-success" : "oauth-callback-error";
  const title = success ? "Login Successful" : "Login Failed";
  const color = success ? "#14735b" : "#b94225";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101816;color:#f8fafb;font-family:Arial,sans-serif}.card{max-width:420px;border:1px solid rgba(255,255,255,.14);border-radius:18px;background:rgba(255,255,255,.08);padding:28px;text-align:center}h1{color:${color};font-size:22px}</style></head>
<body><div class="card"><h1>${title}</h1><p>${success ? "Account imported. You can close this window." : safeMessage}</p></div>
<script>if(window.opener){try{window.opener.postMessage({type:${JSON.stringify(type)},error:${JSON.stringify(safeMessage)}},'*')}catch(e){}}try{window.close()}catch(e){}</script></body></html>`;
}

function acquireSession(state: string): OAuthSession | null {
  const session = pendingSessions.get(state);
  if (!session) {
    return null;
  }
  if (Date.now() - session.createdAt > OAUTH_SESSION_TTL_MS || session.exchanging) {
    return null;
  }
  session.exchanging = true;
  return session;
}

function startCallbackServer(store: FileStore, port: number): void {
  if (activeCallbackServer) {
    try {
      activeCallbackServer.close();
    } catch {
      // Ignore stale callback server cleanup errors.
    }
    activeCallbackServer = null;
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);
    if (url.pathname !== "/auth/callback") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }

    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (error) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(callbackHtml(false, errorDescription || error));
      scheduleClose(server);
      return;
    }

    if (!code || !state) {
      res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
      res.end(callbackHtml(false, "Missing OAuth code or state."));
      scheduleClose(server);
      return;
    }

    const session = acquireSession(state);
    if (!session) {
      if (completedSessions.has(state)) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(callbackHtml(true));
      } else {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        res.end(callbackHtml(false, "Invalid, expired, or already used OAuth session."));
      }
      scheduleClose(server);
      return;
    }

    try {
      const tokens = await exchangeOAuthCode(code, session.codeVerifier, session.redirectUri);
      await saveOAuthAccount(store, tokens);
      pendingSessions.delete(state);
      completedSessions.set(state, Date.now());
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(callbackHtml(true));
    } catch (error) {
      session.exchanging = false;
      const message = error instanceof Error ? error.message : "Unknown OAuth callback error.";
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(callbackHtml(false, message));
    }

    scheduleClose(server);
  });

  server.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[local-ai-hub] OpenAI OAuth callback server failed: ${message}`);
    if (activeCallbackServer === server) {
      activeCallbackServer = null;
    }
  });

  server.listen(port, "0.0.0.0");
  activeCallbackServer = server;
  const timeout = setTimeout(() => scheduleClose(server), OAUTH_SESSION_TTL_MS);
  timeout.unref();
  server.on("close", () => clearTimeout(timeout));
}

function scheduleClose(server: Server): void {
  setTimeout(() => {
    try {
      server.close();
    } catch {
      // Ignore close races.
    }
    if (activeCallbackServer === server) {
      activeCallbackServer = null;
    }
  }, 2000).unref();
}

export function startOpenAIOAuthLogin(store: FileStore): { authUrl: string; state: string; redirectUri: string } {
  const { codeVerifier, codeChallenge } = generatePkce();
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `http://localhost:${OAUTH_CALLBACK_PORT}/auth/callback`;

  pendingSessions.set(state, {
    codeVerifier,
    redirectUri,
    createdAt: Date.now(),
    exchanging: false
  });

  startCallbackServer(store, OAUTH_CALLBACK_PORT);

  return {
    authUrl: buildAuthUrl(redirectUri, state, codeChallenge),
    state,
    redirectUri
  };
}

export async function relayOpenAIOAuthCallback(
  store: FileStore,
  callbackUrl: string
): Promise<{ success: true }> {
  const url = new URL(callbackUrl);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) {
    throw new Error(url.searchParams.get("error_description") || error);
  }
  if (!code || !state) {
    throw new Error("Callback URL must include code and state.");
  }

  const session = acquireSession(state);
  if (!session) {
    if (completedSessions.has(state)) {
      return { success: true };
    }
    throw new Error("Invalid, expired, or already used OAuth session.");
  }

  try {
    const tokens = await exchangeOAuthCode(code, session.codeVerifier, session.redirectUri);
    await saveOAuthAccount(store, tokens);
    pendingSessions.delete(state);
    completedSessions.set(state, Date.now());
    return { success: true };
  } catch (error) {
    session.exchanging = false;
    throw error;
  }
}

export async function probeOAuthUpstream(upstream: UpstreamAccount): Promise<{
  ok: boolean;
  tokens?: OAuthTokenResponse;
  error?: string;
}> {
  if (!upstream.refreshToken) {
    return {
      ok: false,
      error: "OAuth account does not have a refresh token."
    };
  }

  try {
    const tokens = await refreshOAuthToken(upstream.refreshToken);
    return { ok: true, tokens };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown OAuth refresh error."
    };
  }
}
