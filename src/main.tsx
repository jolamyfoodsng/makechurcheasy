import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./fonts.css";
import "./i18n";
import App from "./App";
import { LayoutStoreProvider } from "./hooks/useLayoutStore";
import { AuthProvider } from "./contexts/AuthContext";
import { initOverlayUrl } from "./services/overlayUrl";
import { initAuthStore } from "./services/authService";
import { initAnalytics, captureException } from "./services/analytics";
import { migrateStorageKeys } from "./services/storageMigration";

// Migrate old storage keys before anything else reads them
migrateStorageKeys();

// Initialize analytics before anything else
initAnalytics();

// Global error handler — capture uncaught errors
window.addEventListener("error", (event) => {
  captureException(event.error ?? new Error(event.message), {
    page: window.location.hash,
    source: "window.error",
  });
});
window.addEventListener("unhandledrejection", (event) => {
  captureException(event.reason ?? new Error("Unhandled promise rejection"), {
    page: window.location.hash,
    source: "unhandledrejection",
  });
});

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
void initOverlayUrl();

// Await auth store so the session is in memory before any component reads it
void initAuthStore().then(async () => {
  // Sync church profile from web API on startup (ensures speakers, branding, etc. are in localStorage)
  try {
    const { syncChurchProfile } = await import("./services/churchProfileSync");
    void syncChurchProfile();
  } catch { /* sync is best-effort */ }

  // Start periodic usage sync to server (IndexedDB counts → /api/user/usage)
  try {
    const { startUsageSync } = await import("./services/usageSync");
    startUsageSync();
  } catch { /* usage sync is best-effort */ }

  // Sync any pending offline credit transactions from previous sessions
  try {
    const { syncPendingTransactions } = await import("./services/credits");
    void syncPendingTransactions();
  } catch { /* credit sync is best-effort */ }

  // Load desktop config from API (with cache/fallback) and apply theme overrides
  try {
    const { getDesktopConfig, refreshDesktopConfig } = await import("./services/desktopConfig");
    await getDesktopConfig();

    // Apply admin-configured theme overrides to DEFAULT_THEME_SETTINGS
    const { applyThemeConfigOverrides } = await import("./bible/types");
    applyThemeConfigOverrides();

    // Background refresh every 5 minutes
    setInterval(() => {
      void refreshDesktopConfig().then(() => {
        applyThemeConfigOverrides();
      });
    }, 5 * 60 * 1000);

    // Refresh on window focus and connectivity change
    window.addEventListener("focus", () => {
      void refreshDesktopConfig().then(() => {
        applyThemeConfigOverrides();
      });
    });
    window.addEventListener("online", () => {
      void refreshDesktopConfig().then(() => {
        applyThemeConfigOverrides();
      });
      // Sync pending offline credit transactions when connectivity returns
      import("./services/credits").then(({ syncPendingTransactions }) => {
        void syncPendingTransactions();
      }).catch(() => { /* credit sync is best-effort */ });
    });
  } catch { /* config loading is best-effort, falls back to defaults */ }

  // MakeChurchEasy Dock uses a real pathname (/dock), not a hash route.
  // Intercept before HashRouter mounts so the dock page works standalone.
  if (window.location.pathname === "/dock" || window.location.pathname === "/dock/") {
    // Initialize BroadcastChannel before React renders
    import("./services/dockBridge").then(({ dockClient }) => dockClient.init());
    Promise.all([
      import("./dock/DockPage"),
      import("./dock/DockAuthGate"),
      import("./dock/dock.css"),
      import("./dock/dock-auth.css"),
    ]).then(([{ default: DockPage }, { default: DockAuthGate }]) => {
      root.render(
        <React.StrictMode>
          <DockAuthGate>
            <DockPage />
          </DockAuthGate>
        </React.StrictMode>
      );
    });
  } else {
    root.render(
      <React.StrictMode>
        <HashRouter>
          <AuthProvider>
            <LayoutStoreProvider>
              <App />
            </LayoutStoreProvider>
          </AuthProvider>
        </HashRouter>
      </React.StrictMode>
    );
  }
});
