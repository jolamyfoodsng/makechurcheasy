/**
 * appStatusManager.ts — Centralised application status → dock icon resolver.
 *
 * Only this module should change the macOS dock icon. It subscribes to
 * obsService and lmDockService, resolves the icon from a simple state table,
 * and calls the Rust `set_app_icon` command when the displayed icon changes.
 *
 * State mapping (priority top → bottom):
 *   speechListening && obsConnected  → mic_connected_and_obs_connected
 *   speechListening                  → mic_connected_but_obs_not_connected
 *   obsConnected                     → obs_connected
 *   obsConnectionAttempted           → obs_not_connected
 *   default                          → general (idle)
 */

import { invoke } from "@tauri-apps/api/core";
import { obsService } from "./obsService";
import { lmDockService } from "./lmDockService";

// ── Icon filenames ──────────────────────────────────────────────────────────

const ICON_GENERAL = "app_icon_general.png";
const ICON_OBS_NOT_CONNECTED = "app_icon_obs_not_connected.jpeg";
const ICON_OBS_CONNECTED = "app_icon_obs_connected.jpeg";
const ICON_MIC_NO_OBS = "app_icon_mic_connected_but_obs_not_connected.jpeg";
const ICON_MIC_AND_OBS = "app_icon_mic_connected_and_obs_connected.jpeg";

// ── Internal state ──────────────────────────────────────────────────────────

let obsConnected = false;
let speechListening = false;
let obsConnectionAttempted = false;
let currentIcon: string | null = null;
let initialised = false;

// ── Icon resolver ───────────────────────────────────────────────────────────

function resolveIcon(): string {
  if (speechListening && obsConnected) return ICON_MIC_AND_OBS;
  if (speechListening) return ICON_MIC_NO_OBS;
  if (obsConnected) return ICON_OBS_CONNECTED;
  if (obsConnectionAttempted) return ICON_OBS_NOT_CONNECTED;
  return ICON_GENERAL;
}

// ── Icon updater ────────────────────────────────────────────────────────────

function updateIcon(): void {
  const icon = resolveIcon();
  if (icon === currentIcon) return;
  currentIcon = icon;

  invoke<boolean>("set_app_icon", { iconName: icon }).catch((err) => {
    console.warn("[AppStatusManager] Failed to set app icon:", err);
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

export const appStatusManager = {
  /**
   * Subscribe to both obsService and lmDockService.
   * Call once from App.tsx on mount. Safe to call multiple times —
   * subsequent calls are no-ops.
   */
  init(): () => void {
    if (initialised) return () => { };
    initialised = true;

    // Set initial OBS state
    obsConnected = obsService.isConnected;
    if (obsService.status !== "disconnected") {
      obsConnectionAttempted = true;
    }

    const unsubObs = obsService.onStatusChange((status) => {
      obsConnected = status === "connected";
      // Once the user has tried to connect (or was connected), we know OBS
      // is relevant — show the "obs_not_connected" icon when it drops rather
      // than falling all the way back to the generic idle icon.
      if (status === "connecting" || status === "connected" || status === "error") {
        obsConnectionAttempted = true;
      }
      updateIcon();
    });

    const unsubLm = lmDockService.subscribe((snapshot) => {
      speechListening = snapshot.status === "listening";
      updateIcon();
    });

    // Apply the initial icon
    updateIcon();

    return () => {
      unsubObs();
      unsubLm();
      initialised = false;
      currentIcon = null;
    };
  },

  /** Call when the user clicks "Connect to OBS" (even if it fails). */
  setOBSConnectionAttempted(attempted: boolean): void {
    obsConnectionAttempted = attempted;
    updateIcon();
  },

  /** Reset the OBS connection attempted flag (e.g. on explicit disconnect/reset). */
  clearOBSConnectionAttempt(): void {
    obsConnectionAttempted = false;
    updateIcon();
  },

  /** Force-reset the icon to the general (idle) icon. */
  resetToGeneral(): void {
    obsConnected = false;
    speechListening = false;
    obsConnectionAttempted = false;
    currentIcon = null;
    updateIcon();
  },
};
