/**
 * rundownStore.ts — persistence for rundowns, shared by the app and the OBS Dock.
 *
 * Source of truth is the Dock data file `dock-rundowns.json` (served at
 * /uploads/dock-rundowns.json). The app writes it with the Tauri
 * `save_dock_data` command, the Dock (OBS CEF, no Tauri) writes it through
 * POST /api/save-dock-data. localStorage is a fast local cache / dev fallback.
 * The snapshot with the newest `updatedAt` wins.
 */

import { getOverlayBaseUrlSync } from "../services/overlayUrl";
import type { Rundown, RundownSnapshot } from "./rundownTypes";

export const RUNDOWNS_DOCK_FILE = "dock-rundowns";
const LS_KEY = "mce-rundowns-v1";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function emptySnapshot(): RundownSnapshot {
  return { rundowns: [], updatedAt: new Date(0).toISOString() };
}

function isSnapshot(value: unknown): value is RundownSnapshot {
  return !!value && typeof value === "object" && Array.isArray((value as RundownSnapshot).rundowns);
}

function readLocal(): RundownSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocal(snapshot: RundownSnapshot): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage unavailable */
  }
}

async function readRemote(): Promise<RundownSnapshot | null> {
  try {
    const base = isTauri() ? getOverlayBaseUrlSync() : "";
    const res = await fetch(`${base}/uploads/${RUNDOWNS_DOCK_FILE}.json?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = await res.json();
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeRemote(snapshot: RundownSnapshot): Promise<void> {
  const data = JSON.stringify(snapshot);
  try {
    if (isTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_dock_data", { name: RUNDOWNS_DOCK_FILE, data });
      return;
    }
    await fetch("/api/save-dock-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: RUNDOWNS_DOCK_FILE, data }),
    });
  } catch (err) {
    console.warn("[rundownStore] Failed to write rundowns:", err);
  }
}

function newest(a: RundownSnapshot | null, b: RundownSnapshot | null): RundownSnapshot {
  if (!a) return b ?? emptySnapshot();
  if (!b) return a;
  return Date.parse(a.updatedAt) >= Date.parse(b.updatedAt) ? a : b;
}

export async function loadRundowns(): Promise<RundownSnapshot> {
  const [remote] = await Promise.all([readRemote()]);
  const chosen = newest(readLocal(), remote);
  writeLocal(chosen);
  return chosen;
}

export async function saveRundowns(rundowns: Rundown[]): Promise<RundownSnapshot> {
  const snapshot: RundownSnapshot = { rundowns, updatedAt: new Date().toISOString() };
  writeLocal(snapshot);
  await writeRemote(snapshot);
  return snapshot;
}
