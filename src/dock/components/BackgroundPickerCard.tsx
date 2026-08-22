import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { HexColorPicker } from "react-colorful";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { themeSupportsBibleOverlayMode } from "../../bible/themeVariantSupport";
import type { BibleTheme } from "../../bible/types";
import { BACKGROUND_PATTERNS } from "../../library/backgroundAssets";
import type { MediaItem } from "../../library/libraryTypes";
import {
  readNativeDockSetting,
  writeNativeDockSetting,
} from "../../services/localDockSettings";
import { toStoredOverlayAssetUrl } from "../../services/overlayUrl";
import {
  loadDockPreferenceList,
  readDockPreferenceList,
  saveDockPreferenceList,
} from "../../services/dockPreferenceStorage";
import { FAVORITE_THEMES_UPDATED_EVENT } from "../../services/favoriteThemes";
import Icon from "../DockIcon";
import {
  COMPARE_GAP_PRESETS,
  COMPARE_LAYOUT_PRESETS,
  normalizeCompareThemeSettings,
  type CompareFontWeight,
  type CompareMetadataPosition,
  type CompareTextAlign
} from "../compareThemeConfig";
import type { DockBackgroundPreset } from "../dockConsoleTheme";
import { loadDockFavoriteBibleThemes } from "../dockThemeData";
import {
  LOWER_THIRD_FIT_MIN_FONT_SIZE,
  LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE,
  LOWER_THIRD_FONT_SIZE_MAX,
  LOWER_THIRD_REFERENCE_FONT_SIZE_MAX,
} from "../lowerThirdQuickSettings";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";

/* ── Types ── */
type BackgroundType = "off" | "theme" | "color" | "image" | "pattern" | "video";
type BackgroundPickerTab = "text" | "layout" | "background" | "compare";
type BackgroundPickerStorageScope = "bible" | "worship" | "notes" | "global";
export type BibleReferenceFormat = "full" | "short" | "hidden";
type BibleTextSubTab = "bible" | "reference";
type BibleLayoutSubTab = "text" | "reference";
type CompactFontWeight = "light" | "normal" | "bold" | "extrabold";
type CompactTextCase = "none" | "uppercase" | "lowercase" | "capitalize";
type CompactTextAlign = "match" | "left" | "center" | "right" | "justify";

interface SavedLocalStyle {
  id: string;
  name: string;
  createdAt: number;
  backgroundType: BackgroundType;
  settings: DockFullscreenQuickThemeSettings;
}

interface Props {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
  onQuickSettingsSave?: (settings: DockFullscreenQuickThemeSettings) => void;
  onSaveFeedback?: (message: string) => void;
  selectedThemeId: string | null;
  onThemeSelect: (theme: BibleTheme) => void;
  templateType?: BibleTheme["templateType"];
  allowedCategories?: Array<NonNullable<BibleTheme["category"]>>;
  sampleText?: string;
  sampleReference?: string;
  onBackgroundPresetChange?: (preset: DockBackgroundPreset) => void;
  /** Show the Reference section (only relevant for Bible tab) */
  showReferences?: boolean;
  /** Bible-only reference display preferences surfaced in the Reference sub-tab */
  referenceFormat?: BibleReferenceFormat;
  referenceVersionVisible?: boolean;
  referenceTranslation?: string;
  onReferenceFormatChange?: (format: BibleReferenceFormat) => void;
  onReferenceVersionVisibleChange?: (visible: boolean) => void;
  /** Active overlay mode — used to resolve variant preview in theme cards */
  overlayMode?: "fullscreen" | "lower-third";
  /** Active display mode — controls whether Compare Layout section is visible */
  displayMode?: "single" | "compare";
  initialTab?: BackgroundPickerTab;
  /** Storage scope keeps local picker preferences separate for Bible, Worship, and Notes */
  storageScope?: BackgroundPickerStorageScope;
  /** When true and displayMode is "compare", hides the Background tab and shows only the Compare tab */
  hideBackgroundOnCompare?: boolean;
}

const BG_TYPE_KEY = "dtb-bg-picker-type";
const ACTIVE_TAB_KEY = "dtb-bg-picker-tab";
const LOCAL_STYLES_KEY = "dtb-bg-picker-local-styles";
const LOCAL_STYLE_LIMIT = 12;
const LOWER_THIRD_TEXT_PADDING_MAX = 250;
export const BACKGROUND_PICKER_COMPACT_HEIGHT = 520;

const BG_OPTIONS: Array<{ id: BackgroundType; label: string; icon: string }> = [
  { id: "off", label: "bgPicker.off", icon: "block" },
  { id: "theme", label: "bgPicker.theme", icon: "palette" },
  { id: "color", label: "common.color", icon: "color_lens" },
  { id: "image", label: "common.image", icon: "image" },
  { id: "pattern", label: "common.pattern", icon: "texture" },
  { id: "video", label: "common.video", icon: "videocam" },
];
const COMPARE_BG_OPTIONS = BG_OPTIONS.filter((option) => option.id !== "theme");

const INLINE_COLOR_SWATCHES = [
  "#FFFFFF",
  "#F8FAFC",
  "#E2E8F0",
  "#CBD5E1",
  "#94A3B8",
  "#0F172A",
  "#111827",
  "#FDE68A",
  "#F4D17B",
  "#B9CCFF",
  "#60A5FA",
  "#22C55E",
];

/* ── Helpers ── */
function isOverlayAssetUrl(value: string): boolean {
  return /^(?:data:|blob:|https?:\/\/|\/uploads\/|uploads\/)/i.test(value);
}

/**
 * Normalize current and legacy library records to a URL the OBS overlay can
 * load. Older records may have a filesystem-style path in `url`; uploaded
 * records have a stable disk filename that is safer than the URL's origin.
 */
export function toBackgroundAssetUrl(item: Pick<MediaItem, "url" | "filePath" | "diskFileName">): string {
  if (item.diskFileName) {
    return `/uploads/${encodeURIComponent(item.diskFileName)}`;
  }

  const storedUrl = toStoredOverlayAssetUrl(item.url);
  if (isOverlayAssetUrl(storedUrl)) return storedUrl;

  const fileName = String(item.filePath || "")
    .replace(/^file:\/\//i, "")
    .split(/[\\/]/)
    .pop()
    ?.trim();
  if (fileName) return `/uploads/${encodeURIComponent(fileName)}`;

  return storedUrl;
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
  if (qs.backgroundPattern) return "pattern";
  if (qs.backgroundVideo) return "video";
  if (qs.backgroundColor && qs.backgroundColorEnd) return "color";
  if (qs.backgroundColor && qs.backgroundColor !== "transparent") return "color";
  if (qs.fullscreenShadeColor && qs.fullscreenShadeColor !== "#000000") return "color";
  if (qs.fullscreenShadeOpacity > 0) return "theme";
  return "off";
}

function resolveInitialTab(
  tab: BackgroundPickerTab | undefined,
  displayMode: Props["displayMode"],
  activeTabKey: string,
  forceCompare?: boolean,
): BackgroundPickerTab {
  if (forceCompare && displayMode === "compare") return "compare";

  const stored = !tab ? (() => {
    try {
      const v = readNativeDockSetting<string>(activeTabKey);
      if (v === "text" || v === "layout" || v === "background" || v === "compare") return v;
    } catch { /* ignore */ }
    return null;
  })() : null;

  const resolved = tab ?? stored ?? "text";
  if (resolved === "compare" && displayMode !== "compare") return "text";
  if ((resolved === "text" || resolved === "layout") && displayMode === "compare") return "background";
  return resolved;
}

function isBackgroundType(value: string | null): value is BackgroundType {
  return value === "off" || value === "theme" || value === "color" || value === "image" || value === "pattern" || value === "video";
}

function createLocalStyleId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  } catch { /* ignore */ }
  return `style-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneQuickSettings(settings: DockFullscreenQuickThemeSettings): DockFullscreenQuickThemeSettings {
  try {
    return JSON.parse(JSON.stringify(settings)) as DockFullscreenQuickThemeSettings;
  } catch {
    return { ...settings };
  }
}

function parseLowerThirdPadding(value: unknown): { vertical: number; horizontal: number } {
  if (typeof value === "number" && Number.isFinite(value)) {
    const clamped = clampNumberValue(value, 0, LOWER_THIRD_TEXT_PADDING_MAX);
    return { vertical: clamped, horizontal: clamped };
  }

  if (typeof value !== "string" || !value.trim()) {
    return { vertical: 18, horizontal: 28 };
  }

  const parts = value
    .trim()
    .split(/\s+/)
    .map((part) => Number.parseFloat(part))
    .filter((part) => Number.isFinite(part));

  if (parts.length === 0) {
    return { vertical: 18, horizontal: 28 };
  }

  if (parts.length === 1) {
    const clamped = clampNumberValue(parts[0], 0, LOWER_THIRD_TEXT_PADDING_MAX);
    return { vertical: clamped, horizontal: clamped };
  }

  return {
    vertical: clampNumberValue(parts[0], 0, LOWER_THIRD_TEXT_PADDING_MAX),
    horizontal: clampNumberValue(parts[1], 0, LOWER_THIRD_TEXT_PADDING_MAX),
  };
}

function formatLowerThirdPadding(vertical: number, horizontal: number): string {
  return `${Math.round(clampNumberValue(vertical, 0, LOWER_THIRD_TEXT_PADDING_MAX))}px ${Math.round(clampNumberValue(horizontal, 0, LOWER_THIRD_TEXT_PADDING_MAX))}px`;
}

function validateSavedLocalStyles(parsed: unknown): SavedLocalStyle[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is SavedLocalStyle => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<SavedLocalStyle>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.createdAt === "number" &&
        isBackgroundType(candidate.backgroundType ?? null) &&
        !!candidate.settings &&
        typeof candidate.settings === "object"
      );
    })
    .slice(0, LOCAL_STYLE_LIMIT);
}

function getScopeLabel(scope: BackgroundPickerStorageScope): string {
  if (scope === "bible") return "Bible";
  if (scope === "worship") return "Worship";
  if (scope === "notes") return "Notes";
  return "Local";
}

function getModeLabel(mode: NonNullable<Props["overlayMode"]>): string {
  return mode === "lower-third" ? "Lower Third" : "Full Screen";
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
  referenceFormat,
  referenceVersionVisible = false,
  referenceTranslation = "KJV",
  onReferenceFormatChange,
  onReferenceVersionVisibleChange,
  overlayMode = "fullscreen",
  displayMode = "single",
  initialTab,
  storageScope = "global",
  hideBackgroundOnCompare = false,
  onSaveFeedback,
}: Props) {
  const { t } = useTranslation();
  const localStylesSelectId = useId();
  const storageKeys = useMemo(() => {
    const scopeKey = `${storageScope}:${overlayMode}`;
    return {
      activeTab: `${ACTIVE_TAB_KEY}:${scopeKey}`,
      bgType: `${BG_TYPE_KEY}:${scopeKey}`,
      localStyles: `${LOCAL_STYLES_KEY}:${scopeKey}`,
    };
  }, [overlayMode, storageScope]);
  const [activeTab, setActiveTab] = useState<BackgroundPickerTab>(() =>
    resolveInitialTab(initialTab, displayMode, storageKeys.activeTab, hideBackgroundOnCompare && displayMode === "compare"),
  );
  const [bgType, setBgType] = useState<BackgroundType>(() => {
    try {
      const stored = readNativeDockSetting<string>(storageKeys.bgType);
      if (stored && isBackgroundType(stored)) return stored;
    } catch { /* ignore */ }
    return inferBgTypeFromSettings(quickSettings);
  });

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [textSubTab, setTextSubTab] = useState<BibleTextSubTab>("bible");
  const [layoutSubTab, setLayoutSubTab] = useState<BibleLayoutSubTab>("text");
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [savedStyles, setSavedStyles] = useState<SavedLocalStyle[]>(() => {
    try { return validateSavedLocalStyles(readDockPreferenceList<SavedLocalStyle>(storageKeys.localStyles)); } catch { return []; }
  });
  const [selectedLocalStyleId, setSelectedLocalStyleId] = useState("");
  const [localStyleStatus, setLocalStyleStatus] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const [pickerHeight, setPickerHeight] = useState(0);
  const prevStorageKeysRef = useRef(storageKeys);
  const compareBackdropValue: BackgroundType = bgType;
  const lowerThirdPadding = parseLowerThirdPadding(quickSettings.lowerThirdCardPadding);
  const lowerThirdPaddingLinked = quickSettings.lowerThirdPaddingLinked ?? false;
  const lowerThirdLinkedPadding = clampNumberValue(
    Math.round((lowerThirdPadding.vertical + lowerThirdPadding.horizontal) / 2),
    0,
    LOWER_THIRD_TEXT_PADDING_MAX,
  );
  const lowerThirdCardRadius = clampNumberValue(Number(quickSettings.lowerThirdCardRadius ?? 18), 0, 64);
  const lowerThirdTextDirection = quickSettings.lowerThirdTextDirection === "inverted" ? "inverted" : "normal";
  const supportsLowerThirdShapeControls = storageScope === "bible" || storageScope === "worship" || storageScope === "notes";
  const isBiblePicker = storageScope === "bible" && showReferences;
  const isCompactHeight = pickerHeight > 0 && pickerHeight <= BACKGROUND_PICKER_COMPACT_HEIGHT;
  const hasBibleSubTabs = isBiblePicker && (activeTab === "text" || activeTab === "layout");

  useEffect(() => {
    const element = pickerRef.current;
    if (!element) return;

    const updateHeight = () => setPickerHeight(element.clientHeight);
    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPickerHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadDockPreferenceList<SavedLocalStyle>(storageKeys.localStyles).then((items) => {
      if (cancelled || !items) return;
      setSavedStyles(validateSavedLocalStyles(items));
    });
    return () => {
      cancelled = true;
    };
  }, [storageKeys.localStyles]);

  useEffect(() => {
    const previous = prevStorageKeysRef.current;
    if (previous.activeTab === storageKeys.activeTab && previous.bgType === storageKeys.bgType && previous.localStyles === storageKeys.localStyles) {
      return;
    }
    prevStorageKeysRef.current = storageKeys;
    setActiveTab(resolveInitialTab(initialTab, displayMode, storageKeys.activeTab, hideBackgroundOnCompare && displayMode === "compare"));
    try {
      const stored = readNativeDockSetting<string>(storageKeys.bgType);
      setBgType(stored && isBackgroundType(stored) ? stored : inferBgTypeFromSettings(quickSettings));
    } catch {
      setBgType(inferBgTypeFromSettings(quickSettings));
    }
    try {
      setSavedStyles(validateSavedLocalStyles(readDockPreferenceList<SavedLocalStyle>(storageKeys.localStyles)));
    } catch {
      setSavedStyles([]);
    }
    setSelectedLocalStyleId("");
    setLocalStyleStatus("");
    setStyleMenuOpen(false);
  }, [displayMode, initialTab, quickSettings, storageKeys]);

  useEffect(() => {
    if (hideBackgroundOnCompare && displayMode === "compare" && activeTab !== "compare") {
      setActiveTab("compare");
    } else if (displayMode === "compare" && (activeTab === "text" || activeTab === "layout")) {
      setActiveTab("background");
    } else if (displayMode !== "compare" && activeTab === "compare") {
      setActiveTab("text");
    }
  }, [activeTab, displayMode, hideBackgroundOnCompare]);

  // Persist active tab preference
  useEffect(() => {
    writeNativeDockSetting(storageKeys.activeTab, activeTab);
  }, [activeTab, storageKeys.activeTab]);

  useEffect(() => {
    const inferredType = inferBgTypeFromSettings(quickSettings);
    setBgType((current) => (current === inferredType ? current : inferredType));
  }, [
    quickSettings.backgroundColor,
    quickSettings.backgroundColorEnd,
    quickSettings.backgroundImage,
    quickSettings.backgroundPattern,
    quickSettings.backgroundType,
    quickSettings.backgroundVideo,
    quickSettings.fullscreenShadeColor,
    quickSettings.fullscreenShadeOpacity,
  ]);

  const handleTypeChange = useCallback((type: BackgroundType) => {
    setBgType(type);
    setDropdownOpen(false);
    writeNativeDockSetting(storageKeys.bgType, type);

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
        backgroundColor: "",
        backgroundColorEnd: "",
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
    } else if (type === "pattern") {
      updater = (prev) => ({
        ...prev,
        backgroundType: "pattern",
        backgroundColor: "",
        backgroundColorEnd: "",
        bgGradientAngle: 180,
        backgroundImage: "",
        backgroundImageFilePath: "",
        backgroundVideo: "",
        backgroundVideoFilePath: "",
        backgroundPattern: prev.backgroundPattern || PATTERN_OPTIONS[0]?.src || "",
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
        backgroundColorEnd: "",
        backgroundOpacity: prev.backgroundOpacity === 0 ? 1 : prev.backgroundOpacity,
        fullscreenShadeOpacity: prev.fullscreenShadeOpacity === 0 ? 0.42 : prev.fullscreenShadeOpacity,
      });
    } else {
      return;
    }

    onQuickSettingsChange(updater);

    // Reset the saved preset after settings update so the next explicit apply uses the new values.
    if (onBackgroundPresetChange) {
      onBackgroundPresetChange(type === "off" ? "none" : "theme");
    }
  }, [onQuickSettingsChange, onBackgroundPresetChange, storageKeys.bgType]);

  const persistSavedStyles = useCallback((next: SavedLocalStyle[]) => {
    const trimmed = next.slice(0, LOCAL_STYLE_LIMIT);
    setSavedStyles(trimmed);
    void saveDockPreferenceList(storageKeys.localStyles, trimmed);
  }, [storageKeys.localStyles]);

  const selectedLocalStyle = savedStyles.find((style) => style.id === selectedLocalStyleId) ?? null;

  const handleSaveLocalStyle = useCallback(() => {
    const nextIndex = savedStyles.length + 1;
    const styleName = `${getScopeLabel(storageScope)} ${getModeLabel(overlayMode)} Style ${nextIndex}`;
    const style: SavedLocalStyle = {
      id: createLocalStyleId(),
      name: styleName,
      createdAt: Date.now(),
      backgroundType: bgType,
      settings: cloneQuickSettings(quickSettings),
    };
    persistSavedStyles([style, ...savedStyles].slice(0, LOCAL_STYLE_LIMIT));
    setSelectedLocalStyleId(style.id);
    setLocalStyleStatus("");
    onSaveFeedback?.(t("dock.feedback.backgroundStyleSaved", "Background style saved."));
    setStyleMenuOpen(false);
  }, [bgType, onSaveFeedback, overlayMode, persistSavedStyles, quickSettings, savedStyles, storageScope, t]);

  const handleApplyLocalStyle = useCallback((styleId: string) => {
    setSelectedLocalStyleId(styleId);
    const style = savedStyles.find((item) => item.id === styleId);
    if (!style) {
      setLocalStyleStatus("");
      return;
    }
    setBgType(style.backgroundType);
    writeNativeDockSetting(storageKeys.bgType, style.backgroundType);
    onQuickSettingsChange(() => cloneQuickSettings(style.settings));
    setLocalStyleStatus(`Applied ${style.name}`);
  }, [onQuickSettingsChange, savedStyles, storageKeys.bgType]);

  const handleDeleteSelectedLocalStyle = useCallback(() => {
    if (!selectedLocalStyle) return;
    persistSavedStyles(savedStyles.filter((style) => style.id !== selectedLocalStyle.id));
    setSelectedLocalStyleId("");
    setLocalStyleStatus(`Deleted ${selectedLocalStyle.name}`);
    setStyleMenuOpen(false);
  }, [persistSavedStyles, savedStyles, selectedLocalStyle]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen && !styleMenuOpen) return;
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (styleMenuRef.current && !styleMenuRef.current.contains(e.target as Node)) {
        setStyleMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [dropdownOpen, styleMenuOpen]);

  const selectedOption = BG_OPTIONS.find((o) => o.id === bgType) ?? BG_OPTIONS[0];
  const compareOnlyMode = hideBackgroundOnCompare && displayMode === "compare";
  const localStylesControl = (
    <>
      <div className="dtb-local-styles">
        <label className="dtb-local-styles__label" htmlFor={localStylesSelectId}>
          Saved Styles
        </label>
        <select
          id={localStylesSelectId}
          className="dtb-local-styles__select"
          value={selectedLocalStyleId}
          onChange={(event) => handleApplyLocalStyle(event.target.value)}
          disabled={savedStyles.length === 0}
          aria-label="Saved Styles"
          title="Saved Styles"
        >
          <option value="">
            {savedStyles.length === 0 ? "No saved styles yet" : "Choose a saved style"}
          </option>
          {savedStyles.map((style) => (
            <option key={style.id} value={style.id}>
              {style.name}
            </option>
          ))}
        </select>
        <div className="dtb-local-styles__menu-wrap" ref={styleMenuRef}>
          <button
            type="button"
            className={`dtb-local-styles__menu-btn${styleMenuOpen ? " dtb-local-styles__menu-btn--open" : ""}`}
            onClick={() => setStyleMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={styleMenuOpen}
            aria-label="Saved style actions"
            title="Saved style actions"
          >
            <Icon name="more_vert" size={15} />
          </button>
          {styleMenuOpen && (
            <div className="dtb-local-styles__menu" role="menu">
              <button
                type="button"
                className="dtb-local-styles__menu-item"
                role="menuitem"
                onClick={handleSaveLocalStyle}
              >
                <Icon name="save" size={14} />
                <span>Save Current Style</span>
              </button>
              <button
                type="button"
                className="dtb-local-styles__menu-item dtb-local-styles__menu-item--danger"
                role="menuitem"
                onClick={handleDeleteSelectedLocalStyle}
                disabled={!selectedLocalStyle}
              >
                <Icon name="delete_outline" size={14} />
                <span>Delete Selected Style</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {localStyleStatus && (
        <p className="dtb-local-styles__status" role="status">
          {localStyleStatus}
        </p>
      )}
    </>
  );

  return (
    <div
      ref={pickerRef}
      className={`dtb-studio-card dtb-studio-card--picker${isCompactHeight ? " dtb-studio-card--compact-height" : ""}`}
      data-compact-height={isCompactHeight || undefined}
    >

      <div className={`dtb-studio-card__body dtb-bg-picker${compareOnlyMode ? " dtb-bg-picker--compare-only" : ""}`}>
        <div className={`dtb-bg-picker__layout${isCompactHeight ? " dtb-bg-picker__layout--compact" : ""}`}>
          {/* Tab Navigation */}
          {!compareOnlyMode && (
            <div
              className="dtb-bg-picker__tabs"
              role="tablist"
              aria-orientation={isCompactHeight ? "vertical" : "horizontal"}
              aria-label={t("bgPicker.settingsTabs", "Background settings")}
            >
              {displayMode !== "compare" && (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "text"}
                    aria-label={t('bgPicker.text')}
                    title={t('bgPicker.text')}
                    className={`dtb-bg-picker__tab${activeTab === "text" ? " dtb-bg-picker__tab--active" : ""}`}
                    onClick={() => setActiveTab("text")}
                  >
                    <Icon name="text_fields" size={13} />
                    <span>{t('bgPicker.text')}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "layout"}
                    aria-label={t('bgPicker.layout', 'Layout')}
                    title={t('bgPicker.layout', 'Layout')}
                    className={`dtb-bg-picker__tab${activeTab === "layout" ? " dtb-bg-picker__tab--active" : ""}`}
                    onClick={() => setActiveTab("layout")}
                  >
                    <Icon name="view_quilt" size={13} />
                    <span>{t('bgPicker.layout', 'Layout')}</span>
                  </button>
                </>
              )}
              {(!hideBackgroundOnCompare || displayMode !== "compare") && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "background"}
                  aria-label={t("bgPicker.bg", "BG")}
                  title={t("bgPicker.bg", "BG")}
                  className={`dtb-bg-picker__tab${activeTab === "background" ? " dtb-bg-picker__tab--active" : ""}`}
                  onClick={() => setActiveTab("background")}
                >
                  <Icon name="wallpaper" size={13} />
                  <span>{t("bgPicker.bg", "BG")}</span>
                </button>
              )}
              {displayMode === "compare" && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "compare"}
                  aria-label={t("bgPicker.compare", "Compare")}
                  title={t("bgPicker.compare", "Compare")}
                  className={`dtb-bg-picker__tab${activeTab === "compare" ? " dtb-bg-picker__tab--active" : ""}`}
                  onClick={() => setActiveTab("compare")}
                >
                  <Icon name="compare_arrows" size={13} />
                  <span>{t("bgPicker.compare", "Compare")}</span>
                </button>
              )}
            </div>
          )}

          <div className={`dtb-bg-picker__panel${isCompactHeight && hasBibleSubTabs ? " dtb-bg-picker__panel--compact-subtabs" : ""}`}>
            {isBiblePicker && activeTab === "text" && (
              <div className="dtb-bg-picker__subtabs" role="tablist" aria-label={t("bible.textSettings", "Bible text settings")}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={textSubTab === "bible"}
                  aria-label={t("bible.bible", "Bible")}
                  title={t("bible.bible", "Bible")}
                  className={`dtb-bg-picker__subtab${textSubTab === "bible" ? " dtb-bg-picker__subtab--active" : ""}`}
                  onClick={() => setTextSubTab("bible")}
                >
                  <Icon name="menu_book" size={13} />
                  <span>{t("bible.bible", "Bible")}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={textSubTab === "reference"}
                  aria-label={t("bible.reference", "Reference")}
                  title={t("bible.reference", "Reference")}
                  className={`dtb-bg-picker__subtab${textSubTab === "reference" ? " dtb-bg-picker__subtab--active" : ""}`}
                  onClick={() => setTextSubTab("reference")}
                >
                  <Icon name="format_quote" size={13} />
                  <span>{t("bible.reference", "Reference")}</span>
                </button>
              </div>
            )}

            {isBiblePicker && activeTab === "layout" && (
              <div className="dtb-bg-picker__subtabs" role="tablist" aria-label={t("bible.layoutSettings", "Bible layout settings")}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={layoutSubTab === "text"}
                  aria-label={t("common.text", "Text")}
                  title={t("common.text", "Text")}
                  className={`dtb-bg-picker__subtab${layoutSubTab === "text" ? " dtb-bg-picker__subtab--active" : ""}`}
                  onClick={() => setLayoutSubTab("text")}
                >
                  <Icon name="text_fields" size={13} />
                  <span>{t("common.text", "Text")}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={layoutSubTab === "reference"}
                  aria-label={t("bible.reference", "Reference")}
                  title={t("bible.reference", "Reference")}
                  className={`dtb-bg-picker__subtab${layoutSubTab === "reference" ? " dtb-bg-picker__subtab--active" : ""}`}
                  onClick={() => setLayoutSubTab("reference")}
                >
                  <Icon name="format_quote" size={13} />
                  <span>{t("bible.reference", "Reference")}</span>
                </button>
              </div>
            )}

            <div className="dtb-bg-picker__scroll">
          {/* Background Tab */}
          {activeTab === "background" && (
            <>
              <p className="dtb-bg-picker__subtitle">{t('bgPicker.chooseBackground')}</p>

              {/* Dropdown Selector */}
              <div className="dtb-bg-dropdown" ref={dropdownRef}>
                <button
                  type="button"
                  className={`dtb-bg-dropdown__trigger${dropdownOpen ? " dtb-bg-dropdown__trigger--open" : ""}`}
                  onClick={() => setDropdownOpen((v) => !v)}
                  aria-expanded={dropdownOpen}
                  aria-haspopup="listbox"
                  title={t('bgPicker.background')}>
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
                        title={t('common.confirm')}>
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

              {localStylesControl}


              {/* Content based on type */}
              <div className="dtb-bg-picker__content">
                {bgType === "image" && (
                  <ImageTab
                    quickSettings={quickSettings}
                    onQuickSettingsChange={onQuickSettingsChange}
                    onBackgroundPresetChange={onBackgroundPresetChange}
                  />
                )}
                {bgType === "video" && (
                  <VideoTab
                    quickSettings={quickSettings}
                    onQuickSettingsChange={onQuickSettingsChange}
                    onBackgroundPresetChange={onBackgroundPresetChange}
                  />
                )}
                {bgType === "pattern" && (
                  <PatternTab
                    quickSettings={quickSettings}
                    onQuickSettingsChange={onQuickSettingsChange}
                    onBackgroundPresetChange={onBackgroundPresetChange}
                  />
                )}
                {bgType === "color" && (
                  <ColorSection
                    quickSettings={quickSettings}
                    onQuickSettingsChange={onQuickSettingsChange}
                    onBackgroundPresetChange={onBackgroundPresetChange}
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

              {(bgType === "image" || bgType === "video" || bgType === "pattern") && (
                <BackgroundAppearanceControls
                  quickSettings={quickSettings}
                  onQuickSettingsChange={onQuickSettingsChange}
                  onBackgroundPresetChange={onBackgroundPresetChange}
                />
              )}

              {(storageScope === "bible" || storageScope === "worship" || storageScope === "notes") && (
                <MotionSection
                  quickSettings={quickSettings}
                  onQuickSettingsChange={onQuickSettingsChange}
                />
              )}



            </>
          )}

          {/* Text Tab */}
          {activeTab === "text" && (
            <>
              {(!isBiblePicker || textSubTab === "bible") && (
                <>
                  {/* ── Bible Text Section ── */}
                  <div className="dtb-bg-picker__settings">
                    {!isBiblePicker && (
                      <div>
                        <div className="dtb-section-title">{t('bgPicker.text')}</div>
                        <p className="dtb-compare-section__description">
                          {t('bgPicker.textSectionDescription', 'Style the main verse text people will read on screen.')}
                        </p>
                      </div>
                    )}
                    <div className="dtb-control-section">
                      <div className="dtb-control-section__head">
                        <span className="dtb-control-section__title">{t('bgPicker.textAppearance', 'Text appearance')}</span>
                      </div>
                      <div className="dtb-control-section__body">
                        {/* Text Color */}
                        <div className="dtb-color-field">
                          <span className="dtb-color-field__label">{t('common.color')}</span>
                          <InlineColorPicker
                            value={quickSettings.fontColor ?? "#ffffff"}
                            onChange={(v) => onQuickSettingsChange((prev) => ({ ...prev, fontColor: v }))}
                          />
                        </div>

                        <div className="dtb-typography-control-row">
                          <SliderNumberField
                            label={t('bgPicker.fontSize')}
                            value={quickSettings.fontSize}
                            min={overlayMode === "lower-third" ? LOWER_THIRD_FIT_MIN_FONT_SIZE : 28}
                            max={overlayMode === "lower-third" ? LOWER_THIRD_FONT_SIZE_MAX : 200}
                            step={1}
                            onChange={(value) => onQuickSettingsChange((prev) => ({ ...prev, fontSize: value }))}
                          />

                          <SliderNumberField
                            label={t('bgPicker.lineHeight')}
                            value={quickSettings.lineHeight}
                            min={1.05}
                            max={1.8}
                            step={0.01}
                            onChange={(value) => onQuickSettingsChange((prev) => ({ ...prev, lineHeight: value }))}
                          />
                        </div>

                        <div className="dtb-typography-control-row dtb-typography-control-row--segmented">
                          <IconSegmentedControl<CompactFontWeight>
                            label={t('bgPicker.weight')}
                            value={(quickSettings.fontWeight ?? "normal") as CompactFontWeight}
                            options={getWeightOptions(t)}
                            onChange={(w) => onQuickSettingsChange((prev) => ({ ...prev, fontWeight: w }))}
                          />

                          <IconSegmentedControl<CompactTextCase>
                            label={t('bgPicker.textCase')}
                            value={(quickSettings.textTransform ?? "none") as CompactTextCase}
                            options={getTextCaseOptions(t)}
                            onChange={(tc) => onQuickSettingsChange((prev) => ({ ...prev, textTransform: tc }))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}



              {/* ── Reference Section ── */}
              {showReferences && (!isBiblePicker || textSubTab === "reference") && (
                <ReferenceSection
                  quickSettings={quickSettings}
                  onQuickSettingsChange={onQuickSettingsChange}
                  overlayMode={overlayMode}
                  sampleReference={_sampleReference}
                  referenceFormat={referenceFormat}
                  referenceVersionVisible={referenceVersionVisible}
                  referenceTranslation={referenceTranslation}
                  onReferenceFormatChange={onReferenceFormatChange}
                  onReferenceVersionVisibleChange={onReferenceVersionVisibleChange}
                />
              )}

              {/* ── Lower Third Sizes (only relevant in lower-third mode) ── */}

            </>
          )}

          {/* Layout Tab */}
          {activeTab === "layout" && (
            <>
              {(!isBiblePicker || layoutSubTab === "text") && (
                <>
                  <div className="dtb-bg-picker__settings">
                    {!isBiblePicker && (
                      <div>
                        <div className="dtb-section-title">{t('bgPicker.text')}</div>
                        <p className="dtb-compare-section__description">
                          {t('bgPicker.textLayoutDescription', 'Control text alignment, lower-third placement, and spacing on screen.')}
                        </p>
                      </div>
                    )}
                    <div className="dtb-control-section">
                      <div className="dtb-control-section__head">
                        <span className="dtb-control-section__title">{t('bgPicker.layout', 'Layout')}</span>
                      </div>
                      <div className="dtb-control-section__body">
                        <IconSegmentedControl<CompactTextAlign>
                          label={t('bgPicker.alignment')}
                          value={(quickSettings.textAlign ?? "center") as CompactTextAlign}
                          options={getAlignmentOptions(t)}
                          onChange={(a) => onQuickSettingsChange((prev) => ({ ...prev, textAlign: a as "left" | "center" | "right" }))}
                        />

                        {overlayMode === "lower-third" && supportsLowerThirdShapeControls && (
                          <div className="dtb-control-subsection">
                            <span className="dtb-control-subsection__title">{t('bgPicker.lowerThirdBar', 'Lower-third bar')}</span>

                            <div className="dtb-font-weight-row">
                              <span className="dtb-position-label">{t('bgPicker.lowerThirdPlacement', 'Bar placement')}</span>
                              <div className="dtb-position-options">
                                {(["bottom", "top", "left", "right"] as const).map((edge) => (
                                  <button
                                    key={edge}
                                    type="button"
                                    className={`dtb-position-btn${(quickSettings.lowerThirdEdge ?? "bottom") === edge ? " dtb-position-btn--active" : ""}`}
                                    onClick={() => onQuickSettingsChange((prev) => ({ ...prev, lowerThirdEdge: edge }))}
                                    title={t(`bgPicker.edge${edge[0].toUpperCase()}${edge.slice(1)}`, edge)}
                                  >
                                    {edge === "bottom"
                                      ? t('bgPicker.edgeBottom', 'Bottom')
                                      : edge === "top"
                                        ? t('bgPicker.edgeTop', 'Top')
                                        : edge === "left"
                                          ? t('common.left', 'Left')
                                          : t('common.right', 'Right')}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="dtb-font-weight-row">
                              <span className="dtb-position-label">{t('bgPicker.textDirection', 'Text direction')}</span>
                              <div className="dtb-position-options">
                                {(["normal", "inverted"] as const).map((direction) => (
                                  <button
                                    key={direction}
                                    type="button"
                                    className={`dtb-position-btn${lowerThirdTextDirection === direction ? " dtb-position-btn--active" : ""}`}
                                    onClick={() => onQuickSettingsChange((prev) => ({ ...prev, lowerThirdTextDirection: direction }))}
                                  >
                                    {direction === "normal"
                                      ? t('bgPicker.textDirectionNormal', 'Normal')
                                      : t('bgPicker.textDirectionInverted', 'Inverted')}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {overlayMode === "lower-third" && (
                      <div className="dtb-control-section">
                        <div className="dtb-control-section__body">
                          <div className="dtb-toggle-field dtb-toggle-field--inline">
                            <div className="dtb-toggle-field__copy">
                              <span className="dtb-toggle-field__label">{t('bgPicker.linkTextPadding', 'Control both padding values')}</span>
                            </div>
                            <button
                              type="button"
                              className={`dtb-toggle${lowerThirdPaddingLinked ? " dtb-toggle--on" : ""}`}
                              onClick={() => onQuickSettingsChange((prev) => {
                                const currentPadding = parseLowerThirdPadding(prev.lowerThirdCardPadding);
                                const linkedPadding = Math.round((currentPadding.vertical + currentPadding.horizontal) / 2);
                                return {
                                  ...prev,
                                  lowerThirdPaddingLinked: !prev.lowerThirdPaddingLinked,
                                  lowerThirdCardPadding: !prev.lowerThirdPaddingLinked
                                    ? formatLowerThirdPadding(linkedPadding, linkedPadding)
                                    : prev.lowerThirdCardPadding,
                                };
                              })}
                              role="switch"
                              aria-checked={lowerThirdPaddingLinked}
                              aria-label={t('bgPicker.linkTextPadding', 'Control both padding values')}
                            >
                              <span className="dtb-toggle__knob" />
                            </button>
                          </div>

                          {lowerThirdPaddingLinked ? (
                            <div className="dtb-slider-field">
                              <div className="dtb-slider-field__head">
                                <span>{t('bgPicker.textPadding', 'Text padding')}</span>
                                <span className="dtb-slider-field__value">{lowerThirdLinkedPadding}px</span>
                              </div>
                              <input
                                type="range"
                                className="dtb-slider"
                                min={0}
                                max={LOWER_THIRD_TEXT_PADDING_MAX}
                                step={2}
                                value={lowerThirdLinkedPadding}
                                onChange={(e) => {
                                  const nextPadding = Number(e.target.value);
                                  onQuickSettingsChange((prev) => ({
                                    ...prev,
                                    lowerThirdPaddingLinked: true,
                                    lowerThirdCardPadding: formatLowerThirdPadding(nextPadding, nextPadding),
                                  }));
                                }}
                                aria-label={t('bgPicker.textPadding', 'Text padding')}
                              />
                            </div>
                          ) : (
                            <>
                              <div className="dtb-slider-field">
                                <div className="dtb-slider-field__head">
                                  <span>{t('bgPicker.verticalTextPadding', 'Vertical text padding')}</span>
                                  <span className="dtb-slider-field__value">{Math.round(lowerThirdPadding.vertical)}px</span>
                                </div>
                                <input
                                  type="range"
                                  className="dtb-slider"
                                  min={0}
                                  max={LOWER_THIRD_TEXT_PADDING_MAX}
                                  step={2}
                                  value={lowerThirdPadding.vertical}
                                  onChange={(e) => {
                                    const nextVertical = Number(e.target.value);
                                    onQuickSettingsChange((prev) => {
                                      const currentPadding = parseLowerThirdPadding(prev.lowerThirdCardPadding);
                                      return {
                                        ...prev,
                                        lowerThirdPaddingLinked: false,
                                        lowerThirdCardPadding: formatLowerThirdPadding(nextVertical, currentPadding.horizontal),
                                      };
                                    });
                                  }}
                                  aria-label={t('bgPicker.verticalTextPadding', 'Vertical text padding')}
                                />
                              </div>

                              <div className="dtb-slider-field">
                                <div className="dtb-slider-field__head">
                                  <span>{t('bgPicker.horizontalTextPadding', 'Horizontal text padding')}</span>
                                  <span className="dtb-slider-field__value">{Math.round(lowerThirdPadding.horizontal)}px</span>
                                </div>
                                <input
                                  type="range"
                                  className="dtb-slider"
                                  min={0}
                                  max={LOWER_THIRD_TEXT_PADDING_MAX}
                                  step={2}
                                  value={lowerThirdPadding.horizontal}
                                  onChange={(e) => {
                                    const nextHorizontal = Number(e.target.value);
                                    onQuickSettingsChange((prev) => {
                                      const currentPadding = parseLowerThirdPadding(prev.lowerThirdCardPadding);
                                      return {
                                        ...prev,
                                        lowerThirdPaddingLinked: false,
                                        lowerThirdCardPadding: formatLowerThirdPadding(currentPadding.vertical, nextHorizontal),
                                      };
                                    });
                                  }}
                                  aria-label={t('bgPicker.horizontalTextPadding', 'Horizontal text padding')}
                                />
                              </div>
                            </>
                          )}

                          {supportsLowerThirdShapeControls && (
                            <div className="dtb-slider-field">
                              <div className="dtb-slider-field__head">
                                <span>{t('bgPicker.cornerRadius', 'Corner radius')}</span>
                                <span className="dtb-slider-field__value">{Math.round(lowerThirdCardRadius)}px</span>
                              </div>
                              <input
                                type="range"
                                className="dtb-slider"
                                min={0}
                                max={64}
                                step={1}
                                value={lowerThirdCardRadius}
                                onChange={(e) => onQuickSettingsChange((prev) => ({ ...prev, lowerThirdCardRadius: Number(e.target.value) }))}
                                aria-label={t('bgPicker.cornerRadius', 'Corner radius')}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {showReferences && (!isBiblePicker || layoutSubTab === "reference") && (
                <ReferenceLayoutSection
                  quickSettings={quickSettings}
                  onQuickSettingsChange={onQuickSettingsChange}
                />
              )}
            </>
          )}

          {/* Compare Tab */}
          {displayMode === "compare" && activeTab === "compare" && (
            <CompareSettingsPanel
              quickSettings={quickSettings}
              onQuickSettingsChange={onQuickSettingsChange}
              compareBackdropValue={compareBackdropValue}
              onBackdropChange={handleTypeChange}
              onBackgroundPresetChange={onBackgroundPresetChange}
              selectedThemeId={_selectedThemeId}
              onThemeSelect={_onThemeSelect}
              allowedCategories={_allowedCategories}
              overlayMode={overlayMode}
            />
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Image Tab ── */
function ImageTab({
  quickSettings,
  onQuickSettingsChange,
  onBackgroundPresetChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
  onBackgroundPresetChange?: (preset: DockBackgroundPreset) => void;
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
          const { loadLocalLibrary } = await import("../dockUploadService");
          const all = loadLocalLibrary();
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
    const relUrl = toBackgroundAssetUrl(item);
    onQuickSettingsChange((prev) => ({
      ...prev,
      backgroundType: "image",
      backgroundImage: prev.backgroundImage === relUrl ? "" : relUrl,
      backgroundImageFilePath: prev.backgroundImage === relUrl ? "" : (item.filePath || ""),
      backgroundVideo: "",
      backgroundVideoFilePath: "",
    }));
    onBackgroundPresetChange?.("theme");
  }, [onBackgroundPresetChange, onQuickSettingsChange]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const { uploadFileToDock } = await import("../dockUploadService");
        const result = await uploadFileToDock(file);
        if (result.item) {
          const { registerDockMediaItem } = await import("../dockUploadService");
          await registerDockMediaItem(result.item);
          setMedia((prev) => [result.item!, ...prev]);
          const relUrl = toBackgroundAssetUrl(result.item);
          onQuickSettingsChange((prev) => ({
            ...prev,
            backgroundType: "image",
            backgroundImage: relUrl,
            backgroundImageFilePath: result.item.filePath || "",
            backgroundVideo: "",
            backgroundVideoFilePath: "",
          }));
          onBackgroundPresetChange?.("theme");
        }
      } catch (err) {
        console.warn("[BackgroundPicker] Upload failed:", err);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  }, [onBackgroundPresetChange, onQuickSettingsChange]);

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
              title={t('common.close')}>
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="dtb-bg-picker__upload-btn"
          onClick={() => fileInputRef.current?.click()}
          title={t('common.upload')}>
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
            const relUrl = toBackgroundAssetUrl(item);
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
                  style={{ backgroundImage: `url(${item.thumbnailUrl || relUrl})` }}
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
  onBackgroundPresetChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
  onBackgroundPresetChange?: (preset: DockBackgroundPreset) => void;
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
          const { loadLocalLibrary } = await import("../dockUploadService");
          const all = loadLocalLibrary();
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
    const relUrl = toBackgroundAssetUrl(item);
    onQuickSettingsChange((prev) => ({
      ...prev,
      backgroundType: "video",
      backgroundVideo: prev.backgroundVideo === relUrl ? "" : relUrl,
      backgroundVideoFilePath: prev.backgroundVideo === relUrl ? "" : (item.filePath || ""),
      backgroundImage: "",
      backgroundImageFilePath: "",
    }));
    onBackgroundPresetChange?.("theme");
  }, [onBackgroundPresetChange, onQuickSettingsChange]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("video/")) continue;
      try {
        const { uploadFileToDock } = await import("../dockUploadService");
        const result = await uploadFileToDock(file);
        if (result.item) {
          const { registerDockMediaItem } = await import("../dockUploadService");
          await registerDockMediaItem(result.item);
          setMedia((prev) => [result.item!, ...prev]);
          const relUrl = toBackgroundAssetUrl(result.item);
          onQuickSettingsChange((prev) => ({
            ...prev,
            backgroundType: "video",
            backgroundVideo: relUrl,
            backgroundVideoFilePath: result.item.filePath || "",
            backgroundImage: "",
            backgroundImageFilePath: "",
          }));
          onBackgroundPresetChange?.("theme");
        }
      } catch (err) {
        console.warn("[BackgroundPicker] Upload failed:", err);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  }, [onBackgroundPresetChange, onQuickSettingsChange]);

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
              title={t('common.close')}>
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="dtb-bg-picker__upload-btn"
          onClick={() => fileInputRef.current?.click()}
          title={t('common.upload')}>
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
            const relUrl = toBackgroundAssetUrl(item);
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
                  style={{ backgroundImage: item.thumbnailUrl ? `url(${item.thumbnailUrl})` : `url(${relUrl})` }}
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

/* ── Pattern Tab — SVG patterns from shared backgroundAssets ── */

interface PatternOption {
  id: string;
  label: string;
  /** SVG data URI — used for both preview and overlay rendering */
  src: string;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Shared SVG patterns from backgroundAssets.ts — single source of truth */
export const PATTERN_OPTIONS: PatternOption[] = BACKGROUND_PATTERNS.map((p) => ({
  id: slugify(p.label),
  label: p.label,
  src: p.src,
}));

function PatternTab({
  quickSettings,
  onQuickSettingsChange,
  onBackgroundPresetChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
  onBackgroundPresetChange?: (preset: DockBackgroundPreset) => void;
}) {
  const { t } = useTranslation();
  const currentPattern = quickSettings.backgroundPattern || "";

  const selectPattern = useCallback((src: string) => {
    onQuickSettingsChange((prev) => ({
      ...prev,
      backgroundType: "pattern",
      backgroundPattern: src,
      backgroundVideo: "",
      backgroundVideoFilePath: "",
      backgroundImage: "",
      backgroundImageFilePath: "",
    }));
    onBackgroundPresetChange?.("theme");
  }, [onBackgroundPresetChange, onQuickSettingsChange]);

  return (
    <div className="dtb-pattern-tab">
      <p className="dtb-bg-picker__sub-heading">{t('bgPicker.selectPattern')}</p>
      <div className="dtb-pattern-grid">
        {PATTERN_OPTIONS.map((opt) => {
          const isSelected = currentPattern === opt.src;
          return (
            <button
              key={opt.id}
              type="button"
              className={`dtb-pattern-swatch${isSelected ? " dtb-pattern-swatch--selected" : ""}`}
              onClick={() => selectPattern(opt.src)}
              title={opt.label}
            >
              <div className="dtb-pattern-swatch__preview">
                <img src={opt.src} alt={opt.label} className="dtb-pattern-swatch__img" />
              </div>
              <span className="dtb-pattern-swatch__label">{opt.label}</span>
              {isSelected && (
                <div className="dtb-bg-picker__card-check">
                  <Icon name="check" size={14} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const MOTION_OPTIONS: Array<{ value: NonNullable<DockFullscreenQuickThemeSettings["animation"]>; label: string }> = [
  { value: "none", label: "Off" },
  { value: "fade", label: "Fade" },
  { value: "slide-up", label: "Slide up" },
  { value: "slide-left", label: "Slide left" },
  { value: "scale-in", label: "Scale in" },
  { value: "reveal-bg-then-text", label: "Reveal background + text" },
];

function MotionSection({
  quickSettings,
  onQuickSettingsChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
}) {
  const { t } = useTranslation();
  const animation = quickSettings.animation ?? "fade";
  const animationEnabled = animation !== "none";

  return (
    <section className="dtb-bg-picker__motion-section" aria-labelledby="dtb-motion-title">
      <div className="dtb-bg-picker__motion-header">
        <div>
          <div id="dtb-motion-title" className="dtb-bg-picker__motion-title">
            {t("bgPicker.motion", "Motion")}
          </div>
        </div>
        <select
          className="dtb-bg-picker__motion-select"
          value={animation}
          onChange={(event) => onQuickSettingsChange((prev) => ({
            ...prev,
            animation: event.target.value as NonNullable<DockFullscreenQuickThemeSettings["animation"]>,
          }))}
          aria-label={t("bgPicker.motion", "Motion")}
        >
          {MOTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      {animationEnabled && (
        <div className="dtb-bg-picker__motion-duration">
          <div className="dtb-slider-field__head">
            <span>{t("bgPicker.duration", "Duration")}</span>
            <span className="dtb-slider-field__value">{quickSettings.animationDuration}ms</span>
          </div>
          <input
            type="range"
            className="dtb-slider"
            min="100"
            max="1500"
            step="50"
            value={quickSettings.animationDuration}
            onChange={(event) => onQuickSettingsChange((prev) => ({
              ...prev,
              animationDuration: Number(event.target.value),
            }))}
            aria-label={t("bgPicker.duration", "Duration")}
          />
        </div>
      )}
    </section>
  );
}

/* ── Color Section — ThemeModalStitch layout, MakeChurchEasy skin ── */
function ColorSection({
  quickSettings,
  onQuickSettingsChange,
  onBackgroundPresetChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
  onBackgroundPresetChange?: (preset: DockBackgroundPreset) => void;
}) {
  const { t } = useTranslation();
  const [presetsCollapsed, setPresetsCollapsed] = useState(false);
  const isGradient = !!(quickSettings.backgroundColor && quickSettings.backgroundColorEnd);
  const colorStart = quickSettings.backgroundColor || "#0F172A";
  const colorEnd = quickSettings.backgroundColorEnd || "#000000";
  const angle = quickSettings.bgGradientAngle ?? 135;

  const pushChange = useCallback(
    (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => {
      onQuickSettingsChange((prev) => {
        const next = updater(prev);
        return {
          ...next,
          backgroundType: "color",
          backgroundImage: "",
          backgroundImageFilePath: "",
          backgroundVideo: "",
          backgroundVideoFilePath: "",
        };
      });
      onBackgroundPresetChange?.("theme");
    },
    [onBackgroundPresetChange, onQuickSettingsChange],
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
            title={t('bgPicker.solid')}>
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
            title={t('bgPicker.gradient')}>
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
            <button
              type="button"
              className="dtb-studio-card__header"
              onClick={() => setPresetsCollapsed((v) => !v)}
            >
              <span className="dtb-studio-card__title">{t('bgPicker.gradientPresets')}</span>
              <Icon
                name={presetsCollapsed ? "expand_more" : "expand_less"}
                size={14}
                className="dtb-studio-card__chevron"
              />
            </button>
            {!presetsCollapsed && (
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
            )}
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

function BackgroundAppearanceControls({
  quickSettings,
  onQuickSettingsChange,
  onBackgroundPresetChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
  onBackgroundPresetChange?: (preset: DockBackgroundPreset) => void;
}) {
  const { t } = useTranslation();
  const updateAppearance = (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => {
    onQuickSettingsChange(updater);
    onBackgroundPresetChange?.("theme");
  };

  return (
    <>
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
              updateAppearance((prev) => ({
                ...prev,
                fullscreenShadeOpacity: Number(e.target.value) / 100,
              }))
            }
            aria-label={t('bgPicker.darkness')}
          />
        </div>
      </div>

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
              updateAppearance((prev) => ({
                ...prev,
                backgroundOpacity: Number(e.target.value) / 100,
              }))
            }
            aria-label={t('bgPicker.opacity')}
          />
        </div>
      </div>
    </>
  );
}

/* ── Gradient Presets ── */
const GRADIENT_PRESETS = [
  { label: "Sunset", start: "#AD0000", end: "#000000", angle: 135 },
  { label: "Sunset", start: "#AE0000", end: "#FF0000", angle: 135 },
  { label: "Dusk", start: "#2D1B69", end: "#11001C", angle: 135 },
  { label: "Slate", start: "#334155", end: "#0F172A", angle: 180 },
];

function shortenBibleReference(reference: string): string {
  return reference
    .replace(/^Genesis\b/i, "Gen")
    .replace(/^Exodus\b/i, "Ex")
    .replace(/^Matthew\b/i, "Mt")
    .replace(/^John\b/i, "Jn")
    .replace(/^Romans\b/i, "Rom");
}

function ReferenceDisplaySection({
  sampleReference,
  referenceFormat,
  referenceVersionVisible,
  referenceTranslation,
  onReferenceFormatChange,
  onReferenceVersionVisibleChange,
}: {
  sampleReference: string;
  referenceFormat: BibleReferenceFormat;
  referenceVersionVisible: boolean;
  referenceTranslation: string;
  onReferenceFormatChange?: (format: BibleReferenceFormat) => void;
  onReferenceVersionVisibleChange?: (visible: boolean) => void;
}) {
  const { t } = useTranslation();
  const translation = referenceTranslation.trim().toUpperCase();
  const buildPreview = (format: BibleReferenceFormat) => {
    const base = format === "short" ? shortenBibleReference(sampleReference) : sampleReference;
    if (format === "hidden") return referenceVersionVisible && translation ? translation : t("common.hidden", "Hidden");
    return `${base}${referenceVersionVisible && translation ? ` (${translation})` : ""}`;
  };
  const options: Array<{ value: BibleReferenceFormat; label: string }> = [
    { value: "full", label: t("bible.referenceFormatFull", "Full") },
    { value: "short", label: t("bible.referenceFormatShort", "Short") },
    { value: "hidden", label: t("bible.referenceFormatHidden", "Off") },
  ];

  return (
    <div className="dtb-reference-display-card">
      <div className="dock-bible-reference-popover__header">
        {t("bible.referenceDisplay", "Reference display")}
      </div>
      <div className="dock-bible-reference-popover__section">
        <div className="dock-bible-reference-popover__label">
          {t("bible.referenceFormat", "Reference")}
        </div>
        <div className="dock-bible-reference-options" role="group" aria-label={t("bible.referenceFormat", "Reference")}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`dock-bible-reference-option${referenceFormat === option.value ? " dock-bible-reference-option--active" : ""}`}
              onClick={() => onReferenceFormatChange?.(option.value)}
              aria-pressed={referenceFormat === option.value}
            >
              <span>{option.label}</span>
              <small>{buildPreview(option.value)}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="dock-bible-reference-popover__toggle-row">
        <div>
          <div className="dock-bible-reference-popover__label">
            {t("bible.showBibleVersion", "Show Bible version")}
          </div>
          <div className="dock-bible-reference-popover__hint">
            {translation || "KJV"}
          </div>
        </div>
        <button
          type="button"
          className={`dtb-toggle${referenceVersionVisible ? " dtb-toggle--on" : ""}`}
          onClick={() => onReferenceVersionVisibleChange?.(!referenceVersionVisible)}
          role="switch"
          aria-checked={referenceVersionVisible}
          aria-label={t("bible.showBibleVersion", "Show Bible version")}
        >
          <span className="dtb-toggle__knob" />
        </button>
      </div>

    </div>
  );
}

/* ── Reference Section ── */
function ReferenceSection({
  quickSettings,
  onQuickSettingsChange,
  overlayMode,
  sampleReference,
  referenceFormat,
  referenceVersionVisible,
  referenceTranslation,
  onReferenceFormatChange,
  onReferenceVersionVisibleChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
  overlayMode: NonNullable<Props["overlayMode"]>;
  sampleReference: string;
  referenceFormat?: BibleReferenceFormat;
  referenceVersionVisible: boolean;
  referenceTranslation: string;
  onReferenceFormatChange?: (format: BibleReferenceFormat) => void;
  onReferenceVersionVisibleChange?: (visible: boolean) => void;
}) {
  const { t } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const refFontSize = quickSettings.refFontSize ?? 12;
  const refFontWeight = quickSettings.refFontWeight ?? "normal";
  const refTextTransform = quickSettings.refTextTransform ?? "none";
  const refOpacity = quickSettings.refOpacity ?? 1;

  return (
    <div className="dtb-bg-picker__settings">
      {!referenceFormat && (
        <div>
          <div className="dtb-section-title">{t('bgPicker.reference')}</div>
          <p className="dtb-compare-section__description">
            {t('bgPicker.referenceSectionDescription', 'Control how the scripture reference is shown above or below the verse.')}
          </p>
        </div>
      )}
      {referenceFormat && onReferenceFormatChange && onReferenceVersionVisibleChange && (
        <ReferenceDisplaySection
          sampleReference={sampleReference}
          referenceFormat={referenceFormat}
          referenceVersionVisible={referenceVersionVisible}
          referenceTranslation={referenceTranslation}
          onReferenceFormatChange={onReferenceFormatChange}
          onReferenceVersionVisibleChange={onReferenceVersionVisibleChange}
        />
      )}

      <div className="dtb-control-section">
        <div className="dtb-control-section__head">
          <span className="dtb-control-section__title">{t('bgPicker.textAppearance', 'Text appearance')}</span>
        </div>
        <div className="dtb-control-section__body">
          <div className="dtb-color-field">
            <span className="dtb-color-field__label">{t('common.color')}</span>
            <InlineColorPicker
              value={quickSettings.refFontColor ?? "#cccccc"}
              onChange={(v) => onQuickSettingsChange((prev) => ({ ...prev, refFontColor: v }))}
            />
          </div>

          <SliderNumberField
            label={t('bgPicker.fontSize')}
            value={refFontSize}
            min={overlayMode === "lower-third" ? LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE : 10}
            max={overlayMode === "lower-third" ? LOWER_THIRD_REFERENCE_FONT_SIZE_MAX : 80}
            step={1}
            onChange={(value) => onQuickSettingsChange((prev) => ({ ...prev, refFontSize: value }))}
          />

          <IconSegmentedControl<CompactFontWeight>
            label={t('bgPicker.weight')}
            value={refFontWeight as CompactFontWeight}
            options={getWeightOptions(t)}
            onChange={(w) => onQuickSettingsChange((prev) => ({ ...prev, refFontWeight: w }))}
          />

          <IconSegmentedControl<CompactTextCase>
            label={t('bgPicker.textCase')}
            value={refTextTransform as CompactTextCase}
            options={getTextCaseOptions(t)}
            onChange={(tc) => onQuickSettingsChange((prev) => ({ ...prev, refTextTransform: tc }))}
          />

        </div>
      </div>

      {overlayMode !== "lower-third" && (
        <ReferenceBackgroundSection
          quickSettings={quickSettings}
          onQuickSettingsChange={onQuickSettingsChange}
        />
      )}

      <button
        type="button"
        className="dtb-colors__collapsible-header"
        onClick={() => setAdvancedOpen((open) => !open)}
        aria-expanded={advancedOpen}
      >
        <span className="dtb-section-title">{t('common.moreOptions', 'More options')}</span>
        <Icon name={advancedOpen ? "expand_less" : "expand_more"} size={14} />
      </button>
      {advancedOpen && (
        <>
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

        </>
      )}
    </div>
  );
}

/* ── Reference Layout Section ── */
function ReferenceLayoutSection({
  quickSettings,
  onQuickSettingsChange,
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
}) {
  const { t } = useTranslation();
  const refPosition = quickSettings.refPosition ?? "bottom";
  const refAnchor = quickSettings.refAnchor ?? "normal";
  const refTextAlign = quickSettings.refTextAlign ?? "match";
  const refSpacing = quickSettings.refSpacing ?? 24;
  const referencePlacement = refAnchor === "top"
    ? "top-edge"
    : refAnchor === "bottom"
      ? "bottom-edge"
      : refPosition === "top"
        ? "above-verse"
        : "below-verse";
  const setReferencePlacement = (placement: "above-verse" | "below-verse" | "top-edge" | "bottom-edge") => {
    onQuickSettingsChange((prev) => ({
      ...prev,
      refAnchor: placement === "top-edge" ? "top" : placement === "bottom-edge" ? "bottom" : "normal",
      refPosition: placement === "above-verse" || placement === "top-edge" ? "top" : "bottom",
    }));
  };

  return (
    <div className="dtb-bg-picker__settings">
      <div>
        <div className="dtb-section-title">{t('bgPicker.reference')}</div>
        <p className="dtb-compare-section__description">
          {t('bgPicker.referenceLayoutDescription', 'Control where the scripture reference sits around the verse.')}
        </p>
      </div>

      <div className="dtb-control-section">
        <div className="dtb-control-section__head">
          <span className="dtb-control-section__title">{t('bgPicker.layout', 'Layout')}</span>
        </div>
        <div className="dtb-control-section__body">
          <IconSegmentedControl<CompactTextAlign>
            label={t('bgPicker.alignment')}
            value={refTextAlign as CompactTextAlign}
            options={getAlignmentOptions(t, true)}
            onChange={(a) => onQuickSettingsChange((prev) => ({ ...prev, refTextAlign: a as "match" | "left" | "center" | "right" }))}
          />

          {/* Reference Placement */}
          <div className="dtb-font-weight-row">
            <span className="dtb-position-label">{t('bgPicker.referencePlacement', 'Placement')}</span>
            <div className="dtb-position-options dtb-position-options--wrap">
              {([
                { value: "above-verse" as const, label: t('bgPicker.aboveVerse', 'Above verse') },
                { value: "below-verse" as const, label: t('bgPicker.belowVerse', 'Below verse') },
                { value: "top-edge" as const, label: t('bgPicker.topEdge', 'Top edge') },
                { value: "bottom-edge" as const, label: t('bgPicker.bottomEdge', 'Bottom edge') },
              ]).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`dtb-position-btn${referencePlacement === item.value ? " dtb-position-btn--active" : ""}`}
                  onClick={() => setReferencePlacement(item.value)}
                  title={item.label}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reference Spacing */}
          <div className="dtb-slider-field">
            <div className="dtb-slider-field__head">
              <span>{t('bgPicker.spacing')}</span>
              <span className="dtb-slider-field__value">{refSpacing}px</span>
            </div>
            <input
              type="range"
              className="dtb-slider"
              min={0}
              max={120}
              step={1}
              value={refSpacing}
              onChange={(e) => onQuickSettingsChange((prev) => ({ ...prev, refSpacing: Number(e.target.value) }))}
              aria-label={t('bgPicker.spacing')}
            />
          </div>
        </div>
      </div>
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
          title="dtb-toggle__knob">
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
            title={t('bgPicker.style')}>
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

  const loadThemes = useCallback(async () => {
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
      const modeFiltered = filtered.filter((theme) => themeSupportsBibleOverlayMode(theme, overlayMode));
      console.log("[ThemeSection]", {
        overlayMode,
        allowedCategories: allowedCategories ?? "ALL",
        loadedCount: all.length,
        filteredCount: modeFiltered.length,
        themeNames: modeFiltered.map((t) => t.name),
      });
      setThemes(modeFiltered);
    } catch (err) {
      console.error("[ThemeSection] failed to load themes:", err);
      setThemes([]);
    } finally {
      setLoading(false);
    }
  }, [allowedCategories, overlayMode]);

  useEffect(() => {
    let cancelled = false;
    void loadThemes().catch(() => { });
    const refresh = () => {
      if (!cancelled) void loadThemes().catch(() => { });
    };
    window.addEventListener(FAVORITE_THEMES_UPDATED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(FAVORITE_THEMES_UPDATED_EVENT, refresh);
    };
  }, [loadThemes]);

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
        title={t('bgPicker.themePresets')}>
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

/* ── Compare Settings (simplified) ── */

const FONT_FAMILY_OPTIONS = [
  { value: "", label: "Use Theme Font" },
  { value: '"CMG Sans Black", "CMG Sans", "Charis SIL", "Noto Sans", Arial, sans-serif', label: "CMG Sans Black (recommended)" },
  { value: '"Charis SIL", "Noto Sans", sans-serif', label: "Charis SIL (African languages)" },
  { value: '"CMG Sans", sans-serif', label: "CMG Sans" },
  { value: '"Inter", system-ui, sans-serif', label: "Inter" },
  { value: '"Charis SIL", serif', label: "Charis SIL" },
  { value: 'Georgia, serif', label: "Georgia" },
  { value: 'Arial, sans-serif', label: "Arial" },
  { value: 'Impact, sans-serif', label: "Impact" },
] as const;

const COMPARE_WEIGHT_OPTIONS: Array<{ value: CompareFontWeight; label: string }> = [
  { value: "regular", label: "Regular" },
  { value: "medium", label: "Medium" },
  { value: "semibold", label: "Semibold" },
  { value: "bold", label: "Bold" },
  { value: "extrabold", label: "Extra Bold" },
];

const COMPARE_ALIGN_OPTIONS: Array<{ value: CompareTextAlign; label: string }> = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
  { value: "justify", label: "Justify" },
];

const COMPARE_META_POSITION_OPTIONS: Array<{ value: CompareMetadataPosition; label: string }> = [
  { value: "above-verse", label: "Above Verse" },
  { value: "below-verse", label: "Below Verse" },
  { value: "hidden", label: "Hidden" },
];

function clampNumberValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function toQuickSettingsPatch(patch: Record<string, unknown>): Partial<DockFullscreenQuickThemeSettings> {
  return patch as Partial<DockFullscreenQuickThemeSettings>;
}

function getWeightGlyphClass(value: CompactFontWeight | CompareFontWeight): string {
  if (value === "light" || value === "regular") return "dtb-icon-segmented__glyph--light";
  if (value === "normal" || value === "medium") return "dtb-icon-segmented__glyph--normal";
  if (value === "semibold") return "dtb-icon-segmented__glyph--semibold";
  if (value === "extrabold") return "dtb-icon-segmented__glyph--extrabold";
  return "dtb-icon-segmented__glyph--bold";
}

function getAlignIcon(value: CompactTextAlign | CompareTextAlign): string {
  if (value === "center") return "format_align_center";
  if (value === "right") return "format_align_right";
  if (value === "justify") return "format_align_justify";
  if (value === "match") return "link";
  return "format_align_left";
}

type IconSegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: string;
  glyph?: string;
  glyphClassName?: string;
};

function IconSegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  columns,
}: {
  label: string;
  value: T;
  options: Array<IconSegmentedOption<T>>;
  onChange: (value: T) => void;
  columns?: number;
}) {
  const columnCount = columns ?? options.length;
  return (
    <div className="dtb-icon-segmented">
      <span className="dtb-position-label">{label}</span>
      <div
        className="dtb-icon-segmented__options"
        style={{ "--dtb-icon-segment-count": columnCount } as CSSProperties}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`dtb-icon-segmented__button${value === option.value ? " dtb-icon-segmented__button--active" : ""}`}
            onClick={() => onChange(option.value)}
            title={option.label}
            aria-label={option.label}
          >
            {option.icon ? (
              <Icon name={option.icon} size={15} />
            ) : (
              <span className={`dtb-icon-segmented__glyph${option.glyphClassName ? ` ${option.glyphClassName}` : ""}`}>
                {option.glyph}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function getWeightOptions(t: ReturnType<typeof useTranslation>["t"]): Array<IconSegmentedOption<CompactFontWeight>> {
  return (["light", "normal", "bold", "extrabold"] as const).map((value) => ({
    value,
    label:
      value === "light"
        ? t("bgPicker.light")
        : value === "bold"
          ? t("bgPicker.bold")
          : value === "extrabold"
            ? t("bgPicker.extraBold", "Extra bold")
            : t("bgPicker.regular"),
    glyph: value === "extrabold" ? "B+" : "B",
    glyphClassName: getWeightGlyphClass(value),
  }));
}

function getTextCaseOptions(t: ReturnType<typeof useTranslation>["t"]): Array<IconSegmentedOption<CompactTextCase>> {
  return [
    { value: "none", label: t("bgPicker.normal"), glyph: "Aa" },
    { value: "uppercase", label: t("common.upper"), glyph: "AA" },
    { value: "lowercase", label: t("common.lower"), glyph: "aa" },
    { value: "capitalize", label: t("bgPicker.title"), glyph: "Ab" },
  ];
}

function getAlignmentOptions(
  t: ReturnType<typeof useTranslation>["t"],
  includeMatch = false,
  includeJustify = false,
): Array<IconSegmentedOption<CompactTextAlign>> {
  const values: CompactTextAlign[] = [
    ...(includeMatch ? (["match"] as const) : []),
    "left",
    "center",
    "right",
    ...(includeJustify ? (["justify"] as const) : []),
  ];
  return values.map((value) => ({
    value,
    label: value === "match" ? t("bgPicker.matchVerse") : t(`common.${value}`),
    icon: getAlignIcon(value),
  }));
}

function getCompareWeightOptions(): Array<IconSegmentedOption<CompareFontWeight>> {
  return COMPARE_WEIGHT_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    glyph: option.value === "extrabold" ? "B+" : "B",
    glyphClassName: getWeightGlyphClass(option.value),
  }));
}

function getCompareAlignOptions(): Array<IconSegmentedOption<CompareTextAlign>> {
  return COMPARE_ALIGN_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    icon: getAlignIcon(option.value),
  }));
}

function SliderNumberField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const safeValue = Number(value) || 0;
  const normalizedStep = Number.isInteger(step) ? 0 : String(step).split(".")[1]?.length ?? 2;
  const formattedValue = Number(safeValue.toFixed(normalizedStep));
  const [draftValue, setDraftValue] = useState(String(formattedValue));

  useEffect(() => {
    setDraftValue(String(formattedValue));
  }, [formattedValue]);

  const commitValue = (rawValue: string) => {
    setDraftValue(rawValue);
    if (rawValue.trim() === "") return;
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) {
      onChange(clampNumberValue(parsed, min, max));
    }
  };

  const stepValue = (direction: -1 | 1) => {
    onChange(clampNumberValue(safeValue + (step * direction), min, max));
  };

  return (
    <div className="dtb-slider-field">
      <div className="dtb-slider-field__head">
        <span>{label}</span>
      </div>
      <div className="dtb-slider-field__stepper">
        <button
          type="button"
          className="dtb-slider-field__step-button"
          onClick={() => stepValue(-1)}
          disabled={safeValue <= min}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <input
          type="number"
          className="dtb-slider-field__number"
          min={min}
          max={max}
          step={step}
          inputMode={step < 1 ? "decimal" : "numeric"}
          value={draftValue}
          onChange={(event) => commitValue(event.target.value)}
          onBlur={() => {
            if (draftValue.trim() === "") setDraftValue(String(formattedValue));
          }}
          aria-label={`${label} value`}
          aria-valuetext={`${formattedValue}${unit ? ` ${unit}` : ""}`}
        />
        <button
          type="button"
          className="dtb-slider-field__step-button"
          onClick={() => stepValue(1)}
          disabled={safeValue >= max}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="dtb-position-row">
      <label className="dtb-position-label">{label}</label>
      <select className="dock-select dtb-bg-picker__select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function CompareLayoutPopover({
  value,
  gap,
  options,
  onPresetChange,
  onGapChange,
}: {
  value: string;
  gap: number;
  options: Array<{ value: string; label: string; description?: string }>;
  onPresetChange: (value: string) => void;
  onGapChange: (value: number) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 292 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  const openPopover = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(292, Math.max(240, window.innerWidth - 16));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 430));
    setPos({ top, left, width });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="dtb-compare-layout-control">
      <button
        ref={triggerRef}
        type="button"
        className="dtb-compare-layout-trigger"
        onClick={() => open ? setOpen(false) : openPopover()}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="Layout and gap"
        title="Layout and gap"
      >
        <Icon name="tune" size={16} />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          id={id}
          className="dtb-compare-layout-popover"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 10000 }}
          role="menu"
        >
          <div className="dtb-compare-layout-popover__header">
            <div>
              <span className="dtb-compare-layout-popover__eyebrow">Layout</span>
              <strong>{selected?.label ?? "Custom"}</strong>
            </div>
            <button
              type="button"
              className="dtb-compare-layout-popover__close"
              onClick={() => setOpen(false)}
              aria-label="Close layout settings"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="dtb-compare-layout-popover__section">
            <span className="dtb-compare-layout-popover__label">Preset</span>
            <div className="dtb-compare-layout-popover__options">
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`dtb-compare-layout-popover__option${active ? " dtb-compare-layout-popover__option--active" : ""}`}
                    onClick={() => {
                      onPresetChange(option.value);
                    }}
                    role="menuitemradio"
                    aria-checked={active}
                  >
                    <span className="dtb-compare-layout-popover__option-icon">
                      <Icon name={option.value === "custom" ? "tune" : "view_column"} size={16} />
                    </span>
                    <span className="dtb-compare-layout-popover__option-copy">
                      <span className="dtb-compare-layout-popover__option-label">{option.label}</span>
                      {option.description && (
                        <span className="dtb-compare-layout-popover__option-desc">{option.description}</span>
                      )}
                    </span>
                    {active && <Icon name="check" size={16} className="dtb-compare-layout-popover__option-check" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="dtb-compare-layout-popover__section">
            <SliderNumberField
              label="Gap between columns"
              value={gap}
              min={0}
              max={100}
              step={1}
              unit="px"
              onChange={onGapChange}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function CompareSettingsPanel({
  quickSettings,
  onQuickSettingsChange,
  compareBackdropValue,
  onBackdropChange,
  onBackgroundPresetChange,
  overlayMode = "fullscreen",
}: {
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
  compareBackdropValue: BackgroundType;
  onBackdropChange: (type: BackgroundType) => void;
  onBackgroundPresetChange?: (preset: DockBackgroundPreset) => void;
  selectedThemeId?: string | null;
  onThemeSelect?: (theme: BibleTheme) => void;
  allowedCategories?: Array<NonNullable<BibleTheme["category"]>>;
  overlayMode?: "fullscreen" | "lower-third";
}) {
  const { t } = useTranslation();
  const compare = useMemo(
    () => normalizeCompareThemeSettings(quickSettings as Record<string, unknown>),
    [quickSettings],
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const compareLowerThirdTextDirection = quickSettings.lowerThirdTextDirection === "inverted" ? "inverted" : "normal";
  const resolvedCompareBackdropValue = compareBackdropValue === "theme" ? "color" : compareBackdropValue;
  const layoutOptions = useMemo(
    () => [
      ...COMPARE_LAYOUT_PRESETS.map((preset) => ({
        value: preset.id,
        label: preset.label,
        description: `${preset.leftWidth}/${preset.rightWidth} • ${preset.gap}px gap`,
      })),
      { value: "custom", label: "Custom", description: "Manual spacing and padding" },
    ],
    [],
  );

  const applyPatch = useCallback((patch: Record<string, unknown>) => {
    onQuickSettingsChange((prev) => ({ ...prev, ...toQuickSettingsPatch(patch) }));
  }, [onQuickSettingsChange]);

  const applyLayoutPreset = useCallback((presetId: string) => {
    const preset = COMPARE_LAYOUT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const matchingGapPreset = COMPARE_GAP_PRESETS.find((item) => item.value === preset.gap)?.id ?? "custom";
    applyPatch({
      compareLayoutPreset: preset.id,
      compareGapPreset: matchingGapPreset,
      compareLeftWidth: preset.leftWidth,
      compareRightWidth: preset.rightWidth,
      compareLockWidths: preset.leftWidth === preset.rightWidth,
      compareOuterPaddingTop: preset.outerPadding,
      compareOuterPaddingBottom: preset.outerPadding,
      compareOuterPaddingLeft: preset.outerPadding,
      compareOuterPaddingRight: preset.outerPadding,
      compareLinkPadding: true,
      comparePanelInnerPadding: preset.innerPadding,
      compareTranslationGap: preset.gap,
    });
  }, [applyPatch]);

  const setGap = useCallback((value: number) => {
    applyPatch({
      compareLayoutPreset: "custom",
      compareGapPreset: "custom",
      compareTranslationGap: clampNumberValue(value, 0, 100),
    });
  }, [applyPatch]);

  const resolvedLayoutPreset = useMemo(() => {
    const match = COMPARE_LAYOUT_PRESETS.find((preset) =>
      compare.compareLeftWidth === preset.leftWidth &&
      compare.compareRightWidth === preset.rightWidth &&
      compare.gap === preset.gap &&
      compare.compareOuterPaddingTop === preset.outerPadding &&
      compare.compareOuterPaddingBottom === preset.outerPadding &&
      compare.compareOuterPaddingLeft === preset.outerPadding &&
      compare.compareOuterPaddingRight === preset.outerPadding &&
      compare.comparePanelInnerPadding === preset.innerPadding,
    );
    return match?.id ?? "custom";
  }, [compare]);

  return (
    <div className="dtb-compare-settings">


      {/* Layout */}
      <div className="dtb-bg-picker__settings" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="dtb-compare-layout-heading">
          <div className="dtb-section-title">Layout</div>
          <CompareLayoutPopover
            value={resolvedLayoutPreset}
            gap={compare.gap}
            options={layoutOptions}
            onPresetChange={(value) => {
              if (value !== "custom") applyLayoutPreset(value);
            }}
            onGapChange={(value) => setGap(value)}
          />
        </div>

        <SelectField
          label="Background"
          value={resolvedCompareBackdropValue}
          onChange={(value) => onBackdropChange(value as BackgroundType)}
          options={COMPARE_BG_OPTIONS.map((option) => ({
            value: option.id,
            label: t(option.label, option.label),
          }))}
        />

        {overlayMode === "lower-third" && (
          <div className="dtb-control-subsection">
            <span className="dtb-control-subsection__title">{t('bgPicker.lowerThirdBar', 'Lower-third bar')}</span>

            <div className="dtb-font-weight-row">
              <span className="dtb-position-label">{t('bgPicker.lowerThirdPlacement', 'Bar placement')}</span>
              <div className="dtb-position-options">
                {(["bottom", "top", "left", "right"] as const).map((edge) => (
                  <button
                    key={edge}
                    type="button"
                    className={`dtb-position-btn${(quickSettings.lowerThirdEdge ?? "bottom") === edge ? " dtb-position-btn--active" : ""}`}
                    onClick={() => onQuickSettingsChange((prev) => ({ ...prev, lowerThirdEdge: edge }))}
                    title={t(`bgPicker.edge${edge[0].toUpperCase()}${edge.slice(1)}`, edge)}
                  >
                    {edge === "bottom"
                      ? t('bgPicker.edgeBottom', 'Bottom')
                      : edge === "top"
                        ? t('bgPicker.edgeTop', 'Top')
                        : edge === "left"
                          ? t('common.left', 'Left')
                          : t('common.right', 'Right')}
                  </button>
                ))}
              </div>
            </div>

            <div className="dtb-font-weight-row">
              <span className="dtb-position-label">{t('bgPicker.textDirection', 'Text direction')}</span>
              <div className="dtb-position-options">
                {(["normal", "inverted"] as const).map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    className={`dtb-position-btn${compareLowerThirdTextDirection === direction ? " dtb-position-btn--active" : ""}`}
                    onClick={() => onQuickSettingsChange((prev) => ({ ...prev, lowerThirdTextDirection: direction }))}
                  >
                    {direction === "normal"
                      ? t('bgPicker.textDirectionNormal', 'Normal')
                      : t('bgPicker.textDirectionInverted', 'Inverted')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {resolvedCompareBackdropValue === "image" && (
        <ImageTab
          quickSettings={quickSettings}
          onQuickSettingsChange={onQuickSettingsChange}
          onBackgroundPresetChange={onBackgroundPresetChange}
        />
      )}
      {resolvedCompareBackdropValue === "video" && (
        <VideoTab
          quickSettings={quickSettings}
          onQuickSettingsChange={onQuickSettingsChange}
          onBackgroundPresetChange={onBackgroundPresetChange}
        />
      )}
      {resolvedCompareBackdropValue === "pattern" && (
        <PatternTab
          quickSettings={quickSettings}
          onQuickSettingsChange={onQuickSettingsChange}
          onBackgroundPresetChange={onBackgroundPresetChange}
        />
      )}
      {resolvedCompareBackdropValue === "color" && (
        <ColorSection
          quickSettings={quickSettings}
          onQuickSettingsChange={onQuickSettingsChange}
          onBackgroundPresetChange={onBackgroundPresetChange}
        />
      )}

      {/* Style */}
      <div className="dtb-bg-picker__settings" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="dtb-section-title">Style</div>

        <SliderNumberField
          label="Font size"
          value={compare.compareVerseFontSizeLeft}
          min={18} max={120} step={1} unit="px"
          onChange={(value) => applyPatch({
            compareVerseFontSizeLeft: value,
            compareVerseFontSizeRight: value,
          })}
        />

        <div className="dtb-compare-style-grid">
          <IconSegmentedControl<CompareFontWeight>
            label="Font weight"
            value={compare.compareFontWeightLeft}
            options={getCompareWeightOptions()}
            onChange={(value) => applyPatch({
              compareFontWeightLeft: value,
              compareFontWeightRight: value,
            })}
          />

          <IconSegmentedControl<CompareTextAlign>
            label="Text alignment"
            value={compare.compareTextAlignLeft}
            options={getCompareAlignOptions()}
            onChange={(value) => applyPatch({
              compareTextAlignLeft: value,
              compareTextAlignRight: value,
            })}
          />
        </div>

        <SliderNumberField
          label="Reference font size"
          value={compare.compareReferenceFontSizeLeft}
          min={10} max={160} step={1} unit="px"
          onChange={(value) => applyPatch({
            compareReferenceFontSizeLeft: value,
            compareReferenceFontSizeRight: value,
          })}
        />

      </div>

      {/* Advanced */}
      <div className="dtb-bg-picker__settings" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          type="button"
          className="dtb-colors__collapsible-header"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
        >
          <span className="dtb-section-title">Advanced</span>
          <Icon name={advancedOpen ? "expand_less" : "expand_more"} size={14} />
        </button>
        {advancedOpen && (
          <>
            <SelectField
              label="Font family"
              value={compare.compareFontFamilyLeft}
              onChange={(value) => applyPatch({
                compareFontFamilyLeft: value,
                compareFontFamilyRight: value,
              })}
              options={FONT_FAMILY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />

            <SliderNumberField
              label="Line height"
              value={compare.compareLineHeightLeft}
              min={0.9} max={2} step={0.01} unit="x"
              onChange={(value) => applyPatch({
                compareLineHeightLeft: value,
                compareLineHeightRight: value,
              })}
            />

            <SliderNumberField
              label="Outer padding"
              value={compare.compareOuterPaddingTop}
              min={0} max={150} step={1} unit="px"
              onChange={(value) => applyPatch({
                compareOuterPaddingTop: value,
                compareOuterPaddingBottom: value,
                compareOuterPaddingLeft: value,
                compareOuterPaddingRight: value,
                compareLayoutPreset: "custom",
              })}
            />

            <SliderNumberField
              label="Inner padding"
              value={compare.comparePanelInnerPadding}
              min={0} max={80} step={1} unit="px"
              onChange={(value) => applyPatch({
                comparePanelInnerPadding: value,
                compareLayoutPreset: "custom",
              })}
            />

            <SelectField
              label="Reference position"
              value={compare.compareReferencePositionLeft}
              onChange={(value) => applyPatch({
                compareReferencePositionLeft: value,
                compareReferencePositionRight: value,
              })}
              options={COMPARE_META_POSITION_OPTIONS}
            />

            <ReferenceBackgroundSection
              quickSettings={quickSettings}
              onQuickSettingsChange={onQuickSettingsChange}
            />
          </>
        )}
      </div>
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hexInput, setHexInput] = useState(value);
  const normalizedValue = value.toUpperCase();

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
      <button
        type="button"
        className="dtb-color-inline__trigger"
        ref={triggerRef}
        onClick={openPopover}
      >
        <span className="dtb-color-inline__preview" style={{ backgroundColor: value }} />
        <span className="dtb-color-inline__meta">
          <span className="dtb-color-inline__eyebrow">Color</span>
          <span className="dtb-color-inline__hex">{normalizedValue}</span>
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} size={14} className="dtb-color-inline__chevron" />
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          className="dtb-color-inline__popover"
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 10000 }}
        >
          <div className="dtb-color-inline__popover-header">
            <span className="dtb-color-inline__popover-preview" style={{ backgroundColor: value }} />
            <div className="dtb-color-inline__popover-copy">
              <span className="dtb-color-inline__popover-label">Selected color</span>
              <span className="dtb-color-inline__popover-value">{normalizedValue}</span>
            </div>
          </div>
          <div className="dtb-color-inline__swatches">
            {INLINE_COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`dtb-color-inline__swatch${normalizedValue === swatch ? " dtb-color-inline__swatch--active" : ""}`}
                style={{ backgroundColor: swatch }}
                onClick={() => onChange(swatch)}
                aria-label={swatch}
                title={swatch}
              />
            ))}
          </div>
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
