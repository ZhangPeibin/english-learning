import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";

const appDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ command, mode }) => {
  const backendEnv = loadEnv(mode, fileURLToPath(new URL("../voice-backend", import.meta.url)), "");
  const accessToken = process.env.VOICE_ACCESS_TOKEN ?? backendEnv.VOICE_ACCESS_TOKEN;
  const target = process.env.VOICE_BACKEND_URL ?? backendEnv.VOICE_BACKEND_URL ?? "http://127.0.0.1:3000";

  if (command === "serve" && mode !== "test" && !accessToken) {
    throw new Error("VOICE_ACCESS_TOKEN is missing from apps/voice-backend/.env");
  }

  const proxyTarget = (path: string): ProxyOptions => ({
    target,
    changeOrigin: true,
    ...(path === "/v1" && accessToken
      ? { headers: { authorization: `Bearer ${accessToken}` } }
      : {})
  });

  return {
    root: appDir,
    server: {
      port: 5173,
      strictPort: true,
      proxy: { "/v1": proxyTarget("/v1"), "/health": proxyTarget("/health") }
    },
    preview: {
      port: 4173,
      strictPort: true,
      proxy: { "/v1": proxyTarget("/v1"), "/health": proxyTarget("/health") }
    }
  };
});
