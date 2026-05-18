import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import path from "node:path";
import { defineConfig } from "vite";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const proxyTarget = process.env.VITE_API_TARGET || `http://127.0.0.1:${process.env.PORT || "4100"}`;

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, "../public"),
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": proxyTarget,
      "/v1": proxyTarget,
      "/health": proxyTarget
    }
  }
});
