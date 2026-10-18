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
import { applyLayoutAdjust } from "./adjust";
import { buildCountdownContent } from "../../countdowns/countdownTime";
import { applyCompareToLayout, bilingualText, compareColumnsOf, compareContent, compareLayoutOf, translationOf, type CompareSlide, type TranslatedSlide } from "./compare";

interface OverlayPacket {
  slide?: ({ text?: string; reference?: string; lineCount?: number } & CompareSlide & TranslatedSlide) | null;
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
  /**
   * True when this packet switches the page between Full screen and Lower
   * third and the change should be seen (source on screen, motion allowed).
   * A visible layout then plays out, swaps layout and plays in instead of
   * cutting to the new layout.
   */
  modeSwitch?: boolean;
  /** How long a leaving layout may take to play out on a mode switch (ms). Default 240. */
  modeSwitchOutMs?: number;
}

const ACTIVE_CLASS = "mtl-active";
const LEGACY_HIDE_CSS = `html.${ACTIVE_CLASS} [data-mtl-legacy]{visibility:hidden!important}`;

let renderer: ThemeRenderer | null = null;
let host: HTMLDivElement | null = null;
let active = false;
/** A layout is playing out before it is retired (layer theme -> legacy theme on a mode switch). */
let retirePending = false;
let retireToken = 0;
const DEFAULT_MODE_SWITCH_OUT_MS = 240;

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
  renderer = new ThemeRenderer(host, { resolveAsset: hooks.resolveAsset, fillViewport: true });
  return renderer;
}

function activate(hooks: OverlayHooks) {
  if (active) return;
  active = true;
  for (const el of hooks.legacy || []) el?.setAttribute("data-mtl-legacy", "");
  document.documentElement.classList.add(ACTIVE_CLASS);
}

function deactivate() {
  retireToken++;
  retirePending = false;
  if (!active) return;
  active = false;
  document.documentElement.classList.remove(ACTIVE_CLASS);
  renderer?.destroy();
  renderer = null;
  host?.remove();
  host = null;
}

/**
 * Layer theme -> legacy theme on a visible mode switch: let the layout play
 * out first and keep the legacy elements hidden until it is gone, so the
 * legacy bar of the layer that is leaving never shows through.
 */
function retireLayoutAfterOut(outMs: number) {
  const r = renderer;
  if (!r) {
    deactivate();
    return;
  }
  retirePending = true;
  const token = ++retireToken;
  const finish = () => {
    if (token === retireToken && renderer === r) deactivate();
  };
  // Small margin so the page's own layer fade-out has finished too.
  const settle = () => setTimeout(finish, 60);
  void r.hide(outMs).then(settle, settle);
  setTimeout(finish, outMs + 400); // safety net if the animation never reports back
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
  // The Dock's text-size / position tweaks travel as theme fields next to the layout.
  let layout = hasTheme && isThemeLayout(packet.theme!.layout)
    ? applyLayoutAdjust(packet.theme!.layout as ThemeLayout, packet.theme)
    : null;
  // Side-by-side Bible (two translations): the verse block is split into two columns.
  const compare = compareColumnsOf(packet.slide);
  const compareMode = compareLayoutOf(packet.slide);
  if (layout && compare) layout = applyCompareToLayout(layout, compareMode);
  // Worship / Notes showing a translation next to the original: both languages in the verse block, a bit smaller.
  const bilingual = !compare && translationOf(packet.slide) !== "";
  if (layout && bilingual) layout = applyCompareToLayout(layout, "line-by-line");
  const contentOf = (slide: NonNullable<OverlayPacket["slide"]>) => {
    if (compare) return compareContent(compare, slide.lineCount, compareMode, packet.slide?.compareMode === "passages" ? "passages" : "translations");
    if (translationOf(slide)) return { text: bilingualText(slide), reference: slide.reference || "", lineCount: slide.lineCount, stackLines: true };
    return { text: slide.text || "", reference: slide.reference || "", lineCount: slide.lineCount };
  };

  // A theme without a layout means a legacy theme was picked: step aside.
  if (hasTheme && !layout) {
    // A mode-switch fade-out is already retiring the layout: let it finish.
    if (retirePending) return false;
    if (hooks.modeSwitch && active && renderer?.visible) {
      retireLayoutAfterOut(hooks.modeSwitchOutMs ?? DEFAULT_MODE_SWITCH_OUT_MS);
      return false;
    }
    deactivate();
    return false;
  }
  // No theme on the packet and no layout active: legacy owns it.
  if (!layout && !active) return false;
  // The layout is on its way out (mode switch to a legacy theme): don't bring it back.
  if (!layout && retirePending) return false;

  // A layout is wanted again: cancel any pending retire.
  if (layout) {
    retireToken++;
    retirePending = false;
  }
  const r = ensureHost(hooks);
  activate(hooks);

  if (
    layout
    && hooks.modeSwitch
    && r.visible
    && packet.action !== "animate-out"
    && packet.slide
    && !packet.blanked
  ) {
    // Full <-> Lower third while a layout is on air: out, swap layout, in.
    safe(hooks.persist, packet);
    void r.switchLayout(layout, contentOf(packet.slide));
    // Ack now, like the in-place swap this replaces: the Dock only waits a few
    // hundred ms for it and must not be held up by the transition.
    safe(hooks.ack, packet, true);
    return true;
  }

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
    .show(contentOf(slide))
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
    if (retirePending) return;
    if (hooks.modeSwitch && active && renderer?.visible) {
      retireLayoutAfterOut(hooks.modeSwitchOutMs ?? DEFAULT_MODE_SWITCH_OUT_MS);
      return;
    }
    deactivate();
    return;
  }
  retireToken++;
  retirePending = false;
  const r = ensureHost(hooks);
  activate(hooks);
  const layout = applyLayoutAdjust(theme.layout, theme);
  if (hooks.modeSwitch && r.visible) void r.switchLayout(layout);
  else r.setLayout(layout);
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
    /** The renderer class itself, for pages that draw their own layouts (countdown overlay). */
    MCEThemeRenderer?: typeof ThemeRenderer;
    /** Timer reading -> layer-design content (tokens + warning level); see countdowns/countdownTime.ts. */
    MCECountdownContent?: typeof buildCountdownContent;
  }
}

window.MCEThemeOverlay = api;
window.MCEThemeRenderer = ThemeRenderer;
window.MCECountdownContent = buildCountdownContent;
