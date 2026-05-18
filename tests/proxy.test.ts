import { afterEach, describe, expect, it, vi } from "vitest";
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
