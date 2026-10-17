/**
 * LayerCanvasOverlay — selection, move and resize on top of the live theme preview.
 *
 * It sits inside the scaled 1920×1080 preview canvas, next to the ThemeRenderer
 * host, and measures each layer from the renderer's own DOM ([data-layer-id]), so
 * boxes match what OBS draws (anchors, nested layers and auto-height text included).
 * Drags report a draft while the pointer moves and commit once on release.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ThemeLayer, ThemeLayout } from "../types";
import { nudgeLayer } from "./layoutOps";
import { snapRect } from "./snapGuides";

interface Rect { x: number; y: number; w: number; h: number }

interface Props {
  /** Element that holds the renderer output (the scaled 1920×1080 canvas). */
  canvasRef: React.RefObject<HTMLElement | null>;
  layout: ThemeLayout;
  scale: number;
  selectedId: string | null;
  /** Changes when the previewed content changes, to re-measure text boxes. */
  contentKey: string;
  onSelect: (id: string | null) => void;
  /** Live update while dragging (not stored in history). */
  onDraft: (id: string, patch: Partial<ThemeLayer>) => void;
  /** Final value when the pointer is released. */
  onCommit: (id: string, patch: Partial<ThemeLayer>) => void;
}

type DragMode = "move" | "resize";

export default function LayerCanvasOverlay({ canvasRef, layout, scale, selectedId, contentKey, onSelect, onDraft, onCommit }: Props) {
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const dragRef = useRef<{ id: string; mode: DragMode; startX: number; startY: number; layer: ThemeLayer; start: Rect | null; last: Partial<ThemeLayer> | null } | null>(null);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base = canvas.getBoundingClientRect();
    const s = scale || 1;
    const next: Record<string, Rect> = {};
    canvas.querySelectorAll<HTMLElement>("[data-layer-id]").forEach((el) => {
      const id = el.dataset.layerId;
      if (!id || el.classList.contains("mtl-hidden")) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      next[id] = { x: (r.left - base.left) / s, y: (r.top - base.top) / s, w: r.width / s, h: r.height / s };
    });
    setRects(next);
  }, [canvasRef, scale]);

  // The renderer draws asynchronously (fonts, auto-fit), so measure a few times.
  useLayoutEffect(() => {
    measure();
    const timers = [60, 250, 700].map((ms) => window.setTimeout(measure, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [measure, layout, contentKey]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const startDrag = (e: ReactPointerEvent, layer: ThemeLayer, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(layer.id);
    if (layer.locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: layer.id, mode, startX: e.clientX, startY: e.clientY, layer, start: rects[layer.id] ?? null, last: null };
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const s = scale || 1;
    let dx = (e.clientX - d.startX) / s;
    let dy = (e.clientY - d.startY) / s;
    if (e.shiftKey && d.mode === "move") {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    // Snap to an 8 px grid unless Alt/Option is held.
    if (!e.altKey) {
      dx = Math.round(dx / 8) * 8;
      dy = Math.round(dy / 8) * 8;
    }
    // Smart guides: snap to the canvas centre / edges and to other layers (Alt/Option turns it off).
    if (!e.altKey && d.start) {
      const moving = d.mode === "move";
      const box = moving
        ? { x: d.start.x + dx, y: d.start.y + dy, w: d.start.w, h: d.start.h }
        : { x: d.start.x, y: d.start.y, w: d.start.w + dx, h: d.start.h + dy };
      const skip = new Set<string>([d.id]);
      for (const l of layout.layers) if (l.parentId && skip.has(l.parentId)) skip.add(l.id);
      const others = layout.layers.filter((l) => !l.hidden && !skip.has(l.id) && rects[l.id]).map((l) => rects[l.id]);
      const snap = snapRect(box, others, {
        canvas: { w: 1920, h: 1080 },
        threshold: Math.min(20, Math.max(6, 6 / (scale || 1))),
        edgesX: moving ? undefined : ["end"],
        edgesY: moving ? undefined : ["end"],
      });
      dx += snap.dx;
      dy += snap.dy;
      setGuides({ x: snap.guidesX, y: snap.guidesY });
    }
    const patch = d.mode === "move" ? nudgeLayer(d.layer, dx, dy) : nudgeLayer(d.layer, 0, 0, dx, dy);
    d.last = patch;
    onDraft(d.id, patch);
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setGuides({ x: [], y: [] });
    if (d?.last) onCommit(d.id, d.last);
  };

  const handle = 14 / (scale || 1);
  const stroke = Math.max(1.5, 2 / (scale || 1));

  return (
    <div
      className="le-overlay"
      style={{ position: "absolute", inset: 0, zIndex: 5 }}
      onPointerDown={() => onSelect(null)}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {layout.layers.map((layer) => {
        const r = rects[layer.id];
        if (!r || layer.hidden) return null;
        const selected = layer.id === selectedId;
        return (
          <div
            key={layer.id}
            className={`le-box${selected ? " le-box--selected" : ""}${layer.locked ? " le-box--locked" : ""}`}
            style={{
              position: "absolute",
              left: r.x,
              top: r.y,
              width: Math.max(r.w, 6),
              height: Math.max(r.h, 6),
              outlineWidth: stroke,
              zIndex: selected ? 3 : 1,
            }}
            title={layer.name}
            onPointerDown={(e) => startDrag(e, layer, "move")}
          >
            {selected && !layer.locked && (
              <span
                className="le-handle"
                style={{ width: handle, height: handle, right: -handle / 2, bottom: -handle / 2 }}
                onPointerDown={(e) => startDrag(e, layer, "resize")}
              />
            )}
          </div>
        );
      })}
      {guides.x.map((x) => (
        <div key={`gx${x}`} className="le-guide" style={{ position: "absolute", left: x - stroke / 2, top: 0, width: stroke, height: 1080 }} />
      ))}
      {guides.y.map((y) => (
        <div key={`gy${y}`} className="le-guide" style={{ position: "absolute", top: y - stroke / 2, left: 0, height: stroke, width: 1920 }} />
      ))}
    </div>
  );
}
