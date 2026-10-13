/**
 * segments.ts — seven-segment digits drawn as SVG (no font needed).
 * Used by text layers that set `style.segment` (countdown designs).
 */
import type { SegmentStyle } from "./types";

// a=top, b=top-right, c=bottom-right, d=bottom, e=bottom-left, f=top-left, g=middle
const DIGITS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  " ": "",
};

const ALL = "abcdefg";
const H = 100;
const W = 56;

function pts(list: Array<[number, number]>): string {
  return list.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(" ");
}

function horizontal(x1: number, x2: number, y: number, t: number): string {
  const h = t / 2;
  return pts([[x1, y], [x1 + h, y - h], [x2 - h, y - h], [x2, y], [x2 - h, y + h], [x1 + h, y + h]]);
}

function vertical(x: number, y1: number, y2: number, t: number): string {
  const h = t / 2;
  return pts([[x, y1], [x + h, y1 + h], [x + h, y2 - h], [x, y2], [x - h, y2 - h], [x - h, y1 + h]]);
}

function segmentPolygons(t: number, g: number): Record<string, string> {
  const h = t / 2;
  const xl = h;
  const xr = W - h;
  const yt = h;
  const ym = H / 2;
  const yb = H - h;
  return {
    a: horizontal(xl + g, xr - g, yt, t),
    g: horizontal(xl + g, xr - g, ym, t),
    d: horizontal(xl + g, xr - g, yb, t),
    f: vertical(xl, yt + g, ym - g, t),
    b: vertical(xr, yt + g, ym - g, t),
    e: vertical(xl, ym + g, yb - g, t),
    c: vertical(xr, ym + g, yb - g, t),
  };
}

export interface SegmentMetrics {
  width: number;
  height: number;
}

/** Characters this display can draw. Anything else is skipped. */
export function segmentChars(text: string): string[] {
  return Array.from(text || "").filter((c) => c in DIGITS || c === ":" || c === ".");
}

/**
 * SVG markup for `text` ("12:34", "-05:00"). Digits are lit segments, `off*` draws
 * the unlit ones. The SVG scales to its box (preserveAspectRatio meet).
 */
export function segmentSvg(text: string, style: SegmentStyle = {}, align: "left" | "center" | "right" = "center"): string {
  const t = Math.max(4, Math.min(30, ((style.thickness ?? 12) / 100) * H));
  const g = Math.max(0, style.gap ?? 2.4);
  const spacing = ((style.spacing ?? 18) / 100) * W;
  const polys = segmentPolygons(t, g);
  const offOpacity = style.offOpacity ?? 0;
  const chars = segmentChars(text);

  let x = 0;
  const parts: string[] = [];
  chars.forEach((c, i) => {
    if (c === ":" || c === ".") {
      const cw = Math.max(t * 1.4, 10);
      const r = t * 0.55;
      const cx = cw / 2;
      if (c === ":") {
        parts.push(`<circle cx="${x + cx}" cy="${H * 0.32}" r="${r}"/><circle cx="${x + cx}" cy="${H * 0.68}" r="${r}"/>`);
      } else {
        parts.push(`<circle cx="${x + cx}" cy="${H - r}" r="${r}"/>`);
      }
      x += cw + (i < chars.length - 1 ? spacing * 0.5 : 0);
      return;
    }
    const lit = DIGITS[c] ?? "";
    const off = ALL.split("").filter((s) => !lit.includes(s));
    let group = "";
    if (offOpacity > 0) {
      const col = style.offColor ? ` fill="${style.offColor}"` : "";
      group += `<g opacity="${offOpacity}"${col}>${off.map((s) => `<polygon points="${polys[s]}"/>`).join("")}</g>`;
    }
    group += lit.split("").map((s) => `<polygon points="${polys[s]}"/>`).join("");
    parts.push(`<g transform="translate(${x} 0)">${group}</g>`);
    x += W + (i < chars.length - 1 ? spacing : 0);
  });

  const slant = Math.max(0, Math.min(25, style.slant ?? 0));
  const lean = Math.tan((slant * Math.PI) / 180) * H;
  const total = Math.max(1, x);
  const vbW = total + lean;
  const preserve = align === "left" ? "xMinYMid meet" : align === "right" ? "xMaxYMid meet" : "xMidYMid meet";
  const body = slant ? `<g transform="translate(${+lean.toFixed(2)} 0) skewX(${-slant})">${parts.join("")}</g>` : parts.join("");
  const glow = style.glow ? ` style="filter:drop-shadow(0 0 ${style.glow}px currentColor) drop-shadow(0 0 ${style.glow * 2.2}px currentColor)"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${+vbW.toFixed(2)} ${H}" preserveAspectRatio="${preserve}" width="100%" height="100%" fill="currentColor"${glow}>${body}</svg>`;
}
