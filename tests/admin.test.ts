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

describe("backend upstream management", () => {
  it("tests an upstream connection and reports discovered models", async () => {
    const harness = await createTestHarness();
    cleanups.push(harness.cleanup);

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          object: "list",
          data: [{ id: "gpt-4o" }, { id: "gpt-4.1-mini" }]
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
      .post("/api/admin/upstreams/test")
      .send({
        name: "Draft OpenAI",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-upstream",
        models: ["gpt-4o"],
        enabled: true,
        weight: 1,
        headers: {},
        note: ""
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.statusCode).toBe(200);
    expect(response.body.models).toEqual(["gpt-4o", "gpt-4.1-mini"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const state = await harness.store.readState();
    expect(state.logs[0]?.message).toContain("Tested draft upstream");
  });

  it("exposes sanitized upstream status without returning upstream secrets", async () => {
    const harness = await createTestHarness({
      upstreams: [
        {
          id: "upstream_private",
          name: "Private Provider",
          provider: "openai-compatible",
          baseUrl: "https://private.example.com",
          apiKey: "sk-private",
          models: ["gpt-4o"],
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

    const response = await harness.request.get("/api/admin/state");

    expect(response.status).toBe(200);
    expect(response.body.counts.upstreams).toBe(1);
    expect(response.body.upstreams).toHaveLength(1);
    expect(response.body.upstreams[0]).toMatchObject({
      id: "upstream_private",
      name: "Private Provider",
      endpointHost: "private.example.com",
      apiKey: "sk-p...vate",
      requestCount: 0,
      usedQuota: 0
    });
    expect(response.body.upstreams[0].baseUrl).toBeUndefined();
    expect(response.body.upstreams[0].headers).toBeUndefined();
    expect(JSON.stringify(response.body.upstreams)).not.toContain("sk-private");
  });

  it("health checks saved upstreams and persists probe status", async () => {
    const harness = await createTestHarness({
      upstreams: [
        {
          id: "upstream_health",
          name: "Health Provider",
          provider: "openai-compatible",
          baseUrl: "https://health.example.com",
          apiKey: "sk-health",
          models: ["gpt-4o"],
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

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          object: "list",
          data: [{ id: "gpt-4o" }]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-limit-requests": "100",
            "x-ratelimit-remaining-requests": "80",
            "x-ratelimit-reset-requests": "1m"
          }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await harness.request.post("/api/admin/upstreams/health-check").send({});

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({ alive: 1, dead: 0, skipped: 0 });
    expect(response.body.results[0]).toMatchObject({
      id: "upstream_health",
      ok: true,
      statusCode: 200,
      models: ["gpt-4o"]
    });

    const state = await harness.store.readState();
    expect(state.upstreams[0]?.lastProbeOk).toBe(true);
    expect(state.upstreams[0]?.discoveredModels).toEqual(["gpt-4o"]);
    expect(state.upstreams[0]?.quota?.remainingRequests).toBe(80);
    expect(state.logs[0]?.message).toContain("Health checked upstream");
  });

  it("deletes a saved upstream account", async () => {
    const harness = await createTestHarness({
      upstreams: [
        {
          id: "upstream_delete",
          name: "Delete Me",
          provider: "openai-compatible",
          baseUrl: "https://delete.example.com",
          apiKey: "sk-delete",
          models: ["gpt-5*"],
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

    const response = await harness.request.delete("/api/admin/upstreams/upstream_delete");

    expect(response.status).toBe(204);

    const state = await harness.store.readState();
    expect(state.upstreams).toHaveLength(0);
    expect(state.logs[0]?.message).toContain("Deleted upstream Delete Me");
  });
});
