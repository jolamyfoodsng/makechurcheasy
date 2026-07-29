import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "./fonts.css";
import "./i18n";
import App from "./App";
import { LayoutStoreProvider } from "./hooks/useLayoutStore";
import { AuthProvider } from "./contexts/AuthContext";
import DesktopBrowserGate from "./components/DesktopBrowserGate";
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

function getPublicPresentationSessionId(): string | null {
  const match = window.location.pathname.match(/^\/p\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function renderPresentationOpening(message = "Opening presentation screen...") {
  root.render(
    <React.StrictMode>
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#000", color: "#f8fafc", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid #1D4ED8", borderTopColor: "transparent", animation: "spin 0.6s linear infinite" }} />
          <span>{message}</span>
        </div>
      </div>
    </React.StrictMode>,
  );
}

async function openPublicPresentationRoute(sessionId: string) {
  renderPresentationOpening();

  try {
    const { getPresentationRemoteAccessInfo } = await import("./services/presentationRemote");
    const info = await getPresentationRemoteAccessInfo(sessionId);
    const candidates = [info.localLink, info.link].filter(Boolean);
    const current = new URL(window.location.href);
    const target = candidates.find((candidate) => {
      try {
        const parsed = new URL(candidate);
        return parsed.origin !== current.origin || parsed.pathname !== current.pathname;
      } catch {
        return false;
      }
    });

    if (target) {
      window.location.replace(target);
      return;
    }

    const params = new URLSearchParams({ sessionId });
    if (info.wsPort > 0) params.set("wsPort", String(info.wsPort));
    window.location.replace(`/presentation.html?${params.toString()}`);
  } catch (error) {
    console.warn("[PresentationRoute] Could not open presentation server:", error);
    const params = new URLSearchParams({ sessionId });
    window.location.replace(`/presentation.html?${params.toString()}`);
  }
}

const appRouter = createHashRouter([
  {
    path: "*",
    element: (
      <DesktopBrowserGate>
        <AuthProvider>
          <LayoutStoreProvider>
            <App />
          </LayoutStoreProvider>
        </AuthProvider>
      </DesktopBrowserGate>
    ),
  },
]);

const publicPresentationSessionId = getPublicPresentationSessionId();

// Await auth store so the session is in memory before any component reads it.
// initAuthStore no longer blocks on network (plan refresh is fire-and-forget),
// so this resolves immediately from local storage.
if (publicPresentationSessionId) {
  void openPublicPresentationRoute(publicPresentationSessionId);
} else {
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
    await refreshDesktopConfig().catch(() => getDesktopConfig());

    // Apply admin-configured theme overrides to DEFAULT_THEME_SETTINGS
    const { applyThemeConfigOverrides } = await import("./bible/types");
    applyThemeConfigOverrides();

    const refreshDesktopSettings = () => {
      void refreshDesktopConfig().then(() => {
        applyThemeConfigOverrides();
      });
    };

    // Background refresh every 5 minutes
    setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshDesktopSettings();
    }, 5 * 60 * 1000);

    // Refresh on window focus and connectivity change
    window.addEventListener("focus", refreshDesktopSettings);
    window.addEventListener("online", () => {
      refreshDesktopSettings();
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
        <RouterProvider router={appRouter} />
      </React.StrictMode>
    );
  }
});
}
