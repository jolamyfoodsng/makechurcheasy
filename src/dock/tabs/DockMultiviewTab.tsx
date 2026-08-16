/**
 * DockMultiviewTab.tsx — Multi-View tab for the MakeChurchEasy Dock
 *
 * Card-based Multi-View manager:
 *   - Each Multi-View is an independent card stacked vertically
 *   - Inline template selection + scene assignment per card
 *   - Per-card Preview in OBS
 *   - Card actions menu (⋮): Rename, Duplicate, Delete
 *   - No detail pages, no back buttons, everything on one screen
 */

import { memo, useState, useEffect, useCallback, useRef, useMemo, type ChangeEvent, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { dockObsClient } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import { useDockObsReady } from "../useDockObsReady";
import Icon from "../DockIcon";
import { requireEntitlement, getDockPlan, showUpgradeModal } from "../dockEntitlement";
import { checkEntitlementSync } from "../../services/entitlementClient";
import { readUserScopedStorage } from "../../services/userScopedStorage";
import { loadDockPreferenceList, saveDockPreferenceList } from "../../services/dockPreferenceStorage";
import { GALLERY_LAYOUTS, type GalleryLayout, type GallerySlot } from "../../multiview/galleryLayouts";
import { BACKGROUND_PATTERNS } from "../../library/backgroundAssets";
import {
  areAddedLayoutIdsEqual,
  getAddedLayoutLocalStorageKeys,
  loadAddedLayoutIdsFromDockData,
  loadLocalAddedLayoutIds,
  mergeAddedLayoutIds,
  MULTIVIEW_ADDED_LAYOUTS_CHANGED_EVENT,
  saveAddedLayoutIdsToDockData,
  saveLocalAddedLayoutIds,
} from "../../multiview/addedLayoutStorage";
import type { MediaItem } from "../../library/libraryTypes";
import {
  dedupeMediaItems,
  loadLocalLibrary,
  registerDockMediaItem,
  uploadFileToDock,
} from "../dockUploadService";
import { isInternalDockMediaItem } from "../internalMediaAssets";
import { getRecommendedPollingInterval } from "../../services/performanceManager";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "dock-mv-saved";
const CANVAS_W = 1920;
const CANVAS_H = 1080;
const DEFAULT_SLOT_FRAMING = { displayMode: "fit" as const, zoom: 1, focalX: 0.5, focalY: 0.5 };
const BACKGROUND_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
const BACKGROUND_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv", "flv"]);
const MV_IMAGE_LIBRARY_UPDATED_EVENT = "dock-mv-image-library-updated";
// Scene/source inventory is useful while the tab is open, but it does not
// need to compete with OBS every few seconds on low-end machines.
const MV_OBS_SCAN_MS = 30_000;
const MV_THUMBNAIL_REFRESH_MS = 60_000;
const MV_THUMBNAIL_CONCURRENCY = 2;

const CONTENT_TYPE_INFO: Record<string, { labelKey: string; icon: string; color: string }> = {
  camera: { labelKey: "multiview.camera", icon: "videocam", color: "#0078d4" },
  scripture: { labelKey: "multiview.scripture", icon: "menu_book", color: "#3B82F6" },
  translation: { labelKey: "multiview.translation", icon: "translate", color: "#00bcd4" },
  "lower-third": { labelKey: "multiview.lowerThird", icon: "subtitles", color: "#ff9800" },
  browser: { labelKey: "multiview.browser", icon: "language", color: "#ff5722" },
  image: { labelKey: "multiview.image", icon: "image", color: "#9c27b0" },
};

const SCENE_TYPES = new Set(["camera", "scripture", "translation", "lower-third"]);

function areStringListsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Data Model
// ---------------------------------------------------------------------------

type MVBgType = "color" | "image" | "video" | "pattern" | "scene";

interface MVBackground {
  type: MVBgType;
  color: string;
  filePath: string;
  patternSrc: string;
  sceneName: string;
}

const DEFAULT_MV_BG: MVBackground = { type: "color", color: "transparent", filePath: "", patternSrc: "", sceneName: "" };

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

function resolveEffectiveFrameId(
  slotFrameId: string | null | undefined,
  layoutFrameId: string | null | undefined,
): string | null {
  if (slotFrameId === "none") return null;
  if (!slotFrameId || slotFrameId === "inherit") return layoutFrameId || null;
  return slotFrameId;
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
    const effectiveFrameId = resolveEffectiveFrameId(slotFrames?.[slot.id], frameId);
    const frame = resolveFrame(effectiveFrameId);
    return frame
      ? { rect: { x: slot.x, y: slot.y, w: slot.width, h: slot.height }, frame }
      : null;
  }).filter((entry): entry is { rect: { x: number; y: number; w: number; h: number }; frame: MultiviewFrame } => Boolean(entry));

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

function buildMultiviewPatternBrowserUrl(patternSrc: string): string {
  const trimmed = patternSrc.trim();
  const imageSrc = /^(data:|https?:\/\/|file:\/\/|\/)/i.test(trimmed)
    ? trimmed
    : `file://${trimmed}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;width:100vw;height:100vh;overflow:hidden;background:#0F172A"><img src="${imageSrc.replace(/"/g, "&quot;")}" style="display:block;width:100%;height:100%;object-fit:cover" /></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
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

function normalizeLoadedMultiView(item: SavedMultiView): SavedMultiView {
  const assignments = item.assignments ?? {};
  const slotModes = item.slotModes ?? {};
  const slotThumbnails = item.slotThumbnails ?? {};
  const slotFraming = { ...(item.slotFraming ?? {}) };
  let changed = !item.assignments || !item.slotModes || !item.slotFraming || !item.slotThumbnails;

  for (const slotId of Object.keys(assignments)) {
    const framing = slotFraming[slotId];
    if (!framing || framing.displayMode === "fill") {
      slotFraming[slotId] = DEFAULT_SLOT_FRAMING;
      changed = true;
    }
  }

  return changed ? { ...item, assignments, slotModes, slotFraming, slotThumbnails } : item;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

interface SavedStorageSnapshot {
  items: SavedMultiView[];
  /** A valid persisted value was found, including an intentional empty list. */
  hasStoredValue: boolean;
  /** The value came from a recovery/migration path and should be written back. */
  shouldMigrate: boolean;
  /** Storage was readable and may safely be written to. */
  canPersist: boolean;
}

function parseSavedItems(raw: string | null): SavedMultiView[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : null;
    return items
      ? (items as SavedMultiView[]).map(normalizeLoadedMultiView)
      : null;
  } catch {
    return null;
  }
}

function loadSavedSnapshot(): SavedStorageSnapshot {
  try {
    const raw = readUserScopedStorage(STORAGE_KEY);
    const items = parseSavedItems(raw);
    if (items) return { items, hasStoredValue: true, shouldMigrate: false, canPersist: true };

    // A malformed value must not be replaced with fresh default cards during a
    // remount. Leave it untouched and let an explicit user edit repair it.
    return { items: [], hasStoredValue: raw !== null, shouldMigrate: false, canPersist: raw === null };
  } catch {
    // Storage can be temporarily unavailable while the dock/auth document is
    // being restored. Treat that as an unreadable session, never as an empty
    // Multiview that should be written back over the user's cards.
    return { items: [], hasStoredValue: false, shouldMigrate: false, canPersist: false };
  }
}

function saveSaved(items: SavedMultiView[]) {
  // localStorage is written synchronously for instant recovery; the same
  // snapshot is also mirrored to the dock's durable user-scoped store.
  void saveDockPreferenceList(STORAGE_KEY, items);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBackgroundMediaLabel(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

function getMediaItemPreviewSrc(item: MediaItem): string {
  if (item.thumbnailUrl) return item.thumbnailUrl;
  if (item.diskFileName) return `/uploads/${encodeURIComponent(item.diskFileName)}`;
  return item.url;
}

function getInlineImagePreviewSrc(filePath: string): string {
  const value = filePath.trim();
  if (/^(https?:\/\/|data:image\/|\/uploads\/)/i.test(value)) return value;
  return "";
}

function formatMediaItemMeta(item: MediaItem): string {
  const parts: string[] = [];
  if (item.mimeType) {
    parts.push(item.mimeType.split("/").pop()?.toUpperCase() || item.type.toUpperCase());
  } else {
    parts.push(item.type === "video" ? "VIDEO" : "IMAGE");
  }
  if (item.fileSize && Number.isFinite(item.fileSize)) {
    const mb = item.fileSize / (1024 * 1024);
    parts.push(mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`);
  }
  return parts.join(" · ");
}

function getUploadBackgroundMediaType(fileName: string): "image" | "video" | null {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (BACKGROUND_IMAGE_EXTENSIONS.has(ext)) return "image";
  if (BACKGROUND_VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}

function createUploadMediaItem(fileName: string): MediaItem | null {
  const type = getUploadBackgroundMediaType(fileName);
  if (!type) return null;
  return {
    id: `upload:${fileName}`,
    name: fileName,
    type,
    url: `/uploads/${encodeURIComponent(fileName)}`,
    diskFileName: fileName,
    createdAt: "0001-01-01T00:00:00.000Z",
    source: "local",
  };
}

function dedupeBackgroundMediaItems(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.filePath || item.diskFileName || item.url || item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isMediaItemSelectedForBackground(item: MediaItem, filePath: string): boolean {
  if (!filePath) return false;
  const selectedName = getBackgroundMediaLabel(filePath);
  return item.filePath === filePath ||
    item.url === filePath ||
    item.diskFileName === selectedName ||
    item.name === selectedName;
}

function isSelectableBackgroundMediaItem(item: MediaItem, type: "image" | "video"): boolean {
  return item.type === type && item.source !== "document-conversion";
}

function isMultiviewManagedSceneName(sceneName: string): boolean {
  return /^MV:\s*Multiview\b/i.test(sceneName.trim());
}

async function loadBackgroundMediaLibrary(): Promise<MediaItem[]> {
  const sources: MediaItem[][] = [];

  try {
    const { getAllMedia } = await import("../../library/libraryDb");
    const indexedItems = await getAllMedia();
    if (indexedItems.length > 0) sources.push(indexedItems);
  } catch (err) {
    console.warn("[DockMultiview] Unable to read IndexedDB media library", err);
  }

  try {
    const res = await fetch("/uploads/dock-media-library.json");
    if (res.ok) {
      const jsonItems = await res.json();
      if (Array.isArray(jsonItems)) sources.push(jsonItems as MediaItem[]);
    }
  } catch (err) {
    console.warn("[DockMultiview] Unable to read dock media library file", err);
  }

  try {
    const res = await fetch("/api/uploads");
    if (res.ok) {
      const files = await res.json();
      if (Array.isArray(files)) {
        sources.push(files
          .filter((file): file is string => typeof file === "string")
          .map(createUploadMediaItem)
          .filter((item): item is MediaItem => Boolean(item)));
      }
    }
  } catch (err) {
    console.warn("[DockMultiview] Unable to read uploads folder media", err);
  }

  sources.push(loadLocalLibrary());
  return dedupeBackgroundMediaItems(
    dedupeMediaItems(sources.flat()).filter((item) => !isInternalDockMediaItem(item)),
  );
}

async function getUploadsDirectory(): Promise<string> {
  const res = await fetch("/api/uploads-dir");
  if (!res.ok) throw new Error(`uploads-dir failed: ${res.status}`);
  const data = await res.json();
  if (!data.path) throw new Error("Uploads directory was not returned.");
  return String(data.path);
}

async function resolveBackgroundMediaFilePath(item: MediaItem): Promise<string> {
  if (item.filePath) return item.filePath;

  if (item.url?.startsWith("data:")) {
    const response = await fetch("/api/save-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: item.diskFileName || item.name, dataUrl: item.url }),
    });
    if (!response.ok) throw new Error(`save-media failed: ${response.status}`);
    const data = await response.json();
    if (!data.path) throw new Error("Saved media path was not returned.");
    return String(data.path);
  }

  const fileName = item.diskFileName || decodeURIComponent(item.url?.split("/").pop() || item.name);
  if (!fileName) throw new Error("Media file name is missing.");
  const dir = await getUploadsDirectory();
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir}${sep}${fileName}`;
}

async function captureMvSourceThumbnail(sourceName: string): Promise<string | null> {
  if (!sourceName || !dockObsClient.isConnected) return null;
  try {
    const resp = await dockObsClient.call("GetSourceScreenshot", {
      sourceName,
      imageFormat: "jpeg",
      imageWidth: 320,
      imageHeight: 180,
      imageCompressionQuality: 60,
    }) as { imageData?: string };
    const data = resp.imageData;
    if (!data) return null;
    return data.startsWith("data:") ? data : `data:image/jpeg;base64,${data}`;
  } catch (err) {
    console.warn("[DockMultiview] Thumbnail capture failed", { sourceName, err });
    return null;
  }
}

/**
 * Capture previews in a small queue instead of starting one OBS screenshot
 * request per slot at the same time. The Dock is often hosted inside OBS, so
 * a burst of screenshot requests competes with the live compositor on the
 * same low-end machine.
 */
async function captureMvSourceThumbnails(sourceNames: string[]): Promise<Map<string, string | null>> {
  const captures = new Map<string, string | null>();
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < sourceNames.length) {
      const sourceName = sourceNames[nextIndex++];
      captures.set(sourceName, await captureMvSourceThumbnail(sourceName));
    }
  };

  const workerCount = Math.min(MV_THUMBNAIL_CONCURRENCY, sourceNames.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return captures;
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

function formatMvContentLabel(value: string): string {
  const clean = value.trim();
  if (!clean) return clean;
  if (/^MCE(?: Browser)?\s*-\s*Worship$/i.test(clean) || /^MCE Worship$/i.test(clean)) return "Worship";
  if (/^MCE(?: Browser)?\s*-\s*Bible$/i.test(clean) || /^MCE Bible$/i.test(clean)) return "Bible";
  if (/^MCE Presentation$/i.test(clean)) return "Presentation";
  return clean.replace(/^MCE(?: Browser)?\s*-\s*/i, "").replace(/^MCE\s+/i, "");
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

const LayoutMiniPreview = memo(function LayoutMiniPreview({ layout, thumbnails, slotFraming, frameId, slotFrames, frameThickness, frameCornerRadius, frameOpacity, frameColor }: {
  layout: GalleryLayout;
  thumbnails?: Record<string, string>;
  slotFraming?: SavedMultiView["slotFraming"];
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
    const effId = resolveEffectiveFrameId(slotFrames?.[slot.id], frameId);
    return { slot, frame: resolveFrame(effId) };
  }).filter((s): s is { slot: GallerySlot; frame: MultiviewFrame } => !!s.frame);

  return (
    <div className="dock-mv-layout-preview" style={{ position: "relative", width: "100%", aspectRatio: `${CANVAS_W}/${CANVAS_H}`, overflow: "hidden", background: "#111", borderRadius: 3 }}>
      {/* Thumbnail images overlaid */}
      {hasThumbs && layout.slots.map((slot) => {
        const thumb = thumbnails?.[slot.id];
        if (!thumb) return null;
        const framing = slotFraming?.[slot.id] ?? DEFAULT_SLOT_FRAMING;
        const tx = calculateSlotTransform(
          320,
          180,
          slot,
          { mode: framing.displayMode, focalX: framing.focalX ?? 0.5, focalY: framing.focalY ?? 0.5, zoom: framing.zoom ?? 1 },
        );
        return (
          <div key={slot.id}
            style={{
              position: "absolute", left: `${slot.x * scaleX}%`, top: `${slot.y * scaleY}%`,
              width: `${slot.width * scaleX}%`, height: `${slot.height * scaleY}%`,
              overflow: "hidden",
            }}
          >
            <img src={thumb} alt=""
              style={{
                position: "absolute",
                left: `${((tx.positionX - slot.x) / slot.width) * 100}%`,
                top: `${((tx.positionY - slot.y) / slot.height) * 100}%`,
                width: `${(tx.renderedWidth / slot.width) * 100}%`,
                height: `${(tx.renderedHeight / slot.height) * 100}%`,
                objectFit: "fill",
                display: "block",
              }} />
          </div>
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
});

// ---------------------------------------------------------------------------
// Content Picker Modal
// ---------------------------------------------------------------------------

function ContentPicker({
  open,
  obsScenes,
  loading,
  onSelect,
  onClose,
  excludeScenes,
}: {
  open: boolean;
  obsScenes: string[];
  loading: boolean;
  onSelect: (value: string) => void;
  onClose: () => void;
  excludeScenes?: string[];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  if (!open) return null;

  const exclude = new Set(excludeScenes ?? []);
  const normalizedQuery = query.trim().toLowerCase();
  const scenes = obsScenes.filter(s => (!normalizedQuery || s.toLowerCase().includes(normalizedQuery)) && !exclude.has(s));

  return (
    <div className="dock-mv-modal-overlay" onClick={onClose}>
      <div className="dock-mv-content-picker" onClick={(e) => e.stopPropagation()}>
        <div className="dock-mv-content-picker__header">
          <div>
            <span className="dock-mv-content-picker__title">{t('multiview.chooseContent')}</span>
            <span className="dock-mv-content-picker__subtitle">{t('multiview.chooseContentDesc')}</span>
          </div>
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
            placeholder={t('multiview.searchScenes', 'Search OBS scenes...')}
            autoFocus
          />
        </div>
        <div className="dock-mv-content-picker__summary" aria-live="polite">
          <span>{t('multiview.scenes')} · {scenes.length}</span>
          <span>{t('multiview.scenePickerHint', 'Use a full OBS scene inside this area.')}</span>
        </div>
        <div className="dock-mv-content-picker__list" aria-busy={loading}>
          {loading ? (
            <div className="dock-mv-content-picker__loading" role="status" aria-live="polite">
              <span>{t('common.loading')}</span>
            </div>
          ) : scenes.length === 0 ? (
            <div className="dock-mv-content-picker__empty">{t('multiview.noContentFound')}</div>
          ) : (
            scenes.map(item => (
              <button
                key={`scene:${item}`}
                type="button"
                className="dock-mv-content-picker__item"
                onClick={() => onSelect(item)}
              >
                <span className="dock-mv-content-picker__item-icon" aria-hidden="true">
                  <Icon name="grid_view" size={14} />
                </span>
                <span className="dock-mv-content-picker__item-body">
                  <span className="dock-mv-content-picker__item-name">{item}</span>
                  <span className="dock-mv-content-picker__item-meta">
                    {t('multiview.scene', 'Scene')}
                  </span>
                </span>
                <span className="dock-mv-content-picker__item-action">
                  <Icon name="arrow_forward" size={13} />
                </span>
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
interface SourceSize { width: number; height: number }

function normalizeSourceSize(width?: number, height?: number): SourceSize {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  return {
    width: Number.isFinite(safeWidth) && safeWidth > 0 ? safeWidth : CANVAS_W,
    height: Number.isFinite(safeHeight) && safeHeight > 0 ? safeHeight : CANVAS_H,
  };
}

function normalizeSlotFraming(
  framing: { displayMode: "fill" | "fit" | "custom"; zoom: number; focalX: number; focalY: number },
) {
  const focalX = Number(framing.focalX);
  const focalY = Number(framing.focalY);
  return {
    displayMode: framing.displayMode,
    zoom: Math.max(1, Math.min(5, Number(framing.zoom) || 1)),
    // Do not use `|| 0.5` here: 0 is a valid edge position.
    focalX: Math.max(0, Math.min(1, Number.isFinite(focalX) ? focalX : 0.5)),
    focalY: Math.max(0, Math.min(1, Number.isFinite(focalY) ? focalY : 0.5)),
  };
}

function normalizeEditorFraming(
  framing: { displayMode: "fill" | "fit" | "custom"; zoom: number; focalX: number; focalY: number },
) {
  const normalized = normalizeSlotFraming(framing);
  // "fill" is retained when reading older saved cards, but the editor now
  // exposes it as the editable Custom mode.
  return normalized.displayMode === "fill"
    ? { ...normalized, displayMode: "custom" as const }
    : normalized;
}

async function getSceneItemSourceSize(sceneName: string, sceneItemId: number): Promise<SourceSize> {
  try {
    const response = await dockObsClient.call("GetSceneItemTransform", {
      sceneName,
      sceneItemId,
    }) as {
      sceneItemTransform?: {
        sourceWidth?: number;
        sourceHeight?: number;
      };
    };
    return normalizeSourceSize(
      response.sceneItemTransform?.sourceWidth,
      response.sceneItemTransform?.sourceHeight,
    );
  } catch {
    return normalizeSourceSize();
  }
}

export function calculateSlotTransform(
  sourceWidth: number,
  sourceHeight: number,
  slot: SlotRect,
  framing: FramingParams,
) {
  const sourceSize = normalizeSourceSize(sourceWidth, sourceHeight);
  const safeFraming = normalizeSlotFraming({
    displayMode: framing.mode,
    zoom: framing.zoom,
    focalX: framing.focalX,
    focalY: framing.focalY,
  });
  const fillScale = Math.max(slot.width / sourceSize.width, slot.height / sourceSize.height);

  if (safeFraming.displayMode === "fit") {
    const scaleX = slot.width / sourceSize.width;
    const scaleY = slot.height / sourceSize.height;
    return {
      scale: Math.max(scaleX, scaleY),
      scaleX,
      scaleY,
      renderedWidth: slot.width,
      renderedHeight: slot.height,
      positionX: slot.x,
      positionY: slot.y,
      cropLeft: 0,
      cropRight: 0,
      cropTop: 0,
      cropBottom: 0,
    };
  }

  const scale = fillScale * safeFraming.zoom;
  const renderedWidth = sourceSize.width * scale;
  const renderedHeight = sourceSize.height * scale;
  const visibleSourceWidth = slot.width / scale;
  const visibleSourceHeight = slot.height / scale;
  const hCrop = Math.max(0, sourceSize.width - visibleSourceWidth);
  const vCrop = Math.max(0, sourceSize.height - visibleSourceHeight);

  return {
    scale,
    scaleX: scale,
    scaleY: scale,
    renderedWidth,
    renderedHeight,
    // Crop distances are measured in source pixels, so convert them back to
    // canvas pixels before positioning the rendered image. Without this
    // scale, the preview stops short of the slot edge at focalX/Y = 1.
    positionX: slot.x - hCrop * safeFraming.focalX * scale,
    positionY: slot.y - vCrop * safeFraming.focalY * scale,
    cropLeft: hCrop * safeFraming.focalX,
    cropRight: hCrop - hCrop * safeFraming.focalX,
    cropTop: vCrop * safeFraming.focalY,
    cropBottom: vCrop - vCrop * safeFraming.focalY,
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
  const [draft, setDraft] = useState(() => normalizeEditorFraming(initialFraming));
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<SourceSize>(() => normalizeSourceSize());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showCustomHint, setShowCustomHint] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startFocalX: number; startFocalY: number } | null>(null);
  const mountedRef = useRef(true);
  const captureGenRef = useRef(0);

  const isCustom = draft.displayMode !== "fit";
  const isPortraitPreview = slotHeight > slotWidth;
  const zoomPixels = Math.round(draft.zoom * 100);

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
      setDraft(normalizeEditorFraming(initialFraming));
      setScreenshot(null);
      setPreviewSize(normalizeSourceSize());
      setError(null);
      setShowCustomHint(false);
      mountedRef.current = true;
      captureScreenshot();
    }
    return () => { mountedRef.current = false; };
  }, [open]);

  useEffect(() => {
    if (!showCustomHint) return;
    const timeout = window.setTimeout(() => setShowCustomHint(false), 3500);
    return () => window.clearTimeout(timeout);
  }, [showCustomHint]);

  const handleDisplayModeChange = useCallback((mode: "fit" | "custom") => {
    if (mode === "fit") {
      setDraft(prev => normalizeEditorFraming({ ...prev, displayMode: "fit" }));
      setShowCustomHint(false);
      return;
    }

    setDraft(prev => normalizeEditorFraming({
      ...prev,
      displayMode: "custom",
      // Switching from Fit starts Custom at a centered fill, ready to drag.
      ...(prev.displayMode === "fit" ? { zoom: 1, focalX: 0.5, focalY: 0.5 } : {}),
    }));
    setShowCustomHint(true);
  }, []);

  const saveFraming = useCallback(() => {
    onSave(normalizeEditorFraming(draft));
    onClose();
  }, [draft, onClose, onSave]);

  // ── Preview image transform using the shared calculation ──
  const imageStyle = useMemo((): React.CSSProperties => {
    const tx = calculateSlotTransform(
      previewSize.width, previewSize.height,
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
  }, [draft, previewSize.height, previewSize.width, slotWidth, slotHeight]);

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
    setDraft(prev => normalizeSlotFraming({
      ...prev,
      // Direct manipulation: dragging the picture right/down moves the
      // picture right/down, instead of reversing the user's gesture.
      focalX: Math.max(0, Math.min(1, dragRef.current!.startFocalX - dx * sensitivity)),
      focalY: Math.max(0, Math.min(1, dragRef.current!.startFocalY - dy * sensitivity)),
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
    setDraft(prev => normalizeSlotFraming({ ...prev, zoom: prev.zoom + delta }));
  }, [isCustom]);

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
            <button
              type="button"
              className="dock-mv-framing-editor__save"
              onClick={saveFraming}
              title={t('multiview.saveFraming')}
              aria-label={t('multiview.saveFraming')}
            >
              {t('common.save', 'Save')}
            </button>
            <button
              type="button"
              className="dock-mv-framing-editor__close"
              onClick={onClose}
              title={t('common.cancel')}
              aria-label={t('common.cancel')}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        <div className="dock-mv-framing-editor__body">
          {/* Visual Preview */}
          <div
            className={[
              "dock-mv-framing-editor__preview",
              isPortraitPreview ? "dock-mv-framing-editor__preview--portrait" : "",
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
                onLoad={(event) => {
                  setPreviewSize(normalizeSourceSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight));
                }}
                draggable={false}
              />
            )}

            {isCustom && showCustomHint && (
              <div className="dock-mv-framing-editor__custom-hint" role="status" aria-live="polite">
                <span className="dock-mv-framing-editor__custom-hint-icon" aria-hidden="true">
                  <Icon name="swap_horiz" size={18} />
                </span>
                <strong>{t('multiview.dragLeftRight', 'Drag left or right')}</strong>
                <span>{t('multiview.dragToReposition', 'Drag the preview to reposition')}</span>
              </div>
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
            {(["fit", "custom"] as const).map(mode => (
              <button
                key={mode}
                type="button"
                className={`dock-mv-framing-editor__mode${draft.displayMode === mode ? " dock-mv-framing-editor__mode--active" : ""}`}
                onClick={() => handleDisplayModeChange(mode)}
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
                    min="100"
                    max="500"
                    step="5"
                    value={zoomPixels}
                    onChange={(e) => setDraft(prev => normalizeSlotFraming({ ...prev, zoom: parseFloat(e.target.value) / 100 }))}
                    className="dock-mv-framing-editor__slider"
                    aria-label={t('multiview.zoom')}
                  />
                  <span className="dock-mv-framing-editor__control-value">{zoomPixels}px ({draft.zoom.toFixed(2)}×)</span>
                </div>
              </label>

            </div>
          )}
        </div>


      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlotControl — redesigned card-style slot assignment
// ---------------------------------------------------------------------------

function ImageSlotControl({
  slot,
  slotIndex,
  value,
  onChange,
  onRemove,
}: {
  slot: GallerySlot;
  slotIndex: number;
  value: string;
  onChange: (val: string, m: "scene" | "source") => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [imageItems, setImageItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");
  const [resolvingMediaId, setResolvingMediaId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const refreshImages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const items = await loadBackgroundMediaLibrary();
      setImageItems(items.filter((item) => isSelectableBackgroundMediaItem(item, "image")));
    } catch (err) {
      console.warn("[DockMultiview] Failed to load image slot media library", err);
      setImageItems([]);
      setError(t("multiview.imageLibraryLoadError", "Could not load saved images."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;
    void refreshImages();
  }, [open, refreshImages]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    const handler = () => {
      if (open) void refreshImages();
    };
    window.addEventListener(MV_IMAGE_LIBRARY_UPDATED_EVENT, handler);
    return () => window.removeEventListener(MV_IMAGE_LIBRARY_UPDATED_EVENT, handler);
  }, [open, refreshImages]);

  const selectedItem = imageItems.find((item) => isMediaItemSelectedForBackground(item, value));
  const selectedName = value ? getBackgroundMediaLabel(value) : "";
  const previewSrc = selectedItem ? getMediaItemPreviewSrc(selectedItem) : getInlineImagePreviewSrc(value);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleImageItems = normalizedQuery
    ? imageItems.filter((item) => item.name.toLowerCase().includes(normalizedQuery))
    : imageItems;

  const handleUpload = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!file.type.startsWith("image/") && !BACKGROUND_IMAGE_EXTENSIONS.has(ext)) {
      setError(t("multiview.chooseImageFile", "Choose an image file."));
      return;
    }

    setUploading(true);
    setUploadStatus("");
    setError("");
    try {
      const { item, error: uploadError } = await uploadFileToDock(file, setUploadStatus);
      if (uploadError) throw new Error(uploadError);
      await registerDockMediaItem(item);
      const nextItems = dedupeBackgroundMediaItems(dedupeMediaItems([item, ...imageItems]))
        .filter((mediaItem) => isSelectableBackgroundMediaItem(mediaItem, "image"));
      setImageItems(nextItems);
      const diskPath = await resolveBackgroundMediaFilePath(item);
      onChange(diskPath, "scene");
      setOpen(false);
      window.dispatchEvent(new CustomEvent(MV_IMAGE_LIBRARY_UPDATED_EVENT));
    } catch (err) {
      console.warn("[DockMultiview] Image slot upload failed", err);
      setError(err instanceof Error ? err.message : t("multiview.imageUploadFailed", "Could not upload this image."));
    } finally {
      setUploading(false);
      setUploadStatus("");
    }
  }, [imageItems, onChange, t]);

  const handlePickerChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleUpload(file);
    event.target.value = "";
  }, [handleUpload]);

  const handleSelectImage = useCallback(async (item: MediaItem) => {
    if (uploading || resolvingMediaId !== null) return;
    setResolvingMediaId(item.id);
    setError("");
    try {
      const diskPath = await resolveBackgroundMediaFilePath(item);
      onChange(diskPath, "scene");
      setOpen(false);
    } catch (err) {
      console.warn("[DockMultiview] Failed to use library image for slot", err);
      setError(err instanceof Error ? err.message : t("multiview.imageSelectFailed", "Could not use this image."));
    } finally {
      setResolvingMediaId(null);
    }
  }, [onChange, resolvingMediaId, t, uploading]);

  const slotLabel = slot.label || t("multiview.contentN", { n: slotIndex + 1 });
  const hasImage = Boolean(value);

  return (
    <div className="dock-mv-slot-row dock-mv-slot-row--image">
      <div className="dock-mv-slot-row__main">
        <SlotTypeIcon contentType={slot.contentType} />
        <span className="dock-mv-slot-row__name">{slotLabel}</span>
        <div className="dock-mv-slot-row__spacer" />
        <div className="dock-mv-slot-image" ref={pickerRef}>
          <button
            type="button"
            className={`dock-mv-slot-image__trigger${hasImage ? " dock-mv-slot-image__trigger--selected" : ""}`}
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            title={hasImage ? selectedName : t("multiview.chooseImage", "Choose image")}
          >
            <span className="dock-mv-slot-image__thumb" aria-hidden="true">
              {previewSrc ? (
                <img src={previewSrc} alt="" loading="lazy" />
              ) : (
                <Icon name="image" size={15} />
              )}
            </span>
            <span className="dock-mv-slot-image__copy">
              <span className="dock-mv-slot-image__label">{t("multiview.image", "Image")}</span>
              <span className={`dock-mv-slot-image__value${hasImage ? "" : " dock-mv-slot-image__value--empty"}`}>
                {hasImage ? selectedName : t("multiview.uploadImage", "Upload image")}
              </span>
            </span>
            <Icon name={open ? "expand_less" : "expand_more"} size={14} />
          </button>

          {open && (
            <div className="dock-mv-slot-image__popover">
              <div className="dock-mv-slot-image__head">
                <span>{t("multiview.savedImages", "Saved images")} · {imageItems.length}</span>
                <button type="button" onClick={() => void refreshImages()} disabled={loading || uploading}>
                  <Icon name="refresh" size={12} />
                  <span>{loading ? t("common.loading", "Loading") : t("common.refresh", "Refresh")}</span>
                </button>
              </div>

              <button
                type="button"
                className="dock-mv-slot-image__upload"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Icon name={uploading ? "hourglass_top" : "upload"} size={14} />
                <span>{uploading ? (uploadStatus || t("multiview.savingImage", "Saving image...")) : t("multiview.uploadImage", "Upload image")}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="dock-mv-bg__file-hidden"
                onChange={handlePickerChange}
              />

              {imageItems.length > 6 && (
                <div className="dock-mv-slot-image__search">
                  <Icon name="search" size={13} />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("multiview.searchSavedImages", "Search saved images...")}
                  />
                </div>
              )}

              {loading ? (
                <div className="dock-mv-slot-image__status" role="status">
                  <Icon name="hourglass_top" size={14} />
                  <span>{t("multiview.loadingSavedImages", "Loading saved images...")}</span>
                </div>
              ) : visibleImageItems.length > 0 ? (
                <div className="dock-mv-slot-image__list">
                  {visibleImageItems.map((item) => {
                    const selected = isMediaItemSelectedForBackground(item, value);
                    const resolving = resolvingMediaId === item.id;
                    const itemPreviewSrc = getMediaItemPreviewSrc(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`dock-mv-slot-image__item${selected ? " dock-mv-slot-image__item--selected" : ""}`}
                        onClick={() => void handleSelectImage(item)}
                        disabled={uploading || resolvingMediaId !== null}
                        title={item.name}
                      >
                        <span className="dock-mv-slot-image__item-thumb">
                          <img src={itemPreviewSrc} alt="" loading="lazy" />
                        </span>
                        <span className="dock-mv-slot-image__item-copy">
                          <span className="dock-mv-slot-image__item-name">{item.name}</span>
                          <span className="dock-mv-slot-image__item-meta">
                            {resolving ? t("common.selecting", "Selecting...") : formatMediaItemMeta(item)}
                          </span>
                        </span>
                        <Icon name={selected ? "check" : "arrow_forward"} size={13} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="dock-mv-slot-image__status">
                  <Icon name="image" size={14} />
                  <span>
                    {imageItems.length > 0
                      ? t("multiview.noSavedImageMatches", "No saved image matches that search.")
                      : t("multiview.noSavedImages", "No saved images yet.")}
                  </span>
                </div>
              )}

              {hasImage && (
                <button
                  type="button"
                  className="dock-mv-slot-image__clear"
                  onClick={() => {
                    onRemove();
                    setOpen(false);
                  }}
                >
                  {t("multiview.clearImage", "Clear image")}
                </button>
              )}

              {error && <div className="dock-mv-slot-image__error">{error}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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

  const hasValue = Boolean(value);
  const isLegacySource = mode === "source";
  const valueExistsInObs = hasValue && (mode === "scene" ? obsScenes.includes(value) : obsSources.includes(value));
  const displayValue = formatMvContentLabel(value);

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
          <span className="dock-mv-slot-row__name">{slot.label || t('multiview.contentN', { n: slotIndex + 1 })}</span>
          <div className="dock-mv-slot-row__spacer" />
          {!hasValue && (
            <button type="button" className="dock-mv-slot-row__add-btn" onClick={onSelect} title={t('multiview.addContent')}>
              <Icon name="add" size={14} />
            </button>
          )}
          {hasValue && (
            <>
              <span
                className={`dock-mv-slot-row__selected-name${valueExistsInObs ? "" : " dock-mv-slot-row__selected-name--unknown"}`}
                title={valueExistsInObs ? value : `${value} (${t('multiview.notSeenInObs', 'not seen in current OBS scan')})`}
              >
                {displayValue}
              </span>
              {!isLegacySource && (
                <button
                  type="button"
                  className="dock-mv-slot-row__framing-btn"
                  onClick={() => onFramingChange(framing)}
                  title={t('multiview.adjustFraming')}
                  aria-label={t('multiview.adjustFraming')}
                >
                  <Icon name="crop" size={14} />
                </button>
              )}
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

  if (slot.contentType === "image") {
    return (
      <ImageSlotControl
        slot={slot}
        slotIndex={slotIndex}
        value={value}
        onChange={onChange}
        onRemove={onRemove}
      />
    );
  }

  // Browser slots keep URL input because they map to OBS browser sources.
  if (slot.contentType === "browser") {
    return (
      <div className="dock-mv-slot-row">
        <div className="dock-mv-slot-row__main">
          <SlotTypeIcon contentType={slot.contentType} />
          <span className="dock-mv-slot-row__name">{slot.label || t('multiview.contentN', { n: slotIndex + 1 })}</span>
          <div className="dock-mv-slot-row__spacer" />
          <input
            className="dock-mv-slot-row__input"
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value, "scene")}
            placeholder={t('multiview.urlPlaceholder')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="dock-mv-slot-row">
      <div className="dock-mv-slot-row__main">
        <SlotTypeIcon contentType={slot.contentType} />
        <span className="dock-mv-slot-row__name">{slot.label || t('multiview.contentN', { n: slotIndex + 1 })}</span>
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
  { type: "pattern", labelKey: "common.pattern", icon: "grid_view" },
  { type: "scene", labelKey: "multiview.bgScene", icon: "grid_view" },
];

function getPatternLabel(src: string): string {
  return BACKGROUND_PATTERNS.find((pattern) => pattern.src === src)?.label || "Pattern";
}

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
  const [uploadStatus, setUploadStatus] = useState("");
  const [libraryMedia, setLibraryMedia] = useState<MediaItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [mediaLibraryError, setMediaLibraryError] = useState("");
  const [resolvingMediaId, setResolvingMediaId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<string | null>(null);
  const [mediaQuery, setMediaQuery] = useState("");

  const hasBg = background.type === "color"
    ? background.color !== "#0F172A" && background.color !== "transparent"
    : background.type === "scene"
      ? Boolean(background.sceneName)
      : background.type === "pattern"
        ? Boolean(background.patternSrc)
        : Boolean(background.filePath);

  const isMediaType = background.type === "image" || background.type === "video";
  const isPatternType = background.type === "pattern";
  const mediaType = background.type === "video" ? "video" : "image";

  const refreshMediaLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setMediaLibraryError("");
    try {
      const items = await loadBackgroundMediaLibrary();
      setLibraryMedia(items);
    } catch (err) {
      console.warn("[DockMultiview] Failed to load background media library", err);
      setMediaLibraryError("Could not load saved media.");
      setLibraryMedia([]);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !isMediaType) return;
    void refreshMediaLibrary();
  }, [isMediaType, open, refreshMediaLibrary]);

  useEffect(() => {
    setMediaQuery("");
  }, [mediaType]);

  const handleFileUpload = useCallback(async (file: File, type: "image" | "video") => {
    setUploading(true);
    setUploadStatus("");
    setMediaLibraryError("");
    try {
      const { item, error } = await uploadFileToDock(file, setUploadStatus);
      if (error) throw new Error(error);
      await registerDockMediaItem(item);
      setLibraryMedia((current) => dedupeMediaItems([item, ...current]));
      const diskPath = await resolveBackgroundMediaFilePath(item);
      onChange({ ...background, type, filePath: diskPath, sceneName: "" });
    } catch (err) {
      console.warn("[DockMultiview] Background upload failed", err);
      setMediaLibraryError(err instanceof Error ? err.message : "Could not save media.");
    } finally {
      setUploading(false);
      setUploadStatus("");
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

  const handleSelectLibraryMedia = useCallback(async (item: MediaItem) => {
    if (uploading || resolvingMediaId) return;
    setResolvingMediaId(item.id);
    setMediaLibraryError("");
    try {
      const diskPath = await resolveBackgroundMediaFilePath(item);
      onChange({ ...background, type: item.type, filePath: diskPath, sceneName: "" });
    } catch (err) {
      console.warn("[DockMultiview] Failed to use library media as background", err);
      setMediaLibraryError(err instanceof Error ? err.message : "Could not use this media file.");
    } finally {
      setResolvingMediaId(null);
    }
  }, [background, onChange, resolvingMediaId, uploading]);

  const bgLabel = background.type === "color" ? t('multiview.bgColor')
    : background.type === "image" ? t('multiview.bgImage')
      : background.type === "video" ? t('multiview.bgVideo')
        : background.type === "pattern" ? t('common.pattern')
          : background.type === "scene" ? t('multiview.bgScene')
            : "";

  const bgValue = background.type === "color" ? background.color
    : background.type === "pattern" ? getPatternLabel(background.patternSrc)
      : background.type === "scene" ? background.sceneName
        : "";

  const selectedMediaName = background.filePath ? getBackgroundMediaLabel(background.filePath) : "";
  const hasSelectedMedia = selectedMediaName.length > 0;
  const mediaTitle = mediaType === "image" ? "Choose background image" : "Choose background video";
  const mediaHint = mediaType === "image"
    ? "Drop an image here or click to browse. PNG, JPG, WEBP, SVG."
    : "Drop a video here or click to browse. MP4, MOV, WEBM, M4V.";
  const mediaLibraryItems = libraryMedia.filter((item) => isSelectableBackgroundMediaItem(item, mediaType));
  const normalizedMediaQuery = mediaQuery.trim().toLowerCase();
  const visibleMediaLibraryItems = normalizedMediaQuery
    ? mediaLibraryItems.filter((item) => item.name.toLowerCase().includes(normalizedMediaQuery))
    : mediaLibraryItems;
  const selectedMediaItem = mediaLibraryItems.find((item) => isMediaItemSelectedForBackground(item, background.filePath));
  const selectedMediaPreviewSrc = selectedMediaItem ? getMediaItemPreviewSrc(selectedMediaItem) : "";
  const selectableObsScenes = obsScenes.filter((sceneName) => !isMultiviewManagedSceneName(sceneName));
  const selectedType = background.type === "color" && (background.color === "transparent" || background.color === "#0F172A")
    ? "none"
    : background.type;

  const handleTypeChange = (type: MVBgType | "none") => {
    if (type === "none") {
      onChange({ ...DEFAULT_MV_BG });
      return;
    }
    onChange({
      ...background,
      type,
      color: type === "color" ? (background.color === "transparent" ? "#0F172A" : background.color) : background.color,
      filePath: type === "image" || type === "video" ? background.filePath : "",
      patternSrc: type === "pattern" ? (background.patternSrc || BACKGROUND_PATTERNS[0]?.src || "") : "",
      sceneName: type === "scene" ? background.sceneName : "",
    });
  };

  return (
    <div className="dock-mv-property">
      <span className="dock-mv-property__label">{t('multiview.background')}</span>
      <div className="dock-mv-property__row">
        {hasBg ? (
          <span className="dock-mv-property__value">{bgLabel}{bgValue ? `: ${bgValue}` : ""}</span>
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

            <div className="dock-mv-bg-editor__type-select-wrap">
              <label htmlFor="dock-mv-background-type" className="dock-mv-bg-editor__type-label">Background type</label>
              <div className="dock-mv-bg-editor__type-select-control">
                <Icon name={BG_TYPE_OPTIONS.find((option) => option.type === selectedType)?.icon || "layers"} size={14} />
                <select
                  id="dock-mv-background-type"
                  className="dock-mv-bg-editor__type-select"
                  value={selectedType}
                  onChange={(event) => handleTypeChange(event.target.value as MVBgType | "none")}
                >
                  {BG_TYPE_OPTIONS.map((option) => (
                    <option key={option.type} value={option.type}>{t(option.labelKey)}</option>
                  ))}
                </select>
              </div>
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
                <div className="dock-mv-bg-editor__library-head">
                  <span>
                    {mediaType === "image" ? "Saved images" : "Saved videos"} · {mediaLibraryItems.length}
                  </span>
                  <button type="button" onClick={() => void refreshMediaLibrary()} disabled={libraryLoading}>
                    <Icon name="refresh" size={12} />
                    <span>{libraryLoading ? "Loading" : "Refresh"}</span>
                  </button>
                </div>
                {mediaLibraryItems.length > 8 && (
                  <div className="dock-mv-bg-editor__library-search">
                    <Icon name="search" size={13} />
                    <input
                      type="search"
                      value={mediaQuery}
                      onChange={(event) => setMediaQuery(event.target.value)}
                      placeholder={mediaType === "image" ? "Search saved images..." : "Search saved videos..."}
                    />
                  </div>
                )}
                {libraryLoading ? (
                  <div className="dock-mv-bg-editor__library-status" role="status">
                    <Icon name="hourglass_top" size={14} />
                    <span>Loading saved media...</span>
                  </div>
                ) : visibleMediaLibraryItems.length > 0 ? (
                  <div className="dock-mv-bg-editor__library-grid">
                    {visibleMediaLibraryItems.map((item) => {
                      const selected = isMediaItemSelectedForBackground(item, background.filePath);
                      const resolving = resolvingMediaId === item.id;
                      const previewSrc = getMediaItemPreviewSrc(item);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`dock-mv-bg-editor__library-item${selected ? " dock-mv-bg-editor__library-item--selected" : ""}`}
                          onClick={() => void handleSelectLibraryMedia(item)}
                          disabled={uploading || resolvingMediaId !== null}
                          title={item.name}
                        >
                          <span className="dock-mv-bg-editor__library-thumb">
                            {item.type === "image" ? (
                              <img src={previewSrc} alt="" loading="lazy" />
                            ) : (
                              <video src={previewSrc} muted playsInline preload="metadata" />
                            )}
                          </span>
                          <span className="dock-mv-bg-editor__library-copy">
                            <span className="dock-mv-bg-editor__library-name">{item.name}</span>
                            <span className="dock-mv-bg-editor__library-meta">{resolving ? "Selecting..." : formatMediaItemMeta(item)}</span>
                          </span>
                          <span className="dock-mv-bg-editor__library-check">
                            <Icon name={selected ? "check" : "arrow_forward"} size={13} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="dock-mv-bg-editor__library-status">
                    <Icon name={mediaType === "image" ? "image" : "movie"} size={14} />
                    <span>{mediaLibraryItems.length > 0 ? "No media matches that search." : mediaType === "image" ? "No saved images yet." : "No saved videos yet."}</span>
                  </div>
                )}
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
                  {hasSelectedMedia && selectedMediaPreviewSrc ? (
                    <span className="dock-mv-bg-editor__media-selected-thumb">
                      {mediaType === "image" ? (
                        <img src={selectedMediaPreviewSrc} alt="" />
                      ) : (
                        <video src={selectedMediaPreviewSrc} muted playsInline preload="metadata" />
                      )}
                    </span>
                  ) : (
                    <div className="dock-mv-bg-editor__media-icon">
                      <Icon name={uploading ? "hourglass_top" : mediaType === "image" ? "image" : "movie"} size={18} />
                    </div>
                  )}
                  <div className="dock-mv-bg-editor__media-copy">
                    <div className="dock-mv-bg-editor__media-title">
                      {uploading ? (uploadStatus || "Saving original media...") : hasSelectedMedia ? selectedMediaName : mediaTitle}
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
                {mediaLibraryError && (
                  <div className="dock-mv-bg-editor__library-error">{mediaLibraryError}</div>
                )}
              </div>
            )}

            {isPatternType && (
              <div className="dock-mv-bg-editor__visual-section">
                <div className="dock-mv-bg-editor__visual-section-head">
                  <span>Patterns</span>
                  <span>{BACKGROUND_PATTERNS.length}</span>
                </div>
                <div className="dock-mv-bg-editor__visual-grid dock-mv-bg-editor__visual-grid--patterns">
                  {BACKGROUND_PATTERNS.map((pattern) => {
                    const selected = background.patternSrc === pattern.src;
                    return (
                      <button
                        key={pattern.label}
                        type="button"
                        className={`dock-mv-bg-editor__visual-card${selected ? " dock-mv-bg-editor__visual-card--selected" : ""}`}
                        onClick={() => onChange({ ...background, type: "pattern", patternSrc: pattern.src, filePath: "", sceneName: "" })}
                        title={pattern.label}
                      >
                        <img src={pattern.src} alt="" loading="lazy" />
                        <span>{pattern.label}</span>
                        {selected && <Icon name="check" size={13} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {background.type === "scene" && (
              <div className="dock-mv-bg-editor__visual-section">
                <div className="dock-mv-bg-editor__visual-section-head">
                  <span>Scenes</span>
                  <span>{selectableObsScenes.length}</span>
                </div>
                {selectableObsScenes.length > 0 ? (
                  <div className="dock-mv-bg-editor__visual-grid dock-mv-bg-editor__visual-grid--scenes">
                    {selectableObsScenes.map((sceneName) => {
                      const selected = background.sceneName === sceneName;
                      return (
                        <button
                          key={sceneName}
                          type="button"
                          className={`dock-mv-bg-editor__visual-card dock-mv-bg-editor__visual-card--scene${selected ? " dock-mv-bg-editor__visual-card--selected" : ""}`}
                          onClick={() => onChange({ ...background, type: "scene", sceneName, filePath: "", patternSrc: "" })}
                          title={sceneName}
                        >
                          <Icon name="grid_view" size={18} />
                          <span>{sceneName}</span>
                          {selected && <Icon name="check" size={13} />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="dock-mv-bg-editor__library-status">
                    <Icon name="grid_view" size={14} />
                    <span>{t('multiview.selectScene')}</span>
                  </div>
                )}
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

const MVCard = memo(function MVCard({
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
  onAssign: (id: string, slotId: string, val: string, mode: "scene" | "source") => void;
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

  const handleContentSelect = (slotId: string, value: string) => {
    onAssign(mv.id, slotId, value, "scene");
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
      {layout && <LayoutMiniPreview layout={layout} thumbnails={mv.slotThumbnails} slotFraming={mv.slotFraming} frameId={mv.layoutFrameId} slotFrames={mv.slotFrames} frameThickness={mv.frameThickness} frameCornerRadius={mv.frameCornerRadius} frameOpacity={mv.frameOpacity} frameColor={mv.frameColor} />}

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
          const framing = mv.slotFraming?.[slot.id] ?? DEFAULT_SLOT_FRAMING;
          return (
            <div key={slot.id}>
              <SlotControl
                slot={slot}
                slotIndex={slotIdx}
                value={val}
                mode={mode}
                framing={framing}
                onSelect={() => setPickerSlot(slot.id)}
                onChange={(v) => handleContentSelect(slot.id, v)}
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
                  loading={obsContentLoading}
                  onSelect={(v) => handleContentSelect(slot.id, v)}
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

      {/* Preview in OBS — per card */}
      <div className="dock-mv-card__actions">
        <button
          type="button"
          className={`dock-btn dock-btn--sm ${isPushing ? "dock-btn--loading" : "dock-btn--primary"}`}
          onClick={() => onPush(mv)}
          disabled={isPushing || isClearing || !allSlotsFilled}
          style={{ flex: 1 }}
          title={isPushing ? t('multiview.previewing', 'Previewing…') : t('common.preview', 'Preview')}>
          <Icon name="cast" size={14} />
          <span>{isPushing ? t('multiview.previewing', 'Previewing…') : t('common.preview', 'Preview')}</span>
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
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function DockMultiviewTab({ isActive = true }: { isActive?: boolean }) {
  const { t } = useTranslation();
  const [dockPlan, setDockPlan] = useState<string>(() => getDockPlan());
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
  const obsContentLoadedRef = useRef(false);
  const obsSceneSignatureRef = useRef("");
  const thumbnailRefreshSignatureRef = useRef("");
  const thumbnailRefreshAtRef = useRef(0);
  const thumbnailRefreshBusyRef = useRef(false);
  const savedListRef = useRef<SavedMultiView[]>([]);

  useEffect(() => {
    if (!isActive) return;
    setDockPlan(getDockPlan());
    const interval = window.setInterval(() => setDockPlan(getDockPlan()), 30_000);
    return () => window.clearInterval(interval);
  }, [isActive]);

  // Show layouts that are added via gallery OR in use by saved cards
  const [addedLayoutIds, setAddedLayoutIds] = useState<Set<string>>(() => loadLocalAddedLayoutIds());

  const mergeIntoAddedLayoutIds = useCallback((...sources: Array<Iterable<unknown> | null | undefined>) => {
    setAddedLayoutIds(prev => {
      const next = mergeAddedLayoutIds(prev, ...sources);
      if (areAddedLayoutIdsEqual(prev, next)) return prev;
      saveLocalAddedLayoutIds(next, { emit: false });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;

    const mergeLocalIds = () => {
      mergeIntoAddedLayoutIds(loadLocalAddedLayoutIds());
    };

    const refreshFromDockData = async () => {
      const remoteIds = await loadAddedLayoutIdsFromDockData();
      if (cancelled) return;

      const localIds = loadLocalAddedLayoutIds();
      const mergedIds = mergeAddedLayoutIds(localIds, remoteIds);
      mergeIntoAddedLayoutIds(mergedIds);

      if (remoteIds.size === 0 && mergedIds.size > 0) {
        saveAddedLayoutIdsToDockData(mergedIds).catch(() => { });
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && !getAddedLayoutLocalStorageKeys().includes(event.key)) return;
      mergeLocalIds();
    };

    const handleAddedLayoutsChanged = (event: Event) => {
      const ids = (event as CustomEvent<{ ids?: string[] }>).detail?.ids;
      mergeIntoAddedLayoutIds(ids ?? loadLocalAddedLayoutIds());
    };

    mergeLocalIds();
    refreshFromDockData();
    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      refreshFromDockData();
    }, 30000);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(MULTIVIEW_ADDED_LAYOUTS_CHANGED_EVENT, handleAddedLayoutsChanged);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(MULTIVIEW_ADDED_LAYOUTS_CHANGED_EVENT, handleAddedLayoutsChanged);
    };
  }, [isActive, mergeIntoAddedLayoutIds]);

  const usedLayoutIds = useMemo(() => (
    [...new Set(savedList.map(m => m.layoutId).filter(Boolean))].sort().join("|")
  ), [savedList]);

  const addedLayouts = useMemo(() => {
    const visibleIds = new Set([
      ...addedLayoutIds,
      ...usedLayoutIds.split("|").filter(Boolean),
    ]);
    return GALLERY_LAYOUTS.filter(l => visibleIds.has(l.id));
  }, [addedLayoutIds, usedLayoutIds]);

  // ── Load saved list without overwriting it during a remount ──
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      let snapshot = loadSavedSnapshot();

      // If the fast local copy is missing, give the durable user-scoped copy a
      // chance to restore the cards before creating the first three defaults.
      if (!snapshot.hasStoredValue) {
        const durableItems = await loadDockPreferenceList<SavedMultiView>(STORAGE_KEY);
        if (cancelled) return;
        if (durableItems) {
          snapshot = {
            items: durableItems.map(normalizeLoadedMultiView),
            hasStoredValue: true,
            shouldMigrate: true,
            canPersist: true,
          };
        }
      }

      let list = snapshot.items;
      let changed = false;
      const usedSceneNames = new Set(list.map((m) => m.obsSceneName).filter(Boolean));

      // Migrate old data: cards without obsSceneName get one assigned
      list = list.map((m, i) => {
        if (!m.obsSceneName) {
          let number = i + 1;
          let obsSceneName = `MV: Multiview ${number}`;
          while (usedSceneNames.has(obsSceneName)) {
            number += 1;
            obsSceneName = `MV: Multiview ${number}`;
          }
          usedSceneNames.add(obsSceneName);
          changed = true;
          return { ...m, obsSceneName, background: { ...DEFAULT_MV_BG, ...(m.background ?? {}) } };
        }
        // Migrate: ensure slotThumbnails, layoutFrameId, slotFrames, frameThickness exist
        if (!m.slotThumbnails || !("layoutFrameId" in m) || !m.slotFrames || typeof m.frameThickness !== "number" || !m.background || typeof (m.background as Partial<MVBackground>).patternSrc !== "string") {
          changed = true;
          return {
            ...m,
            slotThumbnails: m.slotThumbnails ?? {},
            layoutFrameId: m.layoutFrameId ?? null,
            slotFrames: m.slotFrames ?? {},
            frameThickness: m.frameThickness ?? 2,
            frameCornerRadius: (m as any).frameCornerRadius ?? 0,
            frameOpacity: (m as any).frameOpacity ?? 100,
            frameColor: (m as any).frameColor ?? "",
            background: { ...DEFAULT_MV_BG, ...(m.background ?? {}) },
          };
        }
        return m;
      });

      const now = new Date().toISOString();
      const cards: SavedMultiView[] = [...list];
      // Seed only a brand-new store. If the user deliberately has an empty
      // stored list, keep it empty. Never truncate saved cards to the first 3.
      const shouldSeedDefaults = !snapshot.hasStoredValue || cards.length > 0;
      while (shouldSeedDefaults && cards.length < 3) {
        const n = cards.length + 1;
        const obsSceneName = nextObsSceneName(cards);
        cards.push({
          id: genId(),
          name: `${t('multiview.title')} ${n}`,
          obsSceneName,
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
        });
        changed = true;
      }

      if (cancelled) return;

      // A failed/temporary storage read must not be written back as defaults.
      // Persist only migrations, durable recovery, or intentional seeding.
      if (snapshot.canPersist && (changed || snapshot.shouldMigrate)) {
        saveSaved(cards);
      }
      savedListRef.current = cards;
      setSavedList(cards);
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const obsReady = useDockObsReady();

  useEffect(() => {
    savedListRef.current = savedList;
  }, [savedList]);

  useEffect(() => {
    obsContentLoadedRef.current = obsContentLoaded;
  }, [obsContentLoaded]);

  const commitSavedList = useCallback((next: SavedMultiView[]) => {
    savedListRef.current = next;
    setSavedList(next);
    saveSaved(next);
  }, []);

  const refreshAssignedThumbnails = useCallback(async (
    availableSceneNames: string[],
    options?: { force?: boolean },
  ) => {
    if (!dockObsClient.isConnected) return;
    if (thumbnailRefreshBusyRef.current) return;
    const available = new Set(availableSceneNames);
    const snapshot = savedListRef.current;
    const targetKeys = new Set<string>();
    const captureSources = new Set<string>();

    for (const mv of snapshot) {
      for (const [slotId, sourceName] of Object.entries(mv.assignments ?? {})) {
        if (!sourceName) continue;
        const mode = mv.slotModes?.[slotId] ?? "scene";
        if (mode !== "scene") continue;
        targetKeys.add(`${mv.id}:${slotId}:${sourceName}`);
        if (available.has(sourceName)) {
          captureSources.add(sourceName);
        }
      }
    }

    if (targetKeys.size === 0) return;

    const captureSourceNames = [...captureSources].sort();
    const signature = `${[...targetKeys].sort().join("|")}::${captureSourceNames.join("|")}`;
    const now = Date.now();
    if (!options?.force && signature === thumbnailRefreshSignatureRef.current && now - thumbnailRefreshAtRef.current < MV_THUMBNAIL_REFRESH_MS) {
      return;
    }
    thumbnailRefreshSignatureRef.current = signature;
    thumbnailRefreshAtRef.current = now;
    thumbnailRefreshBusyRef.current = true;

    try {
      const captures = await captureMvSourceThumbnails(captureSourceNames);

      if (!mountedRef.current) return;

      setSavedList((current) => {
        let changed = false;
        const next = current.map((mv) => {
          const currentThumbs = mv.slotThumbnails ?? {};
          let nextThumbs = currentThumbs;

          for (const [slotId, sourceName] of Object.entries(mv.assignments ?? {})) {
            const key = `${mv.id}:${slotId}:${sourceName}`;
            if (!targetKeys.has(key)) continue;
            const mode = mv.slotModes?.[slotId] ?? "scene";
            if (mode !== "scene") continue;

            const nextUrl = available.has(sourceName) ? captures.get(sourceName) ?? null : null;
            if (nextUrl) {
              if (nextThumbs[slotId] !== nextUrl) {
                if (nextThumbs === currentThumbs) nextThumbs = { ...currentThumbs };
                nextThumbs[slotId] = nextUrl;
                changed = true;
              }
            } else if (nextThumbs[slotId]) {
              if (nextThumbs === currentThumbs) nextThumbs = { ...currentThumbs };
              delete nextThumbs[slotId];
              changed = true;
            }
          }

          return nextThumbs === currentThumbs ? mv : { ...mv, slotThumbnails: nextThumbs };
        });

        if (changed) {
          savedListRef.current = next;
          saveSaved(next);
        }
        return changed ? next : current;
      });
    } finally {
      thumbnailRefreshBusyRef.current = false;
    }
  }, []);

  // ── Single GetSceneList + GetInputList call ──
  const refreshObsScenes = useCallback(async (options?: { forceThumbnails?: boolean }) => {
    if (!mountedRef.current) return;
    if (obsScanBusyRef.current) return;
    obsScanBusyRef.current = true;
    if (!obsContentLoadedRef.current) setObsContentLoading(true);
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
      const sceneNames = scenes.map(s => s.sceneName);
      const sourceNames = inputs.map(i => i.inputName);
      const sceneSignature = sceneNames.join("\n");
      const scenesChanged = sceneSignature !== obsSceneSignatureRef.current;
      obsSceneSignatureRef.current = sceneSignature;
      setObsScenes(current => areStringListsEqual(current, sceneNames) ? current : sceneNames);
      setObsSources(current => areStringListsEqual(current, sourceNames) ? current : sourceNames);
      setObsContentLoaded(true);

      // Let the card list paint before the heavier OBS screenshot work starts.
      // The screenshots are useful previews, but they are not required to open
      // the tab and can otherwise compete with the first visible render.
      if (Boolean(options?.forceThumbnails) || scenesChanged) {
        window.setTimeout(() => {
          if (mountedRef.current) {
            void refreshAssignedThumbnails(sceneNames, { force: Boolean(options?.forceThumbnails) || scenesChanged });
          }
        }, 0);
      }
    } catch (err) {
      console.warn("[MV] refreshObsScenes FAILED", err);
      if (mountedRef.current) setObsContentLoaded(true);
    } finally {
      obsScanBusyRef.current = false;
      if (mountedRef.current) setObsContentLoading(false);
    }
  }, [refreshAssignedThumbnails]);

  useEffect(() => {
    if (!isActive || !obsReady) return;
    let cancelled = false;
    let interval: number | null = null;
    let startTimer: number | null = null;

    // Defer OBS enumeration until after the active tab has committed. This
    // keeps the navigation response independent from WebSocket round trips.
    const frame = window.requestAnimationFrame(() => {
      startTimer = window.setTimeout(() => {
        if (cancelled) return;
        mountedRef.current = true;
        void refreshObsScenes({ forceThumbnails: true });
        interval = window.setInterval(() => {
          if (document.visibilityState === "hidden") return;
          void refreshObsScenes();
        }, getRecommendedPollingInterval(MV_OBS_SCAN_MS));
      }, 0);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (startTimer !== null) window.clearTimeout(startTimer);
      if (interval !== null) window.clearInterval(interval);
      mountedRef.current = false;
    };
  }, [isActive, obsReady, refreshObsScenes]);

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
    const next = savedListRef.current.map(m => m.id === id ? { ...m, name, updatedAt: new Date().toISOString() } : m);
    commitSavedList(next);
  }, [commitSavedList]);

  const handleUpdateLayout = useCallback((id: string, layoutId: string) => {
    const selectedLayout = resolveLayout(layoutId);
    const next = savedListRef.current.map(m => m.id === id ? {
      ...m,
      layoutId,
      assignments: {},
      slotModes: {},
      slotFraming: {},
      slotThumbnails: {},
      layoutFrameId: selectedLayout?.defaultFrameId ?? null,
      slotFrames: { ...(selectedLayout?.defaultSlotFrames ?? {}) },
      updatedAt: new Date().toISOString(),
    } : m);
    commitSavedList(next);
  }, [commitSavedList]);

  const handleAssign = useCallback((id: string, slotId: string, val: string, mode: "scene" | "source") => {
    const now = new Date().toISOString();
    const next = savedListRef.current.map(m => {
      if (m.id !== id) return m;
      const slotThumbnails = { ...(m.slotThumbnails ?? {}) };
      delete slotThumbnails[slotId];
      return {
        ...m,
        assignments: { ...m.assignments, [slotId]: val },
        slotModes: { ...m.slotModes, [slotId]: mode },
        slotFraming: m.slotFraming?.[slotId] ? m.slotFraming : { ...m.slotFraming, [slotId]: DEFAULT_SLOT_FRAMING },
        slotThumbnails,
        updatedAt: now,
      };
    });
    commitSavedList(next);
    if (dockObsClient.isConnected && val && mode === "scene" && !thumbnailRefreshBusyRef.current) {
      thumbnailRefreshBusyRef.current = true;
      captureMvSourceThumbnails([val]).then((captures) => {
        const url = captures.get(val);
        if (!url) return;
        setSavedList(prev => {
          let changed = false;
          const updated = prev.map(m => {
            if (m.id !== id || m.assignments?.[slotId] !== val) return m;
            changed = true;
            return { ...m, slotThumbnails: { ...(m.slotThumbnails ?? {}), [slotId]: url } };
          });
          if (!changed) return prev;
          savedListRef.current = updated;
          saveSaved(updated);
          return updated;
        });
      }).catch(() => { }).finally(() => {
        thumbnailRefreshBusyRef.current = false;
      });
    }
  }, [commitSavedList]);

  const handleAssignSlotFraming = useCallback((id: string, slotId: string, framing: { displayMode: "fill" | "fit" | "custom"; zoom: number; focalX: number; focalY: number }) => {
    const next = savedListRef.current.map(m => {
      if (m.id !== id) return m;
      return { ...m, slotFraming: { ...m.slotFraming, [slotId]: framing }, updatedAt: new Date().toISOString() };
    });
    commitSavedList(next);
  }, [commitSavedList]);

  const handleRemoveSlot = useCallback((id: string, slotId: string) => {
    const next = savedListRef.current.map(m => {
      if (m.id !== id) return m;
      const assigns = { ...m.assignments };
      delete assigns[slotId];
      const modes = { ...m.slotModes };
      delete modes[slotId];
      const framing = { ...m.slotFraming };
      delete framing[slotId];
      const slotThumbnails = { ...(m.slotThumbnails ?? {}) };
      delete slotThumbnails[slotId];
      return { ...m, assignments: assigns, slotModes: modes, slotFraming: framing, slotThumbnails, updatedAt: new Date().toISOString() };
    });
    commitSavedList(next);
  }, [commitSavedList]);

  const handleUpdateBackground = useCallback((id: string, bg: MVBackground) => {
    const next = savedListRef.current.map(m => m.id === id ? { ...m, background: bg, updatedAt: new Date().toISOString() } : m);
    commitSavedList(next);
  }, [commitSavedList]);

  const handleUpdateFrame = useCallback((id: string, frameId: string | null) => {
    const next = savedListRef.current.map(m => m.id === id ? { ...m, layoutFrameId: frameId, updatedAt: new Date().toISOString() } : m);
    commitSavedList(next);
  }, [commitSavedList]);

  const handleUpdateFrameThickness = useCallback((id: string, thickness: number) => {
    const next = savedListRef.current.map(m => m.id === id ? { ...m, frameThickness: thickness, updatedAt: new Date().toISOString() } : m);
    commitSavedList(next);
  }, [commitSavedList]);

  const handleUpdateFrameCornerRadius = useCallback((id: string, radius: number) => {
    const next = savedListRef.current.map(m => m.id === id ? { ...m, frameCornerRadius: radius, updatedAt: new Date().toISOString() } : m);
    commitSavedList(next);
  }, [commitSavedList]);

  const handleUpdateFrameOpacity = useCallback((id: string, opacity: number) => {
    const next = savedListRef.current.map(m => m.id === id ? { ...m, frameOpacity: opacity, updatedAt: new Date().toISOString() } : m);
    commitSavedList(next);
  }, [commitSavedList]);

  const handleUpdateFrameColor = useCallback((id: string, color: string) => {
    const next = savedListRef.current.map(m => m.id === id ? { ...m, frameColor: color, updatedAt: new Date().toISOString() } : m);
    commitSavedList(next);
  }, [commitSavedList]);

  const handleUpdateSlotFrame = useCallback((id: string, slotId: string, frameMode: string) => {
    const next = savedListRef.current.map(m => m.id === id ? {
      ...m,
      slotFrames: { ...(m.slotFrames ?? {}), [slotId]: frameMode },
      updatedAt: new Date().toISOString(),
    } : m);
    commitSavedList(next);
  }, [commitSavedList]);

  const handleDuplicate = useCallback((id: string) => {
    const current = savedListRef.current;
    const src = current.find(m => m.id === id);
    if (!src) return;
    const now = new Date().toISOString();
    const dupe: SavedMultiView = {
      ...src,
      id: genId(),
      name: `${src.name} (${t('multiview.copy')})`,
      obsSceneName: nextObsSceneName(current),
      assignments: { ...src.assignments },
      background: { ...(src.background ?? DEFAULT_MV_BG) },
      createdAt: now,
      updatedAt: now,
    };
    const next = [dupe, ...current];
    commitSavedList(next);
    showFeedback("success", `"${dupe.name}" created`);
  }, [commitSavedList, showFeedback, t]);

  const handleDeleteConfirmed = useCallback((id: string, deleteObsScene: boolean) => {
    const current = savedListRef.current;
    const mv = current.find(m => m.id === id);
    const next = current.filter(m => m.id !== id);
    commitSavedList(next);
    setDeleteTargetId(null);

    if (deleteObsScene && mv && dockObsClient.isConnected) {
      dockObsClient.call("RemoveScene", { sceneName: mv.obsSceneName }).catch(() => { });
    }

    showFeedback("success", t('common.delete'));
  }, [commitSavedList, showFeedback, t]);

  const handleDelete = useCallback((id: string) => {
    setDeleteTargetId(id);
  }, []);

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

    const legacySourceSlot = layout.slots.find(slot => mv.assignments[slot.id] && mv.slotModes?.[slot.id] === "source");
    if (legacySourceSlot) {
      showFeedback("error", t('multiview.sourcesNoLongerSupported', 'Replace source assignments with OBS scenes before pushing.'));
      return;
    }

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
        // A managed source can change type when the user switches a card from
        // color/image/video to a pattern (or back). OBS does not allow
        // SetInputSettings to change the input kind, so remove only this
        // uniquely-named MCE input before recreating it with the new kind.
        try {
          const inputList = await dockObsClient.call("GetInputList") as {
            inputs?: Array<{ inputName: string; inputKind?: string }>;
          };
          const existingInput = inputList.inputs?.find((input) => input.inputName === inputName);
          if (existingInput?.inputKind && existingInput.inputKind !== inputKind) {
            await dockObsClient.call("RemoveInput", { inputName });
          }
        } catch {
          // CreateInput's existing-source fallback below still handles older
          // OBS bridges that do not expose input metadata.
        }

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
      const entries: Array<{ slotId: string; sceneItemId: number; zIndex: number; sourceSize?: SourceSize }> = [];

      // Background (always zIndex 0) — skip when transparent/effectively none
      const bg = getMvBg(mv);
      const bgSourceName = `${prefix}BACKGROUND`;
      const isBgEmpty = (bg.type === "color" && (bg.color === "transparent" || bg.color === "#0F172A"))
        || (bg.type === "scene" && !bg.sceneName)
        || (bg.type === "pattern" && !bg.patternSrc)
        || ((bg.type === "image" || bg.type === "video") && !bg.filePath);
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
            inputSettings = { local_file: bg.filePath, is_local_file: true, looping: true, restart_on_activate: true, close_when_inactive: true };
          } else if (bg.type === "pattern" && bg.patternSrc) {
            // SVG is not consistently rendered by OBS's native image source.
            // Keep the pattern in memory and let Browser Source render it so
            // the selected pattern is visible without creating user media.
            inputKind = "browser_source";
            inputSettings = {
              url: buildMultiviewPatternBrowserUrl(bg.patternSrc),
              width: CANVAS_W,
              height: CANVAS_H,
              css: "",
              bgcolor: "#00000000",
              shutdown: false,
              restart_when_active: false,
            };
          }
          bgItemId = await createManagedItem(bgSourceName, inputKind, inputSettings);
        }
        if (bgItemId >= 0) entries.push({ slotId: "bg", sceneItemId: bgItemId, zIndex: 0 });
      } catch { /* non-critical */ }

      // Slots — add assigned scenes directly as scene items (scenes are sources in OBS)
      for (const slot of layout.slots) {
        const assigned = mv.assignments[slot.id];
        if (!assigned) continue;
        const assignedMode = mv.slotModes?.[slot.id] ?? "scene";
        try {
          const created = await dockObsClient.call("CreateSceneItem", {
            sceneName, sourceName: assigned, sceneItemEnabled: true,
          }) as { sceneItemId: number };
          if (created.sceneItemId >= 0) {
            const sourceSize = await getSceneItemSourceSize(sceneName, created.sceneItemId);
            entries.push({ slotId: slot.id, sceneItemId: created.sceneItemId, zIndex: slot.zIndex ?? 1, sourceSize });
          }
        } catch (err) {
          console.warn("[DockMultiview] slot push failed for", { slotId: slot.id, assigned, mode: assignedMode, err });
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
          const framing = mv.slotFraming?.[entry.slotId] ?? DEFAULT_SLOT_FRAMING;
          const sourceSize = entry.sourceSize ?? normalizeSourceSize();
          const tx = calculateSlotTransform(
            sourceSize.width, sourceSize.height,
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
              scaleX: tx.scaleX ?? tx.scale,
              scaleY: tx.scaleY ?? tx.scale,
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

      showFeedback("success", `"${sceneName}" previewed in OBS`);
      refreshObsScenes({ forceThumbnails: true });
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : t('multiview.previewFailed', 'Preview failed'));
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
      refreshObsScenes({ forceThumbnails: true });
    } catch { /* ignore */ }
    finally { if (mountedRef.current) setClearingId(null); }
  }, [refreshObsScenes, showFeedback]);

  // ════════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════════

  const deleteTarget = deleteTargetId ? savedList.find(m => m.id === deleteTargetId) : null;
  const multiviewEntitlement = checkEntitlementSync("multiview", dockPlan);

  if (!multiviewEntitlement.allowed) {
    return (
      <div className="dock-mv-tab" role="status">
        <div style={{ padding: "32px 20px", textAlign: "center" }}>
          <Icon name="lock" size={36} />
          <div style={{ fontSize: 14, fontWeight: 700, margin: "14px 0 8px" }}>
            {t("upgrade.multiviewRequired", "Multi-View requires Basic plan or higher")}
          </div>
          <div style={{ fontSize: 11, color: "var(--dock-text-dim)", lineHeight: 1.5, marginBottom: 18 }}>
            {t("upgrade.multiviewDescription", "Build broadcast layouts with multiple camera, scripture, and media views.")}
          </div>
          <button
            type="button"
            className="dock-btn dock-btn--primary dock-btn--sm"
            onClick={() => showUpgradeModal(t("upgrade.multiviewRequiredMessage", "Upgrade to Basic or higher to enable Multi-View."))}
          >
            <Icon name="upgrade" size={14} />
            <span>{t("upgrade.upgradePlan", "Upgrade Plan")}</span>
          </button>
        </div>
      </div>
    );
  }

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
            onAssignSlotFraming={handleAssignSlotFraming}
            onClearSlot={handleRemoveSlot}
            onUpdateFrame={handleUpdateFrame}
            onUpdateFrameThickness={handleUpdateFrameThickness}
            onUpdateFrameCornerRadius={handleUpdateFrameCornerRadius}
            onUpdateFrameOpacity={handleUpdateFrameOpacity}
            onUpdateFrameColor={handleUpdateFrameColor}
            onUpdateSlotFrame={handleUpdateSlotFrame}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
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

export default memo(DockMultiviewTab);
