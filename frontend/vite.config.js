import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const allowedHosts = (env.VITE_ALLOWED_HOSTS ?? "translate.apostol.ink")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      allowedHosts,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
