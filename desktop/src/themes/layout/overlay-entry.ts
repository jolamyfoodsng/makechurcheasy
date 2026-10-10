/**
 * Overlay adapter — bundled to public/theme-renderer.js and loaded by
 * mce-bible-overlay.html, mce-worship-overlay.html and mce-note.html.
 *
 * Each overlay calls `MCEThemeOverlay.handle(packet, hooks)` at the top of its
 * processOverlayUpdate(). If the packet's theme carries a layout, the adapter
 * renders it and returns true (the legacy path is skipped). If the theme has no
 * layout, the adapter steps aside and returns false, so legacy themes keep
 * working exactly as before.
 */
import { ThemeRenderer } from "./renderer";
import { isThemeLayout, type ThemeLayout } from "./types";

interface OverlayPacket {
  slide?: { text?: string; reference?: string; lineCount?: number } | null;
  theme?: { layout?: unknown } | null;
  blanked?: boolean;
  live?: boolean;
  action?: string;
  mode?: string;
}

interface OverlayHooks {
  /** Elements of the legacy overlay to hide while a layout theme is active. */
  legacy?: Array<HTMLElement | null | undefined>;
  persist?: ((packet: OverlayPacket) => void) | null;
  ack?: ((packet: OverlayPacket, fontFitReady?: boolean) => void) | null;
  animateOutDone?: (() => void) | null;
  resolveAsset?: (src: string) => string;
}

const ACTIVE_CLASS = "mtl-active";
const LEGACY_HIDE_CSS = `html.${ACTIVE_CLASS} [data-mtl-legacy]{visibility:hidden!important}`;

let renderer: ThemeRenderer | null = null;
let host: HTMLDivElement | null = null;
let active = false;

function ensureHost(hooks: OverlayHooks): ThemeRenderer {
  if (renderer) return renderer;
  const doc = document;
  if (!doc.getElementById("mtl-legacy-style")) {
    const style = doc.createElement("style");
    style.id = "mtl-legacy-style";
    style.textContent = LEGACY_HIDE_CSS;
    doc.head.appendChild(style);
  }
  host = doc.createElement("div");
  host.id = "mtl-theme-host";
  host.style.cssText = "position:fixed;inset:0;z-index:50;pointer-events:none";
  doc.body.appendChild(host);
  renderer = new ThemeRenderer(host, { resolveAsset: hooks.resolveAsset });
  return renderer;
}

function activate(hooks: OverlayHooks) {
  if (active) return;
  active = true;
  for (const el of hooks.legacy || []) el?.setAttribute("data-mtl-legacy", "");
  document.documentElement.classList.add(ACTIVE_CLASS);
}

function deactivate() {
  if (!active) return;
  active = false;
  document.documentElement.classList.remove(ACTIVE_CLASS);
  renderer?.destroy();
  renderer = null;
  host?.remove();
  host = null;
}

function safe<T extends unknown[]>(fn: ((...args: T) => unknown) | null | undefined, ...args: T) {
  try {
    fn?.(...args);
  } catch (err) {
    console.warn("[MCEThemeOverlay] hook failed", err);
  }
}

function handle(packet: OverlayPacket, hooks: OverlayHooks = {}): boolean {
  if (!packet || typeof packet !== "object") return false;
  const hasTheme = !!packet.theme && typeof packet.theme === "object";
  const layout = hasTheme && isThemeLayout(packet.theme!.layout) ? (packet.theme!.layout as ThemeLayout) : null;

  // A theme without a layout means a legacy theme was picked: step aside.
  if (hasTheme && !layout) {
    deactivate();
    return false;
  }
  // No theme on the packet and no layout active: legacy owns it.
  if (!layout && !active) return false;

  const r = ensureHost(hooks);
  activate(hooks);
  if (layout) r.setLayout(layout);

  if (packet.action === "animate-out") {
    void r.hide().then(() => safe(hooks.animateOutDone));
    return true;
  }

  const slide = packet.slide;
  if (!slide || packet.blanked) {
    void r.hide();
    if (slide || packet.blanked) safe(hooks.persist, packet);
    safe(hooks.ack, packet, true);
    return true;
  }

  safe(hooks.persist, packet);
  void r
    .show({ text: slide.text || "", reference: slide.reference || "", lineCount: slide.lineCount })
    .then(() => safe(hooks.ack, packet, true));
  return true;
}

/**
 * Theme changed without new content (e.g. a mode-change packet). Updates the
 * layout in place, or hands control back to the legacy overlay.
 */
function syncTheme(theme: OverlayPacket["theme"], hooks: OverlayHooks = {}) {
  if (!theme || typeof theme !== "object") return;
  if (!isThemeLayout(theme.layout)) {
    deactivate();
    return;
  }
  const r = ensureHost(hooks);
  activate(hooks);
  r.setLayout(theme.layout);
}

const api = {
  handle,
  syncTheme,
  isActive: () => active,
  /** For debugging in the OBS browser source console. */
  get renderer() {
    return renderer;
  },
};

declare global {
  interface Window {
    MCEThemeOverlay?: typeof api;
  }
}

window.MCEThemeOverlay = api;
