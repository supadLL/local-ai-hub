import { spawn } from "node:child_process";
import { appConfig } from "../config.js";

export type CCSwitchApp = "codex" | "claude" | "gemini";

export interface OpenCCSwitchInput {
  app: CCSwitchApp;
  name: string;
  apiKey: string;
  model: string;
  haikuModel?: string;
  sonnetModel?: string;
  opusModel?: string;
}

function localGatewayBaseUrl(): string {
  const host = appConfig.host === "0.0.0.0" || appConfig.host === "::" ? "127.0.0.1" : appConfig.host;
  return `http://${host}:${appConfig.port}`;
}

export function buildCCSwitchImportUrl(input: OpenCCSwitchInput): string {
  const serverAddress = localGatewayBaseUrl();
  const endpoint = input.app === "codex" ? `${serverAddress}/v1` : serverAddress;
  const params = new URLSearchParams();
  params.set("resource", "provider");
  params.set("app", input.app);
  params.set("name", input.name);
  params.set("endpoint", endpoint);
  params.set("apiKey", input.apiKey);
  params.set("model", input.model);
  if (input.haikuModel) {
    params.set("haikuModel", input.haikuModel);
  }
  if (input.sonnetModel) {
    params.set("sonnetModel", input.sonnetModel);
  }
  if (input.opusModel) {
    params.set("opusModel", input.opusModel);
  }
  params.set("homepage", serverAddress);
  params.set("enabled", "true");
  return `ccswitch://v1/import?${params.toString()}`;
}

function protocolOpenCommand(url: string): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      command: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", url]
    };
  }

  if (process.platform === "darwin") {
    return {
      command: "open",
      args: [url]
    };
  }

  return {
    command: "xdg-open",
    args: [url]
  };
}

export function openCCSwitchImport(input: OpenCCSwitchInput): string {
  const url = buildCCSwitchImportUrl(input);
  const { command, args } = protocolOpenCommand(url);

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.on("error", () => {
    // The OS reports missing protocol handlers asynchronously. The UI receives
    // a best-effort success because local protocol launch support is platform dependent.
  });
  child.unref();
  return url;
}
