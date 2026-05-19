import fs from "node:fs/promises";
import path from "node:path";
import { appConfig } from "../config.js";
import type { AppState } from "../types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultState(): AppState {
  const now = nowIso();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    upstreams: [],
    clientKeys: [],
    logs: []
  };
}

export class FileStore {
  private state: AppState | null = null;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  dataDir(): string {
    return path.dirname(this.filePath);
  }

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      try {
        const content = await fs.readFile(this.filePath, "utf8");
        this.state = JSON.parse(content) as AppState;
      } catch {
        this.state = createDefaultState();
        await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
      }
    })();

    return this.initPromise;
  }

  async readState(): Promise<AppState> {
    await this.init();
    return structuredClone(this.state as AppState);
  }

  async mutate<T>(mutator: (draft: AppState) => T | Promise<T>): Promise<T> {
    await this.init();
    const draft = structuredClone(this.state as AppState);
    const result = await mutator(draft);
    draft.updatedAt = nowIso();
    draft.logs = draft.logs.slice(0, appConfig.logRetention);
    this.state = draft;
    await this.enqueueWrite(draft);
    return result;
  }

  private async enqueueWrite(nextState: AppState): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.writeFile(this.filePath, JSON.stringify(nextState, null, 2), "utf8");
    });
    return this.writeQueue;
  }
}
