/**
 * studioOutputWindow.ts — projectors of the Presentation Studio (like OBS's
 * "Open Program Projector" / "Open Preview Projector").
 *
 * A projector shows `studio-output.html` from the local overlay server:
 *   - on a screen: borderless and full screen on that monitor;
 *   - in a window: a normal window the operator can move, resize and close.
 * Press Esc (or right-click → Close projector) inside a projector to close it.
 * The page asks over the local relay (`studio-control` / `close-projector`),
 * and this module closes the window.
 */
import { availableMonitors, currentMonitor, PhysicalPosition, PhysicalSize, type Monitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getOverlayBaseUrl } from "../services/overlayUrl";
import { toLoopbackBase } from "./studioEngine";
import { overlayBridge } from "../dock/dockOverlayBridge";

const OUTPUT_MONITOR_KEY = "mce-studio-output-monitor";
const LABEL_PREFIX = "studio-projector-";
/** Phase 1 window label, closed too so an old window never gets stuck. */
const LEGACY_LABEL = "studio-output";

export type ProjectorFeed = "program" | "preview";
/** A monitor key, or "window" for a normal window. */
export type ProjectorTarget = string;

export interface StudioMonitor {
  /** Stable enough to remember: name + position + size. */
  key: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  /** The screen the app is on (the operator's screen). */
  isControlScreen: boolean;
}

export interface OpenProjector {
  label: string;
  feed: ProjectorFeed;
  /** Monitor key, or null for a window. */
  monitorKey: string | null;
  /** "Built-in Display" or "Window". */
  where: string;
  /** Opening it again found it already open, so it was brought forward instead of being rebuilt. */
  reused?: boolean;
}

function monitorKey(m: Monitor): string {
  return `${m.name ?? "display"}@${m.position.x},${m.position.y}:${m.size.width}x${m.size.height}`;
}

function sameMonitor(a: Monitor | null, b: Monitor | null): boolean {
  return Boolean(a && b && monitorKey(a) === monitorKey(b));
}

export async function listStudioMonitors(): Promise<StudioMonitor[]> {
  const [monitors, current] = await Promise.all([availableMonitors(), currentMonitor()]);
  return monitors.map((m, i) => ({
    key: monitorKey(m),
    name: m.name?.trim() || `Display ${i + 1}`,
    width: m.size.width,
    height: m.size.height,
    x: m.position.x,
    y: m.position.y,
    isControlScreen: sameMonitor(m, current),
  }));
}

/** OBS style: "Built-in Display: 2048x1330 @ 0,0". */
export function monitorLabel(m: StudioMonitor): string {
  return `${m.name}: ${m.width}x${m.height} @ ${m.x},${m.y}`;
}

export function readSavedOutputMonitor(): string {
  try {
    return localStorage.getItem(OUTPUT_MONITOR_KEY) || "";
  } catch {
    return "";
  }
}

export function saveOutputMonitor(key: string): void {
  try {
    localStorage.setItem(OUTPUT_MONITOR_KEY, key);
  } catch {
    /* ignore */
  }
}

/** The monitor to use: the saved one if still connected, else the first screen that isn't the app's. */
export async function pickDefaultMonitorKey(monitors: StudioMonitor[]): Promise<string> {
  const saved = readSavedOutputMonitor();
  if (saved && monitors.some((m) => m.key === saved)) return saved;
  return (monitors.find((m) => !m.isControlScreen) ?? monitors[0])?.key ?? "";
}

// ── Open projectors ────────────────────────────────────────────────────────

const projectors = new Map<string, OpenProjector>();
const listeners = new Set<(list: OpenProjector[]) => void>();
let counter = 0;
let relayHooked = false;

function notify(): void {
  const list = listOpenProjectors();
  for (const listener of listeners) listener(list);
}

export function listOpenProjectors(): OpenProjector[] {
  return Array.from(projectors.values());
}

/** Called with the open projectors whenever one opens or closes. Returns an unsubscribe. */
export function onProjectorsChange(listener: (list: OpenProjector[]) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Esc / "Close projector" inside a projector page arrives over the local relay. */
function hookRelay(): void {
  if (relayHooked) return;
  relayHooked = true;
  overlayBridge.subscribe((packet) => {
    if (packet.channel !== "studio-control" || packet.type !== "close-projector") return;
    const label = String(packet.label ?? "");
    if (label.startsWith(LABEL_PREFIX)) void closeProjector(label);
  });
  overlayBridge.connect();
}

async function destroyWindow(label: string): Promise<void> {
  const win = await WebviewWindow.getByLabel(label);
  if (!win) return;
  try {
    await win.setFullscreen(false).catch(() => undefined);
    await win.destroy();
  } catch {
    await win.close().catch(() => undefined);
  }
}

export async function closeProjector(label: string): Promise<void> {
  await destroyWindow(label);
  if (projectors.delete(label)) notify();
}

/** Close every projector (or every one of a feed). */
export async function closeAllProjectors(feed?: ProjectorFeed): Promise<void> {
  const labels = listOpenProjectors().filter((p) => !feed || p.feed === feed).map((p) => p.label);
  await Promise.all(labels.map((label) => closeProjector(label)));
  if (!feed || feed === "program") await destroyWindow(LEGACY_LABEL);
}

function waitForCreation(win: WebviewWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    void win.once("tauri://created", () => { if (!done) { done = true; resolve(); } });
    void win.once("tauri://error", (event) => {
      if (done) return;
      done = true;
      reject(new Error(typeof event.payload === "string" ? event.payload : "The projector could not be opened."));
    });
  });
}

/** The projector is already open: bring it forward (rebuilding a full-screen window right away leaves a blank one). */
async function reuseProjector(existing: OpenProjector, focus: boolean): Promise<OpenProjector | null> {
  const win = await WebviewWindow.getByLabel(existing.label);
  if (!win) {
    if (projectors.delete(existing.label)) notify();
    return null;
  }
  try {
    await win.show();
    if (focus) await win.setFocus();
  } catch {
    /* ignore */
  }
  return { ...existing, reused: true };
}

/**
 * Open a Program or Preview projector on a screen (full screen) or in a window.
 * A screen holds one projector: opening a new one there replaces the old one.
 */
export async function openProjector(feed: ProjectorFeed, target: ProjectorTarget): Promise<OpenProjector> {
  hookRelay();
  if (target === "window") {
    const open = listOpenProjectors().find((p) => p.feed === feed && p.monitorKey === null);
    if (open) {
      const back = await reuseProjector(open, true);
      if (back) return back;
    }
  }
  await destroyWindow(LEGACY_LABEL);
  // This computer's own server (not the Wi-Fi address), so a network change can't blank the projector.
  const base = toLoopbackBase(await getOverlayBaseUrl());
  const label = `${LABEL_PREFIX}${feed}-${Date.now()}-${++counter}`;
  const url = `${base}/studio-output.html?feed=${feed}&win=${encodeURIComponent(label)}`;
  const title = feed === "program" ? "Program Projector" : "Preview Projector";

  let entry: OpenProjector;
  let win: WebviewWindow;

  if (target === "window") {
    win = new WebviewWindow(label, {
      title: `${title} (Window)`,
      url,
      width: 960,
      height: 540,
      minWidth: 320,
      minHeight: 180,
      center: true,
      resizable: true,
      decorations: true,
      focus: true,
    });
    entry = { label, feed, monitorKey: null, where: "Window" };
    await waitForCreation(win);
  } else {
    const monitors = await availableMonitors();
    const current = await currentMonitor();
    const monitor = monitors.find((m) => monitorKey(m) === target)
      ?? monitors.find((m) => !sameMonitor(m, current))
      ?? current
      ?? monitors[0];
    if (!monitor) throw new Error("No screen found for the projector.");
    const key = monitorKey(monitor);
    const isControl = sameMonitor(monitor, current);

    // Already open on this screen: bring it forward. Closing it and opening a new full-screen window
    // straight away is what left a blank screen.
    const sameScreen = listOpenProjectors().find((p) => p.feed === feed && p.monitorKey === key);
    if (sameScreen) {
      const back = await reuseProjector(sameScreen, isControl);
      if (back) return back;
    }
    // One projector per screen.
    await Promise.all(listOpenProjectors().filter((p) => p.monitorKey === key).map((p) => closeProjector(p.label)));

    const scale = Math.max(monitor.scaleFactor || 1, 1);
    win = new WebviewWindow(label, {
      title,
      url,
      visible: false,
      decorations: false,
      resizable: true,
      // On the operator's own screen the projector takes focus so Esc reaches it;
      // on a projector screen the operator keeps the keyboard.
      focus: isControl,
      alwaysOnTop: !isControl,
      x: Math.round(monitor.position.x / scale),
      y: Math.round(monitor.position.y / scale),
      width: Math.max(640, Math.round(monitor.size.width / scale)),
      height: Math.max(360, Math.round(monitor.size.height / scale)),
    });
    entry = { label, feed, monitorKey: key, where: monitor.name?.trim() || "Display" };
    await waitForCreation(win);
    await win.setPosition(new PhysicalPosition(monitor.position.x, monitor.position.y));
    await win.setSize(new PhysicalSize(monitor.size.width, monitor.size.height));
    await win.show();
    await win.setFullscreen(true);
    if (isControl) await win.setFocus().catch(() => undefined);
    if (feed === "program") saveOutputMonitor(key);
  }

  projectors.set(label, entry);
  void win.once("tauri://destroyed", () => {
    if (projectors.delete(label)) notify();
  });
  notify();
  return entry;
}

// ── Phase 1 names (kept so nothing else breaks) ───────────────────────────

export async function isStudioOutputOpen(): Promise<boolean> {
  return listOpenProjectors().some((p) => p.feed === "program");
}

export async function closeStudioOutput(): Promise<void> {
  await closeAllProjectors("program");
}

/** Open the Program projector on a screen. Returns the screen's name. */
export async function openStudioOutput(monitorKeyToUse: string): Promise<string> {
  return (await openProjector("program", monitorKeyToUse)).where;
}
