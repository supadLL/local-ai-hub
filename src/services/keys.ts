import crypto from "node:crypto";
import type { Request } from "express";

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function createOpaqueKey(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(18).toString("hex")}`;
}

export function extractBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }
  return token.trim();
}

export function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return "*".repeat(secret.length);
  }
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}
