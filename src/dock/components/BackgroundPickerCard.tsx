import { createPortal } from "react-dom";
import { HexColorPicker } from "react-colorful";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BibleTheme } from "../../bible/types";
import type { MediaItem } from "../../library/libraryTypes";
import Icon from "../DockIcon";
import type { DockBackgroundPreset } from "../dockConsoleTheme";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";
import { loadDockFavoriteBibleThemes } from "../dockThemeData";
import { getUserScopedKey } from "../../services/userScopedStorage";

/* ── Types ── */
type BackgroundType = "off" | "theme" | "color" | "image" | "video";

interface Props {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
  onQuickSettingsSave?: (settings: DockFullscreenQuickThemeSettings) => void;
  selectedThemeId: string | null;
  onThemeSelect: (theme: BibleTheme) => void;
  templateType?: BibleTheme["templateType"];
  allowedCategories?: Array<NonNullable<BibleTheme["category"]>>;
  sampleText?: string;
  sampleReference?: string;
  onBackgroundPresetChange?: (preset: DockBackgroundPreset) => void;
  /** Show the Reference section (only relevant for Bible tab) */
  showReferences?: boolean;
  /** Active overlay mode — used to resolve variant preview in theme cards */
  overlayMode?: "fullscreen" | "lower-third";
}

const BG_TYPE_KEY = "dtb-bg-picker-type";

const BG_OPTIONS: Array<{ id: BackgroundType; label: string; icon: string }> = [
  { id: "off", label: "bgPicker.off", icon: "block" },
  { id: "theme", label: "bgPicker.theme", icon: "palette" },
  { id: "color", label: "common.color", icon: "color_lens" },
  { id: "image", label: "common.image", icon: "image" },
  { id: "video", label: "common.video", icon: "videocam" },
];

/* ── Helpers ── */
function toRelativeUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname;
  } catch {
    return url;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function inferBgTypeFromSettings(qs: DockFullscreenQuickThemeSettings): BackgroundType {
  // Prefer explicit persisted type
  if (qs.backgroundType) return qs.backgroundType;
  if (qs.backgroundImage) return "image";
  if (qs.backgroundVideo) return "video";
  if (qs.backgroundColor && qs.backgroundColorEnd) return "color";
  if (qs.backgroundColor && qs.backgroundColor !== "transparent") return "color";
  if (qs.fullscreenShadeColor && qs.fullscreenShadeColor !== "#000000") return "color";
  if (qs.fullscreenShadeOpacity > 0) return "theme";
  return "off";
}

/* ── Main Component ── */
export default function BackgroundPickerCard({
  quickSettings,
  onQuickSettingsChange,
  selectedThemeId: _selectedThemeId,
  onThemeSelect: _onThemeSelect,
  templateType: _templateType,
  allowedCategories: _allowedCategories,
  sampleText: _sampleText = "Faith",
  sampleReference: _sampleReference = "John 3:16",
  onBackgroundPresetChange,
  showReferences = true,
  overlayMode = "fullscreen",
}: Props) {
  const { t } = useTranslation();
  const [bgType, setBgType] = useState<BackgroundType>(() => {
    try {
      const stored = localStorage.getItem(getUserScopedKey(BG_TYPE_KEY));
      if (stored === "off" || stored === "theme" || stored === "color" || stored === "image" || stored === "video") return stored;
    } catch { /* ignore */ }
    return inferBgTypeFromSettings(quickSettings);
  });

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleTypeChange = useCallback((type: BackgroundType) => {
    setBgType(type);
    setDropdownOpen(false);
    try { localStorage.setItem(getUserScopedKey(BG_TYPE_KEY), type); } catch { /* ignore */ }

    // Reset background preset so it doesn't override the picker's choice
    if (onBackgroundPresetChange) {
      onBackgroundPresetChange(type === "off" ? "none" : "theme");
    }

    // Build the updater for the given type
    let updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings;
    if (type === "off") {
      updater = (prev) => ({
        ...prev,
        backgroundType: "off",
        backgroundImage: "",
        backgroundImageFilePath: "",
        backgroundVideo: "",
        backgroundVideoFilePath: "",
        fullscreenShadeOpacity: 0,
        backgroundOpacity: 0,
      });
    } else if (type === "theme") {
      updater = (prev) => ({
        ...prev,
        backgroundType: "theme",
        backgroundImage: "",
        backgroundImageFilePath: "",
        backgroundVideo: "",
        backgroundVideoFilePath: "",
        backgroundOpacity: prev.backgroundOpacity === 0 ? 1 : prev.backgroundOpacity,
        fullscreenShadeOpacity: prev.fullscreenShadeOpacity === 0 ? 0.42 : prev.fullscreenShadeOpacity,
      });
    } else if (type === "image") {
      updater = (prev) => ({
        ...prev,
        backgroundType: "image",
        backgroundColor: "",
        backgroundColorEnd: "",
        bgGradientAngle: 180,
        backgroundVideo: "",
        backgroundVideoFilePath: "",
        backgroundImageFilePath: prev.backgroundImage ? prev.backgroundImageFilePath : "",
        backgroundOpacity: prev.backgroundOpacity === 0 ? 1 : prev.backgroundOpacity,
        fullscreenShadeOpacity: prev.fullscreenShadeOpacity === 0 ? 0.42 : prev.fullscreenShadeOpacity,
      });
    } else if (type === "video") {
      updater = (prev) => ({
        ...prev,
        backgroundType: "video",
        backgroundColor: "",
        backgroundColorEnd: "",
        bgGradientAngle: 180,
        backgroundImage: "",
        backgroundImageFilePath: "",
        backgroundVideoFilePath: prev.backgroundVideo ? prev.backgroundVideoFilePath : "",
        backgroundOpacity: prev.backgroundOpacity === 0 ? 1 : prev.backgroundOpacity,
        fullscreenShadeOpacity: prev.fullscreenShadeOpacity === 0 ? 0.42 : prev.fullscreenShadeOpacity,
      });
    } else if (type === "color") {
      updater = (prev) => ({
        ...prev,
        backgroundType: "color",
        backgroundImage: "",
        backgroundImageFilePath: "",
        backgroundVideo: "",
        backgroundVideoFilePath: "",
        backgroundColor: prev.backgroundColor || "#0F172A",
        backgroundOpacity: prev.backgroundOpacity === 0 ? 1 : prev.backgroundOpacity,
        fullscreenShadeOpacity: prev.fullscreenShadeOpacity === 0 ? 0.42 : prev.fullscreenShadeOpacity,
      });
    } else {
      return;
    }

    onQuickSettingsChange(updater);
  }, [onQuickSettingsChange, onBackgroundPresetChange]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [dropdownOpen]);

  const selectedOption = BG_OPTIONS.find((o) => o.id === bgType) ?? BG_OPTIONS[0];

  const modeLabel = useMemo(() => {
    switch (bgType) {
      case "off": return t('bgPicker.bgDisabled');
      case "theme": return t('bgPicker.usingThemeBg');
      case "color": {
        const c = quickSettings.backgroundColor || "#0F172A";
        const end = quickSettings.backgroundColorEnd;
        return end ? `${t('bgPicker.gradient')} · ${c} → ${end}` : `${t('bgPicker.solid')} · ${c}`;
      }
      case "image": return quickSettings.backgroundImage ? t('bgPicker.imageBgActive') : t('bgPicker.noImageSelected');
      case "video": return quickSettings.backgroundVideo ? t('bgPicker.videoBgActive') : t('bgPicker.noVideoSelected');
      default: return "";
    }
  }, [bgType, quickSettings.backgroundColor, quickSettings.backgroundColorEnd, quickSettings.backgroundImage, quickSettings.backgroundVideo]);

  return (
    <div className="dtb-studio-card dtb-studio-card--no-collapse">
      <div className="dtb-studio-card__body dtb-bg-picker">
        {/* Header */}
        <div className="dtb-bg-picker__header">
          <div className="dtb-bg-picker__header-left">
            <Icon name="wallpaper" size={14} className="dtb-studio-card__icon" />
            <span className="dtb-studio-card__title">{t('bgPicker.background')}</span>
          </div>
        </div>
        <p className="dtb-bg-picker__subtitle">{t('bgPicker.chooseBackground')}</p>

        {/* Dropdown Selector */}
        <div className="dtb-bg-dropdown" ref={dropdownRef}>
          <button
            type="button"
            className={`dtb-bg-dropdown__trigger${dropdownOpen ? " dtb-bg-dropdown__trigger--open" : ""}`}
            onClick={() => setDropdownOpen((v) => !v)}
            aria-expanded={dropdownOpen}
            aria-haspopup="listbox"
          >
            <Icon name={selectedOption.icon} size={15} className="dtb-bg-dropdown__icon" />
            <span className="dtb-bg-dropdown__label">{t(selectedOption.label)}</span>
            <Icon name={dropdownOpen ? "expand_less" : "expand_more"} size={16} className="dtb-bg-dropdown__chevron" />
          </button>

          {dropdownOpen && (
            <div className="dtb-bg-dropdown__menu" role="listbox">
              {BG_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`dtb-bg-dropdown__item${bgType === option.id ? " dtb-bg-dropdown__item--selected" : ""}`}
                  role="option"
                  aria-selected={bgType === option.id}
                  onClick={() => handleTypeChange(option.id)}
                >
                  <Icon name={option.icon} size={14} className="dtb-bg-dropdown__item-icon" />
                  <span className="dtb-bg-dropdown__item-label">{t(option.label)}</span>
                  {bgType === option.id && (
                    <Icon name="check" size={14} className="dtb-bg-dropdown__check" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active mode indicator */}
        <div className="dtb-bg-picker__mode-badge">
          <span
            className={`dtb-bg-picker__mode-dot${bgType === "off" ? " dtb-bg-picker__mode-dot--off" : ""}`}
          />
          <span className="dtb-bg-picker__mode-text">{modeLabel}</span>
        </div>

        {/* Content based on type */}
        <div className="dtb-bg-picker__content">
          {bgType === "image" && (
            <ImageTab
              quickSettings={quickSettings}
              onQuickSettingsChange={onQuickSettingsChange}
            />
          )}
          {bgType === "video" && (
            <VideoTab
              quickSettings={quickSettings}
              onQuickSettingsChange={onQuickSettingsChange}
            />
          )}
          {bgType === "color" && (
            <ColorSection
              quickSettings={quickSettings}
              onQuickSettingsChange={onQuickSettingsChange}
            />
          )}
          {bgType === "theme" && (
            <ThemeSection
              selectedThemeId={_selectedThemeId}
              onThemeSelect={_onThemeSelect}
              allowedCategories={_allowedCategories}
              overlayMode={overlayMode}
            />
          )}
        </div>

        {/* Opacity controls (shown for color/image/video) */}
        {bgType !== "off" && (
          <div className="dtb-bg-picker__settings">
            <div className="dtb-slider-field">
              <div className="dtb-slider-field__head">
                <span>{t('bgPicker.overlayDarkness')}</span>
                <span className="dtb-slider-field__value">
                  {Math.round(quickSettings.fullscreenShadeOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                className="dtb-slider"
                min={0}
                max={100}
                step={1}
                value={Math.round(quickSettings.fullscreenShadeOpacity * 100)}
                onChange={(e) =>
                  onQuickSettingsChange((prev) => ({
                    ...prev,
                    fullscreenShadeOpacity: Number(e.target.value) / 100,
                  }))
                }
                aria-label={t('bgPicker.overlayDarkness')}
              />
            </div>
            <div className="dtb-slider-field">
              <div className="dtb-slider-field__head">
                <span>{t('bgPicker.backgroundOpacity')}</span>
                <span className="dtb-slider-field__value">
                  {Math.round(quickSettings.backgroundOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                className="dtb-slider"
                min={0}
                max={100}
                step={1}
                value={Math.round(quickSettings.backgroundOpacity * 100)}
                onChange={(e) =>
                  onQuickSettingsChange((prev) => ({
                    ...prev,
                    backgroundOpacity: Number(e.target.value) / 100,
                  }))
                }
                aria-label={t('bgPicker.backgroundOpacity')}
              />
            </div>
          </div>
        )}

        {/* ── Text Section ── */}
        <div className="dtb-bg-picker__settings">
          <div className="dtb-section-title">{t('bgPicker.text')}</div>

          {/* Text Color */}
          <div className="dtb-color-field">
            <span className="dtb-color-field__label">{t('common.color')}</span>
            <InlineColorPicker
              value={quickSettings.fontColor ?? "#ffffff"}
              onChange={(v) => onQuickSettingsChange((prev) => ({ ...prev, fontColor: v }))}
            />
          </div>

          {/* Font Size */}
          <div className="dtb-slider-field">
            <div className="dtb-slider-field__head">
              <span>{t('bgPicker.fontSize')}</span>
              <span className="dtb-slider-field__value">{quickSettings.fontSize}px</span>
            </div>
            <input
              type="range"
              className="dtb-slider"
              min={28}
              max={200}
              step={1}
              value={quickSettings.fontSize}
              onChange={(e) => onQuickSettingsChange((prev) => ({ ...prev, fontSize: Number(e.target.value) }))}
              aria-label={t('bgPicker.fontSize')}
            />
          </div>

          {/* Weight */}
          <div className="dtb-font-weight-row">
            <span className="dtb-position-label">{t('bgPicker.weight')}</span>
            <div className="dtb-position-options">
              {(["light", "normal", "bold"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`dtb-position-btn${quickSettings.fontWeight === w ? " dtb-position-btn--active" : ""}`}
                  onClick={() => onQuickSettingsChange((prev) => ({ ...prev, fontWeight: w }))}
                  style={{ fontWeight: w === "bold" ? 700 : w === "light" ? 300 : 500 }}
                >
                  {w === "light" ? t('bgPicker.light') : w === "bold" ? t('bgPicker.bold') : t('bgPicker.regular')}
                </button>
              ))}
            </div>
          </div>

          {/* Alignment */}
          <div className="dtb-font-weight-row">
            <span className="dtb-position-label">{t('bgPicker.alignment')}</span>
            <div className="dtb-position-options">
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`dtb-position-btn${quickSettings.textAlign === a ? " dtb-position-btn--active" : ""}`}
                  onClick={() => onQuickSettingsChange((prev) => ({ ...prev, textAlign: a }))}
                >
                  {a === "left" ? t('common.left') : a === "center" ? t('common.center') : t('common.right')}
                </button>
              ))}
            </div>
          </div>

          {/* Line Height */}
          <div className="dtb-slider-field">
            <div className="dtb-slider-field__head">
              <span>{t('bgPicker.lineHeight')}</span>
              <span className="dtb-slider-field__value">{quickSettings.lineHeight.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              className="dtb-slider"
              min={1.05}
              max={1.8}
              step={0.01}
              value={quickSettings.lineHeight}
              onChange={(e) => onQuickSettingsChange((prev) => ({ ...prev, lineHeight: Number(e.target.value) }))}
              aria-label={t('bgPicker.lineHeight')}
            />
          </div>

          {/* Text Case */}
          <div className="dtb-font-weight-row">
            <span className="dtb-position-label">{t('bgPicker.textCase')}</span>
            <div className="dtb-position-options">
              {(["none", "uppercase", "lowercase", "capitalize"] as const).map((tc) => (
                <button
                  key={tc}
                  type="button"
                  className={`dtb-position-btn${quickSettings.textTransform === tc ? " dtb-position-btn--active" : ""}`}
                  onClick={() => onQuickSettingsChange((prev) => ({ ...prev, textTransform: tc }))}
                >
                  {tc === "none" ? "Aa" : tc === "capitalize" ? "Ab" : tc === "uppercase" ? "AA" : "aa"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Reference Section ── */}
        {showReferences && (
          <ReferenceSection
            quickSettings={quickSettings}
            onQuickSettingsChange={onQuickSettingsChange}
          />
        )}
      </div>
    </div>
  );
}

/* ── Image Tab ── */
function ImageTab({
  quickSettings,
  onQuickSettingsChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
}) {
  const { t } = useTranslation();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        try {
          const { getAllMedia } = await import("../../library/libraryDb");
          const all = await getAllMedia();
          if (!cancelled && all.length > 0) {
            setMedia(all.filter((m) => m.type === "image"));
            return;
          }
        } catch { /* ignore */ }

        try {
          const res = await fetch("/uploads/dock-media-library.json");
          if (!res.ok) {
            if (res.status === 404) {
              try {
                await fetch("/api/save-dock-data", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: "dock-media-library", data: "[]" }),
                });
              } catch { /* best effort */ }
            }
            throw new Error(`HTTP ${res.status}`);
          }
          const all = await res.json();
          if (!cancelled && Array.isArray(all)) {
            setMedia(all.filter((m: MediaItem) => m.type === "image"));
            return;
          }
        } catch { /* ignore */ }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return media;
    return media.filter((m) => m.name.toLowerCase().includes(q));
  }, [media, search]);

  const selectedUrl = quickSettings.backgroundImage;

  const handleSelect = useCallback((item: MediaItem) => {
    const relUrl = toRelativeUrl(item.url);
    onQuickSettingsChange((prev) => ({
      ...prev,
      backgroundImage: prev.backgroundImage === relUrl ? "" : relUrl,
      backgroundImageFilePath: prev.backgroundImage === relUrl ? "" : (item.filePath || ""),
      backgroundVideo: "",
      backgroundVideoFilePath: "",
    }));
  }, [onQuickSettingsChange]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const { uploadFileToDock } = await import("../dockUploadService");
        const result = await uploadFileToDock(file);
        if (result.item) {
          setMedia((prev) => [result.item!, ...prev]);
          const relUrl = toRelativeUrl(result.item.url);
          onQuickSettingsChange((prev) => ({
            ...prev,
            backgroundImage: relUrl,
            backgroundImageFilePath: result.item.filePath || "",
            backgroundVideo: "",
            backgroundVideoFilePath: "",
          }));
        }
      } catch (err) {
        console.warn("[BackgroundPicker] Upload failed:", err);
      }
    }
  }, [onQuickSettingsChange]);

  return (
    <div className="dtb-bg-picker__tab-content">
      <div className="dtb-bg-picker__toolbar">
        <div className="dtb-bg-picker__search">
          <Icon name="search" size={13} className="dtb-bg-picker__search-icon" />
          <input
            type="text"
            className="dtb-bg-picker__search-input"
            placeholder={t('bgPicker.searchImages')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="dtb-bg-picker__search-clear"
              onClick={() => setSearch("")}
              aria-label={t('bgPicker.clearSearch')}
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="dtb-bg-picker__upload-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="add_photo_alternate" size={13} />
          {t('common.upload')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="dtb-bg-picker__file-input"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {loading ? (
        <div className="dtb-bg-picker__empty">
          <span>{t('bgPicker.loadingImages')}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dtb-bg-picker__empty">
          <Icon name="image" size={20} />
          <span>{search ? t('bgPicker.noImagesMatch') : t('bgPicker.noImagesUploaded')}</span>
        </div>
      ) : (
        <div className="dtb-bg-picker__grid">
          {filtered.map((item) => {
            const relUrl = toRelativeUrl(item.url);
            const isSelected = selectedUrl === relUrl;
            return (
              <button
                key={item.id}
                type="button"
                className={`dtb-bg-picker__card${isSelected ? " dtb-bg-picker__card--selected" : ""}`}
                onClick={() => handleSelect(item)}
                title={item.name}
              >
                <div
                  className="dtb-bg-picker__thumb"
                  style={{ backgroundImage: `url(${item.thumbnailUrl || item.url})` }}
                />
                <div className="dtb-bg-picker__card-info">
                  <span className="dtb-bg-picker__card-name">{item.name}</span>
                </div>
                {isSelected && (
                  <div className="dtb-bg-picker__card-check">
                    <Icon name="check" size={14} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Video Tab ── */
function VideoTab({
  quickSettings,
  onQuickSettingsChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
}) {
  const { t } = useTranslation();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        try {
          const { getAllMedia } = await import("../../library/libraryDb");
          const all = await getAllMedia();
          if (!cancelled && all.length > 0) {
            setMedia(all.filter((m) => m.type === "video"));
            return;
          }
        } catch { /* ignore */ }

        try {
          const res = await fetch("/uploads/dock-media-library.json");
          if (!res.ok) {
            if (res.status === 404) {
              try {
                await fetch("/api/save-dock-data", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: "dock-media-library", data: "[]" }),
                });
              } catch { /* best effort */ }
            }
            throw new Error(`HTTP ${res.status}`);
          }
          const all = await res.json();
          if (!cancelled && Array.isArray(all)) {
            setMedia(all.filter((m: MediaItem) => m.type === "video"));
            return;
          }
        } catch { /* ignore */ }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return media;
    return media.filter((m) => m.name.toLowerCase().includes(q));
  }, [media, search]);

  const selectedUrl = quickSettings.backgroundVideo;

  const handleSelect = useCallback((item: MediaItem) => {
    const relUrl = toRelativeUrl(item.url);
    onQuickSettingsChange((prev) => ({
      ...prev,
      backgroundVideo: prev.backgroundVideo === relUrl ? "" : relUrl,
      backgroundVideoFilePath: prev.backgroundVideo === relUrl ? "" : (item.filePath || ""),
      backgroundImage: "",
      backgroundImageFilePath: "",
    }));
  }, [onQuickSettingsChange]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("video/")) continue;
      try {
        const { uploadFileToDock } = await import("../dockUploadService");
        const result = await uploadFileToDock(file);
        if (result.item) {
          setMedia((prev) => [result.item!, ...prev]);
          const relUrl = toRelativeUrl(result.item.url);
          onQuickSettingsChange((prev) => ({
            ...prev,
            backgroundVideo: relUrl,
            backgroundVideoFilePath: result.item.filePath || "",
            backgroundImage: "",
            backgroundImageFilePath: "",
          }));
        }
      } catch (err) {
        console.warn("[BackgroundPicker] Upload failed:", err);
      }
    }
  }, [onQuickSettingsChange]);

  return (
    <div className="dtb-bg-picker__tab-content">
      <div className="dtb-bg-picker__toolbar">
        <div className="dtb-bg-picker__search">
          <Icon name="search" size={13} className="dtb-bg-picker__search-icon" />
          <input
            type="text"
            className="dtb-bg-picker__search-input"
            placeholder={t('bgPicker.searchVideos')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="dtb-bg-picker__search-clear"
              onClick={() => setSearch("")}
              aria-label={t('bgPicker.clearSearch')}
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="dtb-bg-picker__upload-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="videocam" size={13} />
          {t('common.upload')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          className="dtb-bg-picker__file-input"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {loading ? (
        <div className="dtb-bg-picker__empty">
          <span>{t('bgPicker.loadingVideos')}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dtb-bg-picker__empty">
          <Icon name="videocam" size={20} />
          <span>{search ? t('bgPicker.noVideosMatch') : t('bgPicker.noVideosUploaded')}</span>
        </div>
      ) : (
        <div className="dtb-bg-picker__grid">
          {filtered.map((item) => {
            const relUrl = toRelativeUrl(item.url);
            const isSelected = selectedUrl === relUrl;
            return (
              <button
                key={item.id}
                type="button"
                className={`dtb-bg-picker__card${isSelected ? " dtb-bg-picker__card--selected" : ""}`}
                onClick={() => handleSelect(item)}
                title={item.name}
              >
                <div
                  className="dtb-bg-picker__thumb dtb-bg-picker__thumb--video"
                  style={{ backgroundImage: item.thumbnailUrl ? `url(${item.thumbnailUrl})` : undefined }}
                >
                  <div className="dtb-bg-picker__play-icon">
                    <Icon name="play_arrow" size={18} />
                  </div>
                  {item.durationSec != null && (
                    <span className="dtb-bg-picker__duration">{formatDuration(item.durationSec)}</span>
                  )}
                </div>
                <div className="dtb-bg-picker__card-info">
                  <span className="dtb-bg-picker__card-name">{item.name}</span>
                  {item.fileSize != null && (
                    <span className="dtb-bg-picker__card-meta">{formatFileSize(item.fileSize)}</span>
                  )}
                </div>
                {isSelected && (
                  <div className="dtb-bg-picker__card-check">
                    <Icon name="check" size={14} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Color Section — ThemeModalStitch layout, MakeChurchEasy skin ── */
function ColorSection({
  quickSettings,
  onQuickSettingsChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
}) {
  const { t } = useTranslation();
  const isGradient = !!(quickSettings.backgroundColor && quickSettings.backgroundColorEnd);
  const colorStart = quickSettings.backgroundColor || "#0F172A";
  const colorEnd = quickSettings.backgroundColorEnd || "#000000";
  const angle = quickSettings.bgGradientAngle ?? 135;

  const pushChange = useCallback(
    (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => {
      onQuickSettingsChange(updater);
    },
    [onQuickSettingsChange],
  );

  return (
    <div className="dtb-bg-picker__tab-content dtb-colors">
      {/* Solid / Gradient segmented toggle */}
      <div className="dtb-colors__section">
        <div className="dtb-color-mode-toggle">
          <button
            type="button"
            className={`dtb-color-mode-toggle__btn${!isGradient ? " dtb-color-mode-toggle__btn--active" : ""}`}
            onClick={() => {
              pushChange((prev) => ({
                ...prev,
                backgroundColor: prev.backgroundColor || "#0F172A",
                backgroundColorEnd: "",
                bgGradientAngle: 135,
              }));
            }}
          >
            <Icon name="stop" size={13} />
            {t('bgPicker.solid')}
          </button>
          <button
            type="button"
            className={`dtb-color-mode-toggle__btn${isGradient ? " dtb-color-mode-toggle__btn--active" : ""}`}
            onClick={() => {
              pushChange((prev) => ({
                ...prev,
                backgroundColor: prev.backgroundColor || "#AD0000",
                backgroundColorEnd: prev.backgroundColorEnd || "#000000",
                bgGradientAngle: prev.bgGradientAngle || 135,
              }));
            }}
          >
            <Icon name="palette" size={13} />
            {t('bgPicker.gradient')}
          </button>
        </div>
      </div>

      {/* ── Solid mode: color swatch ── */}
      {!isGradient && (
        <div className="dtb-colors__section">
          <span className="dtb-colors__label">{t('common.color')}</span>
          <InlineColorPicker
            value={colorStart}
            onChange={(v) => pushChange((prev) => ({ ...prev, backgroundColor: v }))}
          />
        </div>
      )}

      {/* ── Gradient mode: preview + start/end + angle + presets ── */}
      {isGradient && (
        <>
          {/* Live gradient preview strip */}
          <div className="dtb-colors__section">
            <div
              className="dtb-gradient-preview"
              style={{
                width: "100%",
                height: 56,
                borderRadius: 4,
                background: `linear-gradient(${angle}deg, ${colorStart}, ${colorEnd})`,
              }}
            />
          </div>

          {/* Start + End color pickers */}
          <div className="dtb-colors__section">
            <div className="dtb-gradient-colors-row">
              <div className="dtb-gradient-colors-row__item">
                <span className="dtb-colors__label">{t('bgPicker.start')}</span>
                <InlineColorPicker
                  value={colorStart}
                  onChange={(v) => pushChange((prev) => ({ ...prev, backgroundColor: v }))}
                />
              </div>
              <div className="dtb-gradient-colors-row__item">
                <span className="dtb-colors__label">{t('bgPicker.end')}</span>
                <InlineColorPicker
                  value={colorEnd}
                  onChange={(v) => pushChange((prev) => ({ ...prev, backgroundColorEnd: v }))}
                />
              </div>
            </div>
          </div>

          {/* Angle control */}
          <div className="dtb-colors__section">
            <div className="dtb-slider-field">
              <div className="dtb-slider-field__head">
                <span>{t('bgPicker.angle')}</span>
                <span className="dtb-slider-field__value">{angle}°</span>
              </div>
              <input
                type="range"
                className="dtb-slider"
                min={0}
                max={360}
                step={1}
                value={angle}
                onChange={(e) =>
                  pushChange((prev) => ({
                    ...prev,
                    bgGradientAngle: Number(e.target.value),
                  }))
                }
                aria-label={t('bgPicker.angle')}
              />
            </div>
          </div>

          {/* Gradient presets */}
          <div className="dtb-colors__section">
            <div className="dtb-gradient-presets">
              {GRADIENT_PRESETS.map((preset) => {
                const active =
                  colorStart === preset.start &&
                  colorEnd === preset.end &&
                  angle === preset.angle;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className={`dtb-gradient-preset${active ? " dtb-gradient-preset--active" : ""}`}
                    onClick={() =>
                      pushChange((prev) => ({
                        ...prev,
                        backgroundColor: preset.start,
                        backgroundColorEnd: preset.end,
                        bgGradientAngle: preset.angle,
                      }))
                    }
                    title={preset.label}
                  >
                    <div
                      className="dtb-gradient-preset__swatch"
                      style={{
                        background: `linear-gradient(${preset.angle}deg, ${preset.start}, ${preset.end})`,
                      }}
                    />
                    <span className="dtb-gradient-preset__label">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Darkness slider (shared) ── */}
      <div className="dtb-colors__section">
        <div className="dtb-slider-field">
          <div className="dtb-slider-field__head">
            <span>{t('bgPicker.darkness')}</span>
            <span className="dtb-slider-field__value">
              {Math.round(quickSettings.fullscreenShadeOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            className="dtb-slider"
            min={0}
            max={100}
            step={1}
            value={Math.round(quickSettings.fullscreenShadeOpacity * 100)}
            onChange={(e) =>
              pushChange((prev) => ({
                ...prev,
                fullscreenShadeOpacity: Number(e.target.value) / 100,
              }))
            }
            aria-label={t('bgPicker.darkness')}
          />
        </div>
      </div>

      {/* ── Opacity slider (shared) ── */}
      <div className="dtb-colors__section">
        <div className="dtb-slider-field">
          <div className="dtb-slider-field__head">
            <span>{t('bgPicker.opacity')}</span>
            <span className="dtb-slider-field__value">
              {Math.round(quickSettings.backgroundOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            className="dtb-slider"
            min={0}
            max={100}
            step={1}
            value={Math.round(quickSettings.backgroundOpacity * 100)}
            onChange={(e) =>
              pushChange((prev) => ({
                ...prev,
                backgroundOpacity: Number(e.target.value) / 100,
              }))
            }
            aria-label={t('bgPicker.opacity')}
          />
        </div>
      </div>



      {/* Theme Presets */}
      <PresetSection
        quickSettings={quickSettings}
        onQuickSettingsChange={onQuickSettingsChange}
      />
    </div>
  );
}

/* ── Gradient Presets ── */
const GRADIENT_PRESETS = [
  { label: "Sunset", start: "#AD0000", end: "#000000", angle: 135 },
  { label: "Ocean", start: "#006994", end: "#001E3C", angle: 180 },
  { label: "Forest", start: "#1B4332", end: "#0B1A12", angle: 160 },
  { label: "Royal", start: "#4A1A6B", end: "#0D0221", angle: 135 },
  { label: "Ember", start: "#B7410E", end: "#1A0A00", angle: 150 },
  { label: "Midnight", start: "#0F172A", end: "#000000", angle: 180 },
  { label: "Dusk", start: "#2D1B69", end: "#11001C", angle: 135 },
  { label: "Slate", start: "#334155", end: "#0F172A", angle: 180 },
];

/* ── Reference Section ── */
function ReferenceSection({
  quickSettings,
  onQuickSettingsChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
}) {
  const { t } = useTranslation();
  const refPosition = quickSettings.refPosition ?? "bottom";
  const refFontSize = quickSettings.refFontSize ?? 24;
  const refFontWeight = quickSettings.refFontWeight ?? "normal";
  const refTextTransform = quickSettings.refTextTransform ?? "none";
  const refLetterSpacing = quickSettings.refLetterSpacing ?? 0;
  const refOpacity = quickSettings.refOpacity ?? 1;
  const refTextAlign = quickSettings.refTextAlign ?? "match";
  const refSpacing = quickSettings.refSpacing ?? 24;

  return (
    <div className="dtb-bg-picker__settings">
      <div className="dtb-section-title">{t('bgPicker.reference')}</div>

      {/* Reference Position */}
      <div className="dtb-position-row">
        <span className="dtb-position-label">{t('bgPicker.position')}</span>
        <div className="dtb-position-options">
          {(["top", "bottom"] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              className={`dtb-position-btn${refPosition === pos ? " dtb-position-btn--active" : ""}`}
              onClick={() => onQuickSettingsChange((prev) => ({ ...prev, refPosition: pos }))}
            >
              {pos === "top" ? t('bgPicker.aboveVerse') : t('bgPicker.belowVerse')}
            </button>
          ))}
        </div>
      </div>

      {/* Reference Font Size */}
      <div className="dtb-slider-field">
        <div className="dtb-slider-field__head">
          <span>{t('bgPicker.fontSize')}</span>
          <span className="dtb-slider-field__value">{refFontSize}px</span>
        </div>
        <input
          type="range"
          className="dtb-slider"
          min={12}
          max={72}
          step={1}
          value={refFontSize}
          onChange={(e) => onQuickSettingsChange((prev) => ({ ...prev, refFontSize: Number(e.target.value) }))}
          aria-label={t('bgPicker.refFontSize')}
        />
      </div>

      {/* Reference Font Weight */}
      <div className="dtb-font-weight-row">
        <span className="dtb-position-label">{t('bgPicker.weight')}</span>
        <div className="dtb-position-options">
          {(["light", "normal", "bold"] as const).map((w) => (
            <button
              key={w}
              type="button"
              className={`dtb-position-btn${refFontWeight === w ? " dtb-position-btn--active" : ""}`}
              onClick={() => onQuickSettingsChange((prev) => ({ ...prev, refFontWeight: w }))}
              style={{ fontWeight: w === "bold" ? 700 : w === "light" ? 300 : 500 }}
            >
              {w === "light" ? t('bgPicker.light') : w === "bold" ? t('bgPicker.bold') : t('bgPicker.normal')}
            </button>
          ))}
        </div>
      </div>

      {/* Reference Color */}
      <div className="dtb-color-field">
        <span className="dtb-color-field__label">{t('common.color')}</span>
        <InlineColorPicker
          value={quickSettings.refFontColor ?? "#cccccc"}
          onChange={(v) => onQuickSettingsChange((prev) => ({ ...prev, refFontColor: v }))}
        />
      </div>

      {/* Reference Text Case */}
      <div className="dtb-font-weight-row">
        <span className="dtb-position-label">{t('bgPicker.textCase')}</span>
        <div className="dtb-position-options">
          {(["none", "uppercase", "lowercase", "capitalize"] as const).map((tc) => (
            <button
              key={tc}
              type="button"
              className={`dtb-position-btn${refTextTransform === tc ? " dtb-position-btn--active" : ""}`}
              onClick={() => onQuickSettingsChange((prev) => ({ ...prev, refTextTransform: tc }))}
            >
              {tc === "none" ? t('bgPicker.normal') : tc === "capitalize" ? t('bgPicker.title') : tc === "uppercase" ? "UPPER" : "lower"}
            </button>
          ))}
        </div>
      </div>

      {/* Reference Alignment */}
      <div className="dtb-font-weight-row">
        <span className="dtb-position-label">{t('bgPicker.alignment')}</span>
        <div className="dtb-position-options">
          {(["match", "left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              type="button"
              className={`dtb-position-btn${refTextAlign === a ? " dtb-position-btn--active" : ""}`}
              onClick={() => onQuickSettingsChange((prev) => ({ ...prev, refTextAlign: a }))}
            >
              {a === "match" ? t('bgPicker.matchVerse') : t(`common.${a}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Letter Spacing */}
      <div className="dtb-slider-field">
        <div className="dtb-slider-field__head">
          <span>{t('bgPicker.letterSpacing')}</span>
          <span className="dtb-slider-field__value">{refLetterSpacing}px</span>
        </div>
        <input
          type="range"
          className="dtb-slider"
          min={0}
          max={10}
          step={0.5}
          value={refLetterSpacing}
          onChange={(e) => onQuickSettingsChange((prev) => ({ ...prev, refLetterSpacing: Number(e.target.value) }))}
          aria-label={t('bgPicker.letterSpacing')}
        />
      </div>

      {/* Spacing */}
      <div className="dtb-slider-field">
        <div className="dtb-slider-field__head">
          <span>{t('bgPicker.spacing')}</span>
          <span className="dtb-slider-field__value">{refSpacing}px</span>
        </div>
        <input
          type="range"
          className="dtb-slider"
          min={0}
          max={80}
          step={1}
          value={refSpacing}
          onChange={(e) => onQuickSettingsChange((prev) => ({ ...prev, refSpacing: Number(e.target.value) }))}
          aria-label={t('bgPicker.spacing')}
        />
      </div>

      {/* Opacity */}
      <div className="dtb-slider-field">
        <div className="dtb-slider-field__head">
          <span>{t('common.opacity')}</span>
          <span className="dtb-slider-field__value">{Math.round(refOpacity * 100)}%</span>
        </div>
        <input
          type="range"
          className="dtb-slider"
          min={10}
          max={100}
          step={1}
          value={Math.round(refOpacity * 100)}
          onChange={(e) => onQuickSettingsChange((prev) => ({ ...prev, refOpacity: Number(e.target.value) / 100 }))}
          aria-label={t('common.opacity')}
        />
      </div>

      {/* Reference Background (reuses existing section) */}
      <ReferenceBackgroundSection
        quickSettings={quickSettings}
        onQuickSettingsChange={onQuickSettingsChange}
      />
    </div>
  );
}

/* ── Reference Background ── */
function ReferenceBackgroundSection({
  quickSettings,
  onQuickSettingsChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
}) {
  const { t } = useTranslation();
  const refBgEnabled = quickSettings.referenceBackgroundEnabled;
  const [styleOpen, setStyleOpen] = useState(true);

  return (
    <div className="dtb-colors__section">
      <div className="dtb-colors__toggle-row">
        <span className="dtb-colors__label">{t('bgPicker.referenceBackground')}</span>
        <button
          type="button"
          className={`dtb-toggle${refBgEnabled ? " dtb-toggle--on" : ""}`}
          onClick={() =>
            onQuickSettingsChange((prev) => ({
              ...prev,
              referenceBackgroundEnabled: !prev.referenceBackgroundEnabled,
            }))
          }
          role="switch"
          aria-checked={refBgEnabled}
          aria-label={t('bgPicker.enableReferenceBackground')}
        >
          <span className="dtb-toggle__knob" />
        </button>
      </div>

      {refBgEnabled && (
        <div className="dtb-colors__ref-bg-controls">
          <InlineColorPicker
            value={quickSettings.referenceBackgroundColor}
            onChange={(v) => onQuickSettingsChange((prev) => ({ ...prev, referenceBackgroundColor: v }))}
          />

          <button
            type="button"
            className="dtb-colors__collapsible-header dtb-colors__collapsible-header--sub"
            onClick={() => setStyleOpen((v) => !v)}
            aria-expanded={styleOpen}
          >
            <span className="dtb-colors__sublabel">{t('bgPicker.style')}</span>
            <Icon name={styleOpen ? "expand_less" : "expand_more"} size={13} />
          </button>
          {styleOpen && (
            <div className="dtb-colors__style-cards">
              {([
                { id: "solid" as const, label: "bgPicker.solid", preview: "John 3:16" },
                { id: "pill" as const, label: "bgPicker.pill", preview: "John 3:16" },
                { id: "outline" as const, label: "bgPicker.outline", preview: "John 3:16" },
              ]).map((style) => {
                const isActive = quickSettings.referenceBackgroundStyle === style.id;
                const bg = quickSettings.referenceBackgroundColor;
                return (
                  <button
                    key={style.id}
                    type="button"
                    className={`dtb-colors__style-card${isActive ? " dtb-colors__style-card--active" : ""}`}
                    onClick={() =>
                      onQuickSettingsChange((prev) => ({ ...prev, referenceBackgroundStyle: style.id }))
                    }
                  >
                    <span className="dtb-colors__style-card-label">{t(style.label)}</span>
                    <span
                      className={`dtb-colors__style-card-preview dtb-colors__style-card-preview--${style.id}`}
                      style={{
                        backgroundColor: style.id === "outline" ? "transparent" : bg,
                        borderColor: style.id === "outline" ? bg : undefined,
                        borderRadius: style.id === "pill" ? "999px" : `${quickSettings.referenceBackgroundRadius}px`,
                        color: style.id === "outline" ? bg : undefined,
                      }}
                    >
                      {style.preview}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="dtb-colors__slider-row">
            <div className="dtb-slider-field">
              <div className="dtb-slider-field__head">
                <span>{t('common.cornerRadius')}</span>
                <span className="dtb-slider-field__value">{quickSettings.referenceBackgroundRadius}px</span>
              </div>
              <input
                type="range"
                className="dtb-slider"
                min={0}
                max={40}
                step={1}
                value={quickSettings.referenceBackgroundRadius}
                onChange={(e) =>
                  onQuickSettingsChange((prev) => ({
                    ...prev,
                    referenceBackgroundRadius: Number(e.target.value),
                  }))
                }
                aria-label={t('common.cornerRadius')}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Theme Picker ── */
function ThemeSection({
  selectedThemeId,
  onThemeSelect,
  allowedCategories,
  overlayMode,
}: {
  selectedThemeId: string | null;
  onThemeSelect: (theme: BibleTheme) => void;
  allowedCategories?: Array<NonNullable<BibleTheme["category"]>>;
  overlayMode: "fullscreen" | "lower-third";
}) {
  const [themes, setThemes] = useState<BibleTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Load all themes (unified — no templateType filter)
        const all = await loadDockFavoriteBibleThemes();
        const allowed = new Set((allowedCategories ?? []).map((c) => c.toLowerCase()));
        const filtered = allowed.size === 0
          ? all
          : all.filter((t) => {
            const cats = t.categories?.length ? t.categories : t.category ? [t.category] : [];
            return cats.some((c) => allowed.has(c.toLowerCase()));
          });
        console.log("[ThemeSection]", {
          overlayMode,
          allowedCategories: allowedCategories ?? "ALL",
          loadedCount: all.length,
          filteredCount: filtered.length,
          themeNames: filtered.map((t) => t.name),
        });
        if (!cancelled) setThemes(filtered);
      } catch (err) {
        console.error("[ThemeSection] failed to load themes:", err);
        if (!cancelled) setThemes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [allowedCategories, overlayMode]);

  if (loading) {
    return (
      <div className="dtb-theme-section">
        <span className="dtb-colors__label">{t('bgPicker.selectTheme')}</span>
        <div className="dtb-theme-section__loading">{t('bgPicker.loadingThemes')}</div>
      </div>
    );
  }

  if (themes.length === 0) {
    return (
      <div className="dtb-theme-section">
        <span className="dtb-colors__label">{t('bgPicker.selectTheme')}</span>
        <div className="dtb-theme-section__empty">{t('bgPicker.noThemesFound')}</div>
      </div>
    );
  }

  return (
    <div className="dtb-theme-section">
      <span className="dtb-colors__label">{t('bgPicker.selectTheme')}</span>
      <div className="dtb-theme-section__grid">
        {themes.map((theme) => {
          const isActive = theme.id === selectedThemeId;
          // Resolve variant for preview — use the active mode's variant, fallback to theme.settings
          const variant = overlayMode === "lower-third"
            ? theme.variants?.lowerThird
            : theme.variants?.fullscreen;
          const s = variant?.settings ?? theme.settings;
          const bgColor = s.boxBackground || s.backgroundColor || "#0F172A";
          const fontColor = s.fontColor || "#fff";
          // Determine which variants this theme supports
          const hasFs = !!(theme.variants?.fullscreen) || theme.templateType === "fullscreen";
          const hasLt = !!(theme.variants?.lowerThird) || theme.templateType === "lower-third";
          return (
            <button
              key={theme.id}
              type="button"
              className={`dtb-theme-section__item${isActive ? " dtb-theme-section__item--active" : ""}`}
              onClick={() => onThemeSelect(theme)}
              title={theme.name}
            >
              <div
                className="dtb-theme-section__preview"
                style={{ backgroundColor: bgColor, color: fontColor }}
              >
                <span className="dtb-theme-section__preview-text">Aa</span>
                <div className="dtb-theme-section__variants">
                  {hasFs && <span className="dtb-theme-section__variant-badge">FS</span>}
                  {hasLt && <span className="dtb-theme-section__variant-badge">LT</span>}
                </div>
              </div>
              <span className="dtb-theme-section__name">{theme.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Theme Presets ── */
const COLOR_PRESETS = [
  {
    label: "Faith",
    backgroundColor: "#1A2244",
    backgroundOpacity: 1,
    referenceBackgroundEnabled: false,
    referenceBackgroundColor: "#F4D17B",
    referenceBackgroundStyle: "solid" as const,
    referenceBackgroundRadius: 12,
  },
  {
    label: "Minimal",
    backgroundColor: "#0F172A",
    backgroundOpacity: 1,
    referenceBackgroundEnabled: false,
    referenceBackgroundColor: "#CBD5E1",
    referenceBackgroundStyle: "solid" as const,
    referenceBackgroundRadius: 12,
  },
  {
    label: "Bold",
    backgroundColor: "#050816",
    backgroundOpacity: 1,
    referenceBackgroundEnabled: true,
    referenceBackgroundColor: "#B9CCFF",
    referenceBackgroundStyle: "pill" as const,
    referenceBackgroundRadius: 20,
  },
  {
    label: "High Contrast",
    backgroundColor: "#000000",
    backgroundOpacity: 1,
    referenceBackgroundEnabled: true,
    referenceBackgroundColor: "#FDE68A",
    referenceBackgroundStyle: "outline" as const,
    referenceBackgroundRadius: 4,
  },
  {
    label: "Elegant",
    backgroundColor: "#1C1917",
    backgroundOpacity: 1,
    referenceBackgroundEnabled: true,
    referenceBackgroundColor: "#D4A574",
    referenceBackgroundStyle: "solid" as const,
    referenceBackgroundRadius: 6,
  },
];

function PresetSection({
  quickSettings,
  onQuickSettingsChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
}) {
  const [open, setOpen] = useState(true);
  const { t } = useTranslation();

  return (
    <div className="dtb-colors__section dtb-colors__section--collapsible">
      <button
        type="button"
        className="dtb-colors__collapsible-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="dtb-colors__label">{t('bgPicker.themePresets')}</span>
        <Icon name={open ? "expand_less" : "expand_more"} size={14} />
      </button>
      {open && (
        <div className="dtb-colors__preset-grid">
          {COLOR_PRESETS.map((preset) => {
            const isActive =
              quickSettings.backgroundColor === preset.backgroundColor &&
              quickSettings.backgroundOpacity === preset.backgroundOpacity &&
              quickSettings.referenceBackgroundEnabled === preset.referenceBackgroundEnabled &&
              quickSettings.referenceBackgroundColor === preset.referenceBackgroundColor &&
              quickSettings.referenceBackgroundStyle === preset.referenceBackgroundStyle &&
              quickSettings.referenceBackgroundRadius === preset.referenceBackgroundRadius;
            return (
              <button
                key={preset.label}
                type="button"
                className={`dtb-colors__preset-card${isActive ? " dtb-colors__preset-card--active" : ""}`}
                onClick={() =>
                  onQuickSettingsChange((prev) => ({
                    ...prev,
                    backgroundColor: preset.backgroundColor,
                    backgroundOpacity: preset.backgroundOpacity,
                    referenceBackgroundEnabled: preset.referenceBackgroundEnabled,
                    referenceBackgroundColor: preset.referenceBackgroundColor,
                    referenceBackgroundStyle: preset.referenceBackgroundStyle,
                    referenceBackgroundRadius: preset.referenceBackgroundRadius,
                  }))
                }
              >
                <div
                  className="dtb-colors__preset-preview"
                  style={{ backgroundColor: preset.backgroundColor }}
                >
                  <span className="dtb-colors__preset-sample">Aa</span>
                  <span
                    className="dtb-colors__preset-ref"
                    style={{
                      backgroundColor: preset.referenceBackgroundEnabled && preset.referenceBackgroundStyle !== "outline" ? preset.referenceBackgroundColor : "transparent",
                      borderRadius: preset.referenceBackgroundStyle === "pill" ? "999px" : `${preset.referenceBackgroundRadius}px`,
                      border: preset.referenceBackgroundEnabled && preset.referenceBackgroundStyle === "outline" ? `1.5px solid ${preset.referenceBackgroundColor}` : "none",
                      color: preset.referenceBackgroundColor,
                      padding: preset.referenceBackgroundEnabled ? "2px 6px" : "0",
                    }}
                  >
                    John 3:16
                  </span>
                </div>
                <span className="dtb-colors__preset-name">{preset.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Inline Color Picker ── */
function InlineColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [hexInput, setHexInput] = useState(value);

  useEffect(() => { setHexInput(value); }, [value]);

  const openPopover = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = Math.min(rect.bottom + 6, window.innerHeight - 240);
    const left = Math.min(rect.left, window.innerWidth - 210);
    setPos({ top, left: Math.max(8, left) });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const commitHex = useCallback(() => {
    const cleaned = hexInput.trim().replace(/^#/, "");
    if (/^[\da-f]{6}$/i.test(cleaned)) {
      onChange(`#${cleaned.toUpperCase()}`);
    } else {
      setHexInput(value);
    }
  }, [hexInput, value, onChange]);

  return (
    <>
      <div
        className="dtb-color-inline__trigger"
        ref={triggerRef}
        onClick={openPopover}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openPopover(); }}
      >
        <div className="dtb-color-inline__preview" style={{ backgroundColor: value }} />
        <span className="dtb-color-inline__hex">{value.toUpperCase()}</span>
      </div>
      {open && createPortal(
        <div
          ref={popoverRef}
          className="dtb-color-inline__popover"
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 10000 }}
        >
          <HexColorPicker color={value} onChange={onChange} />
          <div className="dtb-color-inline__input-row">
            <span className="dtb-color-inline__hash">#</span>
            <input
              className="dtb-color-inline__hex-input"
              type="text"
              maxLength={6}
              value={hexInput.replace(/^#/, "")}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={commitHex}
              onKeyDown={(e) => { if (e.key === "Enter") commitHex(); }}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
