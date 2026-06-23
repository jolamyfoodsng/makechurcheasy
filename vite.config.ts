import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { DEFAULT_PLAN_CONFIG, FEATURE_LABELS, deriveFeatureRequiredPlan } from "./src/services/planConfigTypes";

const host = process.env.TAURI_DEV_HOST;

const root: string = import.meta.dirname ?? ".";

// Read version from package.json at build time
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
const APP_VERSION: string = pkg.version;

// Auth session file — written by desktop app, read by OBS dock.
// In dev the overlay server doesn't have the Rust auth endpoints yet,
// so this Vite plugin handles them directly.
const SESSION_FILE = resolve(root, "makechurcheasy-session.json");

// The overlay server (Rust) reads from ~/Documents/MakeChurchEasy/makechurcheasy-session.json.
// On logout we must delete from BOTH locations so the dock can't still see a stale session.
const OVERLAY_SESSION_FILE = resolve(homedir(), "Documents", "MakeChurchEasy", "makechurcheasy-session.json");

// ── Entitlement Server Config ─────────────────────────────────────────────────
// Default plan entitlements — derived from src/services/planConfigTypes.ts (single source of truth).
// The local server uses these as the source of truth for entitlement checks.
const DEFAULT_ENTITLEMENTS: Record<string, Record<string, number | boolean>> = {};
for (const [tier, config] of Object.entries(DEFAULT_PLAN_CONFIG.plans)) {
  DEFAULT_ENTITLEMENTS[tier] = config.entitlements as unknown as Record<string, number | boolean>;
}

// Minimum plan tier required for each feature — derived at runtime, NOT hardcoded.
const FEATURE_REQUIRED_PLAN: Record<string, string> = deriveFeatureRequiredPlan(DEFAULT_PLAN_CONFIG);

function authSessionPlugin(): Plugin {
  return {
    name: "auth-session",
    configureServer(server) {
      server.middlewares.use("/api/auth/status", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        if (existsSync(SESSION_FILE)) {
          try {
            const data = JSON.parse(readFileSync(SESSION_FILE, "utf-8"));
            if (data.expiresAt && Date.now() < data.expiresAt) {
              res.end(JSON.stringify({ authenticated: true, ...data }));
            } else {
              res.end('{"authenticated":false}');
            }
          } catch {
            res.end('{"authenticated":false}');
          }
        } else {
          res.end('{"authenticated":false}');
        }
      });

      server.middlewares.use("/api/auth/session", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.end("");
          return;
        }

        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", () => {
            const trimmed = body.trim();
            // Empty body OR {"clear":true} = logout
            if (trimmed && !trimmed.includes('"clear"')) {
              writeFileSync(SESSION_FILE, body, "utf-8");
            } else {
              // Empty body = logout: delete from both Vite and overlay server paths
              if (existsSync(SESSION_FILE)) {
                unlinkSync(SESSION_FILE);
              }
              if (existsSync(OVERLAY_SESSION_FILE)) {
                unlinkSync(OVERLAY_SESSION_FILE);
              }
            }
            res.end('{"ok":true}');
          });
          return;
        }

        res.statusCode = 405;
        res.end('{"error":"Method not allowed"}');
      });
    },
  };
}

// ── Entitlement Server Plugin ─────────────────────────────────────────────────
// Local HTTP server that verifies every feature-gated action.
// UI actions POST to /api/entitlement/check → { allowed, reason, limit }.
// Works offline since plan config is embedded in the middleware.
function entitlementServerPlugin(): Plugin {
  return {
    name: "entitlement-server",
    configureServer(server) {
      // POST /api/entitlement/check — verify a single feature action
      server.middlewares.use("/api/entitlement/check", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.end("");
          return;
        }

        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk; });
        req.on("end", () => {
          try {
            const { feature, plan, currentCount = 0 } = JSON.parse(body);

            if (!feature || typeof feature !== "string") {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "feature is required" }));
              return;
            }

            const planKey = (plan || "free").toLowerCase();
            const entitlements = DEFAULT_ENTITLEMENTS[planKey] || DEFAULT_ENTITLEMENTS.free;
            const limit = entitlements[feature as keyof typeof entitlements];
            const label = FEATURE_LABELS[feature] || feature;
            const requiredPlan = FEATURE_REQUIRED_PLAN[feature] || "basic";

            // Boolean features (multiview, tickers, massImport, etc.)
            if (typeof limit === "boolean") {
              res.end(JSON.stringify({
                allowed: limit,
                limit: limit ? -1 : 0,
                reason: limit ? undefined : `${label} requires ${capitalize(requiredPlan)} plan or higher.`,
                requiredPlan: limit ? undefined : requiredPlan,
              }));
              return;
            }

            // Numeric resource features (songs, images, videos, etc.)
            if (typeof limit === "number") {
              const isUnlimited = limit === -1 || limit === Infinity;
              const allowed = isUnlimited || currentCount < limit;
              const remaining = isUnlimited ? -1 : Math.max(0, limit - currentCount);
              res.end(JSON.stringify({
                allowed,
                limit,
                current: currentCount,
                remaining,
                reason: allowed ? undefined : `${label} limit reached (${currentCount}/${limit}). Upgrade to ${capitalize(requiredPlan)} for more.`,
                requiredPlan: allowed ? undefined : requiredPlan,
              }));
              return;
            }

            // Unknown feature
            res.statusCode = 400;
            res.end(JSON.stringify({ error: `Unknown feature: ${feature}` }));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
        });
      });

      // GET /api/entitlement/config — return full plan config for client-side caching
      server.middlewares.use("/api/entitlement/config", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");

        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.end("");
          return;
        }

        res.end(JSON.stringify({
          plans: DEFAULT_ENTITLEMENTS,
          featureLabels: FEATURE_LABELS,
          requiredPlans: FEATURE_REQUIRED_PLAN,
          updatedAt: new Date().toISOString(),
        }));
      });
    },
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), authSessionPlugin(), entitlementServerPlugin()],

  resolve: {
    alias: {
      "@": resolve(root, "src"),
    },
  },

  // Expose version to the app at build time
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },

  // Multi-page build: main app + standalone dock + LM dock
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        dock: resolve(root, "dock.html"),
        "lm-dock": resolve(root, "lm-dock.html"),
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
