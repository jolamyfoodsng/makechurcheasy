/**
 * rundownOverlay.ts — builds countdown-overlay payloads/URLs for rundown timers.
 * Shared by the app (preview) and the OBS Dock (push).
 */

import { createLayoutCountdown } from "./countdownDefaults";
import { attachLayoutMode } from "./layoutMode";
import { overlayExtras } from "./rundownEngine";
import { getTextTheme } from "./textThemes";
import type { CountdownConfig, CountdownOverlayPayload } from "./types";
import type { RundownLiveState, RundownOverlayStyle } from "./rundownTypes";

/** Built-in look used when a timer has no saved design. */
export function defaultRundownDesign(): CountdownConfig {
  const cd = createLayoutCountdown("stage-timer", "rundown-default");
  return { ...cd, id: "rundown-default", title: "Default" };
}

/** Pick the saved design for a timer (falls back to the built-in look). */
export function resolveDesign(designId: string | null | undefined, designs: CountdownConfig[]): CountdownConfig {
  if (designId) {
    const found = designs.find((d) => d.id === designId);
    if (found) return found;
  }
  return defaultRundownDesign();
}

/** Fonts/shadow from the design's text theme (preferred) or its text settings. */
export function designOverlayStyle(design: CountdownConfig): RundownOverlayStyle {
  const theme = design.textThemeId ? getTextTheme(design.textThemeId) : undefined;
  if (theme) {
    return {
      fontFamily: theme.fontFamily,
      fontWeight: theme.fontWeight,
      textShadow: theme.timerShadow && theme.timerShadow !== "none" ? theme.timerShadow : undefined,
      textTransform: theme.timerTransform && theme.timerTransform !== "none" ? theme.timerTransform : undefined,
      fontUrl: theme.fontUrl || undefined,
    };
  }
  const t = design.text;
  return {
    fontFamily: t.fontFamily,
    fontWeight: t.fontWeight,
    textShadow: t.shadowEnabled
      ? `${t.shadowOffsetX}px ${t.shadowOffsetY}px ${t.shadowBlur}px ${t.shadowColor}`
      : undefined,
  };
}

export function buildRundownPayload(
  state: RundownLiveState,
  design: CountdownConfig,
  baseUrl: string,
  opts: { reveal: boolean; now: number },
): CountdownOverlayPayload {
  const extras = overlayExtras(state);
  return attachLayoutMode({
    config: design,
    baseUrl,
    timestamp: opts.now,
    sync: { paused: state.status !== "running", remaining: state.value },
    reveal: opts.reveal,
    rundown: extras ? { ...extras, style: designOverlayStyle(design) } : undefined,
  });
}

export function rundownOverlayUrl(payload: CountdownOverlayPayload, baseUrl: string): string {
  return `${baseUrl}/countdown-overlay.html#data=${encodeURIComponent(JSON.stringify(payload))}`;
}

export function rundownBackgroundUrl(design: CountdownConfig, baseUrl: string, now: number): string {
  const payload = { config: design, baseUrl, timestamp: now };
  return `${baseUrl}/countdown-bg-overlay.html#data=${encodeURIComponent(JSON.stringify(payload))}`;
}
