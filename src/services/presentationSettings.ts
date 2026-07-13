/**
 * presentationSettings.ts — Presentation Mode output routing
 *
 * Manages where fullscreen and lower-third content is displayed:
 * - Local OBS (direct to OBS Studio on this computer)
 * - Remote Presentation (local browser on another device)
 * - Both simultaneously
 */

import { nanoid } from "nanoid";
import { getOverlayBaseUrlSync } from "./overlayUrl";
import { getDeviceId } from "./authService";

// ── Types ──────────────────────────────────────────────────────────────────

export type PresentationOutputMode = "local-obs" | "remote-presentation" | "both";

export type PresentationRoute =
  | "disabled"
  | "local-obs"
  | "remote-presentation"
  | "both";

export interface PresentationSettings {
  outputMode: PresentationOutputMode;
  localObsEnabled: boolean;
  remotePresentationEnabled: boolean;
  obsHost: string;
  obsPort: string;
  obsPassword: string;
  obsConnected: boolean;
  sessionId: string;
  presentationLink: string;
  connectedViewers: number;
  routes: {
    bibleFullscreen: PresentationRoute;
    bibleLowerThird: PresentationRoute;
    worshipFullscreen: PresentationRoute;
    worshipLowerThird: PresentationRoute;
    ministry: PresentationRoute;
    countdown: PresentationRoute;
  };
}

// ── Defaults ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "presentation-settings";

const DEFAULT_SETTINGS: PresentationSettings = {
  outputMode: "both",
  localObsEnabled: true,
  remotePresentationEnabled: true,
  obsHost: "127.0.0.1",
  obsPort: "4455",
  obsPassword: "",
  obsConnected: false,
  sessionId: nanoid(8),
  presentationLink: "",
  connectedViewers: 0,
  routes: {
    bibleFullscreen: "remote-presentation",
    bibleLowerThird: "local-obs",
    worshipFullscreen: "remote-presentation",
    worshipLowerThird: "local-obs",
    ministry: "local-obs",
    countdown: "remote-presentation",
  },
};

// ── Storage ────────────────────────────────────────────────────────────────

export function getPresentationSettings(): PresentationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaults();
    const saved = JSON.parse(raw) as Partial<PresentationSettings>;
    const defaults = buildDefaults();
    return { ...defaults, ...saved, routes: { ...defaults.routes, ...saved.routes } };
  } catch {
    return buildDefaults();
  }
}

export function savePresentationSettings(settings: PresentationSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

export function updatePresentationSettings(patch: Partial<PresentationSettings>): PresentationSettings {
  const current = getPresentationSettings();
  const updated = { ...current, ...patch };
  savePresentationSettings(updated);
  return updated;
}

export function updatePresentationRoutes(routes: Partial<PresentationSettings["routes"]>): PresentationSettings {
  const current = getPresentationSettings();
  const updated = { ...current, routes: { ...current.routes, ...routes } };
  savePresentationSettings(updated);
  return updated;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildDefaults(): PresentationSettings {
  const defaults = { ...DEFAULT_SETTINGS, sessionId: nanoid(8) };
  defaults.presentationLink = buildPresentationLink(defaults.sessionId);
  return defaults;
}

export function buildPresentationLink(sessionId: string): string {
  const isDev = window.location.protocol === "http:" && window.location.port === "1420";
  const base = isDev ? window.location.origin : getOverlayBaseUrlSync();
  const deviceId = getDeviceId();
  const params = new URLSearchParams({ sessionId });
  if (deviceId) params.set("deviceId", deviceId);
  return `${base}/presentation.html?${params.toString()}`;
}

export function regenerateSession(): PresentationSettings {
  const current = getPresentationSettings();
  const newSessionId = nanoid(8);
  const updated = {
    ...current,
    sessionId: newSessionId,
    presentationLink: buildPresentationLink(newSessionId),
    connectedViewers: 0,
  };
  savePresentationSettings(updated);
  return updated;
}

// ── Presets ────────────────────────────────────────────────────────────────

export type PresentationPreset = "projector-stream" | "obs-only" | "remote-only";

const PRESET_ROUTES: Record<PresentationPreset, PresentationSettings["routes"]> = {
  "projector-stream": {
    bibleFullscreen: "remote-presentation",
    bibleLowerThird: "local-obs",
    worshipFullscreen: "remote-presentation",
    worshipLowerThird: "local-obs",
    ministry: "local-obs",
    countdown: "remote-presentation",
  },
  "obs-only": {
    bibleFullscreen: "local-obs",
    bibleLowerThird: "local-obs",
    worshipFullscreen: "local-obs",
    worshipLowerThird: "local-obs",
    ministry: "local-obs",
    countdown: "local-obs",
  },
  "remote-only": {
    bibleFullscreen: "remote-presentation",
    bibleLowerThird: "remote-presentation",
    worshipFullscreen: "remote-presentation",
    worshipLowerThird: "remote-presentation",
    ministry: "remote-presentation",
    countdown: "remote-presentation",
  },
};

export function applyPreset(preset: PresentationPreset): PresentationSettings {
  const modeMap: Record<PresentationPreset, PresentationOutputMode> = {
    "projector-stream": "both",
    "obs-only": "local-obs",
    "remote-only": "remote-presentation",
  };
  const mode = modeMap[preset];
  return updatePresentationSettings({
    outputMode: mode,
    localObsEnabled: mode === "local-obs" || mode === "both",
    remotePresentationEnabled: mode === "remote-presentation" || mode === "both",
    routes: PRESET_ROUTES[preset],
  });
}

// ── Route Labels ───────────────────────────────────────────────────────────

export const ROUTE_CONTENT_TYPES: { key: keyof PresentationSettings["routes"]; label: string }[] = [
  { key: "bibleFullscreen", label: "Bible Fullscreen" },
  { key: "bibleLowerThird", label: "Bible Lower Third" },
  { key: "worshipFullscreen", label: "Worship Fullscreen" },
  { key: "worshipLowerThird", label: "Worship Lower Third" },
  { key: "ministry", label: "Ministry Lower Third" },
  { key: "countdown", label: "Countdown" },
];

export const ROUTE_OPTIONS: { value: PresentationRoute; label: string }[] = [
  { value: "disabled", label: "Disabled" },
  { value: "local-obs", label: "Local OBS" },
  { value: "remote-presentation", label: "Remote Presentation" },
  { value: "both", label: "Both" },
];
