/**
 * lm-dock-main.tsx — Standalone entry point for the LM (Language Model) Dock.
 *
 * This dock provides speech-to-Bible lookup using AssemblyAI streaming.
 * URL in OBS: http://127.0.0.1:<overlay-port>/lm-dock.html
 */

import React from "react";
import ReactDOM from "react-dom/client";
import "../i18n";
import i18n from "../i18n";
import { resolveInterfaceLocale } from "../i18n/localeCatalog";
import DockLmTab from "./tabs/DockLmTab";
import DockAuthGate from "./DockAuthGate";
import { dockClient } from "../services/dockBridge";
import "./dock.css";
import "./dock-auth.css";

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

const el = document.getElementById("dock-root");
if (el) {
  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <DockAuthGate>
        <DockLmTab />
      </DockAuthGate>
    </React.StrictMode>,
  );
}
