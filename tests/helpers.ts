import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../src/app.js";
import { FileStore } from "../src/store/file-store.js";
import type { AppState } from "../src/types.js";

interface TestHarness {
  request: request.SuperTest<request.Test>;
  store: FileStore;
  cleanup: () => Promise<void>;
}

function createBaseState(): AppState {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    upstreams: [],
    clientKeys: [],
    logs: []
  };
}

export async function createTestHarness(
  overrides: Partial<AppState> = {}
): Promise<TestHarness> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-ai-hub-test-"));
  const filePath = path.join(tempDir, "state.json");
  const initialState: AppState = {
    ...createBaseState(),
    ...overrides,
    upstreams: overrides.upstreams ?? [],
    clientKeys: overrides.clientKeys ?? [],
    logs: overrides.logs ?? []
  };

  await fs.writeFile(filePath, JSON.stringify(initialState, null, 2), "utf8");

  const store = new FileStore(filePath);
  await store.init();

  const { app } = createApp({
    store,
    enableRequestLogging: false
  });

  return {
    request: request(app),
    store,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
}
