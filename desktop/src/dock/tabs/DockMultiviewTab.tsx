/**
 * DockMultiviewTab.tsx — Multi-View tab for the MakeChurchEasy Dock
 *
 * Card-based Multi-View manager:
 *   - Each Multi-View is an independent card stacked vertically
 *   - Inline template selection + scene assignment per card
 *   - Per-card Push to OBS
 *   - Card actions menu (⋮): Rename, Duplicate, Delete
 *   - No detail pages, no back buttons, everything on one screen
 */

import { useState, useEffect, useCallback, useRef, useMemo, type ChangeEvent, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { dockObsClient } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import { useDockObsReady } from "../useDockObsReady";
import Icon from "../DockIcon";
import { requireEntitlement } from "../dockEntitlement";
import { getUserScopedKey } from "../../services/userScopedStorage";
import { GALLERY_LAYOUTS, type GalleryLayout, type GallerySlot } from "../../multiview/galleryLayouts";
import { saveToDisk, getSafeFileName } from "../dockUploadService";
import { getRecommendedPollingInterval } from "../../services/performanceManager";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "dock-mv-saved";
const ADDED_LAYOUTS_KEY = "mvg-added-ids";
const CANVAS_W = 1920;
const CANVAS_H = 1080;

const CONTENT_TYPE_INFO: Record<string, { labelKey: string; icon: string; color: string }> = {
  camera: { labelKey: "multiview.camera", icon: "videocam", color: "#0078d4" },
  scripture: { labelKey: "multiview.scripture", icon: "menu_book", color: "#3B82F6" },
  translation: { labelKey: "multiview.translation", icon: "translate", color: "#00bcd4" },
  "lower-third": { labelKey: "multiview.lowerThird", icon: "subtitles", color: "#ff9800" },
  browser: { labelKey: "multiview.browser", icon: "language", color: "#ff5722" },
  image: { labelKey: "multiview.image", icon: "image", color: "#9c27b0" },
};

const SCENE_TYPES = new Set(["camera", "scripture", "translation", "lower-third"]);

// ---------------------------------------------------------------------------
// Data Model
// ---------------------------------------------------------------------------

type MVBgType = "color" | "image" | "video" | "scene";

interface MVBackground {
  type: MVBgType;
  color: string;
  filePath: string;
  sceneName: string;
}

const DEFAULT_MV_BG: MVBackground = { type: "color", color: "transparent", filePath: "", sceneName: "" };

interface SavedMultiView {
  id: string;
  name: string;
  /** Stable OBS scene name — one scene per card, never derived from template */
  obsSceneName: string;
  layoutId: string;
  assignments: Record<string, string>;
  slotModes: Record<string, "scene" | "source">;
  slotFraming: Record<string, { displayMode: "fill" | "fit" | "custom"; zoom: number; focalX: number; focalY: number }>;
  /** Base64 data-URL thumbnails of assigned scenes */
  slotThumbnails: Record<string, string>;
  background: MVBackground;
  /** Frame applied to all slots (null = no frame) */
  layoutFrameId: string | null;
  /** Frame thickness override (1-20, default based on frame definition) */
  frameThickness: number;
  /** Frame corner radius override (0-40, 0 = use frame default) */
  frameCornerRadius: number;
  /** Frame opacity override (10-100, 100 = fully opaque) */
  frameOpacity: number;
  /** Frame color override (empty = use frame default colors) */
  frameColor: string;
  /** Per-slot frame override: "inherit" = use layoutFrameId, "none" = no frame, {frameId} = custom */
  slotFrames: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

// ── Frame Definitions ──────────────────────────────────────────────────────

interface FrameLayer {
  inset: number;       // offset from previous layer (outermost starts at 0)
  thickness: number;   // stroke width
  color: string;       // CSS color
  radius: number;      // corner radius (0 = square)
}

interface MultiviewFrame {
  id: string;
  name: string;
  category: "clean" | "broadcast" | "glow" | "decorative";
  layers: FrameLayer[];
  /** CSS fallback for editor preview (rendered by shared drawLayers on canvas) */
  css: Record<string, string | number>;
}

const FRAME_LIBRARY: MultiviewFrame[] = [
  // ── Clean ──
  {
    id: "clean-white", name: "Thin White", category: "clean",
    layers: [{ inset: 0, thickness: 2, color: "rgba(255,255,255,0.7)", radius: 0 }],
    css: { border: "2px solid rgba(255,255,255,0.7)", borderRadius: "0px" },
  },
  {
    id: "clean-black", name: "Thin Black", category: "clean",
    layers: [{ inset: 0, thickness: 2, color: "rgba(0,0,0,0.7)", radius: 0 }],
    css: { border: "2px solid rgba(0,0,0,0.7)", borderRadius: "0px" },
  },
  {
    id: "clean-gray", name: "Soft Gray", category: "clean",
    layers: [{ inset: 0, thickness: 2, color: "rgba(148,163,184,0.5)", radius: 0 }],
    css: { border: "2px solid rgba(148,163,184,0.5)", borderRadius: "0px" },
  },
  {
    id: "clean-white-round", name: "Rounded White", category: "clean",
    layers: [{ inset: 0, thickness: 2, color: "rgba(255,255,255,0.7)", radius: 12 }],
    css: { border: "2px solid rgba(255,255,255,0.7)", borderRadius: "12px" },
  },
  {
    id: "clean-dark-round", name: "Rounded Dark", category: "clean",
    layers: [{ inset: 0, thickness: 2, color: "rgba(30,41,59,0.8)", radius: 12 }],
    css: { border: "2px solid rgba(30,41,59,0.8)", borderRadius: "12px" },
  },
  // ── Broadcast ──
  {
    id: "broadcast-blue", name: "Blue Broadcast", category: "broadcast",
    layers: [
      { inset: 0, thickness: 3, color: "#1D4ED8", radius: 4 },
      { inset: 4, thickness: 1, color: "rgba(29,78,216,0.3)", radius: 2 },
    ],
    css: { border: "3px solid #1D4ED8", borderRadius: "4px", boxShadow: "inset 0 0 0 1px rgba(29,78,216,0.3)" },
  },
  {
    id: "broadcast-red", name: "Red Broadcast", category: "broadcast",
    layers: [
      { inset: 0, thickness: 3, color: "#DC2626", radius: 4 },
      { inset: 4, thickness: 1, color: "rgba(220,38,38,0.3)", radius: 2 },
    ],
    css: { border: "3px solid #DC2626", borderRadius: "4px", boxShadow: "inset 0 0 0 1px rgba(220,38,38,0.3)" },
  },
  {
    id: "broadcast-gold", name: "Gold Broadcast", category: "broadcast",
    layers: [
      { inset: 0, thickness: 3, color: "#D4A853", radius: 4 },
      { inset: 4, thickness: 1, color: "rgba(212,168,83,0.4)", radius: 2 },
    ],
    css: { border: "3px solid #D4A853", borderRadius: "4px", boxShadow: "inset 0 0 0 1px rgba(212,168,83,0.4)" },
  },
  {
    id: "broadcast-white-gold", name: "White + Gold", category: "broadcast",
    layers: [
      { inset: 0, thickness: 2, color: "#D4A853", radius: 0 },
      { inset: 3, thickness: 2, color: "rgba(255,255,255,0.3)", radius: 0 },
    ],
    css: { border: "4px double #D4A853", borderRadius: "0px" },
  },
  {
    id: "broadcast-double", name: "Double Line", category: "broadcast",
    layers: [
      { inset: 0, thickness: 2, color: "rgba(255,255,255,0.5)", radius: 0 },
      { inset: 4, thickness: 2, color: "rgba(255,255,255,0.3)", radius: 0 },
    ],
    css: { border: "4px double rgba(255,255,255,0.6)", borderRadius: "0px" },
  },
  // ── Glow ──
  {
    id: "glow-cyan", name: "Cyan Glow", category: "glow",
    layers: [
      { inset: 0, thickness: 2, color: "#06B6D4", radius: 8 },
      { inset: 3, thickness: 1, color: "rgba(6,182,212,0.4)", radius: 6 },
    ],
    css: { border: "2px solid #06B6D4", borderRadius: "8px", boxShadow: "0 0 12px rgba(6,182,212,0.5), inset 0 0 8px rgba(6,182,212,0.15)" },
  },
  {
    id: "glow-blue", name: "Blue Glow", category: "glow",
    layers: [
      { inset: 0, thickness: 2, color: "#3B82F6", radius: 8 },
      { inset: 3, thickness: 1, color: "rgba(59,130,246,0.4)", radius: 6 },
    ],
    css: { border: "2px solid #3B82F6", borderRadius: "8px", boxShadow: "0 0 12px rgba(59,130,246,0.5), inset 0 0 8px rgba(59,130,246,0.15)" },
  },
  {
    id: "glow-purple", name: "Purple Glow", category: "glow",
    layers: [
      { inset: 0, thickness: 2, color: "#8B5CF6", radius: 8 },
      { inset: 3, thickness: 1, color: "rgba(139,92,246,0.4)", radius: 6 },
    ],
    css: { border: "2px solid #8B5CF6", borderRadius: "8px", boxShadow: "0 0 12px rgba(139,92,246,0.5), inset 0 0 8px rgba(139,92,246,0.15)" },
  },
  {
    id: "glow-gold", name: "Gold Glow", category: "glow",
    layers: [
      { inset: 0, thickness: 2, color: "#D4A853", radius: 8 },
      { inset: 4, thickness: 1, color: "rgba(212,168,83,0.4)", radius: 6 },
    ],
    css: { border: "2px solid #D4A853", borderRadius: "8px", boxShadow: "0 0 14px rgba(212,168,83,0.5), inset 0 0 8px rgba(212,168,83,0.2)" },
  },
  {
    id: "glow-white", name: "White Glow", category: "glow",
    layers: [
      { inset: 0, thickness: 2, color: "rgba(255,255,255,0.5)", radius: 8 },
    ],
    css: { border: "2px solid rgba(255,255,255,0.5)", borderRadius: "8px", boxShadow: "0 0 10px rgba(255,255,255,0.25)" },
  },
  // ── Decorative ──
  {
    id: "deco-gold-ornate", name: "Gold Ornamental", category: "decorative",
    layers: [
      { inset: 0, thickness: 4, color: "#D4A853", radius: 6 },
      { inset: 5, thickness: 2, color: "rgba(212,168,83,0.2)", radius: 4 },
      { inset: 8, thickness: 1, color: "rgba(212,168,83,0.1)", radius: 2 },
    ],
    css: { border: "4px solid #D4A853", borderRadius: "6px", boxShadow: "0 0 0 3px rgba(212,168,83,0.2), 0 0 0 6px rgba(212,168,83,0.1)" },
  },
  {
    id: "deco-gold-cyan", name: "Gold + Cyan", category: "decorative",
    layers: [
      { inset: 0, thickness: 4, color: "#D4A853", radius: 8 },
      { inset: 5, thickness: 2, color: "rgba(30,30,30,0.7)", radius: 6 },
      { inset: 8, thickness: 2, color: "rgba(6,182,212,0.6)", radius: 4 },
    ],
    css: { border: "3px solid #D4A853", borderRadius: "4px", boxShadow: "0 0 0 2px rgba(6,182,212,0.4), 0 0 0 5px rgba(212,168,83,0.3)" },
  },
  {
    id: "deco-church", name: "Church Broadcast", category: "decorative",
    layers: [
      { inset: 0, thickness: 4, color: "#D4A853", radius: 10 },
      { inset: 5, thickness: 2, color: "rgba(212,168,83,0.3)", radius: 8 },
      { inset: 8, thickness: 1, color: "rgba(255,255,255,0.15)", radius: 7 },
      { inset: 10, thickness: 1, color: "rgba(212,168,83,0.2)", radius: 5 },
    ],
    css: { border: "5px double #D4A853", borderRadius: "8px", boxShadow: "inset 0 0 0 2px rgba(212,168,83,0.15), 0 0 0 1px rgba(212,168,83,0.25)" },
  },
  {
    id: "deco-cinema", name: "Cinematic", category: "decorative",
    layers: [
      { inset: 0, thickness: 3, color: "rgba(255,255,255,0.25)", radius: 0 },
      { inset: 4, thickness: 1, color: "rgba(255,255,255,0.12)", radius: 0 },
    ],
    css: { border: "2px solid rgba(255,255,255,0.3)", borderRadius: "0px", boxShadow: "0 0 20px rgba(0,0,0,0.5)" },
  },
  {
    id: "deco-metallic", name: "Metallic", category: "decorative",
    layers: [
      { inset: 0, thickness: 3, color: "#94A3B8", radius: 2 },
      { inset: 4, thickness: 1, color: "#CBD5E1", radius: 1 },
    ],
    css: { border: "3px solid #94A3B8", borderRadius: "0px" },
  },
];

const FRAME_CATEGORIES = [
  { key: "all" as const, label: "All" },
  { key: "clean" as const, label: "Clean" },
  { key: "broadcast" as const, label: "Broadcast" },
  { key: "glow" as const, label: "Glow" },
  { key: "decorative" as const, label: "Decorative" },
];

function resolveFrame(frameId: string | null | undefined): MultiviewFrame | undefined {
  if (!frameId) return undefined;
  return FRAME_LIBRARY.find(f => f.id === frameId);
}

// ── Shared frame renderer — used by both preview and OBS compositor ──

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawFrameLayers(
  ctx: CanvasRenderingContext2D,
  frame: MultiviewFrame,
  x: number, y: number, w: number, h: number,
  thicknessScale: number,
  cornerRadiusOverride: number,
  opacity: number,
  colorOverride: string,
) {
  const alpha = opacity / 100;
  for (const layer of frame.layers) {
    const t = Math.max(1, Math.round(layer.thickness * thicknessScale));
    const inset = layer.inset;
    const r = cornerRadiusOverride > 0 ? cornerRadiusOverride : Math.max(0, layer.radius - inset);
    const lx = x + inset;
    const ly = y + inset;
    const lw = w - inset * 2;
    const lh = h - inset * 2;
    const color = colorOverride || layer.color;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = t;
    ctx.globalAlpha = alpha;

    if (r > 0) {
      drawRoundedRect(ctx, lx, ly, lw, lh, r);
    } else {
      ctx.strokeRect(lx, ly, lw, lh);
    }
    ctx.stroke();
    ctx.restore();
  }
}

async function generateCompositeFramePng(
  layout: GalleryLayout,
  frameId: string | null,
  slotFrames: Record<string, string>,
  thickness: number,
  cornerRadius: number,
  opacity: number,
  color: string,
): Promise<Uint8Array | null> {
  // Resolve effective frame per slot
  const slotDefs = layout.slots.map(slot => {
    const sf = slotFrames[slot.id];
    const eff = sf === "none" ? null : sf ? sf : frameId;
    return eff ? { rect: { x: slot.x, y: slot.y, w: slot.width, h: slot.height }, frame: resolveFrame(eff) } : null;
  }).filter(Boolean) as Array<{ rect: { x: number; y: number; w: number; h: number }; frame: MultiviewFrame }>;

  if (slotDefs.length === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const scale = thickness / 2; // 2 = base, slider range 1-16

  for (const { rect, frame } of slotDefs) {
    drawFrameLayers(ctx, frame, rect.x, rect.y, rect.w, rect.h, scale, cornerRadius, opacity, color);
  }

  // Export as PNG bytes
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(null); return; }
      blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
    }, "image/png");
  });
}

async function saveFramePngToDisk(bytes: Uint8Array): Promise<string | null> {
  const safeName = `mv-frame-${Date.now()}.png`;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<string>("save_upload_file", {
      fileName: safeName,
      fileData: Array.from(bytes),
    });
    return result;
  } catch {
    // HTTP fallback
    try {
      const base64 = btoa(String.fromCharCode(...bytes));
      const dataUrl = `data:image/png;base64,${base64}`;
      const res = await fetch("/api/save-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: safeName, dataUrl }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.path || null;
    } catch {
      return null;
    }
  }
}

function genId(): string {
  return `mv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Short display ID like MV-001 based on index */
function shortId(index: number): string {
  return `MV-${String(index + 1).padStart(3, "0")}`;
}

/** Pick the next unused OBS scene name (e.g. "MV: Multiview 3") */
function nextObsSceneName(list: SavedMultiView[]): string {
  const used = new Set(list.map(m => m.obsSceneName).filter(Boolean));
  let n = 1;
  while (used.has(`MV: Multiview ${n}`)) n++;
  return `MV: Multiview ${n}`;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function loadSaved(): SavedMultiView[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function loadAddedLayoutIds(): Set<string> {
  try {
    // Migration: try unscoped key first, fall back to user-scoped key
    let raw = localStorage.getItem(ADDED_LAYOUTS_KEY);
    if (!raw) {
      raw = localStorage.getItem(getUserScopedKey(ADDED_LAYOUTS_KEY));
      if (raw) {
        localStorage.setItem(ADDED_LAYOUTS_KEY, raw);
      }
    }
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveSaved(items: SavedMultiView[]) {
  try {
    localStorage.setItem(getUserScopedKey(STORAGE_KEY), JSON.stringify(items));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBackgroundMediaLabel(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

function resolveLayout(layoutId: string): GalleryLayout | undefined {
  return GALLERY_LAYOUTS.find(l => l.id === layoutId);
}

function cssColorToObsInt(cssColor: string): number {
  const hex = cssColor.replace("#", "");
  let r = 0, g = 0, b = 0;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length >= 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }
  return (0xFF << 24 | b << 16 | g << 8 | r) >>> 0;
}

function getMvBg(mv: SavedMultiView): MVBackground {
  return mv.background ?? DEFAULT_MV_BG;
}

function isSceneType(ct: GallerySlot["contentType"]): boolean {
  return SCENE_TYPES.has(ct);
}

function SlotTypeIcon({ contentType }: { contentType: GallerySlot["contentType"] }) {
  const { t } = useTranslation();
  const info = CONTENT_TYPE_INFO[contentType] || CONTENT_TYPE_INFO.camera;
  return (
    <span className="dock-mv-slot-icon" style={{ color: info.color }} title={t(info.labelKey)}>
      <Icon name={info.icon} size={12} />
    </span>
  );
}

function LayoutMiniPreview({ layout, thumbnails, frameId, slotFrames, frameThickness, frameCornerRadius, frameOpacity, frameColor }: {
  layout: GalleryLayout;
  thumbnails?: Record<string, string>;
  frameId?: string | null;
  slotFrames?: Record<string, string>;
  frameThickness?: number;
  frameCornerRadius?: number;
  frameOpacity?: number;
  frameColor?: string;
}) {
  const scaleX = 100 / CANVAS_W;
  const scaleY = 100 / CANVAS_H;
  const hasThumbs = thumbnails && Object.keys(thumbnails).length > 0;

  // Resolve frames per slot for SVG overlay
  const slotFramesResolved = layout.slots.map(slot => {
    const sf = slotFrames?.[slot.id];
    const effId = sf === "none" ? null : sf ? (sf === "inherit" ? frameId : sf) : frameId;
    return { slot, frame: resolveFrame(effId) };
  }).filter((s): s is { slot: GallerySlot; frame: MultiviewFrame } => !!s.frame);

  return (
    <div className="dock-mv-layout-preview" style={{ position: "relative", width: "100%", aspectRatio: `${CANVAS_W}/${CANVAS_H}`, overflow: "hidden", background: "#111", borderRadius: 3 }}>
      {/* Thumbnail images overlaid */}
      {hasThumbs && layout.slots.map((slot) => {
        const thumb = thumbnails?.[slot.id];
        if (!thumb) return null;
        return (
          <img key={slot.id} src={thumb} alt=""
            style={{
              position: "absolute", left: `${slot.x * scaleX}%`, top: `${slot.y * scaleY}%`,
              width: `${slot.width * scaleX}%`, height: `${slot.height * scaleY}%`,
              objectFit: "cover", display: "block",
            }} />
        );
      })}
      {/* SVG overlay: unassigned slot outlines + frame layer borders */}
      <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* Frame layers for assigned slots */}
        {hasThumbs && slotFramesResolved.map(({ slot, frame }) => {
          const t = frameThickness ?? 2;
          const scale = t / 2;
          const alpha = (frameOpacity ?? 100) / 100;
          const rOverride = frameCornerRadius ?? 0;
          return (
            <g key={`frm-${slot.id}`}>
              {frame.layers.map((layer, li) => {
                const lw = Math.max(0.5, layer.thickness * scale);
                const inset = layer.inset;
                const r = rOverride > 0 ? rOverride : Math.max(0, layer.radius - inset);
                return (
                  <rect key={li}
                    x={slot.x + inset} y={slot.y + inset}
                    width={slot.width - inset * 2} height={slot.height - inset * 2}
                    fill="none" stroke={frameColor || layer.color} strokeWidth={lw}
                    rx={r} ry={r} opacity={alpha}
                  />
                );
              })}
            </g>
          );
        })}
        {/* Unassigned slots */}
        {layout.slots.map((slot) => {
          if (thumbnails?.[slot.id]) return null;
          const info = CONTENT_TYPE_INFO[slot.contentType] || CONTENT_TYPE_INFO.camera;
          return (
            <g key={slot.id}>
              <rect x={slot.x} y={slot.y} width={slot.width} height={slot.height} fill={info.color} opacity={0.3} />
              <rect x={slot.x} y={slot.y} width={slot.width} height={slot.height} fill="none" stroke={info.color} strokeWidth={2} opacity={0.6} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Picker Modal
// ---------------------------------------------------------------------------

function ContentPicker({
  open,
  obsScenes,
  obsSources,
  loading,
  onSelect,
  onClose,
  excludeScenes,
}: {
  open: boolean;
  obsScenes: string[];
  obsSources: string[];
  loading: boolean;
  onSelect: (value: string, mode: "scene" | "source") => void;
  onClose: () => void;
  excludeScenes?: string[];
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"scene" | "source">("scene");
  const [query, setQuery] = useState("");

  if (!open) return null;

  const exclude = new Set(excludeScenes ?? []);
  const scenes = obsScenes.filter(s => (!query || s.toLowerCase().includes(query.toLowerCase())) && !exclude.has(s));
  const sources = obsSources.filter(s => !query || s.toLowerCase().includes(query.toLowerCase()));
  const items = tab === "scene" ? scenes : sources;

  return (
    <div className="dock-mv-modal-overlay" onClick={onClose}>
      <div className="dock-mv-content-picker" onClick={(e) => e.stopPropagation()}>
        <div className="dock-mv-content-picker__header">
          <span className="dock-mv-content-picker__title">{t('multiview.chooseContent')}</span>
          <span className="dock-mv-content-picker__subtitle">{t('multiview.chooseContentDesc')}</span>
          <button type="button" className="dock-mv-content-picker__close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="dock-mv-content-picker__search">
          <Icon name="search" size={13} />
          <input
            className="dock-mv-content-picker__search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('multiview.searchContent')}
            autoFocus
          />
        </div>
        <div className="dock-mv-content-picker__tabs">
          <button
            type="button"
            className={`dock-mv-content-picker__tab${tab === "scene" ? " dock-mv-content-picker__tab--active" : ""}`}
            onClick={() => setTab("scene")}
          >
            {t('multiview.scenes')}
          </button>
          <button
            type="button"
            className={`dock-mv-content-picker__tab${tab === "source" ? " dock-mv-content-picker__tab--active" : ""}`}
            onClick={() => setTab("source")}
          >
            {t('multiview.sources')}
          </button>
        </div>
        <div className="dock-mv-content-picker__list" aria-busy={loading}>
          {loading ? (
            <div className="dock-mv-content-picker__loading" role="status" aria-live="polite">
              <Icon name="progress_activity" size={18} />
              <span>{t('common.loading')}</span>
            </div>
          ) : items.length === 0 ? (
            <div className="dock-mv-content-picker__empty">{t('multiview.noContentFound')}</div>
          ) : (
            items.map(item => (
              <button
                key={item}
                type="button"
                className="dock-mv-content-picker__item"
                onClick={() => onSelect(item, tab)}
              >
                <span className="dock-mv-content-picker__item-name">{item}</span>

              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Framing Editor — live OBS screenshot preview with crop/position controls
// ---------------------------------------------------------------------------
// Shared transform calculation — used by both the preview and OBS output
// ---------------------------------------------------------------------------
interface SlotRect { x: number; y: number; width: number; height: number }
interface FramingParams { mode: "fill" | "fit" | "custom"; focalX: number; focalY: number; zoom: number }

function calculateSlotTransform(
  sourceWidth: number,
  sourceHeight: number,
  slot: SlotRect,
  framing: FramingParams,
) {
  const fitScale = Math.min(slot.width / sourceWidth, slot.height / sourceHeight);
  const fillScale = Math.max(slot.width / sourceWidth, slot.height / sourceHeight);

  if (framing.mode === "fit") {
    const scale = fitScale;
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    return {
      scale,
      renderedWidth,
      renderedHeight,
      positionX: slot.x + (slot.width - renderedWidth) / 2,
      positionY: slot.y + (slot.height - renderedHeight) / 2,
    };
  }

  const scale = fillScale * Math.max(1, framing.zoom);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const visibleSourceWidth = slot.width / scale;
  const visibleSourceHeight = slot.height / scale;
  const hCrop = Math.max(0, sourceWidth - visibleSourceWidth);
  const vCrop = Math.max(0, sourceHeight - visibleSourceHeight);

  return {
    scale,
    renderedWidth,
    renderedHeight,
    positionX: slot.x - hCrop * framing.focalX,
    positionY: slot.y - vCrop * framing.focalY,
    cropLeft: hCrop * framing.focalX,
    cropRight: hCrop - hCrop * framing.focalX,
    cropTop: vCrop * framing.focalY,
    cropBottom: vCrop - vCrop * framing.focalY,
  };
}

function FramingEditor({
  open,
  initialFraming,
  slotWidth,
  slotHeight,
  selectedContentName,
  selectedContentMode,
  onSave,
  onClose,
}: {
  open: boolean;
  initialFraming: { displayMode: "fill" | "fit" | "custom"; zoom: number; focalX: number; focalY: number };
  slotWidth: number;
  slotHeight: number;
  selectedContentName: string;
  selectedContentMode: "scene" | "source";
  onSave: (f: { displayMode: "fill" | "fit" | "custom"; zoom: number; focalX: number; focalY: number }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initialFraming);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startFocalX: number; startFocalY: number } | null>(null);
  const mountedRef = useRef(true);
  const captureGenRef = useRef(0);

  const isCustom = draft.displayMode === "custom";

  // ── Capture screenshot when modal opens ──
  const captureScreenshot = useCallback(async () => {
    if (!selectedContentName) return;
    setLoading(true);
    setError(null);
    const gen = ++captureGenRef.current;
    try {
      const resp = await dockObsClient.call("GetSourceScreenshot", {
        sourceName: selectedContentName,
        imageFormat: "png",
        imageWidth: 960,
      }) as { imageData: string };
      if (!mountedRef.current || gen !== captureGenRef.current) return;
      const data = resp.imageData;
      setScreenshot(data.startsWith("data:") ? data : `data:image/png;base64,${data}`);
    } catch (err) {
      if (!mountedRef.current || gen !== captureGenRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[FramingEditor] GetSourceScreenshot FAILED", { sourceName: selectedContentName, mode: selectedContentMode, error: msg });
      setError(msg);
    } finally {
      if (mountedRef.current && gen === captureGenRef.current) {
        setLoading(false);
      }
    }
  }, [selectedContentName, selectedContentMode]);

  useEffect(() => {
    if (open) {
      setDraft(initialFraming);
      setScreenshot(null);
      setError(null);
      mountedRef.current = true;
      captureScreenshot();
    }
    return () => { mountedRef.current = false; };
  }, [open]);

  // ── Preview image transform using the shared calculation ──
  const imageStyle = useMemo((): React.CSSProperties => {
    const tx = calculateSlotTransform(
      CANVAS_W, CANVAS_H,
      { x: 0, y: 0, width: slotWidth, height: slotHeight },
      { mode: draft.displayMode, focalX: draft.focalX, focalY: draft.focalY, zoom: draft.zoom },
    );

    const pctW = (tx.renderedWidth / slotWidth) * 100;
    const pctH = (tx.renderedHeight / slotHeight) * 100;
    const pctL = (tx.positionX / slotWidth) * 100;
    const pctT = (tx.positionY / slotHeight) * 100;

    return {
      position: "absolute",
      left: `${pctL}%`,
      top: `${pctT}%`,
      width: `${pctW}%`,
      height: `${pctH}%`,
      maxWidth: "none",
      objectFit: "none",
    };
  }, [draft, slotWidth, slotHeight]);

  // ── Pointer handlers for Custom mode drag ──
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isCustom) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startFocalX: draft.focalX,
      startFocalY: draft.focalY,
    };
    setDragging(true);
  }, [isCustom, draft.focalX, draft.focalY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !isCustom) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const sensitivity = 0.003;
    setDraft(prev => ({
      ...prev,
      focalX: Math.max(0, Math.min(1, dragRef.current!.startFocalX + dx * sensitivity)),
      focalY: Math.max(0, Math.min(1, dragRef.current!.startFocalY + dy * sensitivity)),
    }));
  }, [isCustom]);

  const handlePointerUp = useCallback((_e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isCustom) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setDraft(prev => ({ ...prev, zoom: Math.max(0.5, Math.min(5, prev.zoom + delta)) }));
  }, [isCustom]);

  // ── Compute slot aspect ratio label ──
  const aspectLabel = useMemo(() => {
    const g = gcd(slotWidth, slotHeight);
    return `${slotWidth / g}:${slotHeight / g}`;
  }, [slotWidth, slotHeight]);

  const slotAspectDisplay = `${slotWidth} × ${slotHeight} (${aspectLabel})`;

  if (!open) return null;

  return (
    <div className="dock-mv-modal-overlay" onClick={onClose}>
      <div className="dock-mv-framing-editor" onClick={(e) => e.stopPropagation()}>
        <div className="dock-mv-framing-editor__header">
          <span className="dock-mv-framing-editor__title">{t('multiview.adjustFraming')}</span>
          <div className="dock-mv-framing-editor__header-actions">
            <button
              type="button"
              className="dock-mv-framing-editor__refresh"
              onClick={captureScreenshot}
              disabled={loading}
              title={t('multiview.refreshPreview')}
            >
              <Icon name="refresh" size={13} />
            </button>
            <button type="button" className="dock-mv-framing-editor__close" onClick={onClose}>
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        <div className="dock-mv-framing-editor__body">
          {/* Visual Preview */}
          <div
            className={[
              "dock-mv-framing-editor__preview",
              isCustom ? "dock-mv-framing-editor__preview--draggable" : "",
              dragging ? "dock-mv-framing-editor__preview--dragging" : "",
              draft.displayMode === "fit" ? "dock-mv-framing-editor__preview--fit" : "",
            ].filter(Boolean).join(" ")}
            style={{ aspectRatio: `${slotWidth}/${slotHeight}` }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          >
            {loading && (
              <div className="dock-mv-framing-editor__preview-status">
                <Icon name="hourglass_top" size={16} />
                <span>{t('multiview.capturingPreview')}</span>
              </div>
            )}

            {!loading && error && (
              <div className="dock-mv-framing-editor__preview-status dock-mv-framing-editor__preview-status--error">
                <span>{t('multiview.captureFailed')}</span>
                <button
                  type="button"
                  className="dock-btn dock-btn--xs"
                  onClick={captureScreenshot}
                >
                  {t('multiview.tryAgain')}
                </button>
              </div>
            )}

            {!loading && !error && screenshot && (
              <img
                className="dock-mv-framing-editor__preview-img"
                src={screenshot}
                alt={`Preview of ${selectedContentName}`}
                style={imageStyle}
                draggable={false}
              />
            )}

            {!loading && !error && !screenshot && (
              <div className="dock-mv-framing-editor__preview-placeholder">
                <Icon name="live_tv" size={24} />
              </div>
            )}

            {/* Slot border overlay */}
            <div className="dock-mv-framing-editor__preview-border" />
          </div>

          {/* Display Mode selector */}
          <div className="dock-mv-framing-editor__modes">
            {(["fill", "fit", "custom"] as const).map(mode => (
              <button
                key={mode}
                type="button"
                className={`dock-mv-framing-editor__mode${draft.displayMode === mode ? " dock-mv-framing-editor__mode--active" : ""}`}
                onClick={() => setDraft(prev => ({ ...prev, displayMode: mode }))}
              >
                {t(`multiview.framingMode_${mode}`)}
              </button>
            ))}
          </div>

          {/* Custom controls */}
          {isCustom && (
            <div className="dock-mv-framing-editor__custom-controls">
              <label className="dock-mv-framing-editor__control">
                <span className="dock-mv-framing-editor__control-label">{t('multiview.zoom')}</span>
                <div className="dock-mv-framing-editor__control-row">
                  <input
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.05"
                    value={draft.zoom}
                    onChange={(e) => setDraft(prev => ({ ...prev, zoom: parseFloat(e.target.value) }))}
                    className="dock-mv-framing-editor__slider"
                  />
                  <span className="dock-mv-framing-editor__control-value">{draft.zoom.toFixed(2)}x</span>
                </div>
              </label>

              <p className="dock-mv-framing-editor__drag-hint">{t('multiview.dragHint')}</p>

              <button
                type="button"
                className="dock-btn dock-btn--sm"
                onClick={() => setDraft(prev => ({ ...prev, focalX: 0.5, focalY: 0.5, zoom: 1 }))}
              >
                {t('multiview.resetCenter')}
              </button>
            </div>
          )}

          {/* Dimension info */}
          <div className="dock-mv-framing-editor__info">
            <span>{t('multiview.source')}: <strong>{selectedContentName}</strong></span>
            <span className="dock-mv-framing-editor__info-sep">•</span>
            <span>{t('multiview.slot')}: {slotAspectDisplay}</span>
          </div>
        </div>

        <div className="dock-mv-framing-editor__actions">
          <button type="button" className="dock-btn dock-btn--sm" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="dock-btn dock-btn--sm dock-btn--primary"
            onClick={() => { onSave(draft); onClose(); }}
          >
            {t('multiview.saveFraming')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Greatest common divisor (for aspect ratio display) ──
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

// ---------------------------------------------------------------------------
// SlotControl — redesigned card-style slot assignment
// ---------------------------------------------------------------------------

function SlotControl({
  slot,
  slotIndex,
  value,
  mode,
  framing,
  onSelect,
  onChange,
  onFramingChange,
  onRemove,
  obsScenes,
  obsSources,
}: {
  slot: GallerySlot;
  slotIndex: number;
  value: string;
  mode: "scene" | "source";
  framing: { displayMode: "fill" | "fit" | "custom"; zoom: number; focalX: number; focalY: number };
  onSelect: () => void;
  onChange: (val: string, m: "scene" | "source") => void;
  onFramingChange: (f: { displayMode: "fill" | "fit" | "custom"; zoom: number; focalX: number; focalY: number }) => void;
  onRemove: () => void;
  obsScenes: string[];
  obsSources: string[];
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasValue = !!value && (mode === "scene" ? obsScenes.includes(value) : obsSources.includes(value));

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  if (isSceneType(slot.contentType)) {
    return (
      <div className="dock-mv-slot-row">
        <div className="dock-mv-slot-row__main">
          <SlotTypeIcon contentType={slot.contentType} />
          <span className="dock-mv-slot-row__name">{t('multiview.contentN', { n: slotIndex + 1 })}</span>
          <div className="dock-mv-slot-row__spacer" />
          {!hasValue && (
            <button type="button" className="dock-mv-slot-row__add-btn" onClick={onSelect} title={t('multiview.addContent')}>
              <Icon name="add" size={14} />
            </button>
          )}
          {hasValue && (
            <>
              <span className="dock-mv-slot-row__selected-name">{value}</span>
              <button
                type="button"
                className="dock-mv-slot-row__framing-btn"
                onClick={() => onFramingChange(framing)}
                title={t('multiview.adjustFraming')}
                aria-label={t('multiview.adjustFraming')}
              >
                <Icon name="crop" size={14} />
              </button>
              <div className="dock-mv-slot-row__menu-wrap" ref={menuRef}>
                <button
                  type="button"
                  className="dock-mv-slot-row__menu-btn"
                  onClick={() => setMenuOpen(o => !o)}
                  title={t('common.more')}
                >
                  <Icon name="more_vert" size={14} />
                </button>
                {menuOpen && (
                  <div className="dock-mv-slot-row__dropdown">
                    <button type="button" className="dock-mv-slot-row__dropdown-item" onClick={() => { setMenuOpen(false); onSelect(); }}>
                      {t('multiview.changeContent')}
                    </button>
                    <div className="dock-mv-slot-row__dropdown-divider" />
                    <button
                      type="button"
                      className="dock-mv-slot-row__dropdown-item dock-mv-slot-row__dropdown-item--danger"
                      onClick={() => { setMenuOpen(false); onRemove(); }}
                    >
                      {t('multiview.removeContent')}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Browser / image / fallback slots keep inline input
  if (slot.contentType === "browser" || slot.contentType === "image") {
    const isUrl = slot.contentType === "browser";
    return (
      <div className="dock-mv-slot-row">
        <div className="dock-mv-slot-row__main">
          <SlotTypeIcon contentType={slot.contentType} />
          <span className="dock-mv-slot-row__name">{t('multiview.contentN', { n: slotIndex + 1 })}</span>
          <div className="dock-mv-slot-row__spacer" />
          <input
            className="dock-mv-slot-row__input"
            type={isUrl ? "url" : "text"}
            value={value}
            onChange={(e) => onChange(e.target.value, "scene")}
            placeholder={isUrl ? t('multiview.urlPlaceholder') : t('multiview.imagePathPlaceholder')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="dock-mv-slot-row">
      <div className="dock-mv-slot-row__main">
        <SlotTypeIcon contentType={slot.contentType} />
        <span className="dock-mv-slot-row__name">{t('multiview.contentN', { n: slotIndex + 1 })}</span>
        <div className="dock-mv-slot-row__spacer" />
        <input
          className="dock-mv-slot-row__input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value, "scene")}
          placeholder={t('multiview.value')}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation Modal
// ---------------------------------------------------------------------------

function DeleteModal({
  mvName,
  onConfirm,
  onCancel,
}: {
  mvName: string;
  onConfirm: (deleteObsScene: boolean) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [deleteObs, setDeleteObs] = useState(false);

  return (
    <div className="dock-mv-modal-overlay" onClick={onCancel}>
      <div className="dock-mv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dock-mv-modal__header">
          <Icon name="warning" size={16} />
          <span className="dock-mv-modal__title">{t('multiview.deleteLayout')}</span>
        </div>
        <p className="dock-mv-modal__body">
          {t('multiview.areYouSure')} <strong>{mvName}</strong>?
          <br />
          <span style={{ color: "var(--dock-text-dim)", fontSize: 10 }}>{t('multiview.deleteConfirm')}</span>
        </p>
        <label className="dock-mv-modal__checkbox">
          <input
            type="checkbox"
            checked={deleteObs}
            onChange={(e) => setDeleteObs(e.target.checked)}
          />
          <span>{t('multiview.alsoDeleteScene')}</span>
        </label>
        <div className="dock-mv-modal__actions">
          <button type="button" className="dock-btn dock-btn--sm" onClick={onCancel} title={t('common.cancel')}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="dock-btn dock-btn--sm dock-btn--danger"
            onClick={() => onConfirm(deleteObs)}
            title={t('common.delete')}>
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Background Section — collapsed card + modal editor
// ---------------------------------------------------------------------------

const BG_TYPE_OPTIONS: Array<{ type: MVBgType | "none"; labelKey: string; icon: string }> = [
  { type: "none", labelKey: "multiview.bgNone", icon: "block" },
  { type: "color", labelKey: "multiview.bgColor", icon: "palette" },
  { type: "image", labelKey: "multiview.bgImage", icon: "image" },
  { type: "video", labelKey: "multiview.bgVideo", icon: "movie" },
  { type: "scene", labelKey: "multiview.bgScene", icon: "grid_view" },
];

function BackgroundSection({
  background,
  onChange,
  obsScenes,
}: {
  background: MVBackground;
  onChange: (bg: MVBackground) => void;
  obsScenes: string[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [draggingType, setDraggingType] = useState<string | null>(null);

  const hasBg = background.type !== "color" || (background.color !== "#0F172A" && background.color !== "transparent") || background.filePath || background.sceneName;

  const handleFileUpload = useCallback(async (file: File, type: "image" | "video") => {
    setUploading(true);
    try {
      const safeName = getSafeFileName(`mv-bg-${Date.now()}-${file.name}`);
      const diskPath = await saveToDisk(file, safeName);
      onChange({ ...background, type, filePath: diskPath });
    } catch (err) {
      onChange({ ...background, type, filePath: file.name });
    } finally {
      setUploading(false);
    }
  }, [background, onChange]);

  const handlePickerChange = useCallback((event: ChangeEvent<HTMLInputElement>, type: "image" | "video") => {
    const file = event.target.files?.[0];
    if (file) void handleFileUpload(file, type);
    event.target.value = "";
  }, [handleFileUpload]);

  const matchesBackgroundMediaType = (file: File, type: "image" | "video"): boolean => {
    if (type === "image") return file.type.startsWith("image/");
    return file.type.startsWith("video/");
  };

  const handleMediaDrop = useCallback((event: DragEvent<HTMLLabelElement>, type: "image" | "video") => {
    event.preventDefault();
    setDraggingType(null);
    if (uploading) return;
    const file = event.dataTransfer.files?.[0];
    if (!file || !matchesBackgroundMediaType(file, type)) return;
    void handleFileUpload(file, type);
  }, [handleFileUpload, uploading]);

  const bgLabel = background.type === "color" ? t('multiview.bgColor')
    : background.type === "image" ? t('multiview.bgImage')
      : background.type === "video" ? t('multiview.bgVideo')
        : background.type === "scene" ? t('multiview.bgScene')
          : "";

  const bgValue = background.type === "color" ? background.color
    : background.type === "scene" ? background.sceneName
      : background.filePath ? getBackgroundMediaLabel(background.filePath)
        : "";

  const isMediaType = background.type === "image" || background.type === "video";
  const mediaType = background.type === "video" ? "video" : "image";
  const selectedMediaName = background.filePath ? getBackgroundMediaLabel(background.filePath) : "";
  const hasSelectedMedia = selectedMediaName.length > 0;
  const mediaTitle = mediaType === "image" ? "Choose background image" : "Choose background video";
  const mediaHint = mediaType === "image"
    ? "Drop an image here or click to browse. PNG, JPG, WEBP, SVG."
    : "Drop a video here or click to browse. MP4, MOV, WEBM, M4V.";

  return (
    <div className="dock-mv-property">
      <span className="dock-mv-property__label">{t('multiview.background')}</span>
      <div className="dock-mv-property__row">
        {hasBg ? (
          <span className="dock-mv-property__value">{bgLabel}: {bgValue}</span>
        ) : (
          <span className="dock-mv-property__value dock-mv-property__value--empty">{t('multiview.noBackground')}</span>
        )}
        <button type="button" className="dock-mv-property__action" onClick={() => setOpen(true)}>
          {hasBg ? t('multiview.change') : `+ ${t('multiview.addBackground')}`}
        </button>
      </div>

      {/* Modal editor (same as before) */}
      {open && (
        <div className="dock-mv-modal-overlay" onClick={() => setOpen(false)}>
          <div className="dock-mv-bg-editor" onClick={(e) => e.stopPropagation()}>
            <div className="dock-mv-bg-editor__header">
              <span className="dock-mv-bg-editor__title">{t('multiview.chooseBackground')}</span>
              <button type="button" className="dock-mv-bg-editor__close" onClick={() => setOpen(false)}>
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="dock-mv-bg-editor__types">
              {BG_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.type}
                  type="button"
                  className={`dock-mv-bg-editor__type-btn${background.type === opt.type ? " dock-mv-bg-editor__type-btn--active" : ""}`}
                  onClick={() => {
                    if (opt.type === "none") {
                      onChange({ type: "color", color: "transparent", filePath: "", sceneName: "" });
                    } else {
                      onChange({ ...background, type: opt.type });
                    }
                  }}
                >
                  <Icon name={opt.icon} size={14} />
                  <span>{t(opt.labelKey)}</span>
                </button>
              ))}
            </div>

            {background.type === "color" && (
              <div className="dock-mv-bg-editor__row">
                <input
                  type="color"
                  className="dock-mv-bg__color-input"
                  value={background.color}
                  onChange={(e) => onChange({ ...background, color: e.target.value })}
                />
                <input
                  className="dock-mv-bg__hex"
                  type="text"
                  value={background.color}
                  onChange={(e) => onChange({ ...background, color: e.target.value })}
                  placeholder="#0F172A"
                />
              </div>
            )}

            {isMediaType && (
              <div className="dock-mv-bg-editor__media">
                <label
                  className={[
                    "dock-mv-bg-editor__media-card",
                    draggingType === mediaType ? "dock-mv-bg-editor__media-card--dragging" : "",
                    hasSelectedMedia ? "dock-mv-bg-editor__media-card--selected" : "",
                    uploading ? "dock-mv-bg-editor__media-card--busy" : "",
                  ].filter(Boolean).join(" ")}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    if (!uploading) setDraggingType(mediaType);
                  }}
                  onDragLeave={() => setDraggingType((current) => current === mediaType ? null : current)}
                  onDrop={(event) => void handleMediaDrop(event, mediaType)}
                  aria-busy={uploading}
                >
                  <div className="dock-mv-bg-editor__media-icon">
                    <Icon name={uploading ? "hourglass_top" : mediaType === "image" ? "image" : "movie"} size={18} />
                  </div>
                  <div className="dock-mv-bg-editor__media-copy">
                    <div className="dock-mv-bg-editor__media-title">
                      {uploading ? "Saving media..." : hasSelectedMedia ? `${t('multiview.bgImageSelected')}: ${selectedMediaName}` : mediaTitle}
                    </div>
                    <div className="dock-mv-bg-editor__media-hint">{hasSelectedMedia ? "" : mediaHint}</div>
                  </div>
                  <span className="dock-mv-bg-editor__media-cta">
                    {uploading ? "Saving..." : hasSelectedMedia ? t('multiview.browseAndUpload') : t('common.upload')}
                  </span>
                  <input
                    ref={mediaType === "image" ? imgInputRef : vidInputRef}
                    type="file"
                    accept={mediaType === "image" ? "image/*" : "video/*"}
                    className="dock-mv-bg__file-hidden"
                    onChange={(event) => handlePickerChange(event, mediaType)}
                  />
                </label>
                {hasSelectedMedia && (
                  <button
                    type="button"
                    className="dock-mv-bg-editor__clear"
                    onClick={() => onChange({ ...background, filePath: "" })}
                  >
                    {t('common.clear')}
                  </button>
                )}
              </div>
            )}

            {background.type === "scene" && (
              <div className="dock-mv-bg-editor__row">
                <select
                  className="dock-mv-bg__select"
                  value={background.sceneName}
                  onChange={(e) => onChange({ ...background, sceneName: e.target.value })}
                >
                  <option value="">— {t('multiview.selectScene')} —</option>
                  {obsScenes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            <div className="dock-mv-bg-editor__actions">
              <button type="button" className="dock-btn dock-btn--sm dock-btn--primary" onClick={() => setOpen(false)}>
                {t('common.done')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frame Picker Modal
// ---------------------------------------------------------------------------

function FramePreviewThumb({ frame }: { frame: MultiviewFrame }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 90, 60);
    drawFrameLayers(ctx, frame, 0, 0, 90, 60, 0.7, 0, 100, "");
  }, [frame]);

  return <canvas ref={ref} width={90} height={60} style={{ width: 68, height: 45, borderRadius: 2 }} />;
}

function FramePicker({
  open,
  selectedId,
  onSelect,
  onClose,
}: {
  open: boolean;
  selectedId: string | null;
  onSelect: (frameId: string | null) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState<"all" | "clean" | "broadcast" | "glow" | "decorative">("all");
  if (!open) return null;

  const filtered = cat === "all" ? FRAME_LIBRARY : FRAME_LIBRARY.filter(f => f.category === cat);

  return (
    <div className="dock-mv-modal-overlay" onClick={onClose}>
      <div className="dock-mv-content-picker" onClick={(e) => e.stopPropagation()}>
        <div className="dock-mv-content-picker__header">
          <span className="dock-mv-content-picker__title">Choose Frame</span>
          <button type="button" className="dock-mv-content-picker__close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="dock-mv-content-picker__tabs" style={{ paddingBottom: 4 }}>
          {FRAME_CATEGORIES.map(c => (
            <button
              key={c.key}
              type="button"
              className={`dock-mv-content-picker__tab${cat === c.key ? " dock-mv-content-picker__tab--active" : ""}`}
              onClick={() => setCat(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="dock-mv-content-picker__list" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, padding: 8 }}>
          {filtered.map(frame => {
            const isSelected = selectedId === frame.id;
            return (
            <button
              key={frame.id}
              type="button"
              onClick={() => onSelect(frame.id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                padding: 10, borderRadius: 4, border: isSelected ? "1px solid var(--dock-accent)" : "1px solid var(--dock-border)",
                background: isSelected ? "var(--dock-accent-bg, rgba(99,102,241,0.1))" : "transparent",
                cursor: "pointer",
              }}
            >
              <FramePreviewThumb frame={frame} />
              <span style={{ fontSize: 10, color: "var(--dock-text-dim)", textAlign: "center" }}>{frame.name}</span>
            </button>
            );
          })}
        </div>
        <div style={{ padding: 8, borderTop: "1px solid var(--dock-border)" }}>
          <button
            type="button"
            className="dock-btn dock-btn--sm"
            style={{ width: "100%" }}
            onClick={() => onSelect(null)}
          >
            No Frame
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MV Card — one independent card per saved Multi-View
// ---------------------------------------------------------------------------

function MVCard({
  mv,
  index,
  isActive,
  obsScenes,
  obsSources,
  obsContentLoading,
  addedLayouts,
  pushingId,
  clearingId,
  onPush,
  onClear,
  onUpdateLayout,
  onUpdateBackground,
  onAssign,
  onAssignSlotMode,
  onAssignSlotFraming,
  onClearSlot,
  onUpdateFrame,
  onUpdateFrameThickness,
  onUpdateFrameCornerRadius,
  onUpdateFrameOpacity,
  onUpdateFrameColor,
  onUpdateSlotFrame: _onUpdateSlotFrame,
}: {
  mv: SavedMultiView;
  index: number;
  isActive: boolean;
  obsScenes: string[];
  obsSources: string[];
  obsContentLoading: boolean;
  addedLayouts: GalleryLayout[];
  pushingId: string | null;
  clearingId: string | null;
  onPush: (mv: SavedMultiView) => void;
  onClear: (mv: SavedMultiView) => void;
  onUpdateName: (id: string, name: string) => void;
  onUpdateLayout: (id: string, layoutId: string) => void;
  onUpdateBackground: (id: string, bg: MVBackground) => void;
  onAssign: (id: string, slotId: string, val: string) => void;
  onAssignSlotMode: (id: string, slotId: string, mode: "scene" | "source") => void;
  onAssignSlotFraming: (id: string, slotId: string, framing: { displayMode: "fill" | "fit" | "custom"; zoom: number; focalX: number; focalY: number }) => void;
  onClearSlot: (id: string, slotId: string) => void;
  onUpdateFrame: (id: string, frameId: string | null) => void;
  onUpdateFrameThickness: (id: string, thickness: number) => void;
  onUpdateFrameCornerRadius: (id: string, radius: number) => void;
  onUpdateFrameOpacity: (id: string, opacity: number) => void;
  onUpdateFrameColor: (id: string, color: string) => void;
  onUpdateSlotFrame: (id: string, slotId: string, frameMode: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);
  const [framingSlot, setFramingSlot] = useState<string | null>(null);
  const [showFramePicker, setShowFramePicker] = useState(false);
  const [showFrameSettings, setShowFrameSettings] = useState(false);
  const frameSettingsRef = useRef<HTMLDivElement>(null);
  const layout = resolveLayout(mv.layoutId);
  const assignedCount = Object.values(mv.assignments).filter(Boolean).length;
  const allSlotsFilled = !!layout && assignedCount >= layout.slots.length;
  const isPushing = pushingId === mv.id;
  const isClearing = clearingId === mv.id;

  // Close frame settings on outside click
  useEffect(() => {
    if (!showFrameSettings) return;
    const handler = (e: MouseEvent) => {
      if (frameSettingsRef.current && !frameSettingsRef.current.contains(e.target as Node)) {
        setShowFrameSettings(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFrameSettings]);

  const handleContentSelect = (slotId: string, value: string, mode: "scene" | "source") => {
    onAssignSlotMode(mv.id, slotId, mode);
    onAssign(mv.id, slotId, value);
    setPickerSlot(null);
  };

  const handleFramingChange = (slotId: string, framing: { displayMode: "fill" | "fit" | "custom"; zoom: number; focalX: number; focalY: number }) => {
    onAssignSlotFraming(mv.id, slotId, framing);
    setFramingSlot(null);
  };

  return (
    <div className="dock-mv-card">
      {/* Card Header */}
      <div className="dock-mv-card__header">
        <div className="dock-mv-card__title-group">
          <span className="dock-mv-card__name">
            {mv.name}
            {isActive && <span className="dock-mv-card__badge">{t('multiview.on')}</span>}
          </span>
          <span className="dock-mv-card__id">{shortId(index)}</span>
        </div>
      </div>

      {/* Template — always-visible select */}
      <div className="dock-mv-property">
        <span className="dock-mv-property__label">{t('multiview.template')}</span>
        <select
          className="dock-mv-property__select dock-mv-property__select--visible"
          value={mv.layoutId}
          onChange={(e) => onUpdateLayout(mv.id, e.target.value)}
        >
          <option value="">— {t('multiview.selectTemplate')} —</option>
          {addedLayouts.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
          {!addedLayouts.some(l => l.id === mv.layoutId) && layout && (
            <option key={layout.id} value={layout.id}>{layout.name}</option>
          )}
        </select>
      </div>

      {/* Layout Preview — shown below template */}
      {layout && <LayoutMiniPreview layout={layout} thumbnails={mv.slotThumbnails} frameId={mv.layoutFrameId} slotFrames={mv.slotFrames} frameThickness={mv.frameThickness} frameCornerRadius={mv.frameCornerRadius} frameOpacity={mv.frameOpacity} frameColor={mv.frameColor} />}

      {/* Frames — compact property row */}
      <div className="dock-mv-property">
        <span className="dock-mv-property__label">{t('multiview.frame')}</span>
        <div className="dock-mv-property__row">
          {mv.layoutFrameId ? (
            <span className="dock-mv-property__value">{resolveFrame(mv.layoutFrameId)?.name ?? "Unknown"}</span>
          ) : (
            <span className="dock-mv-property__value dock-mv-property__value--empty">No frame selected</span>
          )}
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" className="dock-mv-property__action" onClick={() => setShowFramePicker(true)}>
              {mv.layoutFrameId ? "Change" : "+ Add Frame"}
            </button>
            <div ref={frameSettingsRef} style={{ position: "relative" }}>
              <button
                type="button"
                className="dock-mv-property__action"
                disabled={!mv.layoutFrameId}
                onClick={() => setShowFrameSettings(s => !s)}
                title="Frame settings"
                style={{ opacity: mv.layoutFrameId ? 1 : 0.4 }}
              >
                <Icon name="tune" size={12} />
              </button>
              {showFrameSettings && mv.layoutFrameId && (
                <div style={{
                  position: "absolute", right: 0, top: "100%", marginTop: 4,
                  background: "var(--dock-surface, #1E293B)", border: "1px solid var(--dock-border, #334155)",
                  borderRadius: 4, padding: 10, zIndex: 50, minWidth: 180,
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 52 }}>Thickness</span>
                    <input type="range" min={1} max={16} step={1} value={mv.frameThickness ?? 2}
                      onChange={(e) => onUpdateFrameThickness(mv.id, parseInt(e.target.value))}
                      style={{ flex: 1, height: 3, accentColor: "var(--dock-accent)" }} />
                    <span style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 22 }}>{mv.frameThickness ?? 2}px</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 52 }}>Radius</span>
                    <input type="range" min={0} max={40} step={2} value={mv.frameCornerRadius ?? 0}
                      onChange={(e) => onUpdateFrameCornerRadius(mv.id, parseInt(e.target.value))}
                      style={{ flex: 1, height: 3, accentColor: "var(--dock-accent)" }} />
                    <span style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 22 }}>{mv.frameCornerRadius ?? 0}px</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 52 }}>Opacity</span>
                    <input type="range" min={10} max={100} step={5} value={mv.frameOpacity ?? 100}
                      onChange={(e) => onUpdateFrameOpacity(mv.id, parseInt(e.target.value))}
                      style={{ flex: 1, height: 3, accentColor: "var(--dock-accent)" }} />
                    <span style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 22 }}>{mv.frameOpacity ?? 100}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "var(--dock-text-dim)", minWidth: 52 }}>Color</span>
                    <input type="color" value={mv.frameColor || "#D4A853"}
                      onChange={(e) => onUpdateFrameColor(mv.id, e.target.value)}
                      style={{ width: 28, height: 20, border: "none", borderRadius: 3, cursor: "pointer", padding: 0, background: "transparent" }} />
                    <button type="button" style={{ fontSize: 9, color: "var(--dock-text-dim)", border: "none", background: "transparent", cursor: "pointer" }}
                      onClick={() => onUpdateFrameColor(mv.id, "")}>Reset</button>
                  </div>
                  <div style={{ borderTop: "1px solid var(--dock-border)", paddingTop: 6 }}>
                    <button type="button" className="dock-btn dock-btn--sm dock-btn--danger" style={{ width: "100%", fontSize: 10 }}
                      onClick={() => { onUpdateFrame(mv.id, null); setShowFrameSettings(false); }}>
                      Remove Frame
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <FramePicker
          open={showFramePicker}
          selectedId={mv.layoutFrameId}
          onSelect={(frameId) => { onUpdateFrame(mv.id, frameId); setShowFramePicker(false); }}
          onClose={() => setShowFramePicker(false)}
        />
      </div>

      {/* Background — compact property row */}
      <BackgroundSection
        background={getMvBg(mv)}
        onChange={(bg) => onUpdateBackground(mv.id, bg)}
        obsScenes={obsScenes}
      />

      {layout && (<><div className="dock-mv-assign-section">
        <div className="dock-mv-assign-header">
          <Icon name="videocam" size={13} />
          <span>{t('multiview.sceneAssignments')}</span>
          <span className="dock-mv-assign-count">
            {assignedCount}/{layout.slots.length}
          </span>
        </div>
        {layout.slots.map((slot, slotIdx) => {
          const val = mv.assignments[slot.id] ?? "";
          const mode = mv.slotModes?.[slot.id] ?? "scene";
          const framing = mv.slotFraming?.[slot.id] ?? { displayMode: "fill", zoom: 1, focalX: 0.5, focalY: 0.5 };
          return (
            <div key={slot.id}>
              <SlotControl
                slot={slot}
                slotIndex={slotIdx}
                value={val}
                mode={mode}
                framing={framing}
                onSelect={() => setPickerSlot(slot.id)}
                onChange={(v, m) => handleContentSelect(slot.id, v, m)}
                onFramingChange={(_f) => setFramingSlot(slot.id)}
                onRemove={() => onClearSlot(mv.id, slot.id)}
                obsScenes={obsScenes}
                obsSources={obsSources}
              />
              {/* Content Picker for this slot */}
              {pickerSlot === slot.id && (
                <ContentPicker
                  open
                  obsScenes={obsScenes}
                  obsSources={obsSources}
                  loading={obsContentLoading}
                  onSelect={(v, m) => handleContentSelect(slot.id, v, m)}
                  onClose={() => setPickerSlot(null)}
                  excludeScenes={[mv.obsSceneName]}
                />
              )}
              {/* Framing Editor for this slot */}
              {framingSlot === slot.id && (
                <FramingEditor
                  open
                  initialFraming={framing}
                  slotWidth={slot.width}
                  slotHeight={slot.height}
                  selectedContentName={val}
                  selectedContentMode={mode}
                  onSave={(f) => handleFramingChange(slot.id, f)}
                  onClose={() => setFramingSlot(null)}
                />
              )}
            </div>
          );
        })}
      </div>
      </>
      )}

      {/* Push to OBS — per card */}
      <div className="dock-mv-card__actions">
        <button
          type="button"
          className={`dock-btn dock-btn--sm ${isPushing ? "dock-btn--loading" : "dock-btn--primary"}`}
          onClick={() => onPush(mv)}
          disabled={isPushing || isClearing || !allSlotsFilled}
          style={{ flex: 1 }}
          title={t('multiview.pushing')}>
          <Icon name="cast" size={14} />
          <span>{isPushing ? t('multiview.pushing') : t('multiview.applyToObs')}</span>
        </button>
        {isActive && (
          <button
            type="button"
            className={`dock-btn dock-btn--sm ${isClearing ? "dock-btn--loading" : ""}`}
            onClick={() => onClear(mv)}
            disabled={isClearing || isPushing}
            style={{
              background: "transparent",
              border: "1px solid var(--dock-border)",
              color: "var(--dock-text-dim)",
            }}
            title={t('multiview.clearing')}>
            <Icon name="visibility_off" size={14} />
            <span>{isClearing ? t('multiview.clearing') : t('common.clear')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DockMultiviewTab() {
  const { t } = useTranslation();
  const [savedList, setSavedList] = useState<SavedMultiView[]>([]);
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [obsSources, setObsSources] = useState<string[]>([]);
  const [obsContentLoading, setObsContentLoading] = useState(false);
  const [obsContentLoaded, setObsContentLoaded] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const obsScanBusyRef = useRef(false);

async function loadAddedLayoutIdsFromServer(): Promise<Set<string>> {
  try {
    const resp = await fetch("/uploads/mv-added-ids.json");
    if (!resp.ok) return new Set();
    const data = await resp.json();
    return Array.isArray(data) ? new Set(data) : new Set();
  } catch {
    return new Set();
  }
}

  // Show layouts that are added via gallery OR in use by saved cards
  const [addedLayoutIds, setAddedLayoutIds] = useState<Set<string>>(() => loadAddedLayoutIds());

  useEffect(() => {
    // Initial load from server (overrides localStorage)
    loadAddedLayoutIdsFromServer().then((ids) => {
      if (ids.size > 0) setAddedLayoutIds(ids);
    });
    // Poll server every 5s
    const interval = setInterval(() => {
      loadAddedLayoutIdsFromServer().then((ids) => setAddedLayoutIds(ids));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const addedLayouts = useMemo(() => {
    const usedIds = new Set(savedList.map(m => m.layoutId).filter(Boolean));
    const visibleIds = new Set([...addedLayoutIds, ...usedIds]);
    return GALLERY_LAYOUTS.filter(l => visibleIds.has(l.id));
  }, [addedLayoutIds, savedList]);

  // ── Load saved list (auto-seed two cards if empty) ──
  useEffect(() => {
    let list = loadSaved();
    // Migrate old data: cards without obsSceneName get one assigned
    list = list.map((m, i) => {
      if (!m.obsSceneName) {
        return { ...m, obsSceneName: `MV: Multiview ${i + 1}` };
      }
      // Migrate: ensure slotThumbnails, layoutFrameId, slotFrames, frameThickness exist
      if (!m.slotThumbnails || !("layoutFrameId" in m) || !m.slotFrames || typeof m.frameThickness !== "number") {
        return { ...m, slotThumbnails: m.slotThumbnails ?? {}, layoutFrameId: m.layoutFrameId ?? null, slotFrames: m.slotFrames ?? {}, frameThickness: m.frameThickness ?? 2, frameCornerRadius: (m as any).frameCornerRadius ?? 0, frameOpacity: (m as any).frameOpacity ?? 100, frameColor: (m as any).frameColor ?? "" };
      }
      return m;
    });
    const now = new Date().toISOString();
    const cards: SavedMultiView[] = [1, 2, 3].map((n) => {
      const existing = list[n - 1];
      if (existing) return existing;
      return {
        id: genId(),
        name: `${t('multiview.title')} ${n}`,
        obsSceneName: `MV: Multiview ${n}`,
        layoutId: GALLERY_LAYOUTS[0]?.id ?? "",
        assignments: {},
        slotModes: {},
        slotFraming: {},
        slotThumbnails: {},
        layoutFrameId: null,
        slotFrames: {},
        frameThickness: 2,
        frameCornerRadius: 0,
        frameOpacity: 100,
        frameColor: "",
        background: { ...DEFAULT_MV_BG },
        createdAt: now,
        updatedAt: now,
      };
    });
    list = cards;
    saveSaved(list);
    setSavedList(list);
  }, []);

  const obsReady = useDockObsReady();

  // ── Single GetSceneList + GetInputList call ──
  const refreshObsScenes = useCallback(async () => {
    if (!mountedRef.current) { console.log("[MV] refreshObsScenes bailed — not mounted"); return; }
    if (obsScanBusyRef.current) { console.log("[MV] refreshObsScenes bailed — scan busy"); return; }
    obsScanBusyRef.current = true;
    setObsContentLoading(true);
    try {
      const result = await Promise.race([
        Promise.all([
          dockObsClient.call("GetSceneList") as Promise<{ scenes: Array<{ sceneName: string }> }>,
          dockObsClient.call("GetInputList") as Promise<{ inputs: Array<{ inputName: string }> }>,
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("refreshObsScenes timed out")), 15000)
        ),
      ]);
      const [sceneResp, inputResp] = result;
      const scenes = sceneResp.scenes ?? [];
      const inputs = inputResp.inputs ?? [];
      if (!mountedRef.current) return;
      console.log("[MV] refreshObsScenes OK", { sceneCount: scenes.length, scenes: scenes.map(s => s.sceneName), inputCount: inputs.length });
      setObsScenes(scenes.map(s => s.sceneName));
      setObsSources(inputs.map(i => i.inputName));
      setObsContentLoaded(true);
    } catch (err) {
      console.warn("[MV] refreshObsScenes FAILED", err);
      if (mountedRef.current) setObsContentLoaded(true);
    } finally {
      obsScanBusyRef.current = false;
      if (mountedRef.current) setObsContentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!obsReady) { console.log("[MV] effect bailed — obsReady is false"); return; }
    console.log("[MV] effect running — calling refreshObsScenes");
    mountedRef.current = true;
    refreshObsScenes();
    const interval = setInterval(() => { refreshObsScenes(); }, getRecommendedPollingInterval(5000));
    return () => { console.log("[MV] effect cleanup"); mountedRef.current = false; clearInterval(interval); };
  }, [obsReady, refreshObsScenes]);

  // ── Show feedback briefly ──
  const showFeedback = useCallback((type: "success" | "error", text: string) => {
    setFeedback({ type, text });
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => { if (mountedRef.current) setFeedback(null); }, 3000);
  }, []);

  // ════════════════════════════════════════════════════════════════════════
  // CRUD Operations
  // ════════════════════════════════════════════════════════════════════════

  const handleUpdateName = useCallback((id: string, name: string) => {
    const next = savedList.map(m => m.id === id ? { ...m, name, updatedAt: new Date().toISOString() } : m);
    setSavedList(next);
    saveSaved(next);
  }, [savedList]);

  const handleUpdateLayout = useCallback((id: string, layoutId: string) => {
    const next = savedList.map(m => m.id === id ? { ...m, layoutId, assignments: {}, updatedAt: new Date().toISOString() } : m);
    setSavedList(next);
    saveSaved(next);
  }, [savedList]);

  const handleAssign = useCallback((id: string, slotId: string, val: string) => {
    const now = new Date().toISOString();
    const next = savedList.map(m => {
      if (m.id !== id) return m;
      return { ...m, assignments: { ...m.assignments, [slotId]: val }, updatedAt: now };
    });
    setSavedList(next);
    saveSaved(next);
    // Capture screenshot of assigned scene for thumbnail preview
    if (dockObsClient.isConnected && val) {
      dockObsClient.call("GetSourceScreenshot", {
        sourceName: val,
        imageFormat: "jpeg",
        imageWidth: 320,
        imageHeight: 180,
        imageCompressionQuality: 60,
      }).then((resp: unknown) => {
        const data = (resp as { imageData?: string })?.imageData;
        if (data) {
          const url = data.startsWith("data:") ? data : `data:image/jpeg;base64,${data}`;
          setSavedList(prev => {
            const updated = prev.map(m => {
              if (m.id !== id) return m;
              return { ...m, slotThumbnails: { ...m.slotThumbnails, [slotId]: url } };
            });
            saveSaved(updated);
            return updated;
          });
        }
      }).catch(() => {});
    }
  }, [savedList]);

  const handleAssignSlotMode = useCallback((id: string, slotId: string, mode: "scene" | "source") => {
    const next = savedList.map(m => {
      if (m.id !== id) return m;
      return { ...m, slotModes: { ...m.slotModes, [slotId]: mode }, updatedAt: new Date().toISOString() };
    });
    setSavedList(next);
    saveSaved(next);
  }, [savedList]);

  const handleAssignSlotFraming = useCallback((id: string, slotId: string, framing: { displayMode: "fill" | "fit" | "custom"; zoom: number; focalX: number; focalY: number }) => {
    const next = savedList.map(m => {
      if (m.id !== id) return m;
      return { ...m, slotFraming: { ...m.slotFraming, [slotId]: framing }, updatedAt: new Date().toISOString() };
    });
    setSavedList(next);
    saveSaved(next);
  }, [savedList]);

  const handleRemoveSlot = useCallback((id: string, slotId: string) => {
    const next = savedList.map(m => {
      if (m.id !== id) return m;
      const assigns = { ...m.assignments };
      delete assigns[slotId];
      const modes = { ...m.slotModes };
      delete modes[slotId];
      const framing = { ...m.slotFraming };
      delete framing[slotId];
      return { ...m, assignments: assigns, slotModes: modes, slotFraming: framing, updatedAt: new Date().toISOString() };
    });
    setSavedList(next);
    saveSaved(next);
  }, [savedList]);

  const handleUpdateBackground = useCallback((id: string, bg: MVBackground) => {
    const next = savedList.map(m => m.id === id ? { ...m, background: bg, updatedAt: new Date().toISOString() } : m);
    setSavedList(next);
    saveSaved(next);
  }, [savedList]);

  const handleUpdateFrame = useCallback((id: string, frameId: string | null) => {
    const next = savedList.map(m => m.id === id ? { ...m, layoutFrameId: frameId, updatedAt: new Date().toISOString() } : m);
    setSavedList(next);
    saveSaved(next);
  }, [savedList]);

  const handleUpdateFrameThickness = useCallback((id: string, thickness: number) => {
    const next = savedList.map(m => m.id === id ? { ...m, frameThickness: thickness, updatedAt: new Date().toISOString() } : m);
    setSavedList(next);
    saveSaved(next);
  }, [savedList]);

  const handleUpdateFrameCornerRadius = useCallback((id: string, radius: number) => {
    const next = savedList.map(m => m.id === id ? { ...m, frameCornerRadius: radius, updatedAt: new Date().toISOString() } : m);
    setSavedList(next);
    saveSaved(next);
  }, [savedList]);

  const handleUpdateFrameOpacity = useCallback((id: string, opacity: number) => {
    const next = savedList.map(m => m.id === id ? { ...m, frameOpacity: opacity, updatedAt: new Date().toISOString() } : m);
    setSavedList(next);
    saveSaved(next);
  }, [savedList]);

  const handleUpdateFrameColor = useCallback((id: string, color: string) => {
    const next = savedList.map(m => m.id === id ? { ...m, frameColor: color, updatedAt: new Date().toISOString() } : m);
    setSavedList(next);
    saveSaved(next);
  }, [savedList]);

  const handleDuplicate = useCallback((id: string) => {
    const src = savedList.find(m => m.id === id);
    if (!src) return;
    const now = new Date().toISOString();
    const dupe: SavedMultiView = {
      ...src,
      id: genId(),
      name: `${src.name} (${t('multiview.copy')})`,
      obsSceneName: nextObsSceneName(savedList),
      assignments: { ...src.assignments },
      background: { ...(src.background ?? DEFAULT_MV_BG) },
      createdAt: now,
      updatedAt: now,
    };
    const next = [dupe, ...savedList];
    setSavedList(next);
    saveSaved(next);
    showFeedback("success", `"${dupe.name}" created`);
  }, [savedList, showFeedback, t]);

  const handleDeleteConfirmed = useCallback((id: string, deleteObsScene: boolean) => {
    const mv = savedList.find(m => m.id === id);
    const next = savedList.filter(m => m.id !== id);
    setSavedList(next);
    saveSaved(next);
    setDeleteTargetId(null);

    if (deleteObsScene && mv && dockObsClient.isConnected) {
      dockObsClient.call("RemoveScene", { sceneName: mv.obsSceneName }).catch(() => { });
    }

    showFeedback("success", t('common.delete'));
  }, [savedList, showFeedback, t]);

  // ════════════════════════════════════════════════════════════════════════
  // OBS Operations
  // ════════════════════════════════════════════════════════════════════════

  const ensureScene = useCallback(async (sceneName: string) => {
    try {
      const resp = await dockObsClient.call("GetSceneList") as { scenes: Array<{ sceneName: string }> };
      if (!resp.scenes?.some(s => s.sceneName === sceneName)) {
        await dockObsClient.call("CreateScene", { sceneName });
      }
    } catch { /* ignore */ }
  }, []);

  const handlePush = useCallback(async (mv: SavedMultiView) => {
    if (!(await requireEntitlement("multiview", 0))) return;
    await ensureObsConnected();
    if (!dockObsClient.isConnected) return;

    const layout = resolveLayout(mv.layoutId);
    if (!layout) { showFeedback("error", t('multiview.layoutNotFound')); return; }

    const hasAny = Object.values(mv.assignments).some(v => v);
    if (!hasAny) { showFeedback("error", t('multiview.assignBeforePush')); return; }

    setPushingId(mv.id);
    try {
      const sceneName = mv.obsSceneName;
      await ensureScene(sceneName);
      const prefix = `${mv.id}::`;

      // ── Phase 0: Remove ALL existing items from this scene before rebuilding ──
      try {
        const existing = await dockObsClient.call("GetSceneItemList", { sceneName }) as {
          sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
        };
        for (const item of existing.sceneItems ?? []) {
          await dockObsClient.call("RemoveSceneItem", { sceneName, sceneItemId: item.sceneItemId }).catch(() => { });
        }
      } catch { /* scene may be empty */ }

      // Helper: create or update a managed input and return its sceneItemId
      const createManagedItem = async (inputName: string, inputKind: string, inputSettings: Record<string, unknown>): Promise<number> => {
        try {
          const resp = await dockObsClient.call("CreateInput", {
            sceneName, inputName, inputKind, inputSettings, sceneItemEnabled: true,
          }) as { sceneItemId: number };
          return resp.sceneItemId;
        } catch (createErr) {
          // CreateInput may fail if the source already exists — fall back to re-adding it
          console.warn("[DockMultiview] CreateInput failed, attempting fallback:", { inputName, inputKind }, String(createErr));
          // Update existing source settings, then re-add to scene
          await dockObsClient.call("SetInputSettings", { inputName, inputSettings }).catch(() => { });
          await dockObsClient.call("RemoveSceneItem", { sceneName, sourceName: inputName }).catch(() => { });
          await dockObsClient.call("AddSceneItem", { sceneName, sourceName: inputName });
          const existing = await dockObsClient.call("GetSceneItemId", { sceneName, sourceName: inputName }) as { sceneItemId: number };
          return existing.sceneItemId;
        }
      };

      // ── Phase 1: Create / find all managed scene items ──────────────────
      const entries: Array<{ slotId: string; sceneItemId: number; zIndex: number }> = [];

      // Background (always zIndex 0) — skip when transparent/effectively none
      const bg = getMvBg(mv);
      const bgSourceName = `${prefix}BACKGROUND`;
      const isBgEmpty = bg.type === "color" && (bg.color === "transparent" || bg.color === "#0F172A") && !bg.filePath && !bg.sceneName;
      try {
        let bgItemId = -1;
        if (isBgEmpty) {
          // No background — skip
        } else if (bg.type === "scene" && bg.sceneName) {
          // Scene as background — CreateSceneItem adds a scene as a nested source
          const created = await dockObsClient.call("CreateSceneItem", {
            sceneName, sourceName: bg.sceneName, sceneItemEnabled: true,
          }) as { sceneItemId: number };
          bgItemId = created.sceneItemId;
        } else {
          let inputKind = "color_source_v3";
          let inputSettings: Record<string, unknown> = { color: cssColorToObsInt(bg.color || "#0F172A"), width: CANVAS_W, height: CANVAS_H };
          if (bg.type === "image" && bg.filePath) {
            inputKind = "image_source";
            inputSettings = { file: bg.filePath, width: CANVAS_W, height: CANVAS_H };
          } else if (bg.type === "video" && bg.filePath) {
            inputKind = "ffmpeg_source";
            inputSettings = { local_file: bg.filePath, is_local_file: true, looping: true, restart_on_activate: true, close_when_inactive: false };
          }
          bgItemId = await createManagedItem(bgSourceName, inputKind, inputSettings);
        }
        if (bgItemId >= 0) entries.push({ slotId: "bg", sceneItemId: bgItemId, zIndex: 0 });
      } catch { /* non-critical */ }

      // Slots — add assigned scenes directly as scene items (scenes are sources in OBS)
      for (const slot of layout.slots) {
        const assigned = mv.assignments[slot.id];
        if (!assigned) continue;
        try {
          const created = await dockObsClient.call("CreateSceneItem", {
            sceneName, sourceName: assigned, sceneItemEnabled: true,
          }) as { sceneItemId: number };
          if (created.sceneItemId >= 0) {
            entries.push({ slotId: slot.id, sceneItemId: created.sceneItemId, zIndex: slot.zIndex ?? 1 });
          }
        } catch (err) {
          console.warn("[DockMultiview] slot push failed for", slot.id, assigned, err);
        }
      }

      // ── Phase 1.5: Generate composite frame overlay (one transparent PNG with all frames) ──
      const frameSourceName = "MCE · Frames";
      const pngBytes = await generateCompositeFramePng(layout, mv.layoutFrameId, mv.slotFrames, mv.frameThickness ?? 2, mv.frameCornerRadius ?? 0, mv.frameOpacity ?? 100, mv.frameColor ?? "");
      if (pngBytes) {
        const framePath = await saveFramePngToDisk(pngBytes);
        if (framePath) {
          try {
            const frameItemId = await createManagedItem(frameSourceName, "image_source", { file: framePath });
            if (frameItemId >= 0) {
              entries.push({ slotId: "__frame__", sceneItemId: frameItemId, zIndex: 999 });
            }
          } catch (err) {
            console.warn("[DockMultiview] frame source creation failed", err);
          }
        }
      } else {
        // No frames — remove existing frame source if present
        try {
          await dockObsClient.call("RemoveSceneItem", { sceneName, sourceName: frameSourceName }).catch(() => { });
        } catch { }
      }

      try { await dockObsClient.call("SetCurrentPreviewScene", { sceneName }); } catch { }

      // ── Phase 2: Apply transforms ──────────────────────────────────────
      for (const entry of entries) {
        if (entry.slotId === "bg") {
          await dockObsClient.call("SetSceneItemTransform", {
            sceneName,
            sceneItemId: entry.sceneItemId,
            sceneItemTransform: {
              positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0,
              boundsType: "OBS_BOUNDS_STRETCH", boundsWidth: CANVAS_W, boundsHeight: CANVAS_H,
              boundsAlignment: 0, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0,
            },
          });
        } else if (entry.slotId === "__frame__") {
          // Full-canvas frame overlay at origin
          await dockObsClient.call("SetSceneItemTransform", {
            sceneName,
            sceneItemId: entry.sceneItemId,
            sceneItemTransform: {
              positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0,
              boundsType: "OBS_BOUNDS_STRETCH", boundsWidth: CANVAS_W, boundsHeight: CANVAS_H,
              boundsAlignment: 0, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0,
            },
          });
        } else {
          const slot = layout.slots.find(s => s.id === entry.slotId);
          if (!slot) continue;
          const framing = mv.slotFraming?.[entry.slotId] ?? { displayMode: "fill", zoom: 1, focalX: 0.5, focalY: 0.5 };
          const tx = calculateSlotTransform(
            CANVAS_W, CANVAS_H,
            { x: slot.x, y: slot.y, width: slot.width, height: slot.height },
            { mode: framing.displayMode, focalX: framing.focalX ?? 0.5, focalY: framing.focalY ?? 0.5, zoom: framing.zoom ?? 1 },
          );
          const hasCrop = (tx.cropLeft ?? 0) > 0 || (tx.cropRight ?? 0) > 0 || (tx.cropTop ?? 0) > 0 || (tx.cropBottom ?? 0) > 0;
          await dockObsClient.call("SetSceneItemTransform", {
            sceneName,
            sceneItemId: entry.sceneItemId,
            sceneItemTransform: {
              positionX: hasCrop ? slot.x : tx.positionX,
              positionY: hasCrop ? slot.y : tx.positionY,
              scaleX: tx.scale,
              scaleY: tx.scale,
              rotation: 0,
              boundsType: "OBS_BOUNDS_NONE",
              cropLeft: Math.round(tx.cropLeft ?? 0),
              cropRight: Math.round(tx.cropRight ?? 0),
              cropTop: Math.round(tx.cropTop ?? 0),
              cropBottom: Math.round(tx.cropBottom ?? 0),
            },
          });
        }
      }

      // ── Phase 3: Order by zIndex ───────────────────────────────────────
      entries.sort((a, b) => a.zIndex - b.zIndex);
      for (let i = 0; i < entries.length; i++) {
        await dockObsClient.call("SetSceneItemIndex", { sceneName, sceneItemId: entries[i].sceneItemId, sceneItemIndex: i });
      }

      // ── Phase 4: Lock items ────────────────────────────────────────────
      for (const entry of entries) {
        try {
          await dockObsClient.call("SetSceneItemLocked", { sceneName, sceneItemId: entry.sceneItemId, sceneItemLocked: true });
        } catch { /* not supported on older OBS versions */ }
      }

      // ── Phase 5: Verify order ──────────────────────────────────────────
      try {
        const verify = await dockObsClient.call("GetSceneItemList", { sceneName }) as {
          sceneItems: Array<{ sceneItemId: number; sceneItemIndex: number }>;
        };
        const orderedItems = [...(verify.sceneItems ?? [])].sort((a, b) => a.sceneItemIndex - b.sceneItemIndex);
        const expectedIds = entries.map(e => e.sceneItemId);
        const actualIds = orderedItems.map(si => si.sceneItemId);
        if (expectedIds.some((id, idx) => id !== actualIds[idx])) {
          console.warn("[Multiview] Order mismatch after SetSceneItemIndex — reapplying order", { expected: expectedIds, actual: actualIds });
          for (let i = 0; i < entries.length; i++) {
            await dockObsClient.call("SetSceneItemIndex", { sceneName, sceneItemId: entries[i].sceneItemId, sceneItemIndex: i });
          }
        }
      } catch { /* verify non-critical */ }

      try { await dockObsClient.call("SetCurrentPreviewScene", { sceneName }); } catch { }

      showFeedback("success", `"${sceneName}" pushed to OBS`);
      refreshObsScenes();
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : t('multiview.pushFailed'));
    } finally {
      if (mountedRef.current) setPushingId(null);
    }
  }, [ensureScene, refreshObsScenes, showFeedback, t]);

  const handleClear = useCallback(async (mv: SavedMultiView) => {
    await ensureObsConnected();
    if (!dockObsClient.isConnected) return;
    setClearingId(mv.id);
    try {
      const sceneName = mv.obsSceneName;
      const prefix = `${mv.id}::`;
      await dockObsClient.fadeOutAllSceneItems(sceneName).catch(() => { });

      try {
        const prog = await dockObsClient.call("GetCurrentProgramScene") as { currentProgramSceneName?: string };
        if (prog.currentProgramSceneName && prog.currentProgramSceneName !== sceneName) {
          await dockObsClient.call("SetCurrentPreviewScene", { sceneName: prog.currentProgramSceneName }).catch(() => { });
        }
      } catch { }

      try {
        const items = await dockObsClient.call("GetSceneItemList", { sceneName }) as {
          sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
        };
        for (const item of items.sceneItems ?? []) {
          if (!item.sourceName?.startsWith(prefix)) continue;
          await dockObsClient.call("RemoveSceneItem", { sceneName, sceneItemId: item.sceneItemId }).catch(() => { });
        }
      } catch { }

      showFeedback("success", `"${sceneName}" cleared`);
      refreshObsScenes();
    } catch { /* ignore */ }
    finally { if (mountedRef.current) setClearingId(null); }
  }, [refreshObsScenes, showFeedback]);

  // ════════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════════

  const deleteTarget = deleteTargetId ? savedList.find(m => m.id === deleteTargetId) : null;

  return (
    <div className="dock-mv-tab">
      {/* ── Feedback ── */}
      {feedback && (
        <div className={`dock-mv-tab__feedback dock-mv-tab__feedback--${feedback.type}`}>
          <Icon name={feedback.type === "success" ? "check_circle" : "error"} size={14} />
          <span>{feedback.text}</span>
          <button type="button" className="dock-mv-tab__feedback-close" onClick={() => setFeedback(null)} title={t('common.close')}>
            <Icon name="close" size={12} />
          </button>
        </div>
      )}

      {/* ── Cards ── */}
      <div className="dock-mv-tab__list">
        {savedList.map((mv, idx) => (
          <MVCard
            key={mv.id}
            mv={mv}
            index={idx}
            isActive={obsScenes.includes(mv.obsSceneName)}
            obsScenes={obsScenes}
            obsSources={obsSources}
            obsContentLoading={obsContentLoading || (!obsContentLoaded && obsReady)}
            addedLayouts={addedLayouts}
            pushingId={pushingId}
            clearingId={clearingId}
            onPush={handlePush}
            onClear={handleClear}
            onUpdateName={handleUpdateName}
            onUpdateLayout={handleUpdateLayout}
            onUpdateBackground={handleUpdateBackground}
            onAssign={handleAssign}
            onAssignSlotMode={handleAssignSlotMode}
            onAssignSlotFraming={handleAssignSlotFraming}
            onClearSlot={handleRemoveSlot}
            onUpdateFrame={handleUpdateFrame}
            onUpdateFrameThickness={handleUpdateFrameThickness}
            onUpdateFrameCornerRadius={handleUpdateFrameCornerRadius}
            onUpdateFrameOpacity={handleUpdateFrameOpacity}
            onUpdateFrameColor={handleUpdateFrameColor}
            onUpdateSlotFrame={(id: string, slotId: string, frameMode: string) => {
              const next = savedList.map(m => {
                if (m.id !== id) return m;
                return { ...m, slotFrames: { ...m.slotFrames, [slotId]: frameMode }, updatedAt: new Date().toISOString() };
              });
              setSavedList(next);
              saveSaved(next);
            }}
            onDuplicate={handleDuplicate}
            onDelete={(id) => setDeleteTargetId(id)}
          />
        ))}
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <DeleteModal
          mvName={deleteTarget.name}
          onConfirm={(deleteObs) => handleDeleteConfirmed(deleteTarget.id, deleteObs)}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}
    </div>
  );
}
