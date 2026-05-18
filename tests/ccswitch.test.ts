import { afterEach, describe, expect, it } from "vitest";
import { buildCCSwitchImportUrl } from "../src/services/ccswitch.js";
import { createTestHarness } from "./helpers.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("ccswitch integration", () => {
  it("builds a provider import URL for the local gateway", () => {
    const importUrl = buildCCSwitchImportUrl({
      app: "codex",
      name: "Local AI Hub Codex",
      apiKey: "lah_secret_key",
      model: "gpt-5.2",
      haikuModel: "gpt-5-mini",
      sonnetModel: "gpt-5.2",
      opusModel: "gpt-5.5"
    });

    const parsed = new URL(importUrl);

    expect(parsed.protocol).toBe("ccswitch:");
    expect(parsed.host).toBe("v1");
    expect(parsed.pathname).toBe("/import");
    expect(parsed.searchParams.get("resource")).toBe("provider");
    expect(parsed.searchParams.get("app")).toBe("codex");
    expect(parsed.searchParams.get("endpoint")).toBe("http://127.0.0.1:4100/v1");
    expect(parsed.searchParams.get("apiKey")).toBe("lah_secret_key");
    expect(parsed.searchParams.get("model")).toBe("gpt-5.2");
    expect(parsed.searchParams.get("haikuModel")).toBe("gpt-5-mini");
    expect(parsed.searchParams.get("sonnetModel")).toBe("gpt-5.2");
    expect(parsed.searchParams.get("opusModel")).toBe("gpt-5.5");
    expect(parsed.searchParams.get("enabled")).toBe("true");
  });

  it("returns a browser protocol import link with the stored raw client key", async () => {
    const harness = await createTestHarness({
      clientKeys: [
        {
          id: "ck_ccswitch",
          name: "ccswitch-dev",
          key: "lah_stored_secret",
          allowedModels: ["gpt-5*"],
          enabled: true,
          quotaLimit: null,
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
      .post("/api/admin/client-keys/ck_ccswitch/ccswitch/open")
      .send({
        app: "claude",
        model: "gpt-5.2",
        name: "Local AI Hub Claude Code",
        haikuModel: "gpt-5-mini",
        sonnetModel: "gpt-5.2",
        opusModel: "gpt-5.5"
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.importUrl).toContain("ccswitch://v1/import?");
    expect(response.body.importUrl).toContain("apiKey=lah_stored_secret");
    expect(response.body.importUrl).toContain("app=claude");
    expect(response.body.importUrl).toContain("model=gpt-5.2");
    expect(response.body.importUrl).toContain("haikuModel=gpt-5-mini");
    expect(response.body.importUrl).toContain("sonnetModel=gpt-5.2");
    expect(response.body.importUrl).toContain("opusModel=gpt-5.5");
    const state = await harness.store.readState();
    expect(state.logs[0]?.message).toContain("Opened CCSwitch import");
  });

  it("returns 404 when the requested local key does not exist", async () => {
    const harness = await createTestHarness();
    cleanups.push(harness.cleanup);

    const response = await harness.request
      .post("/api/admin/client-keys/missing/ccswitch/open")
      .send({
        app: "codex",
        model: "gpt-5.2"
      });

    expect(response.status).toBe(404);
  });
});
