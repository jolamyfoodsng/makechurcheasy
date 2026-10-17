/**
 * snapGuides.ts — Canva-style smart guides for moving and resizing layers.
 *
 * Pure geometry in design pixels (the 1920×1080 canvas). A moving box snaps its
 * edges / centre to the canvas edges and centre, and to the edges and centres of
 * the other layers, and reports the guide lines to draw while it is snapped.
 */

export interface SnapRect { x: number; y: number; w: number; h: number }

export type SnapEdge = "start" | "center" | "end";

export interface SnapOptions {
  canvas: { w: number; h: number };
  /** Reach of a snap, in design pixels. */
  threshold: number;
  /** Which edges of the moving box can snap, per axis. Default: all three on both. */
  edgesX?: SnapEdge[];
  edgesY?: SnapEdge[];
}

export interface SnapResult {
  /** Extra shift to apply to the box so it sits on the guide. */
  dx: number;
  dy: number;
  /** Guide lines to draw: x positions (vertical lines) and y positions (horizontal lines). */
  guidesX: number[];
  guidesY: number[];
}

const ALL_EDGES: SnapEdge[] = ["start", "center", "end"];

function edgeValue(start: number, size: number, edge: SnapEdge): number {
  return edge === "start" ? start : edge === "center" ? start + size / 2 : start + size;
}

function snapAxis(
  start: number,
  size: number,
  edges: SnapEdge[],
  targets: number[],
  threshold: number,
): { shift: number; guides: number[] } {
  let best: number | null = null;
  for (const edge of edges) {
    const value = edgeValue(start, size, edge);
    for (const target of targets) {
      const delta = target - value;
      if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best))) best = delta;
    }
  }
  if (best === null) return { shift: 0, guides: [] };
  // Every edge that now lines up gets its own guide (e.g. centred and flush at once).
  const guides = new Set<number>();
  for (const edge of edges) {
    const value = edgeValue(start, size, edge) + best;
    for (const target of targets) if (Math.abs(target - value) < 0.5) guides.add(Math.round(target * 2) / 2);
  }
  return { shift: best, guides: [...guides] };
}

export function snapRect(rect: SnapRect, others: SnapRect[], opts: SnapOptions): SnapResult {
  const targetsX = [0, opts.canvas.w / 2, opts.canvas.w];
  const targetsY = [0, opts.canvas.h / 2, opts.canvas.h];
  for (const o of others) {
    targetsX.push(o.x, o.x + o.w / 2, o.x + o.w);
    targetsY.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  const x = snapAxis(rect.x, rect.w, opts.edgesX ?? ALL_EDGES, targetsX, opts.threshold);
  const y = snapAxis(rect.y, rect.h, opts.edgesY ?? ALL_EDGES, targetsY, opts.threshold);
  return { dx: x.shift, dy: y.shift, guidesX: x.guides, guidesY: y.guides };
}
