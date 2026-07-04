import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error Node path module — resolved at runtime by Vite
import { resolve } from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// @ts-expect-error import.meta.dirname available in Node 21+ / Vite 7
const root: string = import.meta.dirname ?? ".";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Multi-page build: main app + standalone dock
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        dock: resolve(root, "dock.html"),
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // Proxy /uploads/* and /api/* to the Tauri overlay server so the dock
    // can load synced JSON files (dock-worship-songs.json, etc.) in dev.
    proxy: {
      "/uploads": {
        target: "http://127.0.0.1:45678",
        changeOrigin: true,
      },
      "/api": {
        target: "http://127.0.0.1:45678",
        changeOrigin: true,
      },
    },
  },
}));
