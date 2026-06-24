/**
 * MediaTab.tsx — Media grid tab for the Library page
 *
 * Features:
 *   • Search by name
 *   • Filter: All / Images / Videos
 *   • Responsive card grid with thumbnails, type/duration badges
 *   • 3-dot menu: Rename, Delete (with confirmation)
 *   • Add Media modal with drag-and-drop + file browse
 *   • ESC closes modals
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MediaItem } from "./libraryTypes";
import { getAllMedia, saveMedia, deleteMedia, renameMedia } from "./libraryDb";
import { resolveOverlayAssetUrl, getOverlayBaseUrl } from "../services/overlayUrl";
import Icon from "../components/Icon";
import { useAuth } from "../contexts/AuthContext";
import { getEffectivePlan } from "../services/licenseService";
import { checkEntitlementSync } from "../services/entitlementClient";
import { isSupportedMediaFile } from "../services/mediaValidation";

type FilterType = "all" | "image" | "video";

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export const MEDIA_FILE_ACCEPT = "image/*,video/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.mp4,.mov,.m4v,.avi,.mkv,.webm,.wmv,.flv";

/* ---------- helpers ---------- */

function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function getVideoDuration(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(v.duration);
    v.onerror = () => resolve(0);
    v.src = dataUrl;
  });
}

function getVideoDimensions(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        resolve({ width: v.videoWidth, height: v.videoHeight });
      } else {
        resolve(null);
      }
    };
    v.onerror = () => resolve(null);
    v.src = dataUrl;
  });
}

function getImageDimensions(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function generateVideoThumbnail(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.onloadeddata = () => {
      v.currentTime = Math.min(1, v.duration / 4);
    };
    v.onseeked = () => {
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 180;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    v.onerror = () => resolve("");
    v.src = dataUrl;
  });
}

/**
 * Generate a small thumbnail data-URL for an image (max 320×180).
 * Keeps the stored data small for localStorage.
 */
function generateImageThumbnail(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const MAX_W = 320;
      const MAX_H = 180;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_W || h > MAX_H) {
        const ratio = Math.min(MAX_W / w, MAX_H / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve("");
    img.src = src;
  });
}

export async function saveLibraryMediaFile(file: File, overrideName?: string): Promise<void> {
  if (!isSupportedMediaFile(file)) {
    throw new Error(`Unsupported file type. Only image and video files are allowed.`);
  }
  const fileName = (overrideName ?? file.name).trim();
  const category = file.type.startsWith("video") ? "video" : "image";

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const safeName = `media_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const diskPath = await invoke<string>("save_upload_file", {
      fileName: safeName,
      fileData: Array.from(bytes),
    });

    const baseUrl = await getOverlayBaseUrl();
    const overlayUrl = `${baseUrl}/uploads/${encodeURIComponent(safeName)}`;

    let thumbnailUrl: string | undefined;
    let durationSec: number | undefined;
    let dimensions: { width: number; height: number } | null = null;
    const objectUrl = URL.createObjectURL(file);

    try {
      if (category === "video") {
        durationSec = await getVideoDuration(objectUrl);
        dimensions = await getVideoDimensions(objectUrl);
        thumbnailUrl = await generateVideoThumbnail(objectUrl);
      } else {
        dimensions = await getImageDimensions(objectUrl);
        thumbnailUrl = await generateImageThumbnail(objectUrl);
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }

    const item: MediaItem = {
      id: uid(),
      name: fileName,
      type: category,
      url: overlayUrl,
      filePath: diskPath,
      diskFileName: safeName,
      thumbnailUrl,
      width: dimensions?.width,
      height: dimensions?.height,
      durationSec: durationSec ? Math.round(durationSec) : undefined,
      fileSize: file.size,
      mimeType: file.type,
      createdAt: new Date().toISOString(),
    };

    await saveMedia(item);
  } catch (err) {
    console.error("[MediaTab] Error in saveLibraryMediaFile:", err);
    throw err;
  }
}

/* ========================================================================= */
/* MediaTab                                                                  */
/* ========================================================================= */

export function MediaTab({ focusMediaId }: { focusMediaId?: string }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [pageDragging, setPageDragging] = useState(false);
  const [pageUploading, setPageUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [showMediaLimitModal, setShowMediaLimitModal] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const autoOpenedMediaIdRef = useRef<string | null>(null);
  const renameSubmittingRef = useRef(false);

  // ── Plan enforcement ──
  const { user: authUser } = useAuth();
  const effectivePlan = getEffectivePlan(authUser);
  const { limit: imageLimit } = checkEntitlementSync("images", effectivePlan);
  const { limit: videoLimit } = checkEntitlementSync("videos", effectivePlan);
  const imageCount = useMemo(() => items.filter((m) => m.type === "image").length, [items]);
  const videoCount = useMemo(() => items.filter((m) => m.type === "video").length, [items]);
  const isImageUnlimited = imageLimit === -1;
  const isVideoUnlimited = videoLimit === -1;
  const hasReachedImageLimit = !isImageUnlimited && imageCount >= imageLimit;
  const hasReachedVideoLimit = !isVideoUnlimited && videoCount >= videoLimit;
  const showMediaUsage = !isImageUnlimited || !isVideoUnlimited;

  const reload = useCallback(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const items = await getAllMedia();
        if (cancelled) return;
        setItems(items);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("[MediaTab] Failed to load media:", err);
        setItems([]);
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return reload();
  }, [reload]);

  useEffect(() => {
    if (!focusMediaId) {
      autoOpenedMediaIdRef.current = null;
      return;
    }
    if (focusMediaId === autoOpenedMediaIdRef.current) return;
    const target = items.find((item) => item.id === focusMediaId);
    if (!target) return;

    autoOpenedMediaIdRef.current = focusMediaId;
    setFilter("all");
    setPreviewItem(target);

    window.setTimeout(() => {
      const safeId = focusMediaId.replace(/"/g, '\\"');
      const element = document.querySelector<HTMLDivElement>(`[data-media-id="${safeId}"]`);
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
  }, [focusMediaId, items]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilter(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ESC handling
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAddModal) { setShowAddModal(false); return; }
        if (deleteConfirmId) { setDeleteConfirmId(null); return; }
        if (renameId) { setRenameId(null); return; }
        if (showMediaLimitModal) { setShowMediaLimitModal(false); return; }
        setMenuOpenId(null);
        setShowFilter(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showAddModal, deleteConfirmId, renameId, showMediaLimitModal]);

  // Filter + search (memoized to avoid recomputation)
  // NOTE: Plan limits do NOT control visibility. Users always see all their media.
  // Limits only apply to upload/create/import actions.
  const visible = useMemo(() => {
    return items.filter((m) => {
      if (filter !== "all" && m.type !== filter) return false;
      if (search && !fuzzyMatch(search, m.name)) return false;
      return true;
    });
  }, [items, filter, search]);

  /* ---- actions ---- */

  const handleDelete = useCallback(
    (id: string) => {
      deleteMedia(id);
      reload();
      setDeleteConfirmId(null);
      setMenuOpenId(null);
    },
    [reload]
  );

  const handleRenameSubmit = useCallback(
    async (id: string) => {
      if (renameSubmittingRef.current) return;
      renameSubmittingRef.current = true;
      try {
        if (renameValue.trim()) {
          await renameMedia(id, renameValue.trim());
          await reload();
        }
        setRenameId(null);
      } finally {
        renameSubmittingRef.current = false;
      }
    },
    [renameValue, reload]
  );

  const handleAddComplete = useCallback(() => {
    reload();
    setShowAddModal(false);
  }, [reload]);

  const handleDirectUpload = useCallback(async (files: FileList | File[]) => {
    const allFiles = Array.from(files);
    // Validate file types — reject unsupported files with clear error
    const rejected = allFiles.filter((f) => !isSupportedMediaFile(f));
    for (const f of rejected) {
      alert(`Unsupported file type: "${f.name}". Please upload an image or video file.`);
    }
    const queue = allFiles.filter((f) => isSupportedMediaFile(f));
    if (queue.length === 0) return;

    // ── Per-file-type quota enforcement ──
    // Use live entitlements from server (checkEntitlementSync reads latest)
    const { limit: liveImageLimit } = checkEntitlementSync("images", effectivePlan);
    const { limit: liveVideoLimit } = checkEntitlementSync("videos", effectivePlan);

    // Recount from DB to get current stored counts (fresh, not stale)
    const currentItems = await getAllMedia();
    const currentImageCount = currentItems.filter((m) => m.type === "image").length;
    const currentVideoCount = currentItems.filter((m) => m.type === "video").length;

    console.log("[MediaTab] Plan:", effectivePlan);
    console.log("[MediaTab] Entitlements:", { images: liveImageLimit, videos: liveVideoLimit });
    console.log("[MediaTab] Images:", currentImageCount, "/", liveImageLimit);
    console.log("[MediaTab] Videos:", currentVideoCount, "/", liveVideoLimit);

    let imagesToUpload = 0;
    let videosToUpload = 0;

    // Pre-count incoming files by type
    for (const file of queue) {
      if (file.type.startsWith("image/")) imagesToUpload++;
      else if (file.type.startsWith("video/")) videosToUpload++;
    }

    // Check if each type exceeds quota
    const imageExceeded = liveImageLimit !== -1 && (currentImageCount + imagesToUpload) > liveImageLimit;
    const videoExceeded = liveVideoLimit !== -1 && (currentVideoCount + videosToUpload) > liveVideoLimit;

    // Both types over limit → block entirely
    if (imageExceeded && videoExceeded) {
      setShowMediaLimitModal(true);
      return;
    }

    setPageUploading(true);
    try {
      let imagesUploaded = 0;
      let videosUploaded = 0;
      for (const file of queue) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");

        // Check per-file quota — skip over-limit files, continue with valid ones
        if (isImage && liveImageLimit !== -1 && currentImageCount + imagesUploaded >= liveImageLimit) {
          continue;
        }
        if (isVideo && liveVideoLimit !== -1 && currentVideoCount + videosUploaded >= liveVideoLimit) {
          continue;
        }

        await saveLibraryMediaFile(file);
        if (isImage) imagesUploaded++;
        else if (isVideo) videosUploaded++;
      }

      // Show limit modal if any files were rejected
      const uploadedCount = imagesUploaded + videosUploaded;
      const rejectedCount = queue.length - uploadedCount;
      if (rejectedCount > 0) {
        setShowMediaLimitModal(true);
      }

      reload();
    } catch (error) {
      console.error("[MediaTab] Failed to save dropped media:", error);
      alert("Failed to save one or more media files. Please try again.");
    } finally {
      setPageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [reload, effectivePlan]);

  const filterLabel = filter === "all" ? "All" : filter === "image" ? "Images" : "Videos";

  return (
    <div
      className={`lib-media-shell${pageDragging ? " lib-media-shell--dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        dragCounterRef.current += 1;
        setPageDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setPageDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
        if (dragCounterRef.current === 0) {
          setPageDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragCounterRef.current = 0;
        setPageDragging(false);
        // Per-file quota enforcement happens inside handleDirectUpload
        if (event.dataTransfer.files?.length) {
          void handleDirectUpload(event.dataTransfer.files);
        }
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={MEDIA_FILE_ACCEPT}
        multiple
        style={{ display: "none" }}
        onChange={(event) => {
          const files = event.target.files;
          if (files?.length) {
            void handleDirectUpload(files);
          }
        }}
      />
      {/* Toolbar */}
      <div className="lib-toolbar">
        <div className="lib-toolbar-left">
          {/* Search */}
          <div className="lib-search-wrap">
            <Icon name="search" size={20} className="lib-search-icon" />
            <input
              className="lib-search-input"
              type="text"
              placeholder="Search media..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search media"
            />
            {search && (
              <button
                type="button"
                className="lib-search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear media search"
                title="Clear media search"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          {/* Filter dropdown */}
          <div className="lib-filter-wrap" ref={filterRef}>
            <button
              className="lib-filter-btn"
              onClick={() => setShowFilter((v) => !v)}
            >
              <Icon name="filter_list" size={18} />
              <span>Filter: {filterLabel}</span>
              <Icon name="arrow_drop_down" size={18} />
            </button>
            {showFilter && (
              <div className="lib-filter-dropdown">
                {(["all", "image", "video"] as FilterType[]).map((f) => (
                  <button
                    key={f}
                    className={`lib-filter-option${filter === f ? " is-active" : ""}`}
                    onClick={() => { setFilter(f); setShowFilter(false); }}
                  >
                    {f === "all" ? "All" : f === "image" ? "Images" : "Videos"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {showMediaUsage && (
          <span className="lib-song-usage-badge">
            {!isImageUnlimited && `Images ${imageCount}/${imageLimit}`}
            {!isImageUnlimited && !isVideoUnlimited && " · "}
            {!isVideoUnlimited && `Videos ${videoCount}/${videoLimit}`}
          </span>
        )}

        <button
          className="lib-add-btn"
          onClick={() => {
            // Always open file picker — per-file quota is enforced after file selection
            fileInputRef.current?.click();
          }}
        >
          <Icon name="add" size={20} />
          {pageUploading ? "Uploading..." : "Add Media"}
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="lib-media-loading">
          <Icon name="sync" size={24} className="spin" />
          <p>Loading media...</p>
        </div>
      ) : (
        <div className="lib-media-grid">
          {visible.length === 0 && (
            <div className="lib-empty">
              <Icon name="perm_media" size={48} style={{ opacity: 0.3 }} />
              <p>No media found</p>
              <button className="lib-add-btn" onClick={() => {
                // Always open file picker — per-file quota is enforced after file selection
                fileInputRef.current?.click();
              }}>
                <Icon name="add" size={20} />
                Add Media
              </button>
            </div>
          )}

          {visible.map((m) => (
            <div
              className={`lib-media-card${menuOpenId === m.id ? " lib-media-card--menu-open" : ""}${previewItem?.id === m.id ? " lib-media-card--focused" : ""}`}
              key={m.id}
              data-media-id={m.id}
              onClick={() => { }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setPreviewItem(m);
              }}
              tabIndex={0}
              role="group"
              aria-label={m.name}
            >
              {/* Thumbnail */}
              <div className="lib-media-thumb">
                {m.type === "video" ? (
                  // Videos: show thumbnail or placeholder (never load video file as image)
                  m.thumbnailUrl ? (
                    <img
                      src={m.thumbnailUrl}
                      alt={m.name}
                      className="lib-media-thumb-img"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="lib-media-thumb--video-placeholder">
                      <Icon name="movie" size={32} />
                    </div>
                  )
                ) : m.type === "image" ? (
                  // Images: show thumbnail or full image
                  m.thumbnailUrl || m.url ? (
                    <img
                      src={m.thumbnailUrl || m.url}
                      alt={m.name}
                      className="lib-media-thumb-img"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="lib-media-thumb--image-placeholder">
                      <Icon name="image" size={32} />
                    </div>
                  )
                ) : null}
                <div className="lib-media-thumb-overlay" />
                {/* Type badge */}
                <span className="lib-media-badge-type">
                  {m.type === "video" ? "VIDEO" : "IMAGE"}
                </span>
                {/* Duration badge */}
                {m.type === "video" && m.durationSec != null && (
                  <span className="lib-media-badge-dur">
                    {fmtDuration(m.durationSec)}
                  </span>
                )}
                {/* Play button overlay */}
                {m.type === "video" && (
                  <div className="lib-media-play-overlay">
                    <div className="lib-media-play-btn">
                      <Icon name="play_arrow" size={20} className="filled" />
                    </div>
                  </div>
                )}
              </div>

              {/* Info row */}
              <div className="lib-media-info">
                <div className="lib-media-info-text">
                  {renameId === m.id ? (
                    <input
                      className="lib-rename-input"
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(m.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRenameSubmit(m.id);
                          setRenameId(null);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setRenameId(null);
                        }
                      }}
                    />
                  ) : (
                    <>
                      <h4
                        className="lib-media-name"
                        title={m.name}
                      >
                        {m.name.length > 25 ? `${m.name.slice(0, 25)}...` : m.name}
                      </h4>
                      <p className="lib-media-meta">
                        {m.type === "image" && m.mimeType
                          ? `${m.mimeType.split("/")[1]?.toUpperCase() || "IMG"}`
                          : ""}
                        {m.fileSize ? (m.type === "image" ? " • " : "") + fmtFileSize(m.fileSize) : ""}
                        {!m.fileSize && m.createdAt ? timeAgo(m.createdAt) : ""}
                      </p>
                    </>
                  )}
                </div>
                <button
                  className="lib-media-view-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewItem(m);
                  }}
                  aria-label={`View ${m.name}`}
                >
                  <Icon name="visibility" size={16} />
                  View
                </button>
                {/* 3-dot menu */}
                <div className="lib-media-menu-wrap" ref={menuOpenId === m.id ? menuRef : undefined}>
                  <button
                    className="lib-media-menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === m.id ? null : m.id);
                    }}
                  >
                    <Icon name="more_vert" size={20} />
                  </button>
                  {menuOpenId === m.id && (
                    <div className="lib-media-menu-dropdown">
                      <button
                        className="lib-media-menu-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameId(m.id);
                          setRenameValue(m.name);
                          setMenuOpenId(null);
                        }}
                      >
                        <Icon name="edit" size={16} />
                        Rename
                      </button>
                      <button
                        className="lib-media-menu-action lib-media-menu-action--danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(m.id);
                          setMenuOpenId(null);
                        }}
                      >
                        <Icon name="delete" size={16} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Media Preview Modal */}
      {previewItem && (
        <MediaPreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirmId && (
        <div className="lib-modal-backdrop" onClick={() => setDeleteConfirmId(null)}>
          <div className="lib-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Media?</h3>
            <p>This media item will be permanently removed from your library.</p>
            <div className="lib-confirm-actions">
              <button className="lib-confirm-cancel" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
              <button className="lib-confirm-delete" onClick={() => handleDelete(deleteConfirmId)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Media Modal */}
      {showAddModal && (
        <AddMediaModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddComplete}
          effectivePlan={effectivePlan}
        />
      )}

      {/* Media Limit Modal */}
      {showMediaLimitModal && (
        <div className="lib-modal-backdrop" onClick={() => setShowMediaLimitModal(false)}>
          <div className="lib-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Media Limit Reached</h3>
            <p>
              Your {effectivePlan} plan allows {imageLimit} images and {videoLimit} videos.
              {hasReachedImageLimit && ` You've reached the image limit (${imageCount}/${imageLimit}).`}
              {hasReachedVideoLimit && ` You've reached the video limit (${videoCount}/${videoLimit}).`}
            </p>
            <p>Upgrade your plan to upload more media.</p>
            <div className="lib-confirm-actions">
              <button className="lib-confirm-cancel" onClick={() => setShowMediaLimitModal(false)}>Close</button>
              <a href="https://makechurcheasy.creatorstudioslabs.stream/pricing" target="_blank" rel="noopener noreferrer" className="lib-confirm-delete" style={{ textDecoration: "none" }}>
                Upgrade Plan
              </a>
            </div>
          </div>
        </div>
      )}

      {pageDragging && (
        <div className="lib-media-drop-overlay" aria-hidden="true">
          <div className="lib-media-drop-overlay__card">
            <Icon name="cloud_upload" size={22} />
            <div className="lib-media-drop-overlay__title">Drag to add</div>
            <div className="lib-media-drop-overlay__text">Drop image or video files to save them directly into the library.</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================================================= */
/* MediaPreviewModal                                                         */
/* ========================================================================= */

function MediaPreviewModal({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The URL might be stored as relative (/uploads/...) or absolute (http://127.0.0.1:port/uploads/...)
  // Resolve it to ensure it has the full base URL
  const resolvedUrl = resolveOverlayAssetUrl(item.url);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Fetch media as blob to bypass CSP restrictions
  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;

    const loadMedia = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(resolvedUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        if (cancelled) return;

        blobUrl = URL.createObjectURL(blob);
        setMediaSrc(blobUrl);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("[MediaPreview] Failed to fetch media:", err);
        setError(`Failed to load: ${resolvedUrl}`);
        setLoading(false);
      }
    };

    loadMedia();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [resolvedUrl]);

  return (
    <div className="lib-preview-backdrop" onClick={onClose}>
      <div className="lib-preview-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="lib-preview-header">
          <div className="lib-preview-title">
            <Icon name={item.type === "video" ? "movie" : "image"} size={20} />
            <span>{item.name}</span>
          </div>
          <button className="lib-preview-close" onClick={onClose} aria-label="Close preview">
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="lib-preview-content">
          {loading ? (
            <div className="lib-preview-loading">
              <Icon name="sync" size={32} className="spin" />
              <p>Loading media...</p>
            </div>
          ) : error ? (
            <div className="lib-preview-error">
              <Icon name="error_outline" size={24} />
              <span>{error}</span>
            </div>
          ) : item.type === "video" ? (
            <video
              ref={videoRef}
              className="lib-preview-video"
              src={mediaSrc || undefined}
              controls
              autoPlay
              muted
              playsInline
              crossOrigin="anonymous"
            />
          ) : (
            <img
              className="lib-preview-image"
              src={mediaSrc || undefined}
              alt={item.name}
              crossOrigin="anonymous"
            />
          )}
        </div>

        {/* Footer */}
        <div className="lib-preview-footer">
          <span className="lib-preview-meta">
            {item.type === "video" ? "Video" : "Image"}
            {item.width && item.height && ` · ${item.width}×${item.height}`}
            {item.durationSec && ` · ${fmtDuration(item.durationSec)}`}
            {item.fileSize && ` · ${fmtFileSize(item.fileSize)}`}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* AddMediaModal                                                             */
/* ========================================================================= */

function AddMediaModal({ onClose, onSave, effectivePlan }: { onClose: () => void; onSave: () => void; effectivePlan: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [category, setCategory] = useState<"image" | "video">("video");
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleFile = useCallback((f: File) => {
    if (!isSupportedMediaFile(f)) {
      alert(`Unsupported file type: "${f.name}". Please upload an image or video file.`);
      return;
    }
    setFile(f);
    setFileName(f.name);
    setCategory(f.type.startsWith("video") ? "video" : "image");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleSave = useCallback(async () => {
    if (!file || !fileName.trim()) return;

    // Per-file quota check before saving
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    const { limit: imgLimit } = checkEntitlementSync("images", effectivePlan);
    const { limit: vidLimit } = checkEntitlementSync("videos", effectivePlan);

    // Get fresh count from DB
    const currentItems = await getAllMedia();
    const imgCount = currentItems.filter((m) => m.type === "image").length;
    const vidCount = currentItems.filter((m) => m.type === "video").length;

    if (isImage && imgLimit !== -1 && imgCount >= imgLimit) {
      alert(`Image limit reached (${imgCount}/${imgLimit}). Upgrade your plan to upload more images.`);
      return;
    }
    if (isVideo && vidLimit !== -1 && vidCount >= vidLimit) {
      alert(`Video limit reached (${vidCount}/${vidLimit}). Upgrade your plan to upload more videos.`);
      return;
    }

    setSaving(true);
    try {
      await saveLibraryMediaFile(file, fileName.trim());
      onSave();
    } catch (err) {
      console.error("[MediaTab] Failed to save media:", err);
      alert("Failed to save media. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [file, fileName, category, onSave, effectivePlan]);

  return (
    <div className="lib-modal-backdrop" onClick={onClose}>
      <div className="lib-add-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="lib-add-modal-header">
          <h3>Add Media to Library</h3>
          <button className="lib-modal-close-btn" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="lib-add-modal-body">
          {/* Drop zone */}
          <label
            className={`lib-dropzone${dragging ? " is-dragging" : ""}${file ? " has-file" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <div className="lib-dropzone-content">
              <div className="lib-dropzone-icon-wrap">
                <Icon name="cloud_upload" size={20} className="lib-dropzone-icon" />
              </div>
              {file ? (
                <p className="lib-dropzone-text">{file.name}</p>
              ) : (
                <>
                  <p className="lib-dropzone-text">
                    Drag & drop media here or <span className="lib-dropzone-browse">browse</span>
                  </p>
                  <p className="lib-dropzone-hint">PNG, JPG, MP4, MOV up to 50MB</p>
                </>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={MEDIA_FILE_ACCEPT}
              className="lib-dropzone-file-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>

          {/* File name */}
          <div className="lib-field">
            <label className="lib-field-label">File Name</label>
            <div className="lib-field-input-wrap">
              <input
                className="lib-field-input"
                type="text"
                placeholder="Enter file name"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
              <Icon name="edit" size={20} className="lib-field-input-icon" />
            </div>
          </div>

          {/* Category toggle */}
          <div className="lib-field">
            <label className="lib-field-label">Category</label>
            <div className="lib-category-toggle">
              <label className={`lib-category-opt${category === "image" ? " is-active" : ""}`}>
                <input
                  type="radio"
                  name="media-category"
                  className="sr-only"
                  checked={category === "image"}
                  onChange={() => setCategory("image")}
                />
                <Icon name="image" size={16} />
                Image
              </label>
              <label className={`lib-category-opt${category === "video" ? " is-active" : ""}`}>
                <input
                  type="radio"
                  name="media-category"
                  className="sr-only"
                  checked={category === "video"}
                  onChange={() => setCategory("video")}
                />
                <Icon name="videocam" size={16} />
                Video
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="lib-add-modal-footer">
          <button className="lib-modal-cancel-btn" onClick={onClose}>Cancel</button>
          <button
            className="lib-modal-save-btn"
            disabled={!file || !fileName.trim() || saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save to Library"}
          </button>
        </div>
      </div>
    </div>
  );
}
