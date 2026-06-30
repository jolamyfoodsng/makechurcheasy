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
import { useTranslation } from "react-i18next";
import { dockObsClient } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import { useDockObsReady } from "../useDockObsReady";
import Icon from "../DockIcon";
import { requireEntitlement } from "../dockEntitlement";
import { getUserScopedKey } from "../../services/userScopedStorage";
import { GALLERY_LAYOUTS, type GalleryLayout, type GallerySlot } from "../../multiview/galleryLayouts";
import { saveToDisk, getSafeFileName } from "../dockUploadService";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "dock-mv-saved";
const CANVAS_W = 1920;
const CANVAS_H = 1080;

const CONTENT_TYPE_INFO: Record<string, { label: string; icon: string; color: string }> = {
  camera: { label: "Camera", icon: "videocam", color: "#0078d4" },
  scripture: { label: "Scripture", icon: "menu_book", color: "#3B82F6" },
  translation: { label: "Translation", icon: "translate", color: "#00bcd4" },
  "lower-third": { label: "Lower Third", icon: "subtitles", color: "#ff9800" },
  browser: { label: "Browser", icon: "language", color: "#ff5722" },
  image: { label: "Image", icon: "image", color: "#9c27b0" },
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
  layoutId: string;
  assignments: Record<string, string>;
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
  const info = CONTENT_TYPE_INFO[contentType] || CONTENT_TYPE_INFO.camera;
  return (
    <span className="dock-mv-slot-icon" style={{ color: info.color }} title={info.label}>
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
// SlotControl — renders type-appropriate input per slot content type
// ---------------------------------------------------------------------------

function SlotControl({
  slot,
  value,
  onChange,
  onClear,
  obsScenes,
}: {
  slot: GallerySlot;
  value: string;
  onChange: (val: string) => void;
  onClear: () => void;
  obsScenes: string[];
}) {
  const { t } = useTranslation();
  if (isSceneType(slot.contentType)) {
    return (
      <div className="dock-mv-assign-row__control">
        <select
          className="dock-mv-assign-row__select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— {t('multiview.selectScene')} —</option>
          {obsScenes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {value && (
          <button type="button" className="dock-mv-assign-row__clear" onClick={onClear} title={t('common.clear')}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
    );
  }

  if (slot.contentType === "browser") {
    return (
      <div className="dock-mv-assign-row__control">
        <input
          className="dock-mv-assign-row__input"
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('multiview.urlPlaceholder')}
        />
        {value && (
          <button type="button" className="dock-mv-assign-row__clear" onClick={onClear} title={t('common.clear')}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
    );
  }

  if (slot.contentType === "image") {
    return (
      <div className="dock-mv-assign-row__control">
        <input
          className="dock-mv-assign-row__input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('multiview.imagePathPlaceholder')}
        />
        {value && (
          <button type="button" className="dock-mv-assign-row__clear" onClick={onClear} title={t('common.clear')}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="dock-mv-assign-row__control">
      <input
        className="dock-mv-assign-row__input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('multiview.value')}
      />
      {value && (
        <button type="button" className="dock-mv-assign-row__clear" onClick={onClear} title={t('common.clear')}>
          <Icon name="close" size={12} />
        </button>
      )}
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
          <button type="button" className="dock-btn dock-btn--sm" onClick={onCancel} title="Cancel">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="dock-btn dock-btn--sm dock-btn--danger"
            onClick={() => onConfirm(deleteObs)}
           title="Delete">
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Background Picker — compact background type selector per card
// ---------------------------------------------------------------------------

const BG_TYPE_OPTIONS: Array<{ type: MVBgType; label: string }> = [
  { type: "color", label: "Color" },
  { type: "image", label: "Image" },
  { type: "video", label: "Video" },
  { type: "scene", label: "Scene" },
];

function BackgroundPicker({
  background,
  onChange,
  obsScenes,
}: {
  background: MVBackground;
  onChange: (bg: MVBackground) => void;
  obsScenes: string[];
}) {
  const { t } = useTranslation();
  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const bgTypeLabels: Record<MVBgType, string> = {
    color: t('multiview.color'),
    image: t('multiview.image'),
    video: t('multiview.video'),
    scene: t('multiview.scene'),
  };

  const handleFileUpload = useCallback(async (file: File, type: "image" | "video") => {
    setUploading(true);
    try {
      const safeName = getSafeFileName(`mv-bg-${Date.now()}-${file.name}`);
      const diskPath = await saveToDisk(file, safeName);
      onChange({ ...background, type, filePath: diskPath });
    } catch (err) {
      console.error("[MV Background] Failed to save file:", err);
      // Fallback: store the filename as-is
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
            {bgTypeLabels[opt.type]}
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
  addedLayouts,
  pushingId,
  clearingId,
  onPush,
  onClear,
  onUpdateName,
  onUpdateLayout,
  onUpdateBackground,
  onAssign,
  onClearSlot,
  onDuplicate,
  onDelete,
}: {
  mv: SavedMultiView;
  index: number;
  isActive: boolean;
  obsScenes: string[];
  addedLayouts: GalleryLayout[];
  pushingId: string | null;
  clearingId: string | null;
  onPush: (mv: SavedMultiView) => void;
  onClear: (mv: SavedMultiView) => void;
  onUpdateName: (id: string, name: string) => void;
  onUpdateLayout: (id: string, layoutId: string) => void;
  onUpdateBackground: (id: string, bg: MVBackground) => void;
  onAssign: (id: string, slotId: string, val: string) => void;
  onClearSlot: (id: string, slotId: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(mv.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const layout = resolveLayout(mv.layoutId);
  const assignedCount = Object.values(mv.assignments).filter(Boolean).length;
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
               title="Rename">
                <Icon name="drive_file_rename_outline" size={13} />
                <span>{t('multiview.rename')}</span>
              </button>
              <button
                type="button"
                className="dock-mv-card__menu-item"
                onClick={() => { onDuplicate(mv.id); setMenuOpen(false); }}
               title="Duplicate">
                <Icon name="content_copy" size={13} />
                <span>{t('multiview.duplicate')}</span>
              </button>
              <div className="dock-mv-card__menu-divider" />
              <button
                type="button"
                className="dock-mv-card__menu-item dock-mv-card__menu-item--danger"
                onClick={() => { onDelete(mv.id); setMenuOpen(false); }}
               title="Delete">
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
        <select
          className="dock-mv-field__select"
          value={mv.layoutId}
          onChange={(e) => onUpdateLayout(mv.id, e.target.value)}
        >
          {addedLayouts.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
          {!addedLayouts.some(l => l.id === mv.layoutId) && layout && (
            <option key={layout.id} value={layout.id}>{layout.name}</option>
          )}
        </select>
      </div>

      {/* Background Picker */}
      <BackgroundPicker
        background={getMvBg(mv)}
        onChange={(bg) => onUpdateBackground(mv.id, bg)}
        obsScenes={obsScenes}
      />

      {/* Slot Config — shown when layout is selected */}
      {layout && (
        <>
          <div className="dock-mv-card__preview">
            <LayoutMiniPreview layout={layout} />
          </div>

          <div className="dock-mv-assign-section">
            <div className="dock-mv-assign-header">
              <Icon name="videocam" size={13} />
              <span>{t('multiview.sceneAssignments')}</span>
              <span className="dock-mv-assign-count">
                {assignedCount}/{layout.slots.length}
              </span>
            </div>
            {layout.slots.map((slot) => {
              const val = mv.assignments[slot.id] ?? "";
              const info = CONTENT_TYPE_INFO[slot.contentType] || CONTENT_TYPE_INFO.camera;
              return (
                <div key={slot.id} className="dock-mv-assign-row">
                  <div className="dock-mv-assign-row__label">
                    <SlotTypeIcon contentType={slot.contentType} />
                    <span className="dock-mv-assign-row__name">{slot.label}</span>
                    <span className="dock-mv-assign-row__type">{info.label}</span>
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
      )}

      {/* Push to OBS — per card */}
      <div className="dock-mv-card__actions">
        <button
          type="button"
          className={`dock-btn dock-btn--sm ${isPushing ? "dock-btn--loading" : "dock-btn--primary"}`}
          onClick={() => onPush(mv)}
          disabled={isPushing || isClearing}
          style={{ flex: 1 }}
         title="Pushing">
          <Icon name="cast" size={14} />
          <span>{isPushing ? t('multiview.pushing') : t('multiview.pushToObs')}</span>
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
           title="Clearing">
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
  const [activeNames, setActiveNames] = useState<Set<string>>(new Set());
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Derived: layouts that exist as OBS scenes (MV: Name) — these are "Added to OBS"
  const addedLayouts = GALLERY_LAYOUTS.filter(l => activeNames.has(l.name));

  // ── Load saved list ──
  useEffect(() => {
    setSavedList(loadSaved());
  }, []);

  const obsReady = useDockObsReady();

  // ── Scan OBS for active MV scenes ──
  const scanObs = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const resp = await dockObsClient.call("GetSceneList") as { scenes: Array<{ sceneName: string }> };
      const mvNames = (resp.scenes ?? [])
        .filter(s => s.sceneName.startsWith("MV: "))
        .map(s => s.sceneName.replace("MV: ", ""));
      if (mountedRef.current) setActiveNames(new Set(mvNames));
    } catch {
      if (mountedRef.current) setActiveNames(new Set());
    }
  }, []);

  // ── Fetch OBS scene list for dropdowns ──
  const fetchScenes = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const resp = await dockObsClient.call("GetSceneList") as { scenes: Array<{ sceneName: string }> };
      if (mountedRef.current) setObsScenes(resp.scenes?.map(s => s.sceneName) ?? []);
    } catch {
      if (mountedRef.current) setObsScenes([]);
    }
  }, []);

  useEffect(() => {
    if (!obsReady) return;
    mountedRef.current = true;
    scanObs();
    fetchScenes();
    const interval = setInterval(() => {
      if (mountedRef.current) { scanObs(); fetchScenes(); }
    }, 5000);
    return () => { mountedRef.current = false; clearInterval(interval); };
  }, [obsReady, scanObs, fetchScenes]);

  // ── Show feedback briefly ──
  const showFeedback = useCallback((type: "success" | "error", text: string) => {
    setFeedback({ type, text });
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => { if (mountedRef.current) setFeedback(null); }, 3000);
  }, []);

  // ════════════════════════════════════════════════════════════════════════
  // CRUD Operations
  // ════════════════════════════════════════════════════════════════════════

  const handleAdd = useCallback(() => {
    const now = new Date().toISOString();
    const mv: SavedMultiView = {
      id: genId(),
      name: `Multi-View ${savedList.length + 1}`,
      layoutId: GALLERY_LAYOUTS[0]?.id ?? "",
      assignments: {},
      background: { ...DEFAULT_MV_BG },
      createdAt: now,
      updatedAt: now,
    };
    const next = [mv, ...savedList];
    setSavedList(next);
    saveSaved(next);
    showFeedback("success", t('multiview.newCreated'));
  }, [savedList, showFeedback, t]);

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

  const handleClearSlot = useCallback((id: string, slotId: string) => {
    const next = savedList.map(m => {
      if (m.id !== id) return m;
      const assigns = { ...m.assignments };
      delete assigns[slotId];
      return { ...m, assignments: assigns, updatedAt: new Date().toISOString() };
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
      name: `${src.name} (Copy)`,
      assignments: { ...src.assignments },
      background: { ...(src.background ?? DEFAULT_MV_BG) },
      createdAt: now,
      updatedAt: now,
    };
    const next = [dupe, ...savedList];
    setSavedList(next);
    saveSaved(next);
    showFeedback("success", `"${dupe.name}" created`);
  }, [savedList, showFeedback]);

  const handleDeleteConfirmed = useCallback((id: string, deleteObsScene: boolean) => {
    const mv = savedList.find(m => m.id === id);
    const next = savedList.filter(m => m.id !== id);
    setSavedList(next);
    saveSaved(next);
    setDeleteTargetId(null);

    if (deleteObsScene && mv && dockObsClient.isConnected) {
      const sceneName = `MV: ${mv.name}`;
      dockObsClient.call("RemoveScene", { sceneName }).catch(() => { });
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
      const sceneName = `MV: ${mv.name}`;
      await ensureScene(sceneName);

      // Background
      const bgName = `MV_${mv.name.replace(/[^a-zA-Z0-9 _-]/g, "").trim()}_BG`;
      const bg = getMvBg(mv);
      try {
        const inputs = await dockObsClient.call("GetInputList") as { inputs: Array<{ inputName: string }> };
        const exists = inputs.inputs?.some(i => i.inputName === bgName);

        // Determine source kind + settings based on background type
        let inputKind = "color_source_v3";
        let inputSettings: Record<string, unknown> = { color: cssColorToObsInt(bg.color || "#0F172A"), width: CANVAS_W, height: CANVAS_H };

        if (bg.type === "image" && bg.filePath) {
          inputKind = "image_source";
          inputSettings = { file: bg.filePath, width: CANVAS_W, height: CANVAS_H };
        } else if (bg.type === "video" && bg.filePath) {
          inputKind = "ffmpeg_source";
          inputSettings = { local_file: bg.filePath, is_local_file: true, looping: true, restart_on_activate: true, close_when_inactive: false };
        } else if (bg.type === "scene" && bg.sceneName) {
          // Scene background — add scene as a source item directly
          inputKind = "";  // skip CreateInput, handled below
        }

        if (bg.type === "scene" && bg.sceneName) {
          // For scene background, ensure the scene source is in our MV scene
          let sceneItemId = -1;
          try {
            const existing = await dockObsClient.call("GetSceneItemId", { sceneName, sourceName: bg.sceneName }) as { sceneItemId: number };
            sceneItemId = existing.sceneItemId;
          } catch {
            try {
              const resp = await dockObsClient.call("CreateSceneItem", { sceneName, sourceName: bg.sceneName, sceneItemEnabled: true }) as { sceneItemId: number };
              sceneItemId = resp.sceneItemId;
            } catch { /* skip */ }
          }
          if (sceneItemId >= 0) {
            await dockObsClient.call("SetSceneItemTransform", {
              sceneName,
              sceneItemId,
              sceneItemTransform: {
                positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0,
                boundsType: "OBS_BOUNDS_STRETCH", boundsWidth: CANVAS_W, boundsHeight: CANVAS_H,
                boundsAlignment: 0, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0,
              },
            });
            await dockObsClient.call("SetSceneItemIndex", { sceneName, sceneItemId, sceneItemIndex: 0 }).catch(() => { });
          }
        } else if (exists) {
          // Source exists — update settings and ensure it's in the scene
          await dockObsClient.call("SetInputSettings", { inputName: bgName, inputSettings }).catch(() => { });
          await dockObsClient.call("AddSceneItem", { sceneName, sourceName: bgName }).catch(() => { });
        } else {
          // Create new background source
          const resp = await dockObsClient.call("CreateInput", {
            sceneName,
            inputName: bgName,
            inputKind,
            inputSettings,
          }) as { sceneItemId: number };
          if (resp.sceneItemId >= 0) {
            await dockObsClient.call("SetSceneItemTransform", {
              sceneName,
              sceneItemId: resp.sceneItemId,
              sceneItemTransform: {
                positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0,
                boundsType: "OBS_BOUNDS_STRETCH", boundsWidth: CANVAS_W, boundsHeight: CANVAS_H,
                boundsAlignment: 0, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0,
              },
            });
            await dockObsClient.call("SetSceneItemIndex", { sceneName, sceneItemId: resp.sceneItemId, sceneItemIndex: 0 }).catch(() => { });
          }
        }
      } catch { /* non-critical */ }

      // Place scenes into slots
      for (const slot of layout.slots) {
        const assignedScene = mv.assignments[slot.id];
        if (!assignedScene) continue;

        let itemId = -1;
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

      showFeedback("success", `"${sceneName}" pushed to OBS`);
      scanObs();
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : t('multiview.pushFailed'));
    } finally {
      if (mountedRef.current) setPushingId(null);
    }
  }, [ensureScene, scanObs, showFeedback, t]);

  const handleClear = useCallback(async (mv: SavedMultiView) => {
    await ensureObsConnected();
    if (!dockObsClient.isConnected) return;
    setClearingId(mv.id);
    try {
      const sceneName = `MV: ${mv.name}`;
      await dockObsClient.fadeOutAllSceneItems(sceneName).catch(() => { });

      try {
        const prog = await dockObsClient.call("GetCurrentProgramScene") as { currentProgramSceneName?: string };
        if (prog.currentProgramSceneName && prog.currentProgramSceneName !== sceneName) {
          await dockObsClient.call("SetCurrentPreviewScene", { sceneName: prog.currentProgramSceneName }).catch(() => { });
        }
      } catch { }

      try {
        const items = await dockObsClient.call("GetSceneItemList", { sceneName }) as { sceneItems: Array<{ sceneItemId: number }> };
        for (const item of items.sceneItems ?? []) {
          await dockObsClient.call("RemoveSceneItem", { sceneName, sceneItemId: item.sceneItemId }).catch(() => { });
        }
      } catch { }

      await dockObsClient.call("RemoveScene", { sceneName }).catch(() => { });

      showFeedback("success", `"${sceneName}" cleared`);
      scanObs();
    } catch { /* ignore */ }
    finally { if (mountedRef.current) setClearingId(null); }
  }, [scanObs, showFeedback]);

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
        </div>
        <div className="dock-mv-tab__actions">
          <button
            type="button"
            className="dock-btn dock-btn--sm dock-btn--primary"
            onClick={handleAdd}
            title={t('multiview.addView')}
          >
            <Icon name="add" size={14} />
            <span>{t('common.add')}</span>
          </button>
        </div>
      </div>

      {/* ── Feedback ── */}
      {feedback && (
        <div className={`dock-mv-tab__feedback dock-mv-tab__feedback--${feedback.type}`}>
          <Icon name={feedback.type === "success" ? "check_circle" : "error"} size={14} />
          <span>{feedback.text}</span>
          <button type="button" className="dock-mv-tab__feedback-close" onClick={() => setFeedback(null)} title="Close">
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
              isActive={activeNames.has(mv.name)}
              obsScenes={obsScenes}
              addedLayouts={addedLayouts}
              pushingId={pushingId}
              clearingId={clearingId}
              onPush={handlePush}
              onClear={handleClear}
              onUpdateName={handleUpdateName}
              onUpdateLayout={handleUpdateLayout}
              onUpdateBackground={handleUpdateBackground}
              onAssign={handleAssign}
              onClearSlot={handleClearSlot}
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
