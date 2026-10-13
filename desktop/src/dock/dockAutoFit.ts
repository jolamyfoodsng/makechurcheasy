/**
 * dockAutoFit.ts — automatic Dock size.
 *
 * The Dock is a browser panel inside OBS. Its interface was drawn for a large display, so on a
 * 14" MacBook, or a Windows laptop at 125-150% scaling, the same CSS pixels fill much more of
 * the panel: controls look tight and oversized. This works out a factor (1 = unchanged, never
 * above 1) from two things the page can read:
 *
 *   - the SCREEN, in CSS pixels. A Windows laptop at 150% reports ~1280px, a 14" MacBook ~1512px,
 *     a desktop monitor 1920px+. Fewer CSS pixels on the screen means a smaller factor, so each
 *     device gets its own value without checking which operating system it is.
 *   - the PANEL (the Dock's own window). A narrow or short panel shrinks further.
 *
 * DockPage multiplies this by the person's "Dock font size" choice and feeds the result to
 * `--dock-font-scale` (the CSS `zoom` on `.dock-root`), which every Dock modal already divides by.
 */
import { useEffect, useState } from "react";

export interface DockAutoFitInput {
  /** Panel size in CSS px (window.innerWidth / innerHeight). */
  viewportWidth: number;
  viewportHeight: number;
  /** Whole screen in CSS px (window.screen.width / height). 0 when unknown. */
  screenWidth: number;
}

export const DOCK_AUTO_FIT_MIN = 0.78;

function ramp(value: number, low: number, high: number, lowFactor: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  if (value >= high) return 1;
  if (value <= low) return lowFactor;
  return lowFactor + ((value - low) / (high - low)) * (1 - lowFactor);
}

/** 1 = leave the Dock alone; smaller values shrink it. Always within [DOCK_AUTO_FIT_MIN, 1]. */
export function computeDockAutoFit(input: DockAutoFitInput): number {
  // Screen: 1680+ css px -> 1.00, 1280 or less -> 0.88 (Windows 1920 @150%, small laptops).
  const screen = ramp(input.screenWidth, 1280, 1680, 0.88);
  // Panel: a ~300px-wide or ~480px-tall dock is the tight case.
  const panelWidth = ramp(input.viewportWidth, 260, 400, 0.86);
  const panelHeight = ramp(input.viewportHeight, 480, 760, 0.88);
  const fit = screen * Math.min(panelWidth, panelHeight);
  return Math.round(Math.min(1, Math.max(DOCK_AUTO_FIT_MIN, fit)) * 100) / 100;
}

function readInput(): DockAutoFitInput {
  if (typeof window === "undefined") return { viewportWidth: 0, viewportHeight: 0, screenWidth: 0 };
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    screenWidth: window.screen?.width ?? 0,
  };
}

/** Live auto-fit factor; re-measured when the Dock panel is resized or moved to another screen. */
export function useDockAutoFit(): number {
  const [fit, setFit] = useState<number>(() => computeDockAutoFit(readInput()));

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const next = computeDockAutoFit(readInput());
        setFit((current) => (current === next ? current : next));
      });
    };
    window.addEventListener("resize", update);
    update();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
    };
  }, []);

  return fit;
}
