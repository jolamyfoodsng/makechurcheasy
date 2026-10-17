/**
 * studioNdiOut.ts — "Connect with NDI": the Studio's output as an NDI® source on the network.
 *
 * Rust (studio_ndi_out.rs) opens `studio-output.html` in a hidden window and sends its pictures
 * over NDI, so vMix, OBS (DistroAV), NDI Studio Monitor and other NDI receivers can pick it up.
 *   - alt: the Alternate look (e.g. Lower Third) with a see-through background, for laying over a camera;
 *   - program: exactly what the screen shows.
 * Mac only for now. Needs the free NDI Tools (ndi.video), like NDI cameras do.
 */
import { invoke } from "@tauri-apps/api/core";
import { getOverlayBaseUrl } from "../services/overlayUrl";
import { toLoopbackBase } from "./studioEngine";

export type NdiOutFeed = "alt" | "program";

export interface NdiOutStatus {
  running: boolean;
  feed: string;
  /** What receivers list, e.g. "MY-MAC (MakeChurchEazy – Lower Third)". */
  sourceName: string;
  /** Receivers watching right now. */
  connections: number;
  error: string;
}

const SOURCE_NAME: Record<NdiOutFeed, string> = {
  alt: "MakeChurchEazy – Lower Third",
  program: "MakeChurchEazy – Program",
};
const FEED_KEY = "mce-studio-ndi-out-feed";

const IDLE: NdiOutStatus = { running: false, feed: "", sourceName: "", connections: 0, error: "" };
let current: NdiOutStatus = IDLE;
const listeners = new Set<(status: NdiOutStatus) => void>();
let poll: ReturnType<typeof setInterval> | null = null;

function publish(next: NdiOutStatus): void {
  current = next;
  for (const listener of listeners) listener(current);
  // Keep the receiver count fresh while sending.
  if (current.running && !poll) poll = setInterval(() => { void refreshNdiOut(); }, 2000);
  if (!current.running && poll) { clearInterval(poll); poll = null; }
}

export function getNdiOutStatus(): NdiOutStatus {
  return current;
}

/** Called whenever NDI out starts, stops or its receiver count changes. Returns an unsubscribe. */
export function onNdiOutChange(listener: (status: NdiOutStatus) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function readSavedNdiFeed(): NdiOutFeed {
  try { return localStorage.getItem(FEED_KEY) === "program" ? "program" : "alt"; } catch { return "alt"; }
}

export async function refreshNdiOut(): Promise<NdiOutStatus> {
  try {
    publish(await invoke<NdiOutStatus>("get_studio_ndi_out_status"));
  } catch {
    /* not in the app (browser preview) */
  }
  return current;
}

export async function startNdiOut(feed: NdiOutFeed): Promise<NdiOutStatus> {
  try { localStorage.setItem(FEED_KEY, feed); } catch { /* ignore */ }
  try {
    const base = toLoopbackBase(await getOverlayBaseUrl());
    // The Alternate look goes out see-through (no camera, no background) so a switcher can lay it over its video.
    const url = feed === "alt"
      ? `${base}/studio-output.html?feed=alt&nocam=1`
      : `${base}/studio-output.html?feed=program&win=studio-ndi-out`;
    const answer = invoke<NdiOutStatus>("start_studio_ndi_out", { url, feed, name: SOURCE_NAME[feed] });
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("The app did not answer. Restart MakeChurchEazy and try again.")), 15000);
    });
    const status = await Promise.race([answer, timeout]);
    publish(status.running || status.error ? status : { ...status, error: "NDI did not start (no reason given)." });
  } catch (error) {
    console.error("[NDI out]", error);
    publish({ ...IDLE, error: error instanceof Error ? error.message : String(error) });
  }
  return current;
}

export async function stopNdiOut(): Promise<void> {
  try {
    await invoke("stop_studio_ndi_out");
  } catch {
    /* ignore */
  }
  publish(IDLE);
}
