import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readNullableInt(value: string | undefined, fallback: number | null): number | null {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  if (value.trim().toLowerCase() === "null") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const appConfig = {
  host: process.env.HOST || "127.0.0.1",
  port: readInt(process.env.PORT, 4100),
  dataFilePath: path.resolve(process.cwd(), process.env.DATA_FILE || "./data/state.json"),
  logRetention: readInt(process.env.LOG_RETENTION, 200),
  usageHistoryRetentionDays: readNullableInt(process.env.USAGE_HISTORY_RETENTION_DAYS, 90)
};
