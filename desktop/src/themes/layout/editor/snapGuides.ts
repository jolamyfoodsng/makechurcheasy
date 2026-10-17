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
  /** Also snap to equal spacing between layers (moves only). Default true. */
  spacing?: boolean;
}

/** A measured gap to draw: a horizontal segment (axis "x") or vertical one (axis "y"). */
export interface SnapGap {
  axis: "x" | "y";
  /** Start and end along the axis. */
  from: number;
  to: number;
  /** Position on the other axis, where the segment is drawn. */
  cross: number;
}

export interface SnapResult {
  /** Extra shift to apply to the box so it sits on the guide. */
  dx: number;
  dy: number;
  /** Guide lines to draw: x positions (vertical lines) and y positions (horizontal lines). */
  guidesX: number[];
  guidesY: number[];
  /** Equal-spacing markers (drawn with their size) when the box sits at an equal gap. */
  gaps: SnapGap[];
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

interface Interval { s: number; e: number; cs: number; ce: number }

function toInterval(r: SnapRect, axis: "x" | "y"): Interval {
  return axis === "x" ? { s: r.x, e: r.x + r.w, cs: r.y, ce: r.y + r.h } : { s: r.y, e: r.y + r.h, cs: r.x, ce: r.x + r.w };
}

const crossMid = (a: Interval, b: Interval) => (Math.max(a.cs, b.cs) + Math.min(a.ce, b.ce)) / 2;

/**
 * Equal spacing, like Canva: the box snaps (a) exactly between two layers so both
 * gaps match, or (b) one gap away from a layer, repeating the gap that already
 * separates two other layers. Only layers it overlaps on the other axis count.
 */
function snapSpacing(rect: SnapRect, others: SnapRect[], axis: "x" | "y", threshold: number): { shift: number; gaps: SnapGap[] } | null {
  const box = toInterval(rect, axis);
  const size = box.e - box.s;
  const peers = others
    .map((o) => toInterval(o, axis))
    .filter((o) => Math.min(o.ce, box.ce) - Math.max(o.cs, box.cs) > 0 && o.e - o.s > 0)
    .sort((a, b) => a.s - b.s);
  const seg = (from: number, to: number, a: Interval, b: Interval): SnapGap => ({ axis, from, to, cross: crossMid(a, b) });

  let best: { shift: number; gaps: SnapGap[] } | null = null;
  const consider = (pos: number, gaps: SnapGap[]) => {
    const shift = pos - box.s;
    if (Math.abs(shift) > threshold) return;
    if (!best || Math.abs(shift) < Math.abs(best.shift)) best = { shift, gaps };
  };
  for (const a of peers) {
    for (const b of peers) {
      if (a === b || a.e > b.s) continue; // a ends before b starts
      const gap = b.s - a.e;
      // Between a and b: equal gaps on both sides.
      const mid = (a.e + b.s - size) / 2;
      if (mid >= a.e && mid + size <= b.s) {
        const at = { ...box, s: mid, e: mid + size };
        consider(mid, [seg(a.e, mid, a, at), seg(mid + size, b.s, at, b)]);
      }
      if (gap < 1) continue;
      // After b, repeating the gap between a and b.
      const after = { ...box, s: b.e + gap, e: b.e + gap + size };
      consider(after.s, [seg(a.e, b.s, a, b), seg(b.e, after.s, b, after)]);
      // Before a, repeating the same gap.
      const before = { ...box, s: a.s - gap - size, e: a.s - gap };
      consider(before.s, [seg(a.e, b.s, a, b), seg(before.e, a.s, before, a)]);
    }
  }
  return best;
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
  const result: SnapResult = { dx: x.shift, dy: y.shift, guidesX: x.guides, guidesY: y.guides, gaps: [] };
  if (opts.spacing === false) return result;

  // An equal-spacing snap wins on an axis when it is closer than the edge / centre snap there.
  const sx = snapSpacing({ ...rect, y: rect.y + y.shift }, others, "x", opts.threshold);
  if (sx && (x.guides.length === 0 || Math.abs(sx.shift) < Math.abs(x.shift))) {
    result.dx = sx.shift;
    result.guidesX = [];
    result.gaps.push(...sx.gaps);
  }
  const sy = snapSpacing({ ...rect, x: rect.x + result.dx }, others, "y", opts.threshold);
  if (sy && (y.guides.length === 0 || Math.abs(sy.shift) < Math.abs(y.shift))) {
    result.dy = sy.shift;
    result.guidesY = [];
    result.gaps.push(...sy.gaps);
  }
  return result;
}
