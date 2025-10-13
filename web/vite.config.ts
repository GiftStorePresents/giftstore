// web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@data": path.resolve(__dirname, "src/data"),
      "@components": path.resolve(__dirname, "src/components"),
    },
  },
  server: {
    port: 3000,
    strictPort: true,        // jeśli 3000 zajęte -> błąd zamiast losowego portu
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        secure: false,
        // jeśli backend NIE ma prefiksu /api i chcesz go zdjąć:
        // rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/uploads": {
        target: "http://localhost:4000",
        changeOrigin: true,
        secure: false,
      },
    },
    // hmr: { overlay: true }, // default; wyłączysz overlay -> false
  },
});
