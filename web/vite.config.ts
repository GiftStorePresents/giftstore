// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Porty/URL-e
const DEV_PORT = Number(process.env.PORT || 3000);
const ENV_API = process.env.VITE_API_URL || process.env.API_TARGET || "http://localhost:4000";
const API_TARGET = String(ENV_API).replace(/\/+$/, ""); // bez trailing slash

export default defineConfig({
  plugins: [tsconfigPaths(), react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@data": path.resolve(__dirname, "./src/data"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },

  server: {
    port: DEV_PORT,
    strictPort: true,
    cors: true,
    fs: {
      allow: [
        path.resolve(__dirname, ".."),
        path.resolve(__dirname, "../shared"),
      ],
    },
    hmr: {
      clientPort: DEV_PORT,
      overlay: true,
    },
    proxy: {
      // API → backend (Express na 4000)
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      // Uploady serwowane przez backend
      "/uploads": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    target: "es2020",
    sourcemap: true,
  },

  preview: {
    port: DEV_PORT,
    strictPort: true,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
      "/uploads": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});