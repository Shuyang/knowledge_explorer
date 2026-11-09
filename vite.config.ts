import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.KE_PORT ?? 5175);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": `http://localhost:${apiPort}` },
  },
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
} as Parameters<typeof defineConfig>[0]);
