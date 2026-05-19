import fs from "node:fs";
import path from "node:path";
import { appConfig } from "../config.js";
import type { AppState, UpstreamUsage } from "../types.js";
import { normalizeUpstreamUsage } from "./usage.js";

export type UsageHistoryRange = number | "all";
export type UsageGranularity = "raw" | "five_min" | "hourly" | "daily";

export interface UsageSnapshot {
  timestamp: string;
  totals: UsageTotals;
}

export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  request_count: number;
  active_accounts: number;
  total_accounts: number;
}

export interface UsageDataPoint {
  timestamp: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  request_count: number;
}

export interface UsageSummary {
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cached_tokens: number;
  total_reasoning_tokens: number;
  total_request_count: number;
  total_accounts: number;
  active_accounts: number;
}

interface UsageBaseline {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  request_count: number;
}

interface UsageHistoryFile {
  version: 1;
  snapshots: UsageSnapshot[];
  baseline?: UsageBaseline;
}

const defaultBaseline: UsageBaseline = {
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
  cached_tokens: 0,
  reasoning_tokens: 0,
  request_count: 0
};

export class UsageStatsStore {
  private snapshots: UsageSnapshot[] = [];
  private baseline: UsageBaseline = { ...defaultBaseline };

  constructor(private readonly filePath: string) {
    this.load();
  }

  getSummary(state: AppState): UsageSummary {
    const live = this.stateTotals(state);
    return {
      total_input_tokens: this.baseline.input_tokens + live.input_tokens,
      total_output_tokens: this.baseline.output_tokens + live.output_tokens,
      total_tokens: this.baseline.total_tokens + live.total_tokens,
      total_cached_tokens: this.baseline.cached_tokens + live.cached_tokens,
      total_reasoning_tokens: this.baseline.reasoning_tokens + live.reasoning_tokens,
      total_request_count: this.baseline.request_count + live.request_count,
      total_accounts: live.total_accounts,
      active_accounts: live.active_accounts
    };
  }

  recordSnapshot(state: AppState): void {
    const live = this.stateTotals(state);
    const nowMs = Date.now();

    if (this.snapshots.length === 0) {
      this.snapshots.push({
        timestamp: new Date(nowMs - 1).toISOString(),
        totals: {
          ...this.baseline,
          active_accounts: live.active_accounts,
          total_accounts: live.total_accounts
        }
      });
    }

    const lastSnapshot = this.snapshots.at(-1);
    if (lastSnapshot) {
      const previousLive = {
        input_tokens: lastSnapshot.totals.input_tokens - this.baseline.input_tokens,
        output_tokens: lastSnapshot.totals.output_tokens - this.baseline.output_tokens,
        total_tokens: lastSnapshot.totals.total_tokens - this.baseline.total_tokens,
        cached_tokens: lastSnapshot.totals.cached_tokens - this.baseline.cached_tokens,
        reasoning_tokens: lastSnapshot.totals.reasoning_tokens - this.baseline.reasoning_tokens,
        request_count: lastSnapshot.totals.request_count - this.baseline.request_count
      };
      if (usageDropped(live, previousLive)) {
        this.baseline = {
          input_tokens: this.baseline.input_tokens + Math.max(0, previousLive.input_tokens - live.input_tokens),
          output_tokens: this.baseline.output_tokens + Math.max(0, previousLive.output_tokens - live.output_tokens),
          total_tokens: this.baseline.total_tokens + Math.max(0, previousLive.total_tokens - live.total_tokens),
          cached_tokens: this.baseline.cached_tokens + Math.max(0, previousLive.cached_tokens - live.cached_tokens),
          reasoning_tokens: this.baseline.reasoning_tokens + Math.max(0, previousLive.reasoning_tokens - live.reasoning_tokens),
          request_count: this.baseline.request_count + Math.max(0, previousLive.request_count - live.request_count)
        };
      }
    }

    this.snapshots.push({
      timestamp: new Date(nowMs).toISOString(),
      totals: {
        input_tokens: this.baseline.input_tokens + live.input_tokens,
        output_tokens: this.baseline.output_tokens + live.output_tokens,
        total_tokens: this.baseline.total_tokens + live.total_tokens,
        cached_tokens: this.baseline.cached_tokens + live.cached_tokens,
        reasoning_tokens: this.baseline.reasoning_tokens + live.reasoning_tokens,
        request_count: this.baseline.request_count + live.request_count,
        active_accounts: live.active_accounts,
        total_accounts: live.total_accounts
      }
    });

    this.prune();
    this.save();
  }

  getHistory(range: UsageHistoryRange, granularity: UsageGranularity): UsageDataPoint[] {
    const cutoff = range === "all" ? null : Date.now() - range * 60 * 60 * 1000;
    const filtered =
      cutoff === null
        ? this.snapshots
        : this.snapshots.filter((snapshot) => Date.parse(snapshot.timestamp) >= cutoff);

    if (filtered.length < 2) {
      return [];
    }

    const deltas: UsageDataPoint[] = [];
    for (let index = 1; index < filtered.length; index += 1) {
      const previous = filtered[index - 1].totals;
      const current = filtered[index].totals;
      deltas.push({
        timestamp: filtered[index].timestamp,
        input_tokens: Math.max(0, current.input_tokens - previous.input_tokens),
        output_tokens: Math.max(0, current.output_tokens - previous.output_tokens),
        total_tokens: Math.max(0, current.total_tokens - previous.total_tokens),
        cached_tokens: Math.max(0, current.cached_tokens - previous.cached_tokens),
        reasoning_tokens: Math.max(0, current.reasoning_tokens - previous.reasoning_tokens),
        request_count: Math.max(0, current.request_count - previous.request_count)
      });
    }

    if (granularity === "raw") {
      return deltas;
    }

    const bucketMs =
      granularity === "five_min" ? 5 * 60_000 :
      granularity === "hourly" ? 60 * 60_000 :
      24 * 60 * 60_000;
    return bucketize(deltas, bucketMs);
  }

  private stateTotals(state: AppState): UsageTotals {
    let input_tokens = 0;
    let output_tokens = 0;
    let total_tokens = 0;
    let cached_tokens = 0;
    let reasoning_tokens = 0;
    let request_count = 0;
    let active_accounts = 0;

    for (const upstream of state.upstreams) {
      const usage = normalizeUpstreamUsage(upstream);
      input_tokens += usage.input_tokens;
      output_tokens += usage.output_tokens;
      total_tokens += usage.total_tokens;
      cached_tokens += usage.cached_tokens;
      reasoning_tokens += usage.reasoning_tokens;
      request_count += usage.request_count;
      if (upstream.enabled) {
        active_accounts += 1;
      }
    }

    return {
      input_tokens,
      output_tokens,
      total_tokens,
      cached_tokens,
      reasoning_tokens,
      request_count,
      active_accounts,
      total_accounts: state.upstreams.length
    };
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<UsageHistoryFile>;
      this.snapshots = Array.isArray(parsed.snapshots) ? parsed.snapshots.map(normalizeSnapshot) : [];
      this.baseline = normalizeBaseline(parsed.baseline);
    } catch {
      this.snapshots = [];
      this.baseline = { ...defaultBaseline };
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, snapshots: this.snapshots, baseline: this.baseline }, null, 2), "utf8");
      fs.renameSync(tmp, this.filePath);
    } catch (error) {
      console.error("[UsageStats] Failed to persist usage history:", error instanceof Error ? error.message : error);
    }
  }

  private prune(): void {
    const retention = appConfig.usageHistoryRetentionDays;
    if (retention === null) {
      return;
    }
    const cutoff = Date.now() - retention * 24 * 60 * 60_000;
    this.snapshots = this.snapshots.filter((snapshot) => Date.parse(snapshot.timestamp) >= cutoff);
  }
}

export function createUsageStatsStore(dataDir: string): UsageStatsStore {
  return new UsageStatsStore(path.resolve(dataDir, "usage-history.json"));
}

function normalizeUsageTotals(value: Partial<UsageTotals> | undefined): UsageTotals {
  return {
    input_tokens: finite(value?.input_tokens),
    output_tokens: finite(value?.output_tokens),
    total_tokens: finite(value?.total_tokens),
    cached_tokens: finite(value?.cached_tokens),
    reasoning_tokens: finite(value?.reasoning_tokens),
    request_count: finite(value?.request_count),
    active_accounts: finite(value?.active_accounts),
    total_accounts: finite(value?.total_accounts)
  };
}

function normalizeSnapshot(snapshot: UsageSnapshot): UsageSnapshot {
  return {
    timestamp: typeof snapshot.timestamp === "string" ? snapshot.timestamp : new Date().toISOString(),
    totals: normalizeUsageTotals(snapshot.totals)
  };
}

function normalizeBaseline(value: Partial<UsageBaseline> | undefined): UsageBaseline {
  return {
    input_tokens: finite(value?.input_tokens),
    output_tokens: finite(value?.output_tokens),
    total_tokens: finite(value?.total_tokens),
    cached_tokens: finite(value?.cached_tokens),
    reasoning_tokens: finite(value?.reasoning_tokens),
    request_count: finite(value?.request_count)
  };
}

function finite(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function usageDropped(current: UpstreamUsage | UsageBaseline, previous: UsageBaseline): boolean {
  return (
    current.input_tokens < previous.input_tokens ||
    current.output_tokens < previous.output_tokens ||
    current.total_tokens < previous.total_tokens ||
    current.cached_tokens < previous.cached_tokens ||
    current.reasoning_tokens < previous.reasoning_tokens ||
    current.request_count < previous.request_count
  );
}

function bucketize(deltas: UsageDataPoint[], bucketMs: number): UsageDataPoint[] {
  const buckets = new Map<number, UsageDataPoint>();

  for (const point of deltas) {
    const timestamp = Date.parse(point.timestamp);
    if (!Number.isFinite(timestamp)) {
      continue;
    }
    const bucketKey = Math.floor(timestamp / bucketMs) * bucketMs;
    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.input_tokens += point.input_tokens;
      existing.output_tokens += point.output_tokens;
      existing.total_tokens += point.total_tokens;
      existing.cached_tokens += point.cached_tokens;
      existing.reasoning_tokens += point.reasoning_tokens;
      existing.request_count += point.request_count;
    } else {
      buckets.set(bucketKey, {
        timestamp: new Date(bucketKey).toISOString(),
        input_tokens: point.input_tokens,
        output_tokens: point.output_tokens,
        total_tokens: point.total_tokens,
        cached_tokens: point.cached_tokens,
        reasoning_tokens: point.reasoning_tokens,
        request_count: point.request_count
      });
    }
  }

  return [...buckets.values()].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}
