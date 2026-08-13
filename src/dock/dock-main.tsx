/**
 * dock-main.tsx — Standalone entry point for the MakeChurchEasy Dock.
 *
 * This file is the entry for dock.html, which OBS loads directly in its
 * Custom Browser Dock feature. It renders DockPage without any of the
 * main app infrastructure (no HashRouter, no Tauri gates, no splash screen).
 *
 * URL in OBS: http://127.0.0.1:<overlay-port>/dock.html
 */

import React from "react";
import ReactDOM from "react-dom/client";
import "../i18n";
import i18n from "../i18n";
import { resolveInterfaceLocale } from "../i18n/localeCatalog";
import DockPage from "./DockPage";
import DockAuthGate from "./DockAuthGate";
import { dockClient } from "../services/dockBridge";
import { getDesktopConfig } from "../services/desktopConfig";
import { initOverlayUrl } from "../services/overlayUrl";
import "../fonts.css";
import "./dock.css";
import "./dock-auth.css";

// Initialize BroadcastChannel before React renders so child components
// can immediately send/receive messages in their first useEffect cycle.
dockClient.init();

// Listen for language changes from the main app
dockClient.onState((msg) => {
  if (msg.type === "state:language-changed") {
    const payload = msg.payload as { code: string } | null;
    if (payload?.code) {
      const code = resolveInterfaceLocale(payload.code);
      void i18n.changeLanguage(code);
      localStorage.setItem("mce_interface_language", code);
    }
  }
});

function bootstrapDock() {
  // The dock runs outside the main app bootstrap, so seed the shared
  // config/overlay caches here before DockPage starts auto-connecting.
  // Do this in the background so a slow/unreachable API cannot leave the
  // OBS dock blank while it waits for remote configuration.
  void Promise.all([
    getDesktopConfig(),
    initOverlayUrl(),
  ]).catch(() => {
    // Fall back to defaults; DockPage will still render and retry.
  });

  const el = document.getElementById("dock-root");
  if (!el) return;

  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <DockAuthGate>
        <DockPage />
      </DockAuthGate>
    </React.StrictMode>
  );
}

bootstrapDock();
