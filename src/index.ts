import { createApp } from "./app.js";
import { appConfig } from "./config.js";

async function main(): Promise<void> {
  const { app, store } = createApp();
  await store.init();

  app.listen(appConfig.port, appConfig.host, () => {
    console.log(`[local-ai-hub] listening on http://${appConfig.host}:${appConfig.port}`);
    console.log("[local-ai-hub] only import upstream accounts that you own or are explicitly authorized to operate.");
  });
}

main().catch((error) => {
  console.error("[local-ai-hub] fatal startup error");
  console.error(error);
  process.exitCode = 1;
});
