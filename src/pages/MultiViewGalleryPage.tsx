/**
 * MultiViewGalleryPage.tsx — Dedicated Multi-View Layout Gallery
 *
 * Browse, preview, and add multi-view layouts to OBS.
 * Layouts are JSON-driven for easy future expansion.
 *
 * Tracks which layouts have been added to OBS via localStorage.
 * Added layouts appear under the "Added" category filter.
 */

import { useState, useMemo, useCallback } from "react";
import {
  GALLERY_LAYOUTS,
  GALLERY_CATEGORIES,
  type GalleryLayout,
  type GalleryLayoutCategory,
} from "../multiview/galleryLayouts";
import { obsService } from "../services/obsService";
import { getUserScopedKey } from "../services/userScopedStorage";
import Icon from "../components/Icon";
import "./MultiViewGalleryPage.css";

// ── Added layout tracking ──────────────────────────────────────────────────

const ADDED_IDS_KEY = "mvg-added-ids";

function loadAddedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(getUserScopedKey(ADDED_IDS_KEY));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveAddedIds(ids: Set<string>) {
  try {
    localStorage.setItem(getUserScopedKey(ADDED_IDS_KEY), JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

// ── Dock layout storage helpers ────────────────────────────────────────────

const DOCK_MV_KEY = "dock-mv-layouts";

interface DockMVLayout {
  id: string;
  name: string;
  description: string;
  regionCount: number;
  canvasLabel: string;
  updatedAt: string;
  isTemplate: boolean;
  tags: string[];
}

function loadDockLayouts(): DockMVLayout[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(DOCK_MV_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDockLayouts(items: DockMVLayout[]) {
  try {
    localStorage.setItem(getUserScopedKey(DOCK_MV_KEY), JSON.stringify(items));
  } catch { /* ignore */ }
}

// ── Slot content type → display info ───────────────────────────────────────

const CONTENT_TYPE_INFO: Record<string, { label: string; icon: string; color: string }> = {
  camera: { label: "Camera", icon: "videocam", color: "#0078d4" },
  scripture: { label: "Scripture", icon: "menu_book", color: "#6c5ce7" },
  translation: { label: "Translation", icon: "translate", color: "#00bcd4" },
  "lower-third": { label: "Lower Third", icon: "subtitles", color: "#ff9800" },
  browser: { label: "Browser", icon: "language", color: "#ff5722" },
  image: { label: "Image", icon: "image", color: "#9c27b0" },
};

// ── SVG Preview ────────────────────────────────────────────────────────────

function LayoutPreviewSVG({ layout }: { layout: GalleryLayout }) {
  const canvasW = 1920;
  const canvasH = 1080;

  return (
    <svg viewBox={`0 0 ${canvasW} ${canvasH}`} className="mvg-card-svg">
      {/* Dark background */}
      <rect width={canvasW} height={canvasH} fill="#111" />

      {/* Slots */}
      {layout.slots.map((slot) => {
        const info = CONTENT_TYPE_INFO[slot.contentType] || CONTENT_TYPE_INFO.camera;
        const fontSize = slot.width > 400 && slot.height > 200 ? 28 : 16;
        const labelY = slot.y + slot.height / 2 + fontSize * 0.35;
        const labelX = slot.x + slot.width / 2;

        return (
          <g key={slot.id}>
            <rect
              x={slot.x}
              y={slot.y}
              width={slot.width}
              height={slot.height}
              fill={info.color}
              opacity={0.45}
            />
            <rect
              x={slot.x}
              y={slot.y}
              width={slot.width}
              height={slot.height}
              fill="none"
              stroke={info.color}
              strokeWidth={2}
              opacity={0.7}
            />
            {slot.width > 140 && slot.height > 60 && (
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                fill="rgba(255,255,255,0.9)"
                fontSize={fontSize}
                fontWeight="600"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {slot.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Preview Modal ──────────────────────────────────────────────────────────

function PreviewModal({
  layout,
  onClose,
  onAddToOBS,
  obsConnected,
  installing,
  isAdded,
}: {
  layout: GalleryLayout;
  onClose: () => void;
  onAddToOBS: () => void;
  obsConnected: boolean;
  installing: boolean;
  isAdded: boolean;
}) {
  return (
    <div className="mvg-modal-overlay" onClick={onClose}>
      <div className="mvg-modal" onClick={(e) => e.stopPropagation()}>
        <button className="mvg-modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={20} />
        </button>

        {/* Preview */}
        <div className="mvg-modal-preview">
          <LayoutPreviewSVG layout={layout} />
        </div>

        {/* Info */}
        <div className="mvg-modal-info">
          <div className="mvg-modal-header">
            <h2 className="mvg-modal-title">{layout.name}</h2>
            <span className="mvg-modal-category">
              {isAdded ? (
                <span className="mvg-modal-added-badge">
                  <Icon name="check_circle" size={12} /> Added
                </span>
              ) : (
                GALLERY_CATEGORIES.find((c) => c.key === layout.category)?.label
              )}
            </span>
          </div>

          <p className="mvg-modal-desc">{layout.description}</p>

          {/* Slots */}
          <div className="mvg-modal-section">
            <h3 className="mvg-modal-section-title">
              Layout Slots ({layout.slots.length})
            </h3>
            <div className="mvg-modal-slots">
              {layout.slots.map((slot) => {
                const info = CONTENT_TYPE_INFO[slot.contentType] || CONTENT_TYPE_INFO.camera;
                return (
                  <div key={slot.id} className="mvg-modal-slot">
                    <div className="mvg-modal-slot-dot" style={{ background: info.color }} />
                    <Icon name={info.icon} size={14} className="mvg-modal-slot-icon" />
                    <span className="mvg-modal-slot-label">{slot.label}</span>
                    <span className="mvg-modal-slot-type">{info.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Use Cases */}
          <div className="mvg-modal-section">
            <h3 className="mvg-modal-section-title">Use Cases</h3>
            <div className="mvg-modal-usecases">
              {layout.useCases.map((uc) => (
                <span key={uc} className="mvg-modal-usecase">{uc}</span>
              ))}
            </div>
          </div>

          {/* Scene Dimensions */}
          <div className="mvg-modal-section">
            <div className="mvg-modal-meta">
              <span className="mvg-modal-meta-item">
                <Icon name="aspect_ratio" size={14} />
                1920 × 1080
              </span>
              <span className="mvg-modal-meta-item">
                <Icon name="view_module" size={14} />
                {layout.slots.length} slot{layout.slots.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="mvg-modal-actions">
            <button
              className={`mvg-btn ${isAdded ? "mvg-btn--added" : "mvg-btn--primary"}`}
              onClick={onAddToOBS}
              disabled={!obsConnected || installing}
            >
              {installing ? (
                <>
                  <span className="loading-spinner-sm" /> Installing...
                </>
              ) : isAdded ? (
                <>
                  <Icon name="check_circle" size={16} /> Added to OBS
                </>
              ) : (
                <>
                  <Icon name="add" size={16} /> Add To OBS
                </>
              )}
            </button>
          </div>

          {!obsConnected && (
            <p className="mvg-modal-obs-hint">
              <Icon name="info" size={12} /> Connect to OBS to add layouts
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── OBS Not Connected Modal ────────────────────────────────────────────────

function OBSDisconnectedModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="mvg-modal-overlay" onClick={onClose}>
      <div className="mvg-modal mvg-modal--small" onClick={(e) => e.stopPropagation()}>
        <button className="mvg-modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={20} />
        </button>
        <div className="mvg-disconnected-content">
          <Icon name="cast_connected" size={40} className="mvg-disconnected-icon" />
          <h3>OBS is not connected</h3>
          <p>Connect to OBS Studio to install multi-view layouts.</p>
          <div className="mvg-disconnected-actions">
            <button className="mvg-btn mvg-btn--outline" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Gallery Page ──────────────────────────────────────────────────────

export default function MultiViewGalleryPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<GalleryLayoutCategory | "all">("all");
  const [previewLayout, setPreviewLayout] = useState<GalleryLayout | null>(null);
  const [obsConnected, setObsConnected] = useState(obsService.status === "connected");
  const [showDisconnected, setShowDisconnected] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(() => loadAddedIds());
  const [, setRenderTick] = useState(0);

  // ── Listen to OBS status ──
  useState(() => {
    setObsConnected(obsService.status === "connected");
    const unsub = obsService.onStatusChange((status) => {
      setObsConnected(status === "connected");
    });
    return unsub;
  });

  // ── Added count for filter badge ──
  const addedCount = useMemo(() => addedIds.size, [addedIds]);

  // ── Filtered layouts ──
  const filtered = useMemo(() => {
    let list = GALLERY_LAYOUTS;

    if (filter === "added") {
      list = list.filter((l) => addedIds.has(l.id));
    } else if (filter !== "all") {
      list = list.filter((l) => l.category === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          l.useCases.some((uc) => uc.toLowerCase().includes(q))
      );
    }

    return list;
  }, [filter, search, addedIds]);

  // ── Toast helper ──
  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Mark layout as added and refresh ──
  const markAdded = useCallback((layoutId: string) => {
    const ids = loadAddedIds();
    ids.add(layoutId);
    saveAddedIds(ids);
    setAddedIds(new Set(ids));
    setRenderTick(t => t + 1);
  }, []);

  // ── Install layout to OBS ──
  const handleAddToOBS = useCallback(
    async (layout: GalleryLayout) => {
      if (!obsConnected) {
        setShowDisconnected(true);
        return;
      }

      setInstalling(true);
      try {
        // Use MV: prefix to match dock tab convention
        const sceneName = `MV: ${layout.name}`;
        try {
          await obsService.createScene(sceneName);
        } catch {
          // Scene might already exist — continue
        }

        // Create color sources for each slot and position them
        for (const slot of layout.slots) {
          const inputName = `${sceneName} - ${slot.label}`;
          const info = CONTENT_TYPE_INFO[slot.contentType] || CONTENT_TYPE_INFO.camera;

          const itemId = await obsService.createInput(
            sceneName,
            inputName,
            "color_source_v3",
            {
              color: info.color,
              width: slot.width,
              height: slot.height,
            }
          );

          if (itemId) {
            await obsService.setSceneItemTransform(sceneName, itemId, {
              positionX: slot.x,
              positionY: slot.y,
              boundsType: "OBS_BOUNDS_STRETCH",
              boundsWidth: slot.width,
              boundsHeight: slot.height,
              boundsAlignment: 0,
            });
          }
        }

        // Save to dock storage for the dock multiview tab
        const dockEntry: DockMVLayout = {
          id: `mvg-${layout.id}-${Date.now()}`,
          name: layout.name,
          description: layout.description,
          regionCount: layout.slots.length,
          canvasLabel: "1920×1080",
          updatedAt: new Date().toISOString(),
          isTemplate: false,
          tags: layout.useCases,
        };
        const existing = loadDockLayouts();
        existing.unshift(dockEntry);
        saveDockLayouts(existing);

        // Mark as added
        markAdded(layout.id);

        showToast(`"${sceneName}" added to OBS`, "success");
        setPreviewLayout(null);
      } catch (err) {
        console.error("[MultiViewGallery] Failed to install layout:", err);
        showToast("Failed to install layout to OBS", "error");
      } finally {
        setInstalling(false);
      }
    },
    [obsConnected, showToast, markAdded]
  );

  // ── Handle preview → install ──
  const handlePreviewInstall = useCallback(() => {
    if (previewLayout) {
      handleAddToOBS(previewLayout);
    }
  }, [previewLayout, handleAddToOBS]);

  return (
    <div className="app-page mvg-page">
      <div className="app-page__inner mvg-inner">
        {/* Header */}
        <header className="app-page__header mvg-header">
          <div className="app-page__header-copy">
            <p className="app-page__eyebrow">Multi-View</p>
            <h1 className="app-page__title">Multi-View Layouts</h1>
            <p className="app-page__subtitle">
              Choose a layout for displaying multiple cameras, speakers, scriptures,
              translations, and other content in OBS.
            </p>
          </div>
        </header>

        {/* Search */}
        <div className="mvg-search">
          <Icon name="search" size={16} className="mvg-search-icon" />
          <input
            type="text"
            className="mvg-search-input"
            placeholder="Search layouts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="mvg-search-clear" onClick={() => setSearch("")} aria-label="Clear">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        {/* Category filters */}
        <div className="mvg-filters">
          {GALLERY_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              className={`mvg-filter ${filter === cat.key ? "mvg-filter--active" : ""}`}
              onClick={() => setFilter(cat.key)}
            >
              <Icon name={cat.icon} size={14} />
              {cat.label}
              {cat.key === "added" && addedCount > 0 && (
                <span className="mvg-filter-count">{addedCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Layout grid */}
        {filtered.length > 0 ? (
          <div className="mvg-grid">
            {filtered.map((layout) => {
              const isAdded = addedIds.has(layout.id);
              return (
                <div key={layout.id} className={`mvg-card${isAdded ? " mvg-card--added" : ""}`}>
                  {/* Preview */}
                  <div className="mvg-card-preview">
                    <LayoutPreviewSVG layout={layout} />
                    <span className="mvg-card-slots">{layout.slots.length} slot{layout.slots.length !== 1 ? "s" : ""}</span>
                    {isAdded && (
                      <span className="mvg-card-added-badge">
                        <Icon name="check_circle" size={12} /> Added
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="mvg-card-info">
                    <h3 className="mvg-card-name">{layout.name}</h3>
                    <p className="mvg-card-desc">{layout.description}</p>
                    <div className="mvg-card-usecases">
                      {layout.useCases.slice(0, 2).map((uc) => (
                        <span key={uc} className="mvg-card-usecase">{uc}</span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mvg-card-actions">
                    <button
                      className="mvg-btn mvg-btn--outline mvg-btn--sm"
                      onClick={() => setPreviewLayout(layout)}
                    >
                      <Icon name="visibility" size={14} /> Preview
                    </button>
                    <button
                      className={`mvg-btn mvg-btn--sm ${isAdded ? "mvg-btn--added" : "mvg-btn--primary"}`}
                      onClick={() => {
                        if (!obsConnected) {
                          setShowDisconnected(true);
                          return;
                        }
                        handleAddToOBS(layout);
                      }}
                    >
                      {isAdded ? (
                        <>
                          <Icon name="check_circle" size={14} /> Added
                        </>
                      ) : (
                        <>
                          <Icon name="add" size={14} /> Add to OBS
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mvg-empty">
            <Icon name="view_module" size={48} className="mvg-empty-icon" />
            <h3>
              {filter === "added"
                ? "No layouts added yet"
                : "More multi-view layouts are coming soon."}
            </h3>
            <p>
              {filter === "added"
                ? "Add a layout to OBS and it will appear here."
                : "You can create custom layouts in the Multi-View editor."}
            </p>
          </div>
        )}

        {/* Preview Modal */}
        {previewLayout && (
          <PreviewModal
            layout={previewLayout}
            onClose={() => setPreviewLayout(null)}
            onAddToOBS={handlePreviewInstall}
            obsConnected={obsConnected}
            installing={installing}
            isAdded={addedIds.has(previewLayout.id)}
          />
        )}

        {/* OBS Disconnected Modal */}
        {showDisconnected && (
          <OBSDisconnectedModal onClose={() => setShowDisconnected(false)} />
        )}

        {/* Toast */}
        {toast && (
          <div className={`mvg-toast mvg-toast--${toast.type}`}>
            <Icon
              name={toast.type === "success" ? "check_circle" : "error"}
              size={18}
            />
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
