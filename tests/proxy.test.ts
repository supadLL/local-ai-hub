import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { createTestHarness } from "./helpers.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("proxy failover behavior", () => {
  it("supports GPT-5 series requests through the Responses API", async () => {
    const harness = await createTestHarness({
      upstreams: [
        {
          id: "upstream_gpt5",
          name: "GPT-5 Provider",
          provider: "openai-compatible",
          baseUrl: "https://gpt5.example.com",
          apiKey: "sk-gpt5",
          models: ["gpt-5*"],
          enabled: true,
          weight: 1,
          headers: {},
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        }
      ],
      clientKeys: [
        {
          id: "ck_gpt5",
          name: "gpt5-dev",
          key: "lah_gpt5_key",
          allowedModels: ["gpt-5*"],
          enabled: true,
          quotaLimit: 1000,
          usedQuota: 0,
          requestsPerMinute: 60,
          currentWindowStart: 0,
          currentWindowCount: 0,
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        }
      ]
    });
    cleanups.push(harness.cleanup);

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "resp_123",
          object: "response",
          model: "gpt-5.2",
          output: [],
          usage: {
            total_tokens: 37
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await harness.request
      .post("/v1/responses")
      .set("authorization", "Bearer lah_gpt5_key")
      .send({
        model: "gpt-5.2",
        input: "hello"
      });

    expect(response.status).toBe(200);
    expect(response.body.model).toBe("gpt-5.2");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gpt5.example.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "gpt-5.2",
          input: "hello"
        })
      })
    );

    const state = await harness.store.readState();
    expect(state.clientKeys[0]?.usedQuota).toBe(37);
    expect(state.upstreams[0]?.requestCount).toBe(1);
    expect(state.logs[0]?.model).toBe("gpt-5.2");
  });

  it("streams GPT-5 Responses API chunks through the gateway", async () => {
    const harness = await createTestHarness({
      upstreams: [
        {
          id: "upstream_gpt5_stream",
          name: "GPT-5 Stream Provider",
          provider: "openai-compatible",
          baseUrl: "https://gpt5-stream.example.com",
          apiKey: "sk-gpt5-stream",
          models: ["gpt-5*"],
          enabled: true,
          weight: 1,
          headers: {},
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        }
      ],
      clientKeys: [
        {
          id: "ck_gpt5_stream",
          name: "gpt5-stream-dev",
          key: "lah_gpt5_stream_key",
          allowedModels: ["gpt-5*"],
          enabled: true,
          quotaLimit: 1000,
          usedQuota: 0,
          requestsPerMinute: 60,
          currentWindowStart: 0,
          currentWindowCount: 0,
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        }
      ]
    });
    cleanups.push(harness.cleanup);

    const streamBody = [
      'data: {"type":"response.output_text.delta","delta":"hello"}\n\n',
      "data: [DONE]\n\n"
    ].join("");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(streamBody, {
        status: 200,
        headers: {
          "content-type": "text/event-stream"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await harness.request
      .post("/v1/responses")
      .set("authorization", "Bearer lah_gpt5_stream_key")
      .send({
        model: "gpt-5.2",
        input: "hello",
        stream: true
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.text).toContain("response.output_text.delta");
    expect(response.text).toContain("[DONE]");

    const state = await harness.store.readState();
    expect(state.clientKeys[0]?.usedQuota).toBe(1);
    expect(state.upstreams[0]?.requestCount).toBe(1);
    expect(state.logs[0]?.model).toBe("gpt-5.2");
  });

  it("expands GPT catalog wildcards in the local models endpoint", async () => {
    const harness = await createTestHarness({
      upstreams: [
        {
          id: "upstream_catalog",
          name: "Catalog Provider",
          provider: "openai-compatible",
          baseUrl: "https://catalog.example.com",
          apiKey: "sk-catalog",
          models: ["gpt-5*", "gpt-4.1", "gpt-3.5-turbo"],
          enabled: true,
          weight: 1,
          headers: {},
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        }
      ]
    });
    cleanups.push(harness.cleanup);

    const response = await harness.request.get("/v1/models");
    const ids = response.body.data.map((item: { id: string }) => item.id);

    expect(response.status).toBe(200);
    expect(ids).toContain("gpt-5.5");
    expect(ids).toContain("gpt-5.4");
    expect(ids).toContain("gpt-5.4-mini");
    expect(ids).toContain("gpt-5.3-codex");
    expect(ids).toContain("gpt-5.2");
    expect(ids).toContain("gpt-4.1");
    expect(ids).toContain("gpt-3.5-turbo");
    expect(ids).not.toContain("gpt-5*");
  });

  it("exposes Codex-capable models for legacy OAuth imports", async () => {
    const harness = await createTestHarness({
      upstreams: [
        {
          id: "upstream_oauth_models",
          name: "OpenAI Login",
          provider: "openai-oauth",
          baseUrl: "https://chatgpt.com/backend-api",
          apiKey: "oauth-access-token",
          refreshToken: null,
          tokenExpiresAt: null,
          accountEmail: "free@example.com",
          accountSubject: "user_123",
          models: ["codex"],
          enabled: true,
          weight: 1,
          headers: {},
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z",
          discoveredModels: ["codex"]
        }
      ]
    });
    cleanups.push(harness.cleanup);

    const response = await harness.request.get("/v1/models");
    const ids = response.body.data.map((item: { id: string }) => item.id);

    expect(response.status).toBe(200);
    expect(ids).toContain("gpt-5.5");
    expect(ids).toContain("gpt-5.4");
    expect(ids).toContain("gpt-5.3-codex");
    expect(ids).not.toContain("gpt-5.5-pro");
  });

  it("translates Anthropic Messages requests to the Codex backend for OAuth accounts", async () => {
    const harness = await createTestHarness({
      upstreams: [
        {
          id: "upstream_oauth_messages",
          name: "OpenAI Login",
          provider: "openai-oauth",
          baseUrl: "https://chatgpt.com/backend-api",
          apiKey: "oauth-access-token",
          refreshToken: null,
          tokenExpiresAt: null,
          accountEmail: "free@example.com",
          accountSubject: "user_123",
          models: ["codex"],
          enabled: true,
          weight: 1,
          headers: {},
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z",
          discoveredModels: ["codex"]
        }
      ],
      clientKeys: [
        {
          id: "ck_messages",
          name: "claude-code",
          key: "lah_messages_key",
          allowedModels: ["gpt-5*"],
          enabled: true,
          quotaLimit: 1000,
          usedQuota: 0,
          requestsPerMinute: 60,
          currentWindowStart: 0,
          currentWindowCount: 0,
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        }
      ]
    });
    cleanups.push(harness.cleanup);

    const streamBody = [
      'event: response.output_text.delta\ndata: {"delta":"hello from codex"}\n\n',
      'event: response.completed\ndata: {"response":{"id":"resp_codex","usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5,"input_tokens_details":{"cached_tokens":1},"output_tokens_details":{"reasoning_tokens":1}}}}\n\n'
    ].join("");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(streamBody, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-codex-primary-used-percent": "37.6",
          "x-codex-primary-window-minutes": "180",
          "x-codex-primary-reset-at": "1893456000",
          "x-codex-secondary-used-percent": "12",
          "x-codex-secondary-window-minutes": "10080",
          "x-codex-secondary-reset-at": "1894060800",
          "x-codex-code-review-primary-used-percent": "64",
          "x-codex-code-review-primary-window-minutes": "60",
          "x-codex-code-review-primary-reset-at": "1893459600"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await harness.request
      .post("/v1/messages")
      .set("x-api-key", "lah_messages_key")
      .send({
        model: "gpt-5.5",
        max_tokens: 128,
        messages: [{ role: "user", content: "hello" }]
      });

    expect(response.status).toBe(200);
    expect(response.body.model).toBe("gpt-5.5");
    expect(response.body.content[0]).toEqual({ type: "text", text: "hello from codex" });
    expect(response.body.usage).toEqual({ input_tokens: 3, output_tokens: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://chatgpt.com/backend-api/codex/responses",
      expect.objectContaining({
        method: "POST"
      })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      model: "gpt-5.5",
      stream: true,
      store: false
    });
    expect(requestBody.max_output_tokens).toBeUndefined();
    expect(init.headers).toMatchObject({
      authorization: "Bearer oauth-access-token",
      originator: "Codex Desktop"
    });

    const state = await harness.store.readState();
    expect(state.clientKeys[0]?.usedQuota).toBe(5);
    expect(state.upstreams[0]?.requestCount).toBe(1);
    expect(state.upstreams[0]?.usage).toMatchObject({
      request_count: 1,
      input_tokens: 3,
      output_tokens: 2,
      total_tokens: 5,
      cached_tokens: 1,
      reasoning_tokens: 1
    });
    expect(state.upstreams[0]?.quota).toMatchObject({
      source: "response-headers",
      status: "available",
      usedPercent: 38,
      rateLimit: {
        usedPercent: 38,
        limitWindowSeconds: 10800
      },
      secondaryRateLimit: {
        usedPercent: 12,
        limitWindowSeconds: 604800
      },
      codeReviewRateLimit: {
        usedPercent: 64,
        limitWindowSeconds: 3600
      }
    });
  });

  it("records streaming Codex usage details instead of a one-unit fallback", async () => {
    const harness = await createTestHarness({
      upstreams: [
        {
          id: "upstream_oauth_stream_messages",
          name: "OpenAI Login",
          provider: "openai-oauth",
          baseUrl: "https://chatgpt.com/backend-api",
          apiKey: "oauth-access-token",
          refreshToken: null,
          tokenExpiresAt: null,
          accountEmail: "free@example.com",
          accountSubject: "user_123",
          models: ["codex"],
          enabled: true,
          weight: 1,
          headers: {},
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z",
          discoveredModels: ["codex"]
        }
      ],
      clientKeys: [
        {
          id: "ck_stream_messages",
          name: "claude-code",
          key: "lah_stream_messages_key",
          allowedModels: ["gpt-5*"],
          enabled: true,
          quotaLimit: 1000,
          usedQuota: 0,
          requestsPerMinute: 60,
          currentWindowStart: 0,
          currentWindowCount: 0,
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        }
      ]
    });
    cleanups.push(harness.cleanup);

    const streamBody = [
      'event: response.output_text.delta\ndata: {"delta":"streamed"}\n\n',
      'event: response.completed\ndata: {"response":{"id":"resp_stream","usage":{"input_tokens":8,"output_tokens":5,"total_tokens":13,"input_tokens_details":{"cached_tokens":3},"output_tokens_details":{"reasoning_tokens":2}}}}\n\n'
    ].join("");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(streamBody, {
        status: 200,
        headers: {
          "content-type": "text/event-stream"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await harness.request
      .post("/v1/messages")
      .set("x-api-key", "lah_stream_messages_key")
      .send({
        model: "gpt-5.5",
        max_tokens: 128,
        stream: true,
        messages: [{ role: "user", content: "hello" }]
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain("message_delta");
    expect(response.text).toContain("streamed");

    const state = await harness.store.readState();
    expect(state.clientKeys[0]?.usedQuota).toBe(13);
    expect(state.upstreams[0]?.usedQuota).toBe(13);
    expect(state.upstreams[0]?.requestCount).toBe(1);
    expect(state.upstreams[0]?.usage).toMatchObject({
      request_count: 1,
      input_tokens: 8,
      output_tokens: 5,
      total_tokens: 13,
      cached_tokens: 3,
      reasoning_tokens: 2
    });
    expect(state.logs[0]?.metadata).toMatchObject({
      usage: {
        input_tokens: 8,
        output_tokens: 5,
        total_tokens: 13,
        cached_tokens: 3,
        reasoning_tokens: 2
      }
    });

    const summary = await harness.request.get("/api/admin/usage-stats/summary");
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      total_input_tokens: 8,
      total_output_tokens: 5,
      total_tokens: 13,
      total_cached_tokens: 3,
      total_reasoning_tokens: 2,
      total_request_count: 1
    });
  });

  it("uses WebSocket transport for continued Codex response requests", async () => {
    const wsServer = new WebSocketServer({ port: 0 });
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          wsServer.close(() => resolve());
        })
    );
    await new Promise<void>((resolve) => wsServer.once("listening", resolve));
    const address = wsServer.address();
    const port = typeof address === "object" && address ? address.port : 0;
    let receivedBody: Record<string, unknown> | null = null;

    wsServer.on("connection", (socket) => {
      socket.on("message", (raw) => {
        receivedBody = JSON.parse(String(raw)) as Record<string, unknown>;
        socket.send(JSON.stringify({ type: "response.output_text.delta", delta: "continued" }));
        socket.send(
          JSON.stringify({
            type: "response.completed",
            response: {
              id: "resp_ws",
              usage: {
                input_tokens: 4,
                output_tokens: 3,
                total_tokens: 7
              }
            }
          })
        );
        socket.close();
      });
    });

    const harness = await createTestHarness({
      upstreams: [
        {
          id: "upstream_ws",
          name: "OpenAI Login",
          provider: "openai-oauth",
          baseUrl: `http://127.0.0.1:${port}/backend-api`,
          apiKey: "oauth-access-token",
          refreshToken: null,
          tokenExpiresAt: null,
          accountEmail: "free@example.com",
          accountSubject: "user_123",
          models: ["gpt-5.5"],
          enabled: true,
          weight: 1,
          headers: {},
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z",
          discoveredModels: ["gpt-5.5"]
        }
      ],
      clientKeys: [
        {
          id: "ck_ws",
          name: "codex",
          key: "lah_ws_key",
          allowedModels: ["gpt-5*"],
          enabled: true,
          quotaLimit: 1000,
          usedQuota: 0,
          requestsPerMinute: 60,
          currentWindowStart: 0,
          currentWindowCount: 0,
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        }
      ]
    });
    cleanups.push(harness.cleanup);

    const response = await harness.request
      .post("/v1/responses")
      .set("authorization", "Bearer lah_ws_key")
      .send({
        model: "gpt-5.5",
        input: "continue",
        previous_response_id: "resp_previous"
      });

    expect(response.status).toBe(200);
    expect(response.body.output_text).toBe("continued");
    expect(receivedBody).toMatchObject({
      type: "response.create",
      model: "gpt-5.5",
      previous_response_id: "resp_previous",
      stream: true,
      store: false
    });

    const state = await harness.store.readState();
    expect(state.clientKeys[0]?.usedQuota).toBe(7);
    expect(state.upstreams[0]?.requestCount).toBe(1);
  });

  it("fails over to the next matching upstream on retryable upstream errors", async () => {
    const harness = await createTestHarness({
      upstreams: [
        {
          id: "upstream_primary",
          name: "Primary",
          provider: "openai-compatible",
          baseUrl: "https://primary.example.com",
          apiKey: "sk-primary",
          models: ["gpt-4o"],
          enabled: true,
          weight: 1,
          headers: {},
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        },
        {
          id: "upstream_backup",
          name: "Backup",
          provider: "openai-compatible",
          baseUrl: "https://backup.example.com",
          apiKey: "sk-backup",
          models: ["gpt-4o"],
          enabled: true,
          weight: 1,
          headers: {},
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        }
      ],
      clientKeys: [
        {
          id: "ck_dev",
          name: "dev",
          key: "lah_test_key",
          allowedModels: ["gpt-4o"],
          enabled: true,
          quotaLimit: 1000,
          usedQuota: 0,
          requestsPerMinute: 60,
          currentWindowStart: 0,
          currentWindowCount: 0,
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        }
      ]
    });
    cleanups.push(harness.cleanup);

    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Rate limited", type: "rate_limit_error" } }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "2"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "chatcmpl_123",
            object: "chat.completion",
            model: "gpt-4o",
            choices: [],
            usage: {
              total_tokens: 42
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "openai-processing-ms": "12",
              "x-ratelimit-limit-requests": "100",
              "x-ratelimit-remaining-requests": "58",
              "x-ratelimit-reset-requests": "45s"
            }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await harness.request
      .post("/v1/chat/completions")
      .set("authorization", "Bearer lah_test_key")
      .send({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hello" }]
      });

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBeTruthy();
    expect(response.headers["openai-processing-ms"]).toBe("12");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const state = await harness.store.readState();
    expect(state.clientKeys[0]?.usedQuota).toBe(42);
    expect(state.upstreams[0]?.lastErrorCategory).toBe("rate_limit");
    expect(state.upstreams[0]?.cooldownUntil).toBeTruthy();
    expect(state.upstreams[0]?.consecutiveFailures).toBe(1);
    expect(state.upstreams[1]?.requestCount).toBe(1);
    expect(state.upstreams[1]?.usedQuota).toBe(42);
    expect(state.upstreams[1]?.quota?.remainingRequests).toBe(58);
    expect(state.upstreams[1]?.quota?.usedPercent).toBe(42);
    expect(state.logs[0]?.message).toContain("after 1 failed upstream attempt");
    expect((state.logs[0]?.metadata as { attemptCount?: number }).attemptCount).toBe(2);
  });

  it("does not retry non-retryable upstream validation errors", async () => {
    const harness = await createTestHarness({
      upstreams: [
        {
          id: "upstream_primary",
          name: "Primary",
          provider: "openai-compatible",
          baseUrl: "https://primary.example.com",
          apiKey: "sk-primary",
          models: ["gpt-4o"],
          enabled: true,
          weight: 1,
          headers: {},
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        },
        {
          id: "upstream_backup",
          name: "Backup",
          provider: "openai-compatible",
          baseUrl: "https://backup.example.com",
          apiKey: "sk-backup",
          models: ["gpt-4o"],
          enabled: true,
          weight: 1,
          headers: {},
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        }
      ],
      clientKeys: [
        {
          id: "ck_dev",
          name: "dev",
          key: "lah_test_key",
          allowedModels: ["gpt-4o"],
          enabled: true,
          quotaLimit: 1000,
          usedQuota: 0,
          requestsPerMinute: 60,
          currentWindowStart: 0,
          currentWindowCount: 0,
          note: "",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z"
        }
      ]
    });
    cleanups.push(harness.cleanup);

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "Bad request",
            type: "invalid_request_error"
          }
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await harness.request
      .post("/v1/chat/completions")
      .set("authorization", "Bearer lah_test_key")
      .send({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hello" }]
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Bad request");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const state = await harness.store.readState();
    expect(state.clientKeys[0]?.usedQuota).toBe(0);
    expect(state.logs[0]?.statusCode).toBe(400);
  });
});
