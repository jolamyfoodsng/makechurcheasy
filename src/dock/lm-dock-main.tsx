/**
 * lm-dock-main.tsx — Standalone entry point for the LM (Language Model) Dock.
 *
 * This dock provides speech-to-Bible lookup using AssemblyAI streaming.
 * URL in OBS: http://127.0.0.1:<overlay-port>/lm-dock.html
 */

import React from "react";
import ReactDOM from "react-dom/client";
import DockLmTab from "./tabs/DockLmTab";
import DockAuthGate from "./DockAuthGate";
import { dockClient } from "../services/dockBridge";
import "./dock.css";
import "./dock-auth.css";

dockClient.init();

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
