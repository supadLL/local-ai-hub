import cors from "cors";
import express from "express";
import path from "node:path";
import { appConfig } from "./config.js";
import { createAdminRouter } from "./routes/admin.js";
import { createProxyRouter } from "./routes/proxy.js";
import { createId } from "./services/keys.js";
import { UpstreamSelector } from "./services/upstreams.js";
import { FileStore } from "./store/file-store.js";

export interface CreateAppOptions {
  store?: FileStore;
  selector?: UpstreamSelector;
  staticDir?: string;
  enableRequestLogging?: boolean;
}

interface RequestLogPayload {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip: string;
}

function createRequestId(req: express.Request): string {
  const incoming = req.header("x-request-id")?.trim();
  return incoming || createId("req");
}

function logRequest(payload: RequestLogPayload): void {
  console.log(
    JSON.stringify({
      kind: "http_request",
      service: "local-ai-hub",
      ...payload
    })
  );
}

export function createApp(options: CreateAppOptions = {}) {
  const store = options.store ?? new FileStore(appConfig.dataFilePath);
  const selector = options.selector ?? new UpstreamSelector();
  const staticDir = options.staticDir ?? path.resolve(process.cwd(), "public");
  const enableRequestLogging = options.enableRequestLogging ?? true;

  const app = express();

  app.use((req, res, next) => {
    const requestId = createRequestId(req);
    const startedAt = Date.now();

    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    if (enableRequestLogging) {
      res.on("finish", () => {
        logRequest({
          requestId,
          method: req.method,
          path: req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
          ip: req.ip || req.socket.remoteAddress || "unknown"
        });
      });
    }

    next();
  });

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.static(staticDir));

  app.get("/health", async (_req, res, next) => {
    try {
      const state = await store.readState();
      res.json({
        ok: true,
        service: "local-ai-hub",
        host: appConfig.host,
        port: appConfig.port,
        counts: {
          upstreams: state.upstreams.length,
          clientKeys: state.clientKeys.length,
          enabledUpstreams: state.upstreams.filter((item) => item.enabled).length,
          enabledClientKeys: state.clientKeys.filter((item) => item.enabled).length
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/admin", createAdminRouter(store));
  app.use(createProxyRouter(store, selector));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const requestId =
      typeof res.locals.requestId === "string" ? res.locals.requestId : "request-id-missing";

    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({
        error: "invalid_json",
        message: "Request body must be valid JSON."
      });
      return;
    }

    if (error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number") {
      res.status(error.statusCode).json({
        error: "request_error",
        message: "message" in error ? String(error.message) : "Request failed."
      });
      return;
    }

    if (error && typeof error === "object" && "issues" in error) {
      res.status(400).json({
        error: "validation_error",
        details: (error as { issues: unknown }).issues
      });
      return;
    }

    console.error(`[local-ai-hub] request ${requestId} failed`);
    console.error(error);

    res.status(500).json({
      error: "internal_server_error",
      message: error instanceof Error ? error.message : "Unknown server error"
    });
  });

  return {
    app,
    store,
    selector
  };
}
