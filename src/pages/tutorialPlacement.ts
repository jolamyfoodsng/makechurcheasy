// ────────────────────────────────────────────────────────────────────────────
// Tutorial Placement Engine
//
// Pure functions for calculating tooltip/panel placement and spotlight
// clipping relative to the application viewport.  No DOM dependencies —
// all inputs are plain geometry values so the logic is fully unit-testable.
// ────────────────────────────────────────────────────────────────────────────

/** Placement of the panel relative to the target element. */
export type Placement = "top" | "bottom" | "right" | "left";

/** A DOMRect-like shape (subset sufficient for placement math). */
export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Viewport dimensions. */
export interface Viewport {
  width: number;
  height: number;
}

/** Result of placement calculation. */
export interface PanelPlacement {
  top: number;
  left: number;
  /** The placement that was actually chosen after fallback. */
  placement: Placement;
}

/** Clamped spotlight rectangle (always within viewport bounds). */
export interface ClampedSpotlight {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MARGIN = 20;

/** Preferred fallback order: right → bottom → left → top. */
const PLACEMENT_ORDER: Placement[] = ["right", "bottom", "left", "top"];

/**
 * Try to place the panel in each candidate position.  Return the first
 * placement that keeps the panel fully within the viewport (with margin).
 *
 * @param target   Bounding rect of the element being highlighted.
 * @param panelW   Width of the tooltip/panel.
 * @param panelH   Height of the tooltip/panel.
 * @param viewport Application viewport dimensions.
 * @param gap      Gap between target edge and panel edge.
 */
export function calculatePanelPlacement(
  target: Rect,
  panelW: number,
  panelH: number,
  viewport: Viewport,
  gap: number = 20,
): PanelPlacement {
  for (const placement of PLACEMENT_ORDER) {
    const pos = positionForPlacement(target, panelW, panelH, placement, gap);
    if (fitsInViewport(pos, panelW, panelH, viewport)) {
      return { ...pos, placement };
    }
  }

  // Fallback: center horizontally, place below target (clamped).
  let left = (viewport.width - panelW) / 2;
  let top = target.bottom + gap;

  left = clampX(left, panelW, viewport);
  top = clampY(top, panelH, viewport);

  return { top, left, placement: "bottom" };
}

// ── Internal helpers ────────────────────────────────────────────────────────

function positionForPlacement(
  target: Rect,
  panelW: number,
  panelH: number,
  placement: Placement,
  gap: number,
): { top: number; left: number } {
  switch (placement) {
    case "right":
      return {
        top: target.top + target.height / 2 - panelH / 2,
        left: target.right + gap,
      };
    case "left":
      return {
        top: target.top + target.height / 2 - panelH / 2,
        left: target.left - gap - panelW,
      };
    case "top":
      return {
        top: target.top - gap - panelH,
        left: target.left + target.width / 2 - panelW / 2,
      };
    case "bottom":
      return {
        top: target.bottom + gap,
        left: target.left + target.width / 2 - panelW / 2,
      };
  }
}

function fitsInViewport(
  pos: { top: number; left: number },
  panelW: number,
  panelH: number,
  viewport: Viewport,
): boolean {
  return (
    pos.left >= MARGIN &&
    pos.top >= MARGIN &&
    pos.left + panelW <= viewport.width - MARGIN &&
    pos.top + panelH <= viewport.height - MARGIN
  );
}

function clampX(left: number, panelW: number, viewport: Viewport): number {
  return Math.max(MARGIN, Math.min(left, viewport.width - panelW - MARGIN));
}

function clampY(top: number, panelH: number, viewport: Viewport): number {
  return Math.max(MARGIN, Math.min(top, viewport.height - panelH - MARGIN));
}

/**
 * Clamp a spotlight rectangle so it never extends beyond the viewport.
 * Used to draw the dark overlay cut-out around the target element.
 */
export function clampSpotlight(
  spotlight: { top: number; left: number; width: number; height: number },
  viewport: Viewport,
): ClampedSpotlight {
  let { top, left, width, height } = spotlight;

  if (left < 0) {
    width += left;
    left = 0;
  }
  if (top < 0) {
    height += top;
    top = 0;
  }
  if (left + width > viewport.width) {
    width = viewport.width - left;
  }
  if (top + height > viewport.height) {
    height = viewport.height - top;
  }

  width = Math.max(0, width);
  height = Math.max(0, height);

  return { top, left, width, height };
}
