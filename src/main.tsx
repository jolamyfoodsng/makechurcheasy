import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
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
