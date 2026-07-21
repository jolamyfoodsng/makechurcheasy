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

import { useState, useEffect, useCallback, useRef } from "react";
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

const DEFAULT_MV_BG: MVBackground = { type: "color", color: "#0F172A", filePath: "", sceneName: "" };

interface SavedMultiView {
  id: string;
  name: string;
  /** Stable OBS scene name — one scene per card, never derived from template */
  obsSceneName: string;
  layoutId: string;
  assignments: Record<string, string>;
  slotModes: Record<string, "scene" | "source">;
  slotFraming: Record<string, { displayMode: "fill" | "fit" | "custom"; zoom: number; focalX: number; focalY: number }>;
  background: MVBackground;
  createdAt: string;
  updatedAt: string;
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

function saveSaved(items: SavedMultiView[]) {
  try {
    localStorage.setItem(getUserScopedKey(STORAGE_KEY), JSON.stringify(items));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function LayoutMiniPreview({ layout }: { layout: GalleryLayout }) {
  return (
    <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="dock-mv-layout-preview">
      <rect width={CANVAS_W} height={CANVAS_H} fill="#111" />
      {layout.slots.map((slot) => {
        const info = CONTENT_TYPE_INFO[slot.contentType] || CONTENT_TYPE_INFO.camera;
        return (
          <g key={slot.id}>
            <rect x={slot.x} y={slot.y} width={slot.width} height={slot.height} fill={info.color} opacity={0.4} />
            <rect x={slot.x} y={slot.y} width={slot.width} height={slot.height} fill="none" stroke={info.color} strokeWidth={2} opacity={0.6} />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Content Picker Modal
// ---------------------------------------------------------------------------

function ContentPicker({
  open,
  obsScenes,
  obsSources,
  onSelect,
  onClose,
}: {
  open: boolean;
  obsScenes: string[];
  obsSources: string[];
  onSelect: (value: string, mode: "scene" | "source") => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"scene" | "source">("scene");
  const [query, setQuery] = useState("");

  if (!open) return null;

  const scenes = obsScenes.filter(s => !query || s.toLowerCase().includes(query.toLowerCase()));
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
        <div className="dock-mv-content-picker__list">
          {items.length === 0 ? (
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

  const hasBg = background.type !== "color" || background.color !== "#0F172A" || background.filePath || background.sceneName;

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

  return (
    <div className="dock-mv-bg">
      <div className="dock-mv-bg__header">
        <span>{t('multiview.background')}</span>
      </div>
      <div className="dock-mv-bg__types">
        {BG_TYPE_OPTIONS.map(opt => (
          <button
            key={opt.type}
            type="button"
            className={`dock-mv-bg__type-btn${background.type === opt.type ? " dock-mv-bg__type-btn--active" : ""}`}
            onClick={() => onChange({ ...background, type: opt.type })}
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>

      {background.type === "color" && (
        <div className="dock-mv-bg__row">
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

      {background.type === "image" && (
        <div className="dock-mv-bg__row">
          <input
            className="dock-mv-bg__path-input"
            type="text"
            value={background.filePath}
            onChange={(e) => onChange({ ...background, filePath: e.target.value })}
            placeholder={t('multiview.absolutePathPlaceholder')}
          />
          <button
            type="button"
            className="dock-mv-bg__browse-btn"
            onClick={() => imgInputRef.current?.click()}
            title={t('multiview.browseAndUpload')}
            disabled={uploading}
          >
            {uploading ? <Icon name="hourglass_top" size={13} /> : <Icon name="folder_open" size={13} />}
          </button>
          <input
            ref={imgInputRef}
            type="file"
            accept="image/*"
            className="dock-mv-bg__file-hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileUpload(f, "image");
              e.target.value = "";
            }}
          />
        </div>
      )}

      {background.type === "video" && (
        <div className="dock-mv-bg__row">
          <input
            className="dock-mv-bg__path-input"
            type="text"
            value={background.filePath}
            onChange={(e) => onChange({ ...background, filePath: e.target.value })}
            placeholder={t('multiview.absolutePathPlaceholder')}
          />
          <button
            type="button"
            className="dock-mv-bg__browse-btn"
            onClick={() => vidInputRef.current?.click()}
            title={t('multiview.browseAndUpload')}
            disabled={uploading}
          >
            {uploading ? <Icon name="hourglass_top" size={13} /> : <Icon name="folder_open" size={13} />}
          </button>
          <input
            ref={vidInputRef}
            type="file"
            accept="video/*"
            className="dock-mv-bg__file-hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileUpload(f, "video");
              e.target.value = "";
            }}
          />
        </div>
      )}

      {background.type === "scene" && (
        <div className="dock-mv-bg__row">
          <select
            className="dock-mv-bg__select"
            value={background.sceneName}
            onChange={(e) => onChange({ ...background, sceneName: e.target.value })}
          >
            <option value="">— {t('multiview.selectScene')} —</option>
            {obsScenes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
  const handlePickerChange = useCallback((event: ChangeEvent<HTMLInputElement>, type: "image" | "video") => {
    const file = event.target.files?.[0];
    if (file) void handleFileUpload(file, type);
    event.target.value = "";
  }, [handleFileUpload]);

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
                      onChange({ type: "color", color: "#0F172A", filePath: "", sceneName: "" });
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
// MV Card — one independent card per saved Multi-View
// ---------------------------------------------------------------------------

function MVCard({
  mv,
  index,
  isActive,
  obsScenes,
  obsSources,
  addedLayouts,
  pushingId,
  clearingId,
  onPush,
  onClear,
  onUpdateName,
  onUpdateLayout,
  onUpdateBackground,
  onAssign,
  onAssignSlotMode,
  onAssignSlotFraming,
  onClearSlot,
  onDuplicate,
  onDelete,
}: {
  mv: SavedMultiView;
  index: number;
  isActive: boolean;
  obsScenes: string[];
  obsSources: string[];
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
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(mv.name);
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);
  const [framingSlot, setFramingSlot] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const layout = resolveLayout(mv.layoutId);
  const assignedCount = Object.values(mv.assignments).filter(Boolean).length;
  const allSlotsFilled = !!layout && assignedCount >= layout.slots.length;
  const isPushing = pushingId === mv.id;
  const isClearing = clearingId === mv.id;

  // Close menu on outside click
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

  const handleRenameSubmit = () => {
    const name = renameValue.trim();
    if (name && name !== mv.name) {
      onUpdateName(mv.id, name);
    }
    setRenaming(false);
  };

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
          {renaming ? (
            <form
              className="dock-mv-card__rename"
              onSubmit={(e) => { e.preventDefault(); handleRenameSubmit(); }}
            >
              <input
                className="dock-mv-card__rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                onBlur={handleRenameSubmit}
                onClick={(e) => e.stopPropagation()}
              />
            </form>
          ) : (
            <span className="dock-mv-card__name">
              {mv.name}
              {isActive && <span className="dock-mv-card__badge">{t('multiview.on')}</span>}
            </span>
          )}
          <span className="dock-mv-card__id">{shortId(index)}</span>
        </div>

        {/* Card Actions Menu */}
        <div className="dock-mv-card__menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="dock-mv-card__menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            title={t('multiview.actions')}
          >
            <Icon name="more_vert" size={14} />
          </button>
          {menuOpen && (
            <div className="dock-mv-card__menu">
              <button
                type="button"
                className="dock-mv-card__menu-item"
                onClick={() => { setRenaming(true); setRenameValue(mv.name); setMenuOpen(false); }}
                title={t('common.rename')}>
                <Icon name="drive_file_rename_outline" size={13} />
                <span>{t('multiview.rename')}</span>
              </button>
              <button
                type="button"
                className="dock-mv-card__menu-item"
                onClick={() => { onDuplicate(mv.id); setMenuOpen(false); }}
                title={t('common.duplicate')}>
                <Icon name="content_copy" size={13} />
                <span>{t('multiview.duplicate')}</span>
              </button>
              <div className="dock-mv-card__menu-divider" />
              <button
                type="button"
                className="dock-mv-card__menu-item dock-mv-card__menu-item--danger"
                onClick={() => { onDelete(mv.id); setMenuOpen(false); }}
                title={t('common.delete')}>
                <Icon name="delete" size={13} />
                <span>{t('multiview.delete')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Template Dropdown */}
      <div className="dock-mv-card__template">
        <label className="dock-mv-card__template-label">{t('multiview.template')}</label>
      {/* Template — compact property row */}
      <div className="dock-mv-property">
        <span className="dock-mv-property__label">{t('multiview.template')}</span>
        <div className="dock-mv-property__row">
          {layout && <span className="dock-mv-property__value">{layout.name}</span>}
          {!layout && <span className="dock-mv-property__value dock-mv-property__value--empty">{t('multiview.noTemplate')}</span>}
          <button
            type="button"
            className="dock-mv-property__action"
            onClick={(e) => {
              const select = (e.currentTarget.parentElement?.parentElement as HTMLElement)
                ?.querySelector<HTMLSelectElement>('.dock-mv-property__select');
              select?.classList.toggle('dock-mv-property__select--visible');
            }}
          >
            {t('multiview.change')}
          </button>
        </div>
        <select
          className="dock-mv-property__select"
          value={mv.layoutId}
          onChange={(e) => {
            onUpdateLayout(mv.id, e.target.value);
            (e.currentTarget as HTMLElement).classList.remove('dock-mv-property__select--visible');
          }}
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
      {layout && <LayoutMiniPreview layout={layout} />}

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
                  onSelect={(v, m) => handleContentSelect(slot.id, v, m)}
                  onClose={() => setPickerSlot(null)}
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
            {layout.slots.map((slot) => {
              const val = mv.assignments[slot.id] ?? "";
              const info = CONTENT_TYPE_INFO[slot.contentType] || CONTENT_TYPE_INFO.camera;
              return (
                <div key={slot.id} className="dock-mv-assign-row">
                  <div className="dock-mv-assign-row__label">
                    <SlotTypeIcon contentType={slot.contentType} />
                    <span className="dock-mv-assign-row__name">{slot.label}</span>
                    <span className="dock-mv-assign-row__type">{t(info.labelKey)}</span>
                  </div>
                  <SlotControl
                    slot={slot}
                    value={val}
                    onChange={(v) => onAssign(mv.id, slot.id, v)}
                    onClear={() => onClearSlot(mv.id, slot.id)}
                    obsScenes={obsScenes}
                  />
                </div>
              );
            })}
          </div>
        </>
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
  const [hasMvScene, setHasMvScene] = useState(false);
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [obsSources, setObsSources] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const obsScanBusyRef = useRef(false);

  // Derived: when the shared MV scene exists all gallery layouts are available
  const addedLayouts = hasMvScene ? GALLERY_LAYOUTS : [];

  // ── Load saved list (auto-seed two cards if empty) ──
  useEffect(() => {
    let list = loadSaved();
    // Migrate old data: cards without obsSceneName get one assigned
    let migrated = false;
    list = list.map((m, i) => {
      if (!m.obsSceneName) {
        migrated = true;
        return { ...m, obsSceneName: `MV: Multiview ${i + 1}` };
      }
      return m;
    });
    if (list.length === 0) {
      const now = new Date().toISOString();
      const defaultMv1: SavedMultiView = {
        id: genId(),
        name: `${t('multiview.title')} 1`,
        obsSceneName: "MV: Multiview 1",
        layoutId: GALLERY_LAYOUTS[0]?.id ?? "",
        assignments: {},
        slotModes: {},
        slotFraming: {},
        background: { ...DEFAULT_MV_BG },
        createdAt: now,
        updatedAt: now,
      };
      const defaultMv2: SavedMultiView = {
        id: genId(),
        name: `${t('multiview.title')} 2`,
        obsSceneName: "MV: Multiview 2",
        layoutId: GALLERY_LAYOUTS[0]?.id ?? "",
        assignments: {},
        slotModes: {},
        slotFraming: {},
        background: { ...DEFAULT_MV_BG },
        createdAt: now,
        updatedAt: now,
      };
      list = [defaultMv1, defaultMv2];
      saveSaved(list);
    } else if (migrated) {
      saveSaved(list);
    }
    setSavedList(list);
  }, []);

  const obsReady = useDockObsReady();

  // ── Single GetSceneList + GetInputList call ──
  const refreshObsScenes = useCallback(async () => {
    if (!mountedRef.current) { console.log("[MV] refreshObsScenes bailed — not mounted"); return; }
    if (obsScanBusyRef.current) { console.log("[MV] refreshObsScenes bailed — scan busy"); return; }
    obsScanBusyRef.current = true;
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
      setHasMvScene(scenes.some(s => /^MV: Multiview \d+$/.test(s.sceneName)));
      setObsScenes(scenes.map(s => s.sceneName));
      setObsSources(inputs.map(i => i.inputName));
    } catch (err) {
      console.warn("[MV] refreshObsScenes FAILED", err);
    } finally {
      obsScanBusyRef.current = false;
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
    const next = savedList.map(m => {
      if (m.id !== id) return m;
      return { ...m, assignments: { ...m.assignments, [slotId]: val }, updatedAt: new Date().toISOString() };
    });
    setSavedList(next);
    saveSaved(next);
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

  const handleAddCard = useCallback(() => {
    const now = new Date().toISOString();
    const card: SavedMultiView = {
      id: genId(),
      name: `${t('multiview.title')} ${savedList.length + 1}`,
      obsSceneName: nextObsSceneName(savedList),
      layoutId: GALLERY_LAYOUTS[0]?.id ?? "",
      assignments: {},
      slotModes: {},
      slotFraming: {},
      background: { ...DEFAULT_MV_BG },
      createdAt: now,
      updatedAt: now,
    };
    const next = [card, ...savedList];
    setSavedList(next);
    saveSaved(next);
    showFeedback("success", `"${card.name}" added`);
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

      // ── Phase 0: Remove only DeckPilot-managed items from this scene ──
      try {
        const existing = await dockObsClient.call("GetSceneItemList", { sceneName }) as {
          sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
        };
        for (const item of existing.sceneItems ?? []) {
          if (!item.sourceName?.startsWith(prefix)) continue;
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
        } catch {
          await dockObsClient.call("SetInputSettings", { inputName, inputSettings }).catch(() => { });
          try {
            const existing = await dockObsClient.call("GetSceneItemId", { sceneName, sourceName: inputName }) as { sceneItemId: number };
            return existing.sceneItemId;
          } catch {
            await dockObsClient.call("AddSceneItem", { sceneName, sourceName: inputName }).catch(() => { });
            const existing = await dockObsClient.call("GetSceneItemId", { sceneName, sourceName: inputName }) as { sceneItemId: number };
            return existing.sceneItemId;
          }
        }
      };

      // ── Phase 1: Create / find all managed scene items ──────────────────
      const entries: Array<{ slotId: string; sceneItemId: number; zIndex: number }> = [];

      // Background (always zIndex 0)
      const bg = getMvBg(mv);
      const bgSourceName = `${prefix}BACKGROUND`;
      try {
        let bgItemId = -1;
        if (bg.type === "scene" && bg.sceneName) {
          bgItemId = await createManagedItem(bgSourceName, "scene_capture_source", { scene: bg.sceneName });
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

      // Slots — always use scene_capture_source with managed naming
      for (const slot of layout.slots) {
        const assigned = mv.assignments[slot.id];
        if (!assigned) continue;
        const slotSourceName = `${prefix}SLOT-${slot.id}`;
        try {
          const existing = await dockObsClient.call("GetSceneItemId", { sceneName, sourceName: assignedScene }) as { sceneItemId: number };
          itemId = existing.sceneItemId;
        } catch {
          try {
            await ensureScene(assignedScene);
            const resp = await dockObsClient.call("CreateSceneItem", { sceneName, sourceName: assignedScene, sceneItemEnabled: true }) as { sceneItemId: number };
            itemId = resp.sceneItemId;
          } catch { /* skip */ }
        }
        if (itemId > 0) {
          await dockObsClient.animateSceneItemWithMove(sceneName, itemId, slot.x, slot.y, slot.width, slot.height);
        }
      }

      try { await dockObsClient.call("SetCurrentPreviewScene", { sceneName }); } catch { }
          const itemId = await createManagedItem(slotSourceName, "scene_capture_source", { scene: assigned });
          if (itemId >= 0) {
            entries.push({ slotId: slot.id, sceneItemId: itemId, zIndex: slot.zIndex ?? 1 });
          }
        } catch { /* skip */ }
      }

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

      await setPreviewSceneWithRetry(sceneName);

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
      {/* ── Header ── */}
      <div className="dock-mv-tab__header">
        <div className="dock-mv-tab__title-row">
          <Icon name="grid_view" size={16} />
          <span className="dock-mv-tab__title">{t('multiview.title')}</span>
          {savedList.length > 0 && (
            <span className="dock-mv-tab__count">{savedList.length}</span>
          )}
          <button type="button" className="dock-btn dock-btn--sm dock-btn--ghost" onClick={handleAddCard} title={t('multiview.addView')}>
            <Icon name="add" size={14} />
          </button>
        </div>
      </div>

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
        {savedList.length === 0 ? (
          <div className="dock-mv-tab__empty">
            <Icon name="grid_view" size={28} />
            <span className="dock-mv-tab__empty-title">{t('multiview.noViews')}</span>
            <span className="dock-mv-tab__empty-text">
              {t('common.add')} — {t('multiview.addView')}
            </span>
          </div>
        ) : (
          savedList.map((mv, idx) => (
            <MVCard
              key={mv.id}
              mv={mv}
              index={idx}
              isActive={obsScenes.includes(mv.obsSceneName)}
              obsScenes={obsScenes}
              obsSources={obsSources}
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
              onDuplicate={handleDuplicate}
              onDelete={(id) => setDeleteTargetId(id)}
            />
          ))
        )}
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
