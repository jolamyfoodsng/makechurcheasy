/**
 * DockMediaTab.tsx — Media tab for the MakeChurchEasy Dock
 *
 * Lists all sources in the current OBS scene and lets the user:
 *   • Toggle source visibility (show/hide)
 *   • Refresh the source list
 *   • Browse uploaded media files and play them in OBS
 *
 * Replaces the former "Ticker" tab.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { dockObsClient, type DockMediaSendOptions } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import { dockClient } from "../../services/dockBridge";
import type { DockStagedItem } from "../dockTypes";
import type { MediaItem } from "../../library/libraryTypes";
import { BACKGROUND_PATTERNS, type BackgroundPattern } from "../../library/backgroundAssets";
import { getOverlayBaseUrlSync } from "../../services/overlayUrl";
import { track } from "../../services/analytics";
import { trackMediaPresented } from "../../services/tracking";
import {
  downloadTemplateVideoToLibrary,
  fetchTemplateVideos,
  type TemplateVideoAsset,
} from "../../services/templateVideos";
import { uploadFileToDock } from "../dockUploadService";
import { requireEntitlement, showUpgradeModal } from "../dockEntitlement";
import { isSupportedMediaFile } from "../../services/mediaValidation";
import { getFeatureLimit } from "../../services/entitlementClient";
import Icon from "../DockIcon";
import { getUserScopedKey } from "../../services/userScopedStorage";

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
}

type DockMediaKind = "video" | "image";
type DockMediaFilter = "all" | DockMediaKind;
type DockMediaViewMode = "uploaded" | "recent";
type DockMediaBrowserTab = "uploads" | "animations" | "patterns" | "text";
type DockAddMediaTab = "background" | "template-videos";
type DockTextAlign = "left" | "center" | "right";
type DockTextVerticalPos = "top" | "center" | "bottom";
type DockTextAnimation = "none" | "fade" | "fade-up" | "slide-up" | "slide-down" | "zoom";

interface DockTextOverlayState {
  headline: string;
  subline: string;
  align: DockTextAlign;
  verticalPos: DockTextVerticalPos;
  headlineSize: number;
  sublineSize: number;
  animation: DockTextAnimation;
  animationDuration: number;
}

interface DockMediaEntry {
  key: string;
  prefKey: string;
  name: string;
  kind: DockMediaKind;
  createdAt: string;
  originLabel: string;
  mimeLabel?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  libraryItem?: MediaItem;
  durationSec?: number;
  fileSize?: number;
  playingKey: string;
  uploadFile?: string;
}

interface ActiveMediaTargets {
  active: DockMediaEntry | null;
}

interface DockMediaPreference {
  videoMuted?: boolean;
  imageAudioInputName?: string | null;
  loop?: boolean;
  fitMode?: "cover" | "contain" | "stretch";
  label?: string;
  hidden?: boolean;
  lastUsedAt?: string;
}

type DockMediaPreferences = Record<string, DockMediaPreference>;
type DockMediaFitMode = "cover" | "contain" | "stretch";

interface ActiveMediaPlaybackState {
  active: boolean;
}

interface DockTextOverlayState {
  headline: string;
  subline: string;
  align: DockTextAlign;
}

interface DockMediaTargetKeys {
  active: string | null;
}

interface DockMediaSessionState {
  browserTab: DockMediaBrowserTab;
  activeKind: DockMediaFilter;
  viewMode: DockMediaViewMode;
  activeTargetKeys: DockMediaTargetKeys;
  pausedTargets: ActiveMediaPlaybackState;
  textOverlay: DockTextOverlayState;
  textOverlayTargets: { active: boolean };
}

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "avi", "mkv", "wmv", "flv"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
const MEDIA_PREFS_STORAGE_KEY = "ocs-dock-media-preferences-v1";
const MEDIA_LOCAL_LIBRARY_STORAGE_KEY = "ocs-dock-media-library-v1";
const MEDIA_SESSION_STORAGE_KEY = "ocs-dock-media-session-v1";
const INTERNAL_UPLOAD_PREFIXES = ["dock_theme_bg_", "dock_theme_box_bg_", "dock_theme_logo_"];

/** Determine icon for file type */
function getFileIcon(kind: DockMediaKind): string {
  return kind === "video" ? "movie" : "image";
}

function getUploadMediaKind(name: string): DockMediaKind | null {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  return null;
}

function isMediaFile(name: string): boolean {
  return getUploadMediaKind(name) !== null;
}

function isInternalUploadFile(name: string): boolean {
  return INTERNAL_UPLOAD_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function loadMediaPreferences(): DockMediaPreferences {
  try {
    const stored = localStorage.getItem(getUserScopedKey(MEDIA_PREFS_STORAGE_KEY));
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as DockMediaPreferences;
  } catch {
    return {};
  }
}

function loadLocalMediaLibrary(): MediaItem[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(MEDIA_LOCAL_LIBRARY_STORAGE_KEY));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as MediaItem[] : [];
  } catch {
    return [];
  }
}

function isDockMediaBrowserTab(value: unknown): value is DockMediaBrowserTab {
  return value === "uploads" || value === "animations" || value === "patterns" || value === "text";
}

function isDockMediaKind(value: unknown): value is DockMediaFilter {
  return value === "video" || value === "image" || value === "all";
}

function isDockTextAlign(value: unknown): value is DockTextAlign {
  return value === "left" || value === "center" || value === "right";
}

function loadMediaSessionState(): DockMediaSessionState {
  const fallback: DockMediaSessionState = {
    browserTab: "uploads",
    activeKind: "all",
    viewMode: "uploaded",
    activeTargetKeys: {
      active: null,
    },
    pausedTargets: {
      active: false,
    },
    textOverlay: {
      headline: "",
      subline: "",
      align: "center",
      verticalPos: "center",
      headlineSize: 72,
      sublineSize: 28,
      animation: "fade-up",
      animationDuration: 1.0,
    },
    textOverlayTargets: {
      active: false,
    },
  };

  try {
    const raw = localStorage.getItem(MEDIA_SESSION_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DockMediaSessionState> | null;
    if (!parsed || typeof parsed !== "object") return fallback;

    const storedBrowserTab = parsed.browserTab;

    return {
      browserTab: isDockMediaBrowserTab(storedBrowserTab) ? storedBrowserTab : fallback.browserTab,
      activeKind: isDockMediaKind(parsed.activeKind) ? parsed.activeKind : fallback.activeKind,
      viewMode: (parsed.viewMode === "uploaded" || parsed.viewMode === "recent") ? parsed.viewMode : fallback.viewMode,
      activeTargetKeys: {
        active: typeof parsed.activeTargetKeys?.active === "string" ? parsed.activeTargetKeys.active : null,
      },
      pausedTargets: {
        active: Boolean(parsed.pausedTargets?.active),
      },
      textOverlay: {
        headline: typeof parsed.textOverlay?.headline === "string" ? parsed.textOverlay.headline : "",
        subline: typeof parsed.textOverlay?.subline === "string" ? parsed.textOverlay.subline : "",
        align: isDockTextAlign(parsed.textOverlay?.align) ? parsed.textOverlay.align : fallback.textOverlay.align,
        verticalPos: (parsed.textOverlay?.verticalPos === "top" || parsed.textOverlay?.verticalPos === "center" || parsed.textOverlay?.verticalPos === "bottom")
          ? parsed.textOverlay.verticalPos : fallback.textOverlay.verticalPos,
        headlineSize: typeof parsed.textOverlay?.headlineSize === "number" ? parsed.textOverlay.headlineSize : fallback.textOverlay.headlineSize,
        sublineSize: typeof parsed.textOverlay?.sublineSize === "number" ? parsed.textOverlay.sublineSize : fallback.textOverlay.sublineSize,
        animation: parsed.textOverlay && (["none", "fade", "fade-up", "slide-up", "slide-down", "zoom"] as DockTextAnimation[]).includes(parsed.textOverlay.animation as DockTextAnimation)
          ? parsed.textOverlay.animation as DockTextAnimation : fallback.textOverlay.animation,
        animationDuration: typeof parsed.textOverlay?.animationDuration === "number" ? parsed.textOverlay.animationDuration : fallback.textOverlay.animationDuration,
      },
      textOverlayTargets: {
        active: Boolean(parsed.textOverlayTargets?.active),
      },
    };
  } catch {
    return fallback;
  }
}

function dedupeMediaItems(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  return items
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter((item) => {
      const key = `${item.filePath || ""}|${item.diskFileName || ""}|${item.name}|${item.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isAnimationMediaItem(item: MediaItem): boolean {
  return item.type === "video" && (
    item.source === "template-cloudflare" ||
    Boolean(item.sourceAssetId) ||
    Boolean(item.cloudflareKey)
  );
}

function getMediaPreviewUrl(item: MediaItem, overlayBaseUrl: string): string {
  if (item.diskFileName) {
    return `${overlayBaseUrl}/uploads/${encodeURIComponent(item.diskFileName)}`;
  }
  return item.url;
}

function fmtDuration(totalSeconds?: number): string {
  if (!totalSeconds || !Number.isFinite(totalSeconds)) return "";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

function formatFitMode(value: DockMediaFitMode): string {
  switch (value) {
    case "contain":
      return "Fit";
    case "stretch":
      return "Stretch";
    case "cover":
    default:
      return "Fill";
  }
}

function createLibraryEntry(item: MediaItem, overlayBaseUrl: string, originLabel: string): DockMediaEntry {
  const prefKey = `media:${item.filePath || item.diskFileName || item.id}`;
  return {
    key: prefKey,
    prefKey,
    name: item.name,
    kind: item.type,
    createdAt: item.createdAt,
    originLabel,
    mimeLabel: item.mimeType?.split("/")[1]?.toUpperCase(),
    thumbnailUrl: item.thumbnailUrl,
    previewUrl: getMediaPreviewUrl(item, overlayBaseUrl),
    libraryItem: item,
    durationSec: item.durationSec,
    fileSize: item.fileSize,
    playingKey: `library:${item.id}`,
  };
}

function createPatternEntry(pattern: BackgroundPattern): DockMediaEntry {
  const key = `pattern:${pattern.label}`;
  return {
    key,
    prefKey: key,
    name: pattern.label,
    kind: "image",
    createdAt: "",
    originLabel: "Pattern",
    mimeLabel: "SVG",
    previewUrl: pattern.src,
    playingKey: key,
  };
}

function isAnimatedPattern(pattern: BackgroundPattern): boolean {
  return /%3Canimate(?:Transform)?/i.test(pattern.src);
}

function TemplateVideoPreview({ src, label }: { src: string; label: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const previewSrc = `${src}#t=0.1`;

  useEffect(() => {
    const node = hostRef.current;
    if (!node || shouldLoad) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "180px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad]);

  const handlePointerEnter = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => { });
  }, []);

  const handlePointerLeave = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    try {
      video.currentTime = 0.1;
    } catch {
      // Ignore seek failures on partially buffered previews.
    }
  }, []);

  return (
    <div
      ref={hostRef}
      className="dock-media-template-preview"
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      onFocus={handlePointerEnter}
      onBlur={handlePointerLeave}
    >
      {shouldLoad ? (
        <>
          <video
            ref={videoRef}
            className="dock-media-card__preview dock-media-card__preview-video"
            src={previewSrc}
            muted
            playsInline
            preload="metadata"
            aria-label={`${label} preview`}
          />
          <span className="dock-media-template-preview__badge">
            <Icon name="movie" size={10} />
            <span>Preview</span>
          </span>
        </>
      ) : (
        <div className="dock-media-card__placeholder" aria-hidden="true">
          <Icon name="movie" size={18} />
          <span>Template Video</span>
        </div>
      )}
    </div>
  );
}

export default function DockMediaTab({ staged: _staged, onStage: _onStage }: Props) {
  const overlayBaseUrl = getOverlayBaseUrlSync();
  const [mediaSession] = useState<DockMediaSessionState>(() => loadMediaSessionState());
  const [browserTab, setBrowserTab] = useState<DockMediaBrowserTab>(() => mediaSession.browserTab);
  const [activeKind, setActiveKind] = useState<DockMediaFilter>(() => mediaSession.activeKind);
  const [viewMode, setViewMode] = useState<DockMediaViewMode>(() => mediaSession.viewMode);
  const [assetSearch, setAssetSearch] = useState("");
  const [showAddMediaModal, setShowAddMediaModal] = useState(false);
  const [addMediaTab, setAddMediaTab] = useState<DockAddMediaTab>("background");
  const [templateVideoSearch, setTemplateVideoSearch] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [sendingFile, setSendingFile] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [mediaPrefs, setMediaPrefs] = useState<DockMediaPreferences>(() => loadMediaPreferences());
  const [localLibrary, setLocalLibrary] = useState<MediaItem[]>(() => loadLocalMediaLibrary());
  const [uploading, setUploading] = useState(false);
  const [openOptionsKey, setOpenOptionsKey] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<DockMediaEntry | null>(null);
  const [activeTargets, setActiveTargets] = useState<ActiveMediaTargets>({
    active: null,
  });
  const [activeTargetKeys, setActiveTargetKeys] = useState<DockMediaTargetKeys>(() => mediaSession.activeTargetKeys);
  const [pausedTargets, setPausedTargets] = useState<ActiveMediaPlaybackState>(() => mediaSession.pausedTargets);
  const [textOverlay, setTextOverlay] = useState<DockTextOverlayState>(() => mediaSession.textOverlay);
  const [textOverlayTargets, setTextOverlayTargets] = useState<{ active: boolean }>(() => mediaSession.textOverlayTargets);
  const [applyingTextTarget, setApplyingTextTarget] = useState<boolean | null>(null);
  const [clearingTarget, setClearingTarget] = useState<boolean | null>(null);
  const [animatingPreview, setAnimatingPreview] = useState(false);
  const [templateVideos, setTemplateVideos] = useState<TemplateVideoAsset[]>([]);
  const [templateVideosLoading, setTemplateVideosLoading] = useState(false);
  const [templateVideosError, setTemplateVideosError] = useState<string | null>(null);
  const [templateVideoProgress, setTemplateVideoProgress] = useState<Record<string, number | null>>({});
  const mountedRef = useRef(true);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  // ── Video Loop / Playlist state ──
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlistName, setPlaylistName] = useState("VLC Playlist");
  const [playlistLoop, setPlaylistLoop] = useState(true);
  const [playlistShuffle, setPlaylistShuffle] = useState(false);
  const [playlistMuted, setPlaylistMuted] = useState(true);

  // ── Absolute path to the uploads directory (for native OBS sources) ──
  const [uploadsDir, setUploadsDir] = useState<string | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(getUserScopedKey(MEDIA_PREFS_STORAGE_KEY), JSON.stringify(mediaPrefs));
    } catch {
      // Dock preferences are convenience-only; ignore storage failures.
    }
  }, [mediaPrefs]);

  useEffect(() => {
    try {
      localStorage.setItem(getUserScopedKey(MEDIA_LOCAL_LIBRARY_STORAGE_KEY), JSON.stringify(localLibrary));
    } catch {
      // ignore local fallback persistence failures
    }
  }, [localLibrary]);

  const updateMediaPreference = useCallback((entryKey: string, patch: DockMediaPreference) => {
    setMediaPrefs((prev) => ({
      ...prev,
      [entryKey]: {
        ...prev[entryKey],
        ...patch,
      },
    }));
  }, []);

  const persistLocalLibrary = useCallback((updater: (current: MediaItem[]) => MediaItem[]) => {
    setLocalLibrary((current) => dedupeMediaItems(updater(current)));
  }, []);

  // Fetch uploads directory path on mount (with retries for startup timing)
  useEffect(() => {
    let cancelled = false;
    async function fetchDir(retries = 5) {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch("/api/uploads-dir");
          if (res.ok) {
            const data = await res.json();
            if (data.path && !cancelled) {
              setUploadsDir(data.path);
              return;
            }
          }
        } catch { /* server not ready yet */ }
        // Wait before retrying (1s, 2s, 3s...)
        if (i < retries - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
      if (!cancelled) console.warn("[DockMediaTab] Could not fetch uploads dir after retries");
    }
    fetchDir();
    return () => { cancelled = true; };
  }, []);

  // ── Library media items (from main app) ──
  const [libraryMedia, setLibraryMedia] = useState<MediaItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  const loadLibraryMedia = useCallback(async () => {
    console.log("[UPLOAD] loadLibraryMedia: start");
    setLibraryLoading(true);
    try {
      // Strategy 1: try IndexedDB (async)
      try {
        const { getAllMedia } = await import("../../library/libraryDb");
        const all = await getAllMedia();
        console.log("[UPLOAD] loadLibraryMedia: IndexedDB returned", all.length, "items");
        if (all.length > 0) {
          setLibraryMedia(all);
          console.log("[UPLOAD] loadLibraryMedia: set libraryMedia from IndexedDB (overwrites current state)");
          return;
        }
      } catch (err) {
        console.log("[UPLOAD] loadLibraryMedia: IndexedDB unavailable →", err);
        // IndexedDB not available, fall through to JSON fetch.
      }

      // Strategy 2: fetch from overlay server (works when dock runs in OBS CEF)
      try {
        const res = await fetch("/uploads/dock-media-library.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const all = await res.json();
        console.log("[UPLOAD] loadLibraryMedia: JSON fetch returned", Array.isArray(all) ? all.length : 0, "items");
        if (Array.isArray(all) && all.length > 0) {
          setLibraryMedia(all);
          console.log("[UPLOAD] loadLibraryMedia: set libraryMedia from JSON");
          return;
        }
      } catch (err) {
        console.log("[UPLOAD] loadLibraryMedia: JSON fetch failed →", err);
        // JSON fetch failed, continue to finally.
      }
      console.log("[UPLOAD] loadLibraryMedia: no data found, keeping current state");
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const loadTemplateVideos = useCallback(async () => {
    setTemplateVideosLoading(true);
    setTemplateVideosError(null);
    try {
      const items = await fetchTemplateVideos();
      if (!mountedRef.current) return;
      setTemplateVideos(items);
    } catch (err) {
      if (!mountedRef.current) return;
      setTemplateVideosError(err instanceof Error ? err.message : "Unable to load template videos.");
      setTemplateVideos([]);
    } finally {
      if (mountedRef.current) {
        setTemplateVideosLoading(false);
      }
    }
  }, []);

  const openAddMediaModal = useCallback((tab: DockAddMediaTab = "background") => {
    setAddMediaTab(tab);
    setTemplateVideoSearch("");
    setShowAddMediaModal(true);
  }, []);

  const closeAddMediaModal = useCallback(() => {
    setShowAddMediaModal(false);
  }, []);

  // Load library media on mount
  useEffect(() => {
    loadLibraryMedia();
    dockClient.sendCommand({ type: "request-library-data", timestamp: Date.now() });
  }, [loadLibraryMedia]);

  // Listen for library-updated signal to refresh media
  useEffect(() => {
    const unsub = dockClient.onState((msg) => {
      if (msg.type === "state:media-data" && Array.isArray(msg.payload)) {
        setLibraryMedia(msg.payload as MediaItem[]);
        return;
      }
      if (msg.type === "state:library-updated") {
        loadLibraryMedia();
      }
    });
    return unsub;
  }, [loadLibraryMedia]);

  // Fallback polling: refresh media every 30s in case event-based sync fails
  useEffect(() => {
    const interval = setInterval(() => {
      void loadLibraryMedia();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadLibraryMedia]);

  // ── Fetch uploaded files from overlay server ──

  const fetchUploads = useCallback(async () => {
    setUploadsLoading(true);
    try {
      const resp = await fetch("/api/uploads");
      if (resp.ok) {
        const files: string[] = await resp.json();
        if (mountedRef.current) {
          setUploadedFiles(files.filter((file) => isMediaFile(file) && !isInternalUploadFile(file)));
        }
      }
    } catch {
      // Silently fail — uploads listing is optional
    } finally {
      if (mountedRef.current) setUploadsLoading(false);
    }
  }, []);

  // Fetch uploads on mount
  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  // Validate file existence on load — remove entries whose files are missing from disk
  const uploadsValidatedRef = useRef(false);
  useEffect(() => {
    if (!uploadsDir || uploadedFiles.length === 0 || uploadsValidatedRef.current) return;
    uploadsValidatedRef.current = true;
    const sep = uploadsDir.includes("\\") ? "\\" : "/";
    const checkAndClean = async () => {
      const results = await Promise.all(
        uploadedFiles.map(async (file) => {
          try {
            const filePath = `${uploadsDir}${sep}${file}`;
            const resp = await fetch(`/api/file-exists?path=${encodeURIComponent(filePath)}`);
            if (!resp.ok) return { file, exists: true };
            const data = await resp.json();
            return { file, exists: !!data.exists };
          } catch {
            return { file, exists: true };
          }
        }),
      );
      const missing = results.filter((r) => !r.exists);
      if (missing.length > 0) {
        console.warn("[DockMediaTab] Removing upload entries with missing files:", missing.map((r) => r.file));
        setUploadedFiles((prev) => prev.filter((f) => !missing.some((m) => m.file === f)));
      }
    };
    void checkAndClean();
  }, [uploadsDir, uploadedFiles]);

  // Validate local library file paths on load
  const libraryValidatedRef = useRef(false);
  useEffect(() => {
    if (localLibrary.length === 0 || libraryValidatedRef.current) return;
    libraryValidatedRef.current = true;
    const checkAndClean = async () => {
      const results = await Promise.all(
        localLibrary.map(async (item) => {
          if (!item.filePath) return { id: item.id, exists: true };
          try {
            const resp = await fetch(`/api/file-exists?path=${encodeURIComponent(item.filePath)}`);
            if (!resp.ok) return { id: item.id, exists: true };
            const data = await resp.json();
            return { id: item.id, exists: !!data.exists };
          } catch {
            return { id: item.id, exists: true };
          }
        }),
      );
      const missingIds = new Set(results.filter((r) => !r.exists).map((r) => r.id));
      if (missingIds.size > 0) {
        console.warn("[DockMediaTab] Removing library items with missing files:", [...missingIds]);
        setLocalLibrary((prev) => prev.filter((item) => !missingIds.has(item.id)));
      }
    };
    void checkAndClean();
  }, [localLibrary]);

  useEffect(() => {
    if (!showAddMediaModal || addMediaTab !== "template-videos" || templateVideos.length > 0 || templateVideosLoading) {
      return;
    }
    void loadTemplateVideos();
  }, [addMediaTab, loadTemplateVideos, showAddMediaModal, templateVideos.length, templateVideosLoading]);

  // ── Play uploaded media via OBS — send to Preview or Go Live ──

  const playMedia = useCallback(
    async (fileName: string, options?: DockMediaSendOptions): Promise<boolean> => {
      try {
        await ensureObsConnected();
      } catch {
        console.warn("[DockMediaTab] Not connected to OBS");
        return false;
      }

      setSendingFile(`upload:${fileName}`);
      try {
        let dir = uploadsDir;
        if (!dir) {
          try {
            const res = await fetch("/api/uploads-dir");
            if (res.ok) {
              const data = await res.json();
              dir = data.path || null;
              if (dir) setUploadsDir(dir);
            }
          } catch { /* ignore */ }
        }
        if (!dir) {
          console.warn("[DockMediaTab] Could not resolve uploads directory");
          return false;
        }

        const sep = dir.includes("\\") ? "\\" : "/";
        const filePath = `${dir}${sep}${fileName}`;
        await dockObsClient.pushMedia(filePath, fileName, options);
        setSendError(null);
        track("media_presented");
        trackMediaPresented("uploaded");
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to send media";
        console.warn("[DockMediaTab] Play media failed:", msg);
        setSendError(msg);
        return false;
      } finally {
        setSendingFile(null);
      }
    },
    [uploadsDir]
  );

  // ── Play library media item via OBS ──

  const playLibraryMedia = useCallback(
    async (item: MediaItem, options?: DockMediaSendOptions): Promise<boolean> => {
      try {
        await ensureObsConnected();
      } catch {
        return false;
      }

      setSendingFile(`library:${item.id}`);
      try {
        let filePath: string;

        if (item.filePath) {
          filePath = item.filePath;
        } else if (item.url.startsWith("data:")) {
          const res = await fetch("/api/save-media", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: item.name, dataUrl: item.url }),
          });
          if (!res.ok) throw new Error(`save-media failed: ${res.status}`);
          const data = await res.json();
          if (!data.path) throw new Error("No path returned from save-media");
          filePath = data.path;
        } else if (uploadsDir && !item.url.startsWith("http") && !item.url.startsWith("blob:")) {
          filePath = item.url;
        } else if (uploadsDir) {
          const fileName = item.url.split("/").pop() || item.name;
          const sep = uploadsDir.includes("\\") ? "\\" : "/";
          filePath = `${uploadsDir}${sep}${decodeURIComponent(fileName)}`;
        } else {
          throw new Error("Cannot resolve media to a local file path");
        }

        await dockObsClient.pushMedia(filePath, item.name, options);
        setSendError(null);
        track("media_presented");
        trackMediaPresented("library");
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to send media";
        console.warn("[DockMediaTab] Play library media failed:", msg);
        setSendError(msg);
        return false;
      } finally {
        setSendingFile(null);
      }
    },
    [uploadsDir]
  );

  const refreshMedia = useCallback(async () => {
    await Promise.all([fetchUploads(), loadLibraryMedia()]);
  }, [fetchUploads, loadLibraryMedia]);

  const mergedLibraryItems = useMemo(
    () => dedupeMediaItems([...libraryMedia, ...localLibrary]),
    [libraryMedia, localLibrary],
  );

  const representedUploadNames = useMemo(() => {
    const names = new Set<string>();
    for (const item of mergedLibraryItems) {
      if (item.diskFileName) names.add(item.diskFileName);
      if (item.name) names.add(item.name);
    }
    return names;
  }, [mergedLibraryItems]);

  const uploadedEntries = useMemo(
    () => uploadedFiles.reduce<DockMediaEntry[]>((entries, file) => {
      const kind = getUploadMediaKind(file);
      if (!kind || representedUploadNames.has(file)) return entries;
      const prefKey = `media:${file}`;
      if (mediaPrefs[prefKey]?.hidden) return entries;
      entries.push({
        key: prefKey,
        prefKey,
        name: file,
        kind,
        createdAt: "",
        originLabel: "Uploads",
        mimeLabel: file.split(".").pop()?.toUpperCase(),
        uploadFile: file,
        previewUrl: `${overlayBaseUrl}/uploads/${encodeURIComponent(file)}`,
        playingKey: `upload:${file}`,
      });
      return entries;
    }, []),
    [mediaPrefs, overlayBaseUrl, representedUploadNames, uploadedFiles],
  );

  const libraryEntries = useMemo(
    () => mergedLibraryItems
      .filter((item) => (item.type === "video" || item.type === "image") && !isAnimationMediaItem(item))
      .map((item) => createLibraryEntry(
        item,
        overlayBaseUrl,
        libraryMedia.some((candidate) => candidate.id === item.id) ? "Library" : "Dock",
      ))
      .filter((entry) => !mediaPrefs[entry.prefKey]?.hidden),
    [libraryMedia, mediaPrefs, mergedLibraryItems, overlayBaseUrl],
  );

  const animationEntries = useMemo(
    () => mergedLibraryItems
      .filter((item) => isAnimationMediaItem(item))
      .map((item) => createLibraryEntry(item, overlayBaseUrl, "Animation"))
      .filter((entry) => !mediaPrefs[entry.prefKey]?.hidden),
    [mediaPrefs, mergedLibraryItems, overlayBaseUrl],
  );

  const mediaEntries = useMemo(
    () => [...libraryEntries, ...uploadedEntries].sort((a, b) => {
      if (viewMode === "recent") {
        // Recently Used: sort by lastUsedAt DESC, items without usage go to bottom
        const aUsed = mediaPrefs[a.prefKey]?.lastUsedAt || "";
        const bUsed = mediaPrefs[b.prefKey]?.lastUsedAt || "";
        if (aUsed && !bUsed) return -1;
        if (!aUsed && bUsed) return 1;
        if (aUsed && bUsed) return bUsed.localeCompare(aUsed);
        // Both unused — fall back to createdAt DESC
        const aCreatedAt = a.createdAt ?? "";
        const bCreatedAt = b.createdAt ?? "";
        if (aCreatedAt === "" && bCreatedAt !== "") return -1;
        if (aCreatedAt !== "" && bCreatedAt === "") return 1;
        return bCreatedAt.localeCompare(aCreatedAt);
      }
      // Newly Uploaded (default): sort by createdAt DESC, lastUsedAt as tiebreaker
      const aCreatedAt = a.createdAt ?? "";
      const bCreatedAt = b.createdAt ?? "";
      // Empty createdAt (uploads without timestamps) should sort first
      if (aCreatedAt === "" && bCreatedAt !== "") return -1;
      if (aCreatedAt !== "" && bCreatedAt === "") return 1;
      if (aCreatedAt !== bCreatedAt) {
        return bCreatedAt.localeCompare(aCreatedAt);
      }
      const aUsed = mediaPrefs[a.prefKey]?.lastUsedAt || "";
      const bUsed = mediaPrefs[b.prefKey]?.lastUsedAt || "";
      return bUsed.localeCompare(aUsed);
    }),
    [libraryEntries, mediaPrefs, uploadedEntries, viewMode],
  );

  const videoEntries = useMemo(() => mediaEntries.filter((entry) => entry.kind === "video"), [mediaEntries]);
  const imageEntries = useMemo(() => mediaEntries.filter((entry) => entry.kind === "image"), [mediaEntries]);
  const patternEntries = useMemo(() => BACKGROUND_PATTERNS.map(createPatternEntry), []);
  const filteredUploadEntries = useMemo(() => {
    const pool = activeKind === "all" ? mediaEntries : activeKind === "video" ? videoEntries : imageEntries;
    const query = assetSearch.trim().toLowerCase();
    if (!query) return pool;
    return pool.filter((entry) => entry.name.toLowerCase().includes(query));
  }, [activeKind, assetSearch, imageEntries, mediaEntries, videoEntries]);

  // ── Plan-locked items: items beyond the plan limit get a blur + padlock ──
  const lockedKeys = useMemo(() => {
    const locked = new Set<string>();
    let plan = "free";
    try { plan = localStorage.getItem("ocs-dock-plan") || "free"; } catch { /* */ }

    // Try server-provided entitlements first, then FALLBACK_LIMITS
    let serverEntitlements: Record<string, number | boolean> | null = null;
    try {
      const raw = localStorage.getItem("ocs-dock-entitlements");
      if (raw) serverEntitlements = JSON.parse(raw);
    } catch { /* */ }

    const getLimit = (feature: string): number => {
      if (serverEntitlements && serverEntitlements[feature] !== undefined) {
        const v = serverEntitlements[feature];
        if (typeof v === "boolean") return v ? -1 : 0;
        if (typeof v === "number") return v;
      }
      return getFeatureLimit(feature as any, plan);
    };

    const imageLimit = getLimit("images");
    const videoLimit = getLimit("videos");

    // Lock excess images (items sorted by createdAt desc — first N are allowed)
    if (imageLimit >= 0) {
      let count = 0;
      for (const entry of mediaEntries) {
        if (entry.kind === "image") {
          if (count >= imageLimit) locked.add(entry.key);
          count++;
        }
      }
    }

    // Lock excess videos
    if (videoLimit >= 0) {
      let count = 0;
      for (const entry of mediaEntries) {
        if (entry.kind === "video") {
          if (count >= videoLimit) locked.add(entry.key);
          count++;
        }
      }
    }

    return locked;
  }, [mediaEntries]);
  const filteredPatternEntries = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    if (!query) return patternEntries;
    return patternEntries.filter((entry) => entry.name.toLowerCase().includes(query));
  }, [assetSearch, patternEntries]);
  const filteredAnimationEntries = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    if (!query) return animationEntries;
    return animationEntries.filter((entry) => entry.name.toLowerCase().includes(query));
  }, [animationEntries, assetSearch]);
  const filteredTemplateVideos = useMemo(() => {
    const query = templateVideoSearch.trim().toLowerCase();
    return templateVideos.filter((asset) => !query || asset.fileName.toLowerCase().includes(query));
  }, [templateVideoSearch, templateVideos]);
  const managedEntries = useMemo(
    () => [...mediaEntries, ...animationEntries],
    [animationEntries, mediaEntries],
  );
  const allResolvableEntries = useMemo(
    () => [...managedEntries, ...patternEntries],
    [managedEntries, patternEntries],
  );
  const activeOptionsEntry = useMemo(
    () => managedEntries.find((entry) => entry.key === openOptionsKey) ?? null,
    [managedEntries, openOptionsKey],
  );
  const previewBaseEntry = activeTargets.active;

  // ── Selection helpers ──
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      if (prev) setSelectedKeys(new Set());
      return !prev;
    });
  }, []);

  const toggleSelectKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    setSelectionMode(false);
  }, []);

  const handleCreateVlcPlaylist = useCallback(async () => {
    if (selectedKeys.size === 0) return;
    const videoCount = libraryMedia.filter((m) => m.type === "video").length;
    if (!(await requireEntitlement("videos", videoCount))) return;
    try {
      await ensureObsConnected();
    } catch {
      console.warn("[DockMediaTab] Cannot create playlist: not connected to OBS");
      return;
    }

    const entryMap = new Map(allResolvableEntries.map((e) => [e.key, e]));
    const videoPaths: string[] = [];
    const imagePaths: string[] = [];

    for (const key of selectedKeys) {
      const entry = entryMap.get(key);
      if (!entry) continue;

      let filePath: string | null = null;
      if (entry.uploadFile) {
        let dir = uploadsDir;
        if (!dir) {
          try {
            const res = await fetch("/api/uploads-dir");
            if (res.ok) { const data = await res.json(); dir = data.path || null; }
          } catch { /* ignore */ }
        }
        if (dir) {
          const sep = dir.includes("\\") ? "\\" : "/";
          filePath = `${dir}${sep}${entry.uploadFile}`;
        }
      } else if (entry.libraryItem?.filePath) {
        filePath = entry.libraryItem.filePath;
      }

      if (filePath) {
        if (entry.kind === "image") {
          imagePaths.push(filePath);
        } else {
          videoPaths.push(filePath);
        }
      }
    }

    try {
      const sourceName = playlistName.trim() || "Media Playlist";

      // Create Slideshow for videos
      if (videoPaths.length > 0) {
        await dockObsClient.pushVlcPlaylist({
          sourceName: `${sourceName} - Videos`,
          playlist: videoPaths,
          loop: playlistLoop,
          shuffle: playlistShuffle,
          muted: playlistMuted,
        });
      }

      // Create image slideshow for images
      if (imagePaths.length > 0) {
        await dockObsClient.pushImageSlideshow({
          sourceName: `${sourceName} - Images`,
          images: imagePaths,
          loop: playlistLoop,
          transitionTime: 3000,
        });
      }

      setShowPlaylistModal(false);
      clearSelection();
    } catch (err) {
      console.warn("[DockMediaTab] Failed to create playlist:", err);
    }
  }, [allResolvableEntries, selectedKeys, uploadsDir, playlistName, playlistLoop, playlistShuffle, playlistMuted, clearSelection]);

  const selectedEntries = useMemo(
    () => {
      const entryMap = new Map(allResolvableEntries.map((e) => [e.key, e]));
      return Array.from(selectedKeys)
        .map(key => entryMap.get(key))
        .filter((e): e is DockMediaEntry => !!e);
    },
    [selectedKeys, allResolvableEntries],
  );

  const selectedVideoEntries = useMemo(
    () => selectedEntries.filter((e) => e.kind === "video"),
    [selectedEntries],
  );

  const selectedImageEntries = useMemo(
    () => selectedEntries.filter((e) => e.kind === "image"),
    [selectedEntries],
  );

  useEffect(() => {
    const entryMap = new Map(allResolvableEntries.map((entry) => [entry.key, entry]));
    setActiveTargets({
      active: activeTargetKeys.active ? entryMap.get(activeTargetKeys.active) ?? null : null,
    });
  }, [activeTargetKeys.active, allResolvableEntries]);

  useEffect(() => {
    try {
      localStorage.setItem(MEDIA_SESSION_STORAGE_KEY, JSON.stringify({
        browserTab,
        activeKind,
        viewMode,
        activeTargetKeys,
        pausedTargets,
        textOverlay,
        textOverlayTargets,
      } satisfies DockMediaSessionState));
    } catch {
      // Dock session persistence is convenience-only.
    }
  }, [activeKind, activeTargetKeys, browserTab, pausedTargets, textOverlay, textOverlayTargets, viewMode]);

  useEffect(() => {
    if (activeKind === "video" && videoEntries.length === 0 && imageEntries.length > 0) {
      setActiveKind("image");
      return;
    }
    if (activeKind === "image" && imageEntries.length === 0 && videoEntries.length > 0) {
      setActiveKind("video");
    }
    if (activeKind === "all" && mediaEntries.length === 0) {
      // Stay on "all" even when empty — shows the empty state
    }
  }, [activeKind, imageEntries.length, mediaEntries.length, videoEntries.length]);

  const getEntryPrefs = useCallback(
    (entry: DockMediaEntry): DockMediaPreference => mediaPrefs[entry.prefKey] ?? {},
    [mediaPrefs],
  );

  const getEntrySendOptions = useCallback(
    (entry: DockMediaEntry): DockMediaSendOptions => {
      const prefs = getEntryPrefs(entry);
      if (entry.kind === "video") {
        return {
          muted: prefs.videoMuted ?? true,
          looping: prefs.loop ?? true,
          fitMode: prefs.fitMode ?? "cover",
        };
      }
      return {
        imageAudioInputName: prefs.imageAudioInputName || null,
        fitMode: prefs.fitMode ?? "cover",
      };
    },
    [getEntryPrefs],
  );

  const toggleVideoMute = useCallback(
    async (entry: DockMediaEntry) => {
      const currentMuted = getEntryPrefs(entry).videoMuted ?? true;
      const nextMuted = !currentMuted;
      updateMediaPreference(entry.prefKey, { videoMuted: nextMuted });

      if (activeTargets.active?.key === entry.key) {
        try {
          await ensureObsConnected();
          await dockObsClient.setMediaVideoMuted(nextMuted);
        } catch (err) {
          console.warn("[DockMediaTab] toggleVideoMute failed:", err);
        }
      }
    },
    [activeTargets.active, getEntryPrefs, updateMediaPreference],
  );

  const setEntryLoop = useCallback(
    async (entry: DockMediaEntry, looping: boolean) => {
      updateMediaPreference(entry.prefKey, { loop: looping });
      if (activeTargets.active?.key === entry.key) {
        try {
          await ensureObsConnected();
          await dockObsClient.setMediaLooping(looping);
        } catch (err) {
          console.warn("[DockMediaTab] setEntryLoop failed:", err);
        }
      }
    },
    [activeTargets.active, updateMediaPreference],
  );

  const setEntryFitMode = useCallback(
    async (entry: DockMediaEntry, fitMode: DockMediaFitMode) => {
      updateMediaPreference(entry.prefKey, { fitMode });
      if (activeTargets.active?.key === entry.key) {
        try {
          await ensureObsConnected();
          await dockObsClient.setMediaFitMode(fitMode);
        } catch (err) {
          console.warn("[DockMediaTab] setEntryFitMode failed:", err);
        }
      }
    },
    [activeTargets.active, updateMediaPreference],
  );

  const setEntryLabel = useCallback((entry: DockMediaEntry, label: string) => {
    updateMediaPreference(entry.prefKey, { label });
  }, [updateMediaPreference]);

  const closeEntryOptions = useCallback(() => {
    setOpenOptionsKey(null);
  }, []);

  const saveMediaToAppLibrary = useCallback((item: MediaItem) => {
    dockClient.sendCommand({
      type: "media:save",
      payload: item,
      timestamp: Date.now(),
      commandId: `dock-media-save-${item.id}`,
    });
    dockClient.sendCommand({ type: "request-library-data", timestamp: Date.now() });
  }, []);

  const removeMediaFromAppLibrary = useCallback((id: string) => {
    dockClient.sendCommand({
      type: "media:delete",
      payload: { id },
      timestamp: Date.now(),
      commandId: `dock-media-delete-${id}`,
    });
    dockClient.sendCommand({ type: "request-library-data", timestamp: Date.now() });
  }, []);

  // Directly delete from IndexedDB (called alongside the bridge command for reliability)
  const deleteFromIndexedDb = useCallback(async (id: string) => {
    try {
      const { deleteMedia } = await import("../../library/libraryDb");
      await deleteMedia(id);
    } catch {
      // Bridge command is the primary path; this is a safety net
    }
  }, []);

  const handleUploadFiles = useCallback(async (files: FileList | File[]) => {
    console.log("[UPLOAD] ─── handleUploadFiles started ───");
    const allFiles = Array.from(files);
    console.log("[UPLOAD] Total files:", allFiles.length);
    // Validate file types — reject unsupported files with clear error
    const rejected = allFiles.filter((f) => !isSupportedMediaFile(f));
    for (const f of rejected) {
      showUpgradeModal(`Unsupported file type: "${f.name}". Please upload an image or video file.`);
    }
    const queue = allFiles.filter((f) => isSupportedMediaFile(f));
    if (queue.length === 0) return;

    // ── Per-file-type quota enforcement ──
    // Resolve limits from server entitlements → localStorage → fallback
    let plan = "free";
    try { plan = localStorage.getItem("ocs-dock-plan") || "free"; } catch { /* */ }
    let serverEntitlements: Record<string, number | boolean> | null = null;
    try {
      const raw = localStorage.getItem("ocs-dock-entitlements");
      if (raw) serverEntitlements = JSON.parse(raw);
    } catch { /* */ }
    const getLimit = (feature: string): number => {
      if (serverEntitlements && serverEntitlements[feature] !== undefined) {
        const v = serverEntitlements[feature];
        if (typeof v === "boolean") return v ? -1 : 0;
        if (typeof v === "number") return v;
      }
      return getFeatureLimit(feature as any, plan);
    };
    const imageLimit = getLimit("images");
    const videoLimit = getLimit("videos");

    // Count current stored items per type
    const currentImages = libraryMedia.filter((m) => m.type === "image").length;
    const currentVideos = libraryMedia.filter((m) => m.type === "video").length;

    // Count incoming files per type
    const incomingImages = queue.filter((f) => f.type.startsWith("image/")).length;
    const incomingVideos = queue.filter((f) => f.type.startsWith("video/")).length;

    // Check if each type would exceed quota
    const imageQuotaExceeded = imageLimit >= 0 && (currentImages + incomingImages) > imageLimit;
    const videoQuotaExceeded = videoLimit >= 0 && (currentVideos + incomingVideos) > videoLimit;

    // Both types over limit → block entirely
    if (imageQuotaExceeded && videoQuotaExceeded) {
      showUpgradeModal(`You've reached your media limits (${currentImages}/${imageLimit} images, ${currentVideos}/${videoLimit} videos). Upgrade to upload more.`);
      return;
    }

    // Filter queue to only allow files whose type is within quota
    const allowedQueue = queue.filter((file) => {
      if (file.type.startsWith("image/") && imageQuotaExceeded) return false;
      if (file.type.startsWith("video/") && videoQuotaExceeded) return false;
      return true;
    });

    if (allowedQueue.length === 0) return;

    // Show explanation if some files were rejected
    const rejectedCount = queue.length - allowedQueue.length;
    if (rejectedCount > 0) {
      const rejectedType = imageQuotaExceeded ? "images" : "videos";
      const limit = imageQuotaExceeded ? imageLimit : videoLimit;
      const current = imageQuotaExceeded ? currentImages : currentVideos;
      showUpgradeModal(`You've reached your ${rejectedType} limit (${current}/${limit}). ${rejectedCount} ${rejectedType} file${rejectedCount > 1 ? "s were" : " was"} skipped. Upgrade to upload more.`);
    }

    setUploading(true);
    console.log("[UPLOAD] Queue after filtering:", allowedQueue.map((f) => f.name));
    console.log("[UPLOAD] Limits:", { imageLimit, videoLimit, currentImages, currentVideos });
    try {
      const nextItems: MediaItem[] = [];
      for (const file of allowedQueue) {
        console.log("[UPLOAD] ── Uploading:", file.name, { size: file.size, type: file.type });
        const uploadStart = performance.now();
        const { item, error } = await uploadFileToDock(file);
        const uploadMs = Math.round(performance.now() - uploadStart);
        if (error) {
          console.warn("[UPLOAD] ✗ Upload FAILED:", file.name, error, `${uploadMs}ms`);
          continue;
        }
        console.log("[UPLOAD] ✓ Upload OK:", file.name, { id: item.id, filePath: item.filePath, uploadMs });
        nextItems.push(item);
        console.log("[UPLOAD] Saving to app library:", item.id);
        saveMediaToAppLibrary(item);
      }
      if (nextItems.length > 0) {
        // Mark excess items with old createdAt so lockedKeys puts them at the bottom
        // Recount after upload to handle items that push past the limit
        const postImages = currentImages + nextItems.filter((i) => i.type === "image").length;
        const postVideos = currentVideos + nextItems.filter((i) => i.type === "video").length;
        let excessImages = imageLimit >= 0 ? Math.max(0, postImages - imageLimit) : 0;
        let excessVideos = videoLimit >= 0 ? Math.max(0, postVideos - videoLimit) : 0;

        const patchedItems = nextItems.map((item) => {
          if (item.type === "image" && excessImages > 0) {
            excessImages--;
            return { ...item, createdAt: "0001-01-01T00:00:00.000Z" } as MediaItem;
          }
          if (item.type === "video" && excessVideos > 0) {
            excessVideos--;
            return { ...item, createdAt: "0001-01-01T00:00:00.000Z" } as MediaItem;
          }
          return item;
        });

        persistLocalLibrary((current) => [...patchedItems, ...current]);
        setLibraryMedia((current) => dedupeMediaItems([...patchedItems, ...current]));
        console.log("[UPLOAD] About to refreshMedia. Library size:", mergedLibraryItems.length, "Local:", localLibrary.length);
        await refreshMedia();
        console.log("[UPLOAD] refreshMedia complete. Library size:", libraryMedia.length);
        setShowAddMediaModal(false);
        for (const item of patchedItems) {
          track("media_uploaded", { mediaType: item.type });
        }
        console.log("[UPLOAD] ─── Upload flow finished successfully ───");
      } else {
        console.log("[UPLOAD] No items uploaded (all failed or quota blocked)");
      }
    } catch (err) {
      console.error("[UPLOAD] ✗ Upload flow FAILED:", err);
    } finally {
      console.log("[UPLOAD] Finally block — setting uploading=false");
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }, [libraryMedia, persistLocalLibrary, refreshMedia, saveMediaToAppLibrary]);

  const deleteEntry = useCallback(
    async (entry: DockMediaEntry) => {
      updateMediaPreference(entry.prefKey, { hidden: true });
      if (entry.libraryItem?.id) {
        removeMediaFromAppLibrary(entry.libraryItem.id);
        await deleteFromIndexedDb(entry.libraryItem.id);
        setLibraryMedia((current) => current.filter((item) => item.id !== entry.libraryItem?.id));
        persistLocalLibrary((current) => current.filter((item) => item.id !== entry.libraryItem?.id));
      }
      if (activeTargets.active?.key === entry.key) {
        setOpenOptionsKey(null);
      }
    },
    [activeTargets.active, deleteFromIndexedDb, persistLocalLibrary, removeMediaFromAppLibrary, updateMediaPreference],
  );

  const handleSendEntry = useCallback(
    async (entry: DockMediaEntry) => {
      // Presentation actions do NOT consume storage quota — no entitlement check needed.
      // The media already exists within the user's allowed quota.
      let success = false;
      const options = getEntrySendOptions(entry);
      if (entry.uploadFile) {
        success = await playMedia(entry.uploadFile, options);
      } else if (entry.libraryItem) {
        success = await playLibraryMedia(entry.libraryItem, options);
      }

      if (!success) return;

      setActiveTargetKeys({ active: entry.key });
      updateMediaPreference(entry.prefKey, { lastUsedAt: new Date().toISOString() });
      setPausedTargets({ active: false });
    },
    [getEntrySendOptions, playLibraryMedia, playMedia, updateMediaPreference]
  );

  const handleSendPattern = useCallback(async (entry: DockMediaEntry) => {
    // Presentation actions do NOT consume storage quota — no entitlement check needed.
    setSendingFile(entry.playingKey);
    try {
      if (!entry.previewUrl) return;
      await ensureObsConnected();
      await dockObsClient.pushPatternBackground(entry.previewUrl, entry.name);
      setActiveTargetKeys({ active: entry.key });
      setPausedTargets({ active: false });
      updateMediaPreference(entry.prefKey, { lastUsedAt: new Date().toISOString() });
    } catch (err) {
      console.warn("[DockMediaTab] Pattern push failed:", err);
    } finally {
      setSendingFile(null);
    }
  }, [updateMediaPreference]);

  const findDownloadedTemplateVideo = useCallback((asset: TemplateVideoAsset) => (
    mergedLibraryItems.find((item) => (
      item.type === "video" &&
      Boolean(item.filePath) &&
      (item.sourceAssetId === asset.id ||
        item.cloudflareKey === asset.cloudflareKey ||
        (item.source === "template-cloudflare" && item.name === asset.fileName))
    ))
  ), [mergedLibraryItems]);

  const handleDownloadTemplateVideo = useCallback(async (asset: TemplateVideoAsset) => {
    const videoCount = libraryMedia.filter((m) => m.type === "video").length;
    if (!(await requireEntitlement("videos", videoCount))) return;
    setSendingFile(`template:${asset.id}`);
    try {
      const item = await downloadTemplateVideoToLibrary(asset, (fraction) => {
        setTemplateVideoProgress((current) => ({ ...current, [asset.id]: fraction }));
      });

      setLibraryMedia((current) => dedupeMediaItems([item, ...current]));
      persistLocalLibrary((current) => dedupeMediaItems([item, ...current]));
      dockClient.sendCommand({ type: "request-library-data", timestamp: Date.now() });
    } catch (err) {
      console.warn("[DockMediaTab] Template video download failed:", err);
      setTemplateVideosError(err instanceof Error ? err.message : `Unable to download ${asset.fileName}.`);
    } finally {
      setTemplateVideoProgress((current) => {
        const next = { ...current };
        delete next[asset.id];
        return next;
      });
      setSendingFile(null);
    }
  }, [
    dockClient,
    persistLocalLibrary,
  ]);

  const applyTextOverlay = useCallback(async () => {
    const trimmedHeadline = textOverlay.headline.trim();
    const trimmedSubline = textOverlay.subline.trim();

    setApplyingTextTarget(true);
    try {
      await ensureObsConnected();
      await dockObsClient.setMediaTextOverlay(trimmedHeadline || trimmedSubline ? {
        headline: trimmedHeadline,
        subline: trimmedSubline || undefined,
        align: textOverlay.align,
        verticalPos: textOverlay.verticalPos,
        headlineSize: textOverlay.headlineSize,
        sublineSize: textOverlay.sublineSize,
        animation: textOverlay.animation,
        animationDuration: textOverlay.animationDuration,
      } : null);
      setTextOverlayTargets({ active: Boolean(trimmedHeadline || trimmedSubline) });
    } catch (err) {
      console.warn("[DockMediaTab] Failed to apply text overlay:", err);
    } finally {
      setApplyingTextTarget(null);
    }
  }, [textOverlay]);

  const clearTextOverlayEverywhere = useCallback(async () => {
    setTextOverlay((current) => ({ ...current, headline: "", subline: "" }));
    setApplyingTextTarget(true);
    try {
      await ensureObsConnected();
      await dockObsClient.setMediaTextOverlay(null);
      setTextOverlayTargets({ active: false });
    } catch (err) {
      console.warn("[DockMediaTab] Failed to clear text overlays:", err);
    } finally {
      setApplyingTextTarget(null);
    }
  }, []);

  const triggerAnimPreview = useCallback(() => {
    setAnimatingPreview(true);
    setTimeout(() => setAnimatingPreview(false), (textOverlay.animationDuration || 1) * 1000 + 200);
  }, [textOverlay.animationDuration]);

  const getAnimationClass = useCallback((): string => {
    if (!animatingPreview) return "";
    switch (textOverlay.animation) {
      case "fade": return "dock-overlay-anim--fade";
      case "fade-up": return "dock-overlay-anim--fade-up";
      case "slide-up": return "dock-overlay-anim--slide-up";
      case "slide-down": return "dock-overlay-anim--slide-down";
      case "zoom": return "dock-overlay-anim--zoom";
      default: return "";
    }
  }, [animatingPreview, textOverlay.animation]);

  const getVerticalPosStyle = useCallback((): React.CSSProperties => {
    switch (textOverlay.verticalPos) {
      case "top": return { justifyContent: "flex-start", paddingTop: "12%" };
      case "center": return { justifyContent: "center" };
      case "bottom": return { justifyContent: "flex-end", paddingBottom: "12%" };
      default: return { justifyContent: "flex-end", paddingBottom: "12%" };
    }
  }, [textOverlay.verticalPos]);

  const clearMedia = useCallback(async () => {
    setClearingTarget(true);
    try {
      await ensureObsConnected();

      await dockObsClient.clearMedia();
      setActiveTargetKeys({ active: null });
      setPausedTargets({ active: false });
      setTextOverlayTargets({ active: false });
    } catch (err) {
      console.warn("[DockMediaTab] Clear media failed:", err);
    } finally {
      setClearingTarget(null);
    }
  }, []);

  const clearAllMedia = useCallback(() => {
    // Hide all entries via preferences
    setMediaPrefs((prev) => {
      const next = { ...prev };
      for (const entry of mediaEntries) {
        next[entry.prefKey] = { ...next[entry.prefKey], hidden: true };
      }
      return next;
    });
    // Remove all library items
    const libraryIds = mediaEntries
      .filter((entry) => entry.libraryItem?.id)
      .map((entry) => entry.libraryItem!.id);
    if (libraryIds.length > 0) {
      setLibraryMedia((current) => current.filter((item) => !libraryIds.includes(item.id)));
      persistLocalLibrary((current) => current.filter((item) => !libraryIds.includes(item.id)));
      for (const id of libraryIds) {
        removeMediaFromAppLibrary(id);
        void deleteFromIndexedDb(id);
      }
    }
    setShowClearAllConfirm(false);
  }, [mediaEntries, deleteFromIndexedDb, persistLocalLibrary, removeMediaFromAppLibrary]);

  const renderMediaCard = useCallback(
    (entry: DockMediaEntry) => {
      const isActiveTarget = activeTargets.active?.key === entry.key;
      const prefs = getEntryPrefs(entry);
      const displayName = prefs.label?.trim() || entry.name;
      const isSelected = selectedKeys.has(entry.key);
      const canSelect = selectionMode && (entry.kind === "video" || entry.kind === "image");
      const isLocked = lockedKeys.has(entry.key);

      let thumbUrl = "";
      if (entry.thumbnailUrl) {
        thumbUrl = entry.thumbnailUrl;
      } else if (entry.previewUrl && entry.kind === "image") {
        thumbUrl = entry.previewUrl;
      }

      const statusLabel = isActiveTarget ? (pausedTargets.active ? "In Preview" : "Live") : null;
      const statusVariant = isActiveTarget ? (pausedTargets.active ? "preview" : "live") : null;

      const handleCardClick = () => {
        if (isLocked) {
          void requireEntitlement(entry.kind === "video" ? "videos" : "images", 0);
          return;
        }
        if (canSelect) toggleSelectKey(entry.key);
        else void handleSendEntry(entry);
      };

      const handleCardKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleCardClick();
        }
      };

      return (
        <div
          key={entry.key}
          className={`dock-media-gallery-card${isActiveTarget ? " dock-media-gallery-card--active" : ""}${isSelected ? " dock-media-gallery-card--selected" : ""}${isLocked ? " dock-media-gallery-card--locked" : ""}`}
          role="button"
          tabIndex={0}
          onClick={handleCardClick}
          onKeyDown={handleCardKeyDown}
        >
          <div className="dock-media-gallery-card__image-wrap">
            {canSelect && !isLocked && (
              <span className={`dock-media-gallery-card__checkbox${isSelected ? " dock-media-gallery-card__checkbox--checked" : ""}`}>
                {isSelected ? <Icon name="check" size={10} /> : null}
              </span>
            )}
            {thumbUrl ? (
              <img src={thumbUrl} alt={displayName} loading="lazy" className="dock-media-gallery-card__image" />
            ) : entry.previewUrl && entry.kind === "video" ? (
              <video src={entry.previewUrl} className="dock-media-gallery-card__image" muted playsInline preload="metadata" />
            ) : (
              <div className="dock-media-gallery-card__placeholder">
                <Icon name={getFileIcon(entry.kind)} size={24} />
              </div>
            )}
            {isLocked ? (
              <div className="dock-media-gallery-card__lock-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="dock-media-gallery-card__lock-label">Upgrade to access</span>
              </div>
            ) : (
              <div className="dock-media-gallery-card__overlay">
                {!canSelect && (
                  <>
                    <div className="dock-media-gallery-card__overlay-top">
                      <button
                        type="button"
                        className="dock-media-gallery-card__menu-btn"
                        aria-label="More options"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenOptionsKey(openOptionsKey === entry.key ? null : entry.key);
                        }}
                      >
                        <Icon name="more_vert" size={14} />
                      </button>
                    </div>
                    <div className="dock-media-gallery-card__overlay-center">
                      <button
                        type="button"
                        className="dock-media-gallery-card__preview-btn"
                        aria-label={`Send ${displayName} to Preview`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleSendEntry(entry);
                        }}
                      >
                        <Icon name="open_in_new" size={14} />
                        Send
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {!isLocked && openOptionsKey === entry.key && (
              <div className="dock-media-gallery-card__context-menu" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="dock-media-gallery-card__context-item"
                  onClick={() => { setPreviewEntry(entry); setOpenOptionsKey(null); }}
                >
                  <Icon name="open_in_full" size={13} />
                  Preview
                </button>
                <button
                  type="button"
                  className="dock-media-gallery-card__context-item dock-media-gallery-card__context-item--danger"
                  onClick={() => { void deleteEntry(entry); setOpenOptionsKey(null); }}
                >
                  <Icon name="delete" size={13} />
                  Delete {entry.kind === "video" ? "video" : "image"}
                </button>
              </div>
            )}
          </div>
          <div className="dock-media-gallery-card__meta">
            <span className="dock-media-gallery-card__name">{displayName}</span>
            <div className="dock-media-gallery-card__meta-row">
              <span className="dock-media-gallery-card__type-badge">{entry.mimeLabel || (entry.kind === "video" ? "VID" : "IMG")}</span>
              {entry.durationSec ? (
                <span className="dock-media-gallery-card__duration">
                  <Icon name="movie" size={10} />
                  {fmtDuration(entry.durationSec)}
                </span>
              ) : null}
            </div>
          </div>
          {statusLabel && (
            <span className={`dock-media-gallery-card__status-chip dock-media-gallery-card__status-chip--${statusVariant}`}>
              {statusLabel}
            </span>
          )}
        </div>
      );
    },
    [
      activeTargets.active,
      deleteEntry,
      getEntryPrefs,
      handleSendEntry,
      lockedKeys,
      openOptionsKey,
      pausedTargets.active,
      selectionMode,
      selectedKeys,
      toggleSelectKey,
    ]
  );

  const searchPlaceholder = browserTab === "animations"
    ? "Search saved animations"
    : browserTab === "patterns"
      ? "Search patterns"
      : "Search uploads and saved media";

  // ── Render ──



  return (
    <div className="dock-media-console">
      {/* ── Header ── */}
      <div className="dock-media-header">
        <div className="dock-media-header__left">
          <span className="dock-media-header__label">Media</span>

        </div>
        <div className="dock-media-header__actions">
          <button
            type="button"
            className="dock-btn dock-btn--compact dock-btn--primary"
            onClick={() => {
              console.log("[UPLOAD] Add button clicked", { uploading, browserTab });
              console.log("[UPLOAD] Input ref:", uploadInputRef.current);
              // Always open the file picker — per-file quota is enforced inside handleUploadFiles
              uploadInputRef.current?.click();
            }}
            disabled={uploading || browserTab !== "uploads"}
            title={browserTab !== "uploads" ? "Upload is only available in Uploads tab" : (uploading ? "Uploading..." : "Upload media")}
          >
            <Icon name="add" size={12} />
            {uploading ? "Uploading" : "Add"}
          </button>
          <button
            type="button"
            className={`dock-btn dock-btn--compact${selectionMode ? " dock-btn--ghost" : " dock-btn--secondary"}`}
            onClick={async () => {
              // Allow cancelling selection mode without entitlement check
              if (selectionMode) {
                toggleSelectionMode();
                return;
              }
              if (!(await requireEntitlement("slideshow", 0))) return;
              toggleSelectionMode();
            }}
            disabled={browserTab !== "uploads"}
            title={browserTab !== "uploads" ? "Slideshow is only available in Uploads tab" : (selectionMode ? "Cancel selection" : "Create slideshow from selected media")}
          >
            {/* {selectionMode ? "Cancel" : "Create Slideshow"} */}
            <Icon name={selectionMode ? "close" : "slideshow"} size={12} />
          </button>

        </div>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        className="dock-media-upload-input"
        multiple
        accept="image/*,video/*"
        onChange={(event) => {
          const files = event.target.files;
          console.log("[UPLOAD] File picker changed", { count: files?.length ?? 0 });
          if (files?.length) {
            for (let i = 0; i < files.length; i++) {
              console.log(`[UPLOAD] File ${i}:`, { name: files[i].name, type: files[i].type, size: files[i].size });
            }
            void handleUploadFiles(files);
          }
        }}
      />

      {/* ── Category Tabs ── */}
      <div className="dock-media-tabs" role="tablist" aria-label="Media browser views">
        <button
          type="button"
          role="tab"
          aria-selected={browserTab === "uploads"}
          className={`dock-media-tab ${browserTab === "uploads" ? "dock-media-tab--active" : ""}`}
          onClick={() => setBrowserTab("uploads")}
        >
          Uploads
          <span className="dock-media-tab__count">{mediaEntries.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={browserTab === "animations"}
          className={`dock-media-tab ${browserTab === "animations" ? "dock-media-tab--active" : ""}`}
          onClick={() => setBrowserTab("animations")}
        >
          Animations
          <span className="dock-media-tab__count">{animationEntries.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={browserTab === "patterns"}
          className={`dock-media-tab ${browserTab === "patterns" ? "dock-media-tab--active" : ""}`}
          onClick={() => setBrowserTab("patterns")}
        >
          Patterns
          <span className="dock-media-tab__count">{BACKGROUND_PATTERNS.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={browserTab === "text"}
          className={`dock-media-tab ${browserTab === "text" ? "dock-media-tab--active" : ""}`}
          onClick={() => setBrowserTab("text")}
        >
          Text
        </button>
      </div>

      {/* ── Search Bar ── */}
      {browserTab !== "text" && (
        <div className="dock-media-search">
          <Icon name="search" size={12} className="dock-media-search__icon" />
          <input
            type="text"
            className="dock-media-search__input"
            value={assetSearch}
            onChange={(event) => setAssetSearch(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          {assetSearch && (
            <button
              type="button"
              className="dock-media-search__clear"
              onClick={() => setAssetSearch("")}
              aria-label="Clear asset search"
              title="Clear asset search"
            >
              <Icon name="close" size={10} />
            </button>
          )}
        </div>
      )}


      {/* ── Compact Status Row ── */}


      {/* ── Asset Browser ── */}
      <div className="dock-media-browser">
        {browserTab === "uploads" && (
          <>
            {videoEntries.length === 0 && imageEntries.length === 0 && !uploadsLoading && !libraryLoading ? (
              <div className="dock-media-empty">
                <div className="dock-media-empty__icon">
                  <Icon name="perm_media" size={24} />
                </div>
                <div className="dock-media-empty__title">No uploads or saved media yet</div>
                <div className="dock-media-empty__text">
                  Add images or videos. Saved media from the app library also appears here.
                </div>
                <button
                  type="button"
                  className="dock-btn dock-btn--primary dock-btn--compact"
                  onClick={() => openAddMediaModal("background")}
                >
                  <Icon name="add" size={12} />
                  Add Media
                </button>
              </div>
            ) : (
              <>
                {/* Kind toggle */}
                <div className="dock-media-pills" role="tablist" aria-label="Upload media type">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeKind === "all"}
                    className={`dock-media-pill${activeKind === "all" ? " dock-media-pill--active" : ""}`}
                    onClick={() => setActiveKind("all")}
                  >
                    All
                    <span className="dock-media-pill__count">{mediaEntries.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeKind === "video"}
                    className={`dock-media-pill${activeKind === "video" ? " dock-media-pill--active" : ""}`}
                    onClick={() => setActiveKind("video")}
                  >
                    Video
                    <span className="dock-media-pill__count">{videoEntries.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeKind === "image"}
                    className={`dock-media-pill${activeKind === "image" ? " dock-media-pill--active" : ""}`}
                    onClick={() => setActiveKind("image")}
                  >
                    Picture
                    <span className="dock-media-pill__count">{imageEntries.length}</span>
                  </button>
                </div>

                {/* View mode toggle */}
                <div className="dock-media-pills dock-media-pills--secondary" role="tablist" aria-label="Sort order">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === "recent"}
                    className={`dock-media-pill dock-media-pill--small${viewMode === "recent" ? " dock-media-pill--active" : ""}`}
                    onClick={() => setViewMode("recent")}
                  >
                    Recently Used
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === "uploaded"}
                    className={`dock-media-pill dock-media-pill--small${viewMode === "uploaded" ? " dock-media-pill--active" : ""}`}
                    onClick={() => setViewMode("uploaded")}
                  >
                    Newly Uploaded
                  </button>
                </div>

                {/* Error banner */}
                {sendError && (
                  <div className="dock-media-send-error">
                    <Icon name="error_outline" size={13} />
                    <span>{sendError}</span>
                    <button
                      type="button"
                      className="dock-media-send-error__dismiss"
                      onClick={() => setSendError(null)}
                      aria-label="Dismiss"
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                )}

                {/* Asset list */}
                {filteredUploadEntries.length === 0 ? (
                  <div className="dock-empty dock-empty--inline">
                    <div className="dock-empty__text">
                      {activeKind === "all"
                        ? "No media uploaded yet."
                        : activeKind === "video"
                          ? "No video media matches that search."
                          : "No picture media matches that search."}
                    </div>
                  </div>
                ) : (
                  <div key={`${browserTab}-${activeKind}`} className="dock-media-list">
                    {filteredUploadEntries.map((entry) => renderMediaCard(entry))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {browserTab === "animations" && (
          <>
            {filteredAnimationEntries.length === 0 ? (
              <div className="dock-media-empty">
                <div className="dock-media-empty__icon">
                  <Icon name="movie" size={24} />
                </div>
                <div className="dock-media-empty__title">No saved animations</div>
                <div className="dock-media-empty__text">Download template videos from Add Media, then they will appear here.</div>
                <button
                  type="button"
                  className="dock-btn dock-btn--preview dock-btn--compact"
                  onClick={() => openAddMediaModal("template-videos")}
                >
                  <Icon name="download" size={12} />
                  Add Animation
                </button>
              </div>
            ) : (
              <div className="dock-media-list">
                {filteredAnimationEntries.map((entry) => renderMediaCard(entry))}
              </div>
            )}
          </>
        )}

        {browserTab === "patterns" && (
          <>
            {filteredPatternEntries.length === 0 ? (
              <div className="dock-empty dock-empty--inline">
                <div className="dock-empty__text">No patterns match that search.</div>
              </div>
            ) : (
              <div className="dock-media-list">
                {filteredPatternEntries.map((entry) => {
                  const pattern = BACKGROUND_PATTERNS.find((item) => `pattern:${item.label}` === entry.key);
                  const animated = pattern ? isAnimatedPattern(pattern) : false;
                  const isActiveTarget = activeTargets.active?.key === entry.key;

                  return (
                    <div
                      key={entry.key}
                      className={`dock-media-gallery-card${isActiveTarget ? " dock-media-gallery-card--active" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => void handleSendPattern(entry)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void handleSendPattern(entry);
                        }
                      }}
                    >
                      <div className="dock-media-gallery-card__image-wrap">
                        <img src={entry.previewUrl} alt={entry.name} loading="lazy" className="dock-media-gallery-card__image" />
                        <div className="dock-media-gallery-card__overlay">
                          <span className="dock-media-gallery-card__name">{entry.name}</span>
                          <button
                            type="button"
                            className="dock-media-gallery-card__preview-btn"
                            aria-label={`Show ${entry.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleSendPattern(entry);
                            }}
                          >
                            <Icon name="visibility" size={12} />
                            Show
                          </button>
                        </div>
                        {isActiveTarget && (
                          <span className="dock-media-gallery-card__active-badge">
                            <Icon name="visibility" size={10} />
                            Showing
                          </span>
                        )}
                        <span className="dock-media-gallery-card__type-badge">
                          {animated ? "Motion" : "Still"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {browserTab === "text" && (
          <div className="dock-overlay-composer">
            {/* ── Status Header ── */}


            {/* ── Live Preview Canvas ── */}
            <div className="dock-overlay-canvas">
              <div className="dock-overlay-canvas__bg">
                {previewBaseEntry?.kind === "image" && previewBaseEntry.previewUrl ? (
                  <img src={previewBaseEntry.previewUrl} alt="" />
                ) : previewBaseEntry?.thumbnailUrl ? (
                  <img src={previewBaseEntry.thumbnailUrl} alt="" />
                ) : previewBaseEntry?.previewUrl ? (
                  <video src={previewBaseEntry.previewUrl} muted playsInline loop autoPlay />
                ) : (
                  <div className="dock-overlay-canvas__placeholder">
                    <Icon name="theaters" size={24} />
                  </div>
                )}
              </div>

              {/* Safe Area Guides */}
              <div className="dock-overlay-canvas__guides">
                <div className="dock-overlay-canvas__guide--h" />
                <div className="dock-overlay-canvas__guide--v" />
                <div className="dock-overlay-canvas__corner dock-overlay-canvas__corner--tl" />
                <div className="dock-overlay-canvas__corner dock-overlay-canvas__corner--tr" />
                <div className="dock-overlay-canvas__corner dock-overlay-canvas__corner--bl" />
                <div className="dock-overlay-canvas__corner dock-overlay-canvas__corner--br" />
              </div>

              {/* Text Overlay */}
              <div
                className={`dock-overlay-canvas__text ${getAnimationClass()}`}
                style={{ ...getVerticalPosStyle(), "--overlay-anim-duration": `${textOverlay.animationDuration}s` } as React.CSSProperties}
              >
                <div className={`dock-overlay-canvas__text-inner dock-overlay-canvas__text-inner--${textOverlay.align}`}>
                  {textOverlay.headline.trim() && (
                    <div className="dock-overlay-canvas__headline" style={{ fontSize: "16px" }}>
                      {textOverlay.headline}
                    </div>
                  )}
                  {textOverlay.subline.trim() && (
                    <div className="dock-overlay-canvas__subline" style={{ fontSize: "12px" }}>
                      {textOverlay.subline}
                    </div>
                  )}
                  {!textOverlay.headline.trim() && !textOverlay.subline.trim() && (
                    <div className="dock-overlay-canvas__empty-hint">Your overlay text will appear here</div>
                  )}
                </div>
              </div>

              {/* Canvas Controls */}
              <div className="dock-overlay-canvas__controls">

                <span className="dock-overlay-canvas__safe-badge">
                  <Icon name="crop_free" size={10} />
                  Safe Area
                </span>
              </div>
            </div>

            {/* ── Animation Bar ── */}
            <div className="dock-overlay-anim-bar">
              <button type="button" className="dock-overlay-anim-bar__preview" onClick={triggerAnimPreview}>
                <Icon name="play_arrow" size={12} />
                Preview Animation
              </button>
              {/* <div className="dock-overlay-anim-bar__select-wrap">
                <select
                  className="dock-overlay-anim-bar__select"
                  value={textOverlay.animation}
                  onChange={(e) => setTextOverlay((c) => ({ ...c, animation: e.target.value as DockTextAnimation }))}
                >
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                  <option value="fade-up">Fade Up</option>
                  <option value="slide-up">Slide Up</option>
                  <option value="slide-down">Slide Down</option>
                  <option value="zoom">Zoom</option>
                </select>
              </div> */}
              <div className="dock-overlay-anim-bar__duration">
                <span>Duration</span>
                <input
                  type="number"
                  className="dock-overlay-anim-bar__duration-input"
                  value={textOverlay.animationDuration}
                  min={0.3}
                  max={3}
                  step={0.1}
                  onChange={(e) => setTextOverlay((c) => ({ ...c, animationDuration: parseFloat(e.target.value) || 1 }))}
                />
                <span>s</span>
              </div>
            </div>

            {/* ── Text Controls ── */}
            <div className="dock-overlay-text-controls">
              <div className="dock-overlay-text-controls__row">
                <div className="dock-overlay-text-controls__field">
                  <label className="dock-overlay-text-controls__label">Headline</label>
                  <input
                    type="text"
                    className="dock-overlay-text-controls__input"
                    value={textOverlay.headline}
                    onChange={(e) => setTextOverlay((c) => ({ ...c, headline: e.target.value }))}
                    placeholder="YOUR MAIN OVERLAY TEXT"
                  />
                </div>
                <div className="dock-overlay-text-controls__size">
                  <label className="dock-overlay-text-controls__label">Font Size</label>
                  <div className="dock-overlay-text-controls__size-ctrl">
                    <button type="button" className="dock-overlay-text-controls__size-btn" onClick={() => setTextOverlay((c) => ({ ...c, headlineSize: Math.max(24, c.headlineSize - 4) }))}>
                      <Icon name="remove" size={12} />
                    </button>
                    <span className="dock-overlay-text-controls__size-value">{textOverlay.headlineSize}<small>px</small></span>
                    <button type="button" className="dock-overlay-text-controls__size-btn" onClick={() => setTextOverlay((c) => ({ ...c, headlineSize: Math.min(120, c.headlineSize + 4) }))}>
                      <Icon name="add" size={12} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="dock-overlay-text-controls__row">
                <div className="dock-overlay-text-controls__field">
                  <label className="dock-overlay-text-controls__label">Subline <span className="dock-overlay-text-controls__optional">(optional)</span></label>
                  <input
                    type="text"
                    className="dock-overlay-text-controls__input"
                    value={textOverlay.subline}
                    onChange={(e) => setTextOverlay((c) => ({ ...c, subline: e.target.value }))}
                    placeholder="YOUR SECONDARY LINE"
                  />
                </div>
                <div className="dock-overlay-text-controls__size">
                  <label className="dock-overlay-text-controls__label">Font Size</label>
                  <div className="dock-overlay-text-controls__size-ctrl">
                    <button type="button" className="dock-overlay-text-controls__size-btn" onClick={() => setTextOverlay((c) => ({ ...c, sublineSize: Math.max(14, c.sublineSize - 2) }))}>
                      <Icon name="remove" size={12} />
                    </button>
                    <span className="dock-overlay-text-controls__size-value">{textOverlay.sublineSize}<small>px</small></span>
                    <button type="button" className="dock-overlay-text-controls__size-btn" onClick={() => setTextOverlay((c) => ({ ...c, sublineSize: Math.min(60, c.sublineSize + 2) }))}>
                      <Icon name="add" size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Alignment & Position ── */}
            <div className="dock-overlay-align-section">
              <div className="dock-overlay-align-section__label">Alignment & Position</div>
              <div className="dock-overlay-align-section__row">
                <button type="button" className={`dock-overlay-align-section__btn ${textOverlay.verticalPos === "top" ? "dock-overlay-align-section__btn--active" : ""}`} onClick={() => setTextOverlay((c) => ({ ...c, verticalPos: "top" }))}>
                  <Icon name="arrow_upward" size={14} />
                  Up
                </button>
                <button type="button" className={`dock-overlay-align-section__btn ${textOverlay.verticalPos === "center" ? "dock-overlay-align-section__btn--active" : ""}`} onClick={() => setTextOverlay((c) => ({ ...c, verticalPos: "center" }))}>
                  <Icon name="vertical_align_center" size={14} />
                  Center
                </button>
                <button type="button" className={`dock-overlay-align-section__btn ${textOverlay.verticalPos === "bottom" ? "dock-overlay-align-section__btn--active" : ""}`} onClick={() => setTextOverlay((c) => ({ ...c, verticalPos: "bottom" }))}>
                  <Icon name="arrow_downward" size={14} />
                  Down
                </button>
              </div>
              <div className="dock-overlay-align-section__row">
                <button type="button" className={`dock-overlay-align-section__btn ${textOverlay.align === "left" ? "dock-overlay-align-section__btn--active" : ""}`} onClick={() => setTextOverlay((c) => ({ ...c, align: "left" }))}>
                  <Icon name="format_align_left" size={14} />
                  Left
                </button>
                <button type="button" className={`dock-overlay-align-section__btn ${textOverlay.align === "center" ? "dock-overlay-align-section__btn--active" : ""}`} onClick={() => setTextOverlay((c) => ({ ...c, align: "center" }))}>
                  <Icon name="format_align_center" size={14} />
                  Center
                </button>
                <button type="button" className={`dock-overlay-align-section__btn ${textOverlay.align === "right" ? "dock-overlay-align-section__btn--active" : ""}`} onClick={() => setTextOverlay((c) => ({ ...c, align: "right" }))}>
                  <Icon name="format_align_right" size={14} />
                  Right
                </button>
              </div>
            </div>

            {/* ── Animation Selection ── */}
            <div className="dock-overlay-anim-section">
              <div className="dock-overlay-anim-section__label">Animate In</div>
              <div className="dock-overlay-anim-section__options">
                {([
                  { key: "none", label: "None", icon: "block" },
                  { key: "fade", label: "Fade", icon: "opacity" },
                  { key: "fade-up", label: "Fade Up", icon: "north" },
                  { key: "slide-up", label: "Slide Up", icon: "arrow_upward" },
                  { key: "slide-down", label: "Slide Down", icon: "arrow_downward" },
                  { key: "zoom", label: "Zoom", icon: "zoom_in" },
                ] as { key: DockTextAnimation; label: string; icon: string }[]).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`dock-overlay-anim-section__opt ${textOverlay.animation === opt.key ? "dock-overlay-anim-section__opt--active" : ""}`}
                    onClick={() => setTextOverlay((c) => ({ ...c, animation: opt.key }))}
                  >
                    <Icon name={opt.icon} size={12} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Action Bar ── */}
            <div className="dock-overlay-actions">
              <button
                type="button"
                className="dock-overlay-actions__btn dock-overlay-actions__btn--show"
                onClick={() => void applyTextOverlay()}
                disabled={applyingTextTarget !== null}
              >
                <Icon name="visibility" size={14} />
                {applyingTextTarget ? "Applying…" : "Show"}
              </button>
              <button
                type="button"
                className="dock-overlay-actions__btn dock-overlay-actions__btn--clear"
                onClick={() => void clearTextOverlayEverywhere()}
                disabled={applyingTextTarget !== null}
              >
                <Icon name="delete" size={14} />
                Clear
              </button>
            </div>

            {/* ── Footer Status ── */}

          </div>
        )}
      </div>

      {showAddMediaModal && (
        <div className="dock-dialog-backdrop" role="presentation" onClick={closeAddMediaModal}>
          <div
            className="dock-dialog dock-media-add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dock-media-add-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dock-dialog__header">
              <div>
                <div className="dock-dialog__eyebrow">Add Media</div>
                <h2 id="dock-media-add-title" className="dock-dialog__title">Choose what to add to the media library</h2>
              </div>
              <button type="button" className="dock-dialog__close" onClick={closeAddMediaModal} aria-label="Close add media dialog">
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="dock-dialog__body">
              <div className="dock-console-segmented dock-media-tabs" role="tablist" aria-label="Add media tabs">
                <button
                  type="button"
                  role="tab"
                  aria-selected={addMediaTab === "background"}
                  className={`dock-console-segmented__item${addMediaTab === "background" ? " dock-console-segmented__item--active" : ""}`}
                  onClick={() => setAddMediaTab("background")}
                >
                  Background
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={addMediaTab === "template-videos"}
                  className={`dock-console-segmented__item${addMediaTab === "template-videos" ? " dock-console-segmented__item--active" : ""}`}
                  onClick={() => setAddMediaTab("template-videos")}
                >
                  Template Videos
                </button>
              </div>

              {addMediaTab === "background" ? (
                <div className="dock-media-add-modal__pane">
                  <div className="dock-media-add-modal__hero">
                    <div className="dock-media-add-modal__hero-icon">
                      <Icon name="perm_media" size={18} />
                    </div>
                    <div className="dock-media-add-modal__hero-copy">
                      <div className="dock-media-add-modal__hero-title">Add regular media</div>
                      <div className="dock-media-add-modal__hero-text">Upload images or local videos. They will appear under Uploads and can be used immediately in the dock.</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="dock-btn dock-btn--preview dock-btn--compact"
                    onClick={() => {
                      // Always open the file picker — per-file quota is enforced inside handleUploadFiles
                      uploadInputRef.current?.click();
                    }}
                    disabled={uploading}
                  >
                    <Icon name="upload" size={12} />
                    {uploading ? "Uploading…" : "Choose Files"}
                  </button>
                  <div className="dock-media-card__hint">
                    Accepted: images and videos. Downloaded template videos are kept separate under Animations.
                  </div>
                </div>
              ) : (
                <div className="dock-media-add-modal__pane dock-media-add-modal__pane--template">
                  <div className="dock-media-searchbar dock-media-add-modal__searchbar">
                    <Icon name="search" size={12} />
                    <input
                      type="text"
                      className="dock-input dock-media-searchbar__input"
                      value={templateVideoSearch}
                      onChange={(event) => setTemplateVideoSearch(event.target.value)}
                      placeholder="Search template videos"
                      aria-label="Search template videos"
                    />
                    {templateVideoSearch && (
                      <button
                        type="button"
                        className="dock-shell-icon-btn dock-media-searchbar__clear"
                        onClick={() => setTemplateVideoSearch("")}
                        aria-label="Clear template video search"
                        title="Clear template video search"
                      >
                        <Icon name="close" size={10} />
                      </button>
                    )}
                  </div>

                  <div className="dock-media-section__header">
                    <div>
                      <div className="dock-media-section__title">Template Videos</div>
                      <div className="dock-media-section__meta">Browse poster previews first, then download only the animations you want to keep locally.</div>
                    </div>
                    <div className="dock-media-section__actions">
                      <span className="dock-media-section__count">{templateVideosLoading ? "…" : filteredTemplateVideos.length}</span>
                      <button
                        type="button"
                        className="dock-shell-icon-btn"
                        onClick={() => void loadTemplateVideos()}
                        disabled={templateVideosLoading}
                        aria-label="Refresh template videos"
                        title="Refresh template videos"
                      >
                        <Icon
                          name="refresh"
                          size={12}
                          style={{ animation: templateVideosLoading ? "spin 1s linear infinite" : undefined }}
                        />
                      </button>
                    </div>
                  </div>

                  {templateVideosError ? (
                    <div className="dock-empty dock-empty--inline">
                      <div className="dock-empty__text">{templateVideosError}</div>
                    </div>
                  ) : templateVideosLoading && filteredTemplateVideos.length === 0 ? (
                    <div className="dock-empty dock-empty--inline">
                      <div className="dock-empty__text">Loading template videos…</div>
                    </div>
                  ) : filteredTemplateVideos.length === 0 ? (
                    <div className="dock-empty dock-empty--inline">
                      <div className="dock-empty__text">No template videos match that search.</div>
                    </div>
                  ) : (
                    <div className="dock-media-list">
                      {filteredTemplateVideos.map((asset) => {
                        const downloadedItem = findDownloadedTemplateVideo(asset);
                        const downloading = templateVideoProgress[asset.id] !== undefined;
                        const progressLabel = templateVideoProgress[asset.id] == null
                          ? "Preparing"
                          : `${Math.round((templateVideoProgress[asset.id] || 0) * 100)}%`;

                        return (
                          <div key={asset.id} className="dock-media-card">
                            <div className="dock-media-card__preview-shell">
                              {downloadedItem?.thumbnailUrl ? (
                                <img
                                  src={downloadedItem.thumbnailUrl}
                                  alt={asset.fileName}
                                  className="dock-media-card__preview"
                                  loading="lazy"
                                />
                              ) : (
                                <TemplateVideoPreview src={asset.videoUrl} label={asset.fileName} />
                              )}
                              <div className="dock-media-card__badges">
                                <span className="dock-media-card__badge">Template</span>
                                <span className="dock-media-card__badge">{downloadedItem ? "Saved" : "Remote"}</span>
                              </div>
                            </div>
                            <div className="dock-media-card__body">
                              <div className="dock-media-card__title" title={asset.fileName}>{asset.fileName}</div>
                              <div className="dock-media-card__meta">
                                {downloadedItem?.durationSec ? `${fmtDuration(downloadedItem.durationSec)} · ` : ""}
                                {formatFileSize(downloadedItem?.fileSize || asset.size)}
                                {downloading ? ` · ${progressLabel}` : ""}
                              </div>
                            </div>
                            <div className="dock-media-card__footer dock-media-card__footer--visible">
                              <div className="dock-media-card__actions">
                                <button
                                  type="button"
                                  className={`dock-media-card__action-icon${downloadedItem ? " dock-media-card__action-icon--active-program" : ""}`}
                                  aria-label={downloadedItem ? `${asset.fileName} is already saved` : `Download ${asset.fileName}`}
                                  title={downloadedItem ? "Already saved to Animations" : downloading ? `Downloading ${progressLabel}` : "Download template video"}
                                  disabled={downloading || Boolean(downloadedItem)}
                                  onClick={() => void handleDownloadTemplateVideo(asset)}
                                >
                                  <Icon
                                    name={downloadedItem ? "check_circle" : downloading ? "downloading" : "download"}
                                    size={13}
                                    style={{ animation: downloading ? "spin 1s linear infinite" : undefined }}
                                  />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="dock-dialog__footer">
              <button type="button" className="dock-btn dock-btn--compact" onClick={closeAddMediaModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Selection Tray ── */}
      {selectionMode && selectedKeys.size > 0 && (
        <div className="dock-media-selection-tray">
          <div className="dock-media-selection-tray__info">
            <span className="dock-media-selection-tray__count">{selectedKeys.size} Selected</span>
            <div className="dock-media-selection-tray__thumbs">
              {selectedVideoEntries.slice(0, 5).map((entry) => (
                <div key={entry.key} className="dock-media-selection-tray__thumb">
                  {entry.thumbnailUrl
                    ? <img src={entry.thumbnailUrl} alt="" />
                    : <Icon name="movie" size={10} />
                  }
                </div>
              ))}
              {selectedVideoEntries.length > 5 && (
                <span className="dock-media-selection-tray__more">+{selectedVideoEntries.length - 5}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="dock-btn dock-btn--primary dock-btn--compact"
            onClick={() => setShowPlaylistModal(true)}
          >
            <Icon name="playlist_add" size={12} />

          </button>
        </div>
      )}

      {/* ── Footer actions (hidden when in text section — it has its own clear) ── */}
      {browserTab !== "text" && (activeTargets.active || textOverlayTargets.active) && (
        <button
          type="button"
          className="dock-btm-toolbar__clear"
          onClick={() => void clearMedia()}
          disabled={clearingTarget !== null}
          aria-label="Clear media"
        >
          {/* <Icon name="delete_sweep" size={16} /> */}
          <span>Hide Media</span>
        </button>
      )}

      {activeOptionsEntry && (() => {
        const entry = activeOptionsEntry;
        const entryPrefs = mediaPrefs[entry.prefKey] ?? {};
        const isActive = activeTargets.active?.key === entry.key;
        const isPaused = isActive && pausedTargets.active;
        const statusLabel = isActive ? (isPaused ? "In Preview" : "Live") : "Not Active";
        const statusVariant = isActive ? (isPaused ? "preview" : "live") : "idle";
        const thumbUrl = entry.thumbnailUrl || (entry.previewUrl && entry.kind === "image" ? entry.previewUrl : null);
        const cleanName = entryPrefs.label?.trim()
          || entry.name.replace(/^media_\d+_/, "").replace(/\.[^.]+$/, "");
        const fileExt = (entry.name.split(".").pop() || entry.mimeLabel || (entry.kind === "video" ? "MP4" : "IMG")).toUpperCase();
        // const addedDate = entry.createdAt ? new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
        // const usedDate = entryPrefs.lastUsedAt ? new Date(entryPrefs.lastUsedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

        return (
          <div className="dock-dialog-backdrop" role="presentation" onClick={closeEntryOptions}>
            <div
              key={entry.key}
              className="dock-dialog dock-media-inspector"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dock-media-inspector-title"
              onClick={(event) => event.stopPropagation()}
            >
              {/* Close button */}
              <button type="button" className="dock-media-inspector__close" onClick={() => { setPreviewPlaying(false); closeEntryOptions(); }} aria-label="Close">
                <Icon name="close" size={14} />
              </button>

              {/* ── Preview ── */}
              {entry.kind === "video" && entry.previewUrl ? (
                <div className="dock-media-inspector__preview">
                  {previewPlaying ? (
                    <video className="dock-media-inspector__preview-media" src={entry.previewUrl} controls preload="metadata" autoPlay />
                  ) : (
                    <>
                      {thumbUrl ? (
                        <img className="dock-media-inspector__preview-media" src={thumbUrl} alt={cleanName} />
                      ) : (
                        <div className="dock-media-inspector__preview-placeholder">
                          <Icon name="movie" size={32} />
                        </div>
                      )}
                      <button type="button" className="dock-media-inspector__play-btn" onClick={() => setPreviewPlaying(true)}>
                        <Icon name="play_arrow" size={22} />
                      </button>
                    </>
                  )}
                </div>
              ) : thumbUrl ? (
                <div className="dock-media-inspector__preview">
                  <img className="dock-media-inspector__preview-media" src={thumbUrl} alt={cleanName} />
                </div>
              ) : (
                <div className="dock-media-inspector__preview dock-media-inspector__preview--placeholder">
                  <Icon name={entry.kind === "video" ? "movie" : "image"} size={32} />
                </div>
              )}

              {/* ── Title + Status ── */}
              <div className="dock-media-inspector__title-block">
                <h2 id="dock-media-inspector-title" className="dock-media-inspector__title">{cleanName}</h2>
                <div className="dock-media-inspector__subtitle">
                  <span className={`dock-media-inspector__badge dock-media-inspector__badge--${statusVariant}`}>{statusLabel}</span>
                  <span className="dock-media-inspector__meta-chip">{fileExt}</span>
                  {entry.originLabel && <span className="dock-media-inspector__meta-chip">{entry.originLabel}</span>}
                </div>
              </div>

              {/* ── Quick Rename ── */}
              <div className="dock-media-inspector__section">
                <label className="dock-media-inspector__label">Label</label>
                <input
                  type="text"
                  className="dock-input dock-media-inspector__rename-input"
                  value={entryPrefs.label ?? ""}
                  onChange={(event) => setEntryLabel(entry, event.target.value)}
                  placeholder={cleanName}
                />
              </div>

              {/* ── Actions ── */}
              <div className="dock-media-inspector__actions">
                <button
                  type="button"
                  className="dock-media-inspector__action-btn dock-media-inspector__action-btn--primary"
                  onClick={() => { void handleSendEntry(entry); closeEntryOptions(); }}
                >
                  <Icon name="play_arrow" size={14} />
                  Send to Preview
                </button>

              </div>

              {/* ── Display ── */}
              <div className="dock-media-inspector__card">
                <h4 className="dock-media-inspector__card-title">Display</h4>
                <div className="dock-media-inspector__segmented">
                  {(["cover", "contain", "stretch"] as DockMediaFitMode[]).map((option) => {
                    const isActiveFit = (entryPrefs.fitMode ?? "cover") === option;
                    const icons: Record<DockMediaFitMode, string> = { cover: "crop", contain: "fit_screen", stretch: "aspect_ratio" };
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`dock-media-inspector__seg-btn${isActiveFit ? " dock-media-inspector__seg-btn--active" : ""}`}
                        onClick={() => void setEntryFitMode(entry, option)}
                        title={option === "cover" ? "Fill screen" : option === "contain" ? "Fit within screen" : "Stretch to screen"}
                      >
                        <Icon name={icons[option]} size={12} />
                        {formatFitMode(option)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Audio (video only) ── */}
              {entry.kind === "video" && (
                <div className="dock-media-inspector__card">
                  <h4 className="dock-media-inspector__card-title">Audio</h4>
                  <div className="dock-media-inspector__chips">
                    <button
                      type="button"
                      className={`dock-media-inspector__chip${!(entryPrefs.videoMuted ?? true) ? " dock-media-inspector__chip--active" : ""}`}
                      disabled={sendingFile === entry.playingKey}
                      onClick={() => void toggleVideoMute(entry)}
                    >
                      <Icon name={(entryPrefs.videoMuted ?? true) ? "volume_off" : "volume_up"} size={12} />
                      {(entryPrefs.videoMuted ?? true) ? "Muted" : "Audio On"}
                    </button>
                    <button
                      type="button"
                      className={`dock-media-inspector__chip${(entryPrefs.loop ?? true) ? " dock-media-inspector__chip--active" : ""}`}
                      disabled={sendingFile === entry.playingKey}
                      onClick={() => void setEntryLoop(entry, !(entryPrefs.loop ?? true))}
                    >
                      <Icon name="refresh" size={12} />
                      {(entryPrefs.loop ?? true) ? "Loop" : "Once"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Information ── */}


              {/* ── Danger Zone ── */}
              <div className="dock-media-inspector__danger">
                <button
                  type="button"
                  className="dock-media-inspector__delete-btn"
                  onClick={() => { void deleteEntry(entry); closeEntryOptions(); }}
                >
                  <Icon name="delete" size={12} />
                  Delete {entry.kind === "video" ? "Video" : "Image"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Playlist Configuration Modal ── */}
      {
        showPlaylistModal && (
          <div className="dock-dialog-backdrop" role="presentation" onClick={() => setShowPlaylistModal(false)}>
            <div
              className="dock-dialog dock-media-playlist-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dock-playlist-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="dock-dialog__header">
                <div>
                  <div className="dock-dialog__eyebrow">Media Source</div>
                  <h2 id="dock-playlist-title" className="dock-dialog__title">Create Media Playlist</h2>
                </div>
                <button type="button" className="dock-dialog__close" onClick={() => setShowPlaylistModal(false)} aria-label="Close">
                  <Icon name="close" size={14} />
                </button>
              </div>
              <div className="dock-dialog__body">
                <div className="dock-playlist-modal__field">
                  <label className="dock-playlist-modal__label">Source Name</label>
                  <input
                    type="text"
                    className="dock-input"
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    placeholder="e.g. Pre-Service Playlist"
                  />
                </div>
                {selectedVideoEntries.length > 0 && (
                  <div className="dock-playlist-modal__field">
                    <label className="dock-playlist-modal__label">Videos ({selectedVideoEntries.length})</label>
                    <div className="dock-playlist-modal__thumbs">
                      {selectedVideoEntries.map((entry) => entry && (
                        <div key={entry.key} className="dock-playlist-modal__thumb">
                          {entry.thumbnailUrl
                            ? <img src={entry.thumbnailUrl} alt={entry.name} />
                            : <Icon name="movie" size={14} />
                          }
                          <span className="dock-playlist-modal__thumb-name">{entry.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedImageEntries.length > 0 && (
                  <div className="dock-playlist-modal__field">
                    <label className="dock-playlist-modal__label">Images ({selectedImageEntries.length})</label>
                    <div className="dock-playlist-modal__thumbs">
                      {selectedImageEntries.map((entry) => entry && (
                        <div key={entry.key} className="dock-playlist-modal__thumb">
                          {entry.thumbnailUrl
                            ? <img src={entry.thumbnailUrl} alt={entry.name} />
                            : <Icon name="image" size={14} />
                          }
                          <span className="dock-playlist-modal__thumb-name">{entry.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="dock-playlist-modal__toggles">
                  <label className="dock-playlist-modal__toggle">
                    <input type="checkbox" checked={playlistLoop} onChange={(e) => setPlaylistLoop(e.target.checked)} />
                    <span>Loop Playlist</span>
                  </label>
                  <label className="dock-playlist-modal__toggle">
                    <input type="checkbox" checked={playlistShuffle} onChange={(e) => setPlaylistShuffle(e.target.checked)} />
                    <span>Shuffle</span>
                  </label>
                  <label className="dock-playlist-modal__toggle">
                    <input type="checkbox" checked={playlistMuted} onChange={(e) => setPlaylistMuted(e.target.checked)} />
                    <span>Mute Audio</span>
                  </label>
                </div>
                <div className="dock-playlist-modal__hint">
                  {selectedVideoEntries.length > 0 && selectedImageEntries.length > 0
                    ? "Creates a VLC Video Source for videos and an Image Slide Show for images in the current OBS scene."
                    : selectedVideoEntries.length > 0
                      ? "Creates a VLC Video Source in the current OBS scene. OBS handles playback natively."
                      : "Creates an Image Slide Show source in the current OBS scene. OBS handles the slideshow natively."
                  }
                </div>
              </div>
              <div className="dock-dialog__footer">
                <button type="button" className="dock-btn dock-btn--compact" onClick={() => setShowPlaylistModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="dock-btn dock-btn--primary dock-btn--compact"
                  onClick={() => void handleCreateVlcPlaylist()}
                  disabled={selectedKeys.size === 0}
                >
                  <Icon name="playlist_add" size={12} />
                  Create{selectedVideoEntries.length > 0 && selectedImageEntries.length > 0 ? " Both" : selectedVideoEntries.length > 0 ? " VLC Source" : " Slideshow"}
                </button>
              </div>
            </div>
          </div>
        )
      }

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      {/* ── Preview Modal ── */}
      {
        previewEntry && (
          <div
            className="dock-dialog-backdrop"
            onClick={() => setPreviewEntry(null)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div
              className="dock-media-preview-modal"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                maxWidth: "90vw",
                maxHeight: "85vh",
                background: "#000",
                borderRadius: 6,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--dock-surface)" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--dock-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                  {previewEntry.name}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewEntry(null)}
                  style={{ background: "none", border: "none", color: "var(--dock-text-dim)", cursor: "pointer", padding: 4, display: "flex" }}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 12, minHeight: 200 }}>
                {previewEntry.kind === "video" ? (
                  <video
                    src={previewEntry.previewUrl}
                    controls
                    autoPlay
                    muted
                    style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 4 }}
                  />
                ) : (
                  <img
                    src={previewEntry.previewUrl || previewEntry.thumbnailUrl || ""}
                    alt={previewEntry.name}
                    style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 4, objectFit: "contain" }}
                  />
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* ── Clear All Confirmation Dialog ── */}
      {showClearAllConfirm && (() => {
        const totalCount = mediaEntries.length;
        return (
          <div className="dock-dialog-backdrop" role="presentation" onClick={() => setShowClearAllConfirm(false)}>
            <div
              className="dock-dialog dock-media-clear-confirm"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="dock-dialog__header">
                <h2 className="dock-dialog__title">Clear All Media?</h2>
                <button type="button" className="dock-dialog__close" onClick={() => setShowClearAllConfirm(false)} aria-label="Close">
                  <Icon name="close" size={14} />
                </button>
              </div>
              <div className="dock-dialog__body">
                <p className="dock-media-clear-confirm__summary">
                  {totalCount} {totalCount === 1 ? "upload" : "uploads"} will be removed.
                </p>
              </div>
              <div className="dock-dialog__footer">
                <button type="button" className="dock-btn dock-btn--compact" onClick={() => setShowClearAllConfirm(false)}>
                  Cancel
                </button>
                <button type="button" className="dock-btn dock-btn--danger dock-btn--compact" onClick={() => void clearAllMedia()}>
                  <Icon name="delete_sweep" size={12} />
                  Clear All
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div >
  );
}
