/**
 * layoutOps.ts — pure helpers the Theme Editor uses to change a ThemeLayout.
 * Every helper returns a NEW layout (the editor stores layouts in undo history).
 */
import type { LayerAnimation, LayerType, ThemeLayer, ThemeLayout } from "../types";

export const ANCHOR_FRACTION: Record<ThemeLayer["anchor"], [number, number]> = {
  "top-left": [0, 0], "top-center": [0.5, 0], "top-right": [1, 0],
  "middle-left": [0, 0.5], center: [0.5, 0.5], "middle-right": [1, 0.5],
  "bottom-left": [0, 1], "bottom-center": [0.5, 1], "bottom-right": [1, 1],
};

/** Text-layer contents people pick from (the "role" of a text box). */
export const TEXT_ROLES: Array<{ id: string; label: string; content: string }> = [
  { id: "verse", label: "Verse / lyrics / note text", content: "{text}" },
  { id: "reference", label: "Reference / song or note label", content: "{reference}" },
  { id: "book-cv", label: "Book + chapter:verse", content: "{book} {chapterVerse}" },
  { id: "book", label: "Book only", content: "{book}" },
  { id: "chapter-verse", label: "Chapter:verse only", content: "{chapterVerse}" },
  { id: "translation", label: "Translation (e.g. NKJV)", content: "{translation}" },
];

export function roleForContent(content: string | undefined): string {
  const c = (content || "").trim();
  return TEXT_ROLES.find((r) => r.content === c)?.id ?? "custom";
}

const anim = (preset: LayerAnimation["preset"], duration: number, delay = 0): LayerAnimation => ({
  preset, duration, delay, easing: "out-expo",
});

function uniqueId(layout: ThemeLayout, base: string): string {
  const ids = new Set(layout.layers.map((l) => l.id));
  let i = 1;
  while (ids.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export function getLayer(layout: ThemeLayout, id: string | null): ThemeLayer | null {
  return id ? layout.layers.find((l) => l.id === id) ?? null : null;
}

export function updateLayer(layout: ThemeLayout, id: string, patch: Partial<ThemeLayer>): ThemeLayout {
  return { ...layout, layers: layout.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

export function updateLayerStyle(layout: ThemeLayout, id: string, patch: Partial<ThemeLayer["style"]>): ThemeLayout {
  return {
    ...layout,
    layers: layout.layers.map((l) => (l.id === id ? { ...l, style: { ...l.style, ...patch } } : l)),
  };
}

/** Ids of a layer and everything nested inside it. */
function withDescendants(layout: ThemeLayout, id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of layout.layers) {
      if (l.parentId && out.has(l.parentId) && !out.has(l.id)) {
        out.add(l.id);
        grew = true;
      }
    }
  }
  return out;
}

export function removeLayer(layout: ThemeLayout, id: string): ThemeLayout {
  const gone = withDescendants(layout, id);
  return { ...layout, layers: layout.layers.filter((l) => !gone.has(l.id)) };
}

/** Moves a layer one step up (drawn later = on top) or down in the draw order. */
export function moveLayer(layout: ThemeLayout, id: string, direction: "up" | "down"): ThemeLayout {
  const layers = [...layout.layers];
  const i = layers.findIndex((l) => l.id === id);
  const j = direction === "up" ? i + 1 : i - 1;
  if (i < 0 || j < 0 || j >= layers.length) return layout;
  [layers[i], layers[j]] = [layers[j], layers[i]];
  return { ...layout, layers };
}

export function duplicateLayer(layout: ThemeLayout, id: string): { layout: ThemeLayout; id: string } {
  const src = getLayer(layout, id);
  if (!src) return { layout, id };
  const copyId = uniqueId(layout, src.type);
  const copy: ThemeLayer = { ...src, id: copyId, name: `${src.name} copy`, x: src.x + 24, y: src.y - 24, style: { ...src.style } };
  const at = layout.layers.findIndex((l) => l.id === id);
  const layers = [...layout.layers];
  layers.splice(at + 1, 0, copy);
  return { layout: { ...layout, layers }, id: copyId };
}

/** Adds a new top-level layer near the lower-third area, on top of everything. */
export function addLayer(layout: ThemeLayout, type: LayerType): { layout: ThemeLayout; id: string } {
  const id = uniqueId(layout, type);
  const base = { id, anchor: "top-left" as const, hidden: false };
  let layer: ThemeLayer;
  if (type === "text") {
    layer = {
      ...base, name: "Text", type, content: "{reference}", x: 120, y: 760, w: 900, h: "auto",
      style: { fontFamily: "Montserrat", fontSize: 40, minFontSize: 22, fontWeight: 600, color: "#ffffff", maxLines: 1 },
      in: anim("fade", 400, 200), out: anim("fade", 220),
    };
  } else if (type === "image") {
    layer = {
      ...base, name: "Image", type, x: 120, y: 760, w: 160, h: 160,
      style: { src: "", fit: "contain" },
      in: anim("pop", 420, 200), out: anim("fade", 200),
    };
  } else if (type === "divider") {
    layer = {
      ...base, name: "Line", type, x: 120, y: 820, w: 600, h: 4,
      style: { fill: "#ffffff" },
      in: anim("grow-x", 500, 100), out: anim("fade", 200),
    };
  } else {
    layer = {
      ...base, name: "Box", type: "box", x: 120, y: 800, w: 1680, h: 200,
      style: { fill: "rgba(15,18,28,0.88)", radius: 8 },
      in: anim("wipe-left", 600), out: anim("fade", 380, 120),
    };
  }
  return { layout: { ...layout, layers: [...layout.layers, layer] }, id };
}

/**
 * Applies a move/resize done on the canvas, in design pixels. `dw`/`dh` grow the
 * box from its top-left corner whatever its anchor (x/y shift to compensate).
 */
export function nudgeLayer(layer: ThemeLayer, dx: number, dy: number, dw = 0, dh = 0): Partial<ThemeLayer> {
  const [fx, fy] = ANCHOR_FRACTION[layer.anchor] ?? [0, 0];
  const out: Partial<ThemeLayer> = { x: Math.round(layer.x + dx + dw * fx), y: Math.round(layer.y + dy) };
  if (dw) out.w = Math.max(4, Math.round(layer.w + dw));
  if (dh && layer.h !== "auto") {
    out.h = Math.max(2, Math.round((layer.h as number) + dh));
    out.y = Math.round(layer.y + dy + dh * fy);
  }
  return out;
}
