/**
 * ThemeCreatorModal.tsx — Theme Designer V2
 *
 * 3-panel layout: Theme Library | Live Preview | Property Inspector
 * Top toolbar with Undo/Redo and Save/Close actions.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import Icon from "../components/Icon";
import {
  X,
  ChevronDown,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  LayoutGrid,
  Plus,
  Undo2,
  Redo2,
  Copy,
  Trash2,
  Save,
  Search,
  Monitor,
  Upload,
  Download,
  Eye,
  Grid3X3,
} from "lucide-react";
import type {
  BibleTheme,
  BibleThemeCategory,
  BibleThemeSettings,
  BibleThemeRawTemplate,
  LowerThirdWidthPreset,
} from "../bible/types";
import { DEFAULT_THEME_SETTINGS } from "../bible/types";
import {
  saveCustomTheme,
  getCustomThemes,
  deleteCustomTheme,
} from "../bible/bibleDb";
import { addBibleFavorite } from "../services/favoriteThemes";
import { getAllMedia } from "../library/libraryDb";
import { BACKGROUND_PATTERNS } from "../library/backgroundAssets";
import type { MediaItem } from "../library/libraryTypes";
import {
  downloadTemplateVideoToLibrary,
  fetchTemplateVideos,
  type TemplateVideoAsset,
} from "../services/templateVideos";
import { saveLibraryMediaFile, MEDIA_FILE_ACCEPT } from "../library/MediaTab";
import { resolveOverlayAssetUrl } from "../services/overlayUrl";
import { BIBLE_BUILTIN_THEMES, getBibleThemePreviewHtml } from "../bible/bibleThemes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BackgroundPickerTab =
  | "my-images"
  | "my-videos"
  | "template-videos"
  | "images"
  | "patterns"
  | "animations"
  | "color"
  | "transparent";

type InspectorTab =
  | "content"
  | "typography"
  | "background"
  | "layout"
  | "bible"
  | "worship"
  | "animation";

type LayoutFilter = "all" | "fullscreen" | "lower-third";

interface PreviewOptions {
  showVerse: boolean;
  showRef: boolean;
  abbreviateBooks: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: Array<{ value: BibleThemeCategory; label: string; icon: string }> = [
  { value: "bible", label: "Bible", icon: "auto_stories" },
  { value: "worship", label: "Worship", icon: "music_note" },
  { value: "general", label: "General", icon: "dashboard" },
];

const FONT_FAMILIES = [
  '"CMG Sans", sans-serif',
  '"Montserrat", sans-serif',
  '"Inter", sans-serif',
  '"Playfair Display", serif',
  '"Lora", serif',
  '"Merriweather", serif',
  '"Roboto", sans-serif',
  '"Open Sans", sans-serif',
  '"Poppins", sans-serif',
  '"Oswald", sans-serif',
  '"Raleway", sans-serif',
  '"Bebas Neue", sans-serif',
  '"DM Sans", sans-serif',
  '"Source Serif 4", serif',
  '"Libre Baskerville", serif',
  "Georgia, serif",
  "system-ui, sans-serif",
];

const FONT_FAMILY_LABELS: Record<string, string> = {
  '"CMG Sans", sans-serif': "CMG Sans",
  '"Montserrat", sans-serif': "Montserrat",
  '"Inter", sans-serif': "Inter",
  '"Playfair Display", serif': "Playfair Display",
  '"Lora", serif': "Lora",
  '"Merriweather", serif': "Merriweather",
  '"Roboto", sans-serif': "Roboto",
  '"Open Sans", sans-serif': "Open Sans",
  '"Poppins", sans-serif': "Poppins",
  '"Oswald", sans-serif': "Oswald",
  '"Raleway", sans-serif': "Raleway",
  '"Bebas Neue", sans-serif': "Bebas Neue",
  '"DM Sans", sans-serif': "DM Sans",
  '"Source Serif 4", serif': "Source Serif 4",
  '"Libre Baskerville", serif': "Libre Baskerville",
  "Georgia, serif": "Georgia",
  "system-ui, sans-serif": "System",
};

const BACKGROUND_PICKER_TABS: Array<{ value: BackgroundPickerTab; label: string }> = [
  { value: "my-images", label: "My Images" },
  { value: "my-videos", label: "My Videos" },
  { value: "template-videos", label: "Template Videos" },
  { value: "images", label: "Images" },
  { value: "patterns", label: "Patterns" },
  { value: "color", label: "Color" },
  { value: "transparent", label: "Transparent" },
];

const BACKGROUND_COLOR_SWATCHES = [
  "#000000",
  "#0F1115",
  "#181D29",
  "#1B2D57",
  "#1D4ED8",
  "#FFFFFF",
  "#2D4A3E",
  "#3A516D",
  "#8B4513",
  "#4A2C2A",
];

const LT_WIDTHS: Array<{ value: LowerThirdWidthPreset; label: string; reduction: number }> = [
  { value: "full", label: "Full", reduction: 0 },
  { value: "sm", label: "SM", reduction: 120 },
  { value: "md", label: "MD", reduction: 240 },
  { value: "lg", label: "LG", reduction: 360 },
  { value: "xl", label: "XL", reduction: 520 },
  { value: "xxl", label: "XXL", reduction: 680 },
];

const LT_WIDTH_REDUCTION = LT_WIDTHS.reduce<Record<LowerThirdWidthPreset, number>>(
  (acc, option) => {
    acc[option.value] = option.reduction;
    return acc;
  },
  { full: 0, sm: 120, md: 240, lg: 360, xl: 520, xxl: 680 }
);

const OBS_CANVAS_WIDTH = 1920;
const LT_MIN_WIDTH = 480;

const INSPECTOR_TABS: Array<{ key: InspectorTab; label: string }> = [
  { key: "content", label: "Content" },
  { key: "typography", label: "Typography" },
  { key: "background", label: "Background" },
  { key: "layout", label: "Layout" },
  { key: "bible", label: "Bible" },
  { key: "worship", label: "Worship" },
  { key: "animation", label: "Animation" },
];

const SAMPLE_CONTENT: Record<
  BibleThemeCategory,
  { verse: string; ref: string; refAbbr: string; verseShort: string }
> = {
  bible: {
    verse: "\u201CFor God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.\u201D",
    ref: "John 3:16 (KJV)",
    refAbbr: "Jn 3:16 (KJV)",
    verseShort: "\u201CFor God so loved the world, that he gave his only begotten Son\u2026\u201D",
  },
  worship: {
    verse: "Amazing grace, how sweet the sound\nThat saved a wretch like me\nI once was lost, but now I\u2019m found\nWas blind, but now I see",
    ref: "Amazing Grace \u2014 John Newton",
    refAbbr: "Amazing Grace \u2014 John Newton",
    verseShort: "Amazing grace, how sweet the sound\nThat saved a wretch like me\u2026",
  },
  general: {
    verse: "Join us this Sunday for a special time of worship and fellowship. All are welcome!",
    ref: "Sunday Service \u2014 10:30 AM",
    refAbbr: "Sunday Service \u2014 10:30 AM",
    verseShort: "Join us this Sunday for a special time\u2026",
  },
};

const DEFAULT_PREVIEW_OPTIONS: PreviewOptions = {
  showVerse: true,
  showRef: true,
  abbreviateBooks: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getLowerThirdLayout(settings: BibleThemeSettings, canvasWidth = OBS_CANVAS_WIDTH) {
  const safeArea = Math.max(0, Number(settings.safeArea) || 40);
  const paddedWidth = Math.max(LT_MIN_WIDTH, canvasWidth - safeArea * 2);
  const requestedReduction = LT_WIDTH_REDUCTION[settings.lowerThirdWidthPreset || "full"] ?? 0;
  const maxReduction = Math.max(0, paddedWidth - LT_MIN_WIDTH);
  const reduction = clamp(requestedReduction, 0, maxReduction);
  const barWidth = Math.max(LT_MIN_WIDTH, paddedWidth - reduction);
  const freeSpace = Math.max(0, paddedWidth - barWidth);

  let minOffset = 0;
  let maxOffset = 0;

  if (settings.lowerThirdPosition === "center") {
    minOffset = -freeSpace / 2;
    maxOffset = freeSpace / 2;
  } else if (settings.lowerThirdPosition === "right") {
    minOffset = -freeSpace;
    maxOffset = 0;
  } else {
    minOffset = 0;
    maxOffset = freeSpace;
  }

  return {
    safeArea,
    paddedWidth,
    reduction,
    barWidth,
    freeSpace,
    justify:
      settings.lowerThirdPosition === "center"
        ? "center"
        : settings.lowerThirdPosition === "right"
          ? "flex-end"
          : "flex-start",
    minOffset: Math.round(minOffset),
    maxOffset: Math.round(maxOffset),
    offsetX: Math.round(clamp(Number(settings.lowerThirdOffsetX) || 0, minOffset, maxOffset)),
  };
}

function normalizeThemeSettings(settings: BibleThemeSettings): BibleThemeSettings {
  const normalized = {
    ...settings,
    lowerThirdWidthPreset: settings.lowerThirdWidthPreset || "full",
    lineHeight: clamp(Number(settings.lineHeight) || 1.6, 1, 3),
  };
  const layout = getLowerThirdLayout(normalized);
  return {
    ...normalized,
    lowerThirdOffsetX: layout.offsetX,
  };
}

function normalizeCategories(values: Array<BibleThemeCategory | null | undefined>): BibleThemeCategory[] {
  const ordered = CATEGORY_OPTIONS.map((option) => option.value);
  const set = new Set<BibleThemeCategory>();
  for (const value of values) {
    if (value && ordered.includes(value)) {
      set.add(value);
    }
  }
  if (set.size === 0) set.add("bible");
  return ordered.filter((value) => set.has(value));
}

function resolveMediaPreviewSrc(item: MediaItem): string {
  if (item.url) return item.url;
  if (item.filePath) return resolveOverlayAssetUrl(item.filePath);
  return "";
}

// ---------------------------------------------------------------------------
// TemplateVideoPreview sub-component
// ---------------------------------------------------------------------------

function TemplateVideoPreview({ asset }: { asset: TemplateVideoAsset }) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const handlePointerEnter = useCallback(() => { setShouldLoad(true); }, []);
  const handlePointerLeave = useCallback(() => { /* keep loaded */ }, []);

  if (!shouldLoad) {
    return (
      <div
        className="tc-template-video-placeholder"
        onPointerEnter={handlePointerEnter}
        style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)", borderRadius: 4 }}
      >
        <Icon name="videocam" size={24} />
      </div>
    );
  }

  return (
    <video
      src={asset.videoUrl}
      muted
      loop
      autoPlay
      onPointerLeave={handlePointerLeave}
      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 4 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Preview HTML builders
// ---------------------------------------------------------------------------

function buildFullscreenPreviewHtml(settings: BibleThemeSettings, category: BibleThemeCategory, _opts: PreviewOptions): string {
  const content = SAMPLE_CONTENT[category];
  const shadowCss = settings.textShadow !== "none" ? `text-shadow: ${settings.textShadow};` : "";
  const outlineCss = settings.textOutline ? `-webkit-text-stroke: ${settings.textOutlineWidth}px ${settings.textOutlineColor};` : "";
  const transformCss = settings.textTransform !== "none" ? `text-transform: ${settings.textTransform};` : "";
  const alignCss = `text-align: ${settings.textAlign};`;
  const shadeCss = settings.fullscreenShadeEnabled
    ? `background: ${settings.fullscreenShadeColor}; opacity: ${settings.fullscreenShadeOpacity}; position: absolute; inset: 0;`
    : "";
  const bgStyle = settings.backgroundColor !== "transparent"
    ? `background-color: ${settings.backgroundColor};`
    : settings.backgroundImage
      ? `background-image: url('${settings.backgroundImage}'); background-size: cover; background-position: center;`
      : "background: transparent;";
  const bgOpacityCss = settings.backgroundColor !== "transparent" ? "" : `opacity: ${settings.backgroundOpacity};`;

  const refAlign = settings.refTextAlign === "match" ? settings.textAlign : settings.refTextAlign;
  const refSpacing = settings.refSpacing ?? 24;
  const refMarginTop = settings.refPosition === "top" ? `0 0 ${refSpacing}px 0` : `${refSpacing}px 0 0 0`;
  const refBgCss = settings.referenceBackgroundEnabled
    ? (() => {
      const bg = settings.referenceBackgroundColor;
      const r = settings.referenceBackgroundRadius ?? 12;
      if (settings.referenceBackgroundStyle === "pill") return `background:${bg};border-radius:999px;padding:4px 16px;display:inline-block;`;
      if (settings.referenceBackgroundStyle === "outline") return `border:1px solid ${bg};border-radius:${r}px;padding:4px 16px;display:inline-block;`;
      return `background:${bg};border-radius:${r}px;padding:4px 16px;display:inline-block;`;
    })()
    : "";
  const refHtmlTop = settings.refPosition === "top"
    ? `<p class="reference" style="margin:${refMarginTop};${refBgCss}">${content.ref}</p>`
    : "";
  const refHtmlBottom = settings.refPosition === "bottom"
    ? `<p class="reference" style="margin:${refMarginTop};${refBgCss}">${content.ref}</p>`
    : "";

  return `<!DOCTYPE html><html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{width:1920px;height:1080px;overflow:hidden;font-family:${settings.fontFamily};${alignCss}}
.bg{position:absolute;inset:0;${bgStyle}${bgOpacityCss}}
.shade{${shadeCss}}
.content{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding: ${settings.padding}px;${alignCss}}
.verse{font-size:${settings.fontSize / 2}px;font-weight:${settings.fontWeight};font-style:${settings.fontStyle || "normal"};color:${settings.fontColor};line-height:${settings.lineHeight};${shadowCss}${outlineCss}${transformCss}}
.reference{font-size:${settings.refFontSize / 2}px;font-weight:${settings.refFontWeight === "light" ? "300" : settings.refFontWeight};color:${settings.refFontColor};text-transform:${settings.refTextTransform !== "none" ? settings.refTextTransform : "none"};text-align:${refAlign};letter-spacing:${settings.refLetterSpacing}px;opacity:${settings.refOpacity}}
</style></head><body>
<div class="bg"></div>
<div class="shade"></div>
<div class="content">
  ${refHtmlTop}
  <p class="verse">${content.verse}</p>
  ${refHtmlBottom}
</div>
</body></html>`;
}

function buildLowerThirdPreviewHtml(settings: BibleThemeSettings, _category: BibleThemeCategory, _opts: PreviewOptions): string {
  const content = SAMPLE_CONTENT.bible;
  const shadowCss = settings.textShadow !== "none" ? `text-shadow: ${settings.textShadow};` : "";
  const outlineCss = settings.textOutline ? `-webkit-text-stroke: ${settings.textOutlineWidth}px ${settings.textOutlineColor};` : "";
  const transformCss = settings.textTransform !== "none" ? `text-transform: ${settings.textTransform};` : "";
  const alignCss = `text-align: ${settings.textAlign};`;
  const boxBg = settings.boxBackground !== "transparent"
    ? `background-color: ${settings.boxBackground};`
    : settings.boxBackgroundImage
      ? `background-image: url('${settings.boxBackgroundImage}'); background-size: cover; background-position: center;`
      : "background: rgba(0,0,0,0.7);";
  const borderRadius = settings.borderRadius ?? 12;
  const ltHeight = settings.lowerThirdHeight ? `height: ${settings.lowerThirdHeight}px;` : "";

  const refAlign = settings.refTextAlign === "match" ? settings.textAlign : settings.refTextAlign;
  const refSpacing = settings.refSpacing ?? 24;
  const refMarginTop = settings.refPosition === "top" ? `0 0 ${refSpacing}px 0` : `${refSpacing}px 0 0 0`;
  const refBgCss = settings.referenceBackgroundEnabled
    ? (() => {
      const bg = settings.referenceBackgroundColor;
      const r = settings.referenceBackgroundRadius ?? 12;
      if (settings.referenceBackgroundStyle === "pill") return `background:${bg};border-radius:999px;padding:4px 16px;display:inline-block;`;
      if (settings.referenceBackgroundStyle === "outline") return `border:1px solid ${bg};border-radius:${r}px;padding:4px 16px;display:inline-block;`;
      return `background:${bg};border-radius:${r}px;padding:4px 16px;display:inline-block;`;
    })()
    : "";
  const refHtmlTop = settings.refPosition === "top"
    ? `<p class="reference" style="margin:${refMarginTop};${refBgCss}">${content.refAbbr}</p>`
    : "";
  const refHtmlBottom = settings.refPosition === "bottom"
    ? `<p class="reference" style="margin:${refMarginTop};${refBgCss}">${content.refAbbr}</p>`
    : "";

  return `<!DOCTYPE html><html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{width:1920px;height:1080px;overflow:hidden;font-family:${settings.fontFamily};background:transparent}
.lt{position:absolute;bottom:64px;left:50%;transform:translateX(-50%);max-width:calc(100% - ${settings.safeArea * 2}px);padding:${settings.padding}px 32px;${boxBg}border-radius:${borderRadius}px;${ltHeight}${alignCss}}
.verse{font-size:${settings.fontSize / 2}px;font-weight:${settings.fontWeight};font-style:${settings.fontStyle || "normal"};color:${settings.fontColor};line-height:${settings.lineHeight};${shadowCss}${outlineCss}${transformCss}}
.reference{font-size:${settings.refFontSize / 2}px;font-weight:${settings.refFontWeight === "light" ? "300" : settings.refFontWeight};color:${settings.refFontColor};text-transform:${settings.refTextTransform !== "none" ? settings.refTextTransform : "none"};text-align:${refAlign};letter-spacing:${settings.refLetterSpacing}px;opacity:${settings.refOpacity}}
</style></head><body>
<div class="lt">
  ${refHtmlTop}
  <p class="verse">${content.verse}</p>
  ${refHtmlBottom}
</div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  onClose: () => void;
  onSaved?: (theme: BibleTheme) => void;
  editTheme?: BibleTheme | null;
  initialCategory?: BibleThemeCategory;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ThemeCreatorModal({ onClose, onSaved, editTheme, initialCategory }: Props) {
  const isEditing = !!editTheme;

  // ── Core state ──
  const [tab, setTab] = useState<"fullscreen" | "lower-third">(
    editTheme?.templateType === "lower-third" ? "lower-third" : "fullscreen"
  );
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(editTheme?.name || "Untitled Theme");
  const [description] = useState(editTheme?.description || "");
  const [categories, setCategories] = useState<BibleThemeCategory[]>(
    () => normalizeCategories(editTheme?.categories || (initialCategory ? [initialCategory] : []))
  );

  const [settings, setSettings] = useState<BibleThemeSettings>(() =>
    editTheme?.settings
      ? normalizeThemeSettings({ ...DEFAULT_THEME_SETTINGS, ...editTheme.settings })
      : { ...DEFAULT_THEME_SETTINGS }
  );

  // ── Undo / Redo ──
  const undoStackRef = useRef<BibleThemeSettings[]>([]);
  const redoStackRef = useRef<BibleThemeSettings[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setSettings((current) => {
      redoStackRef.current = [...redoStackRef.current, { ...current }];
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(true);
      return prev;
    });
  }, []);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    setSettings((current) => {
      undoStackRef.current = [...undoStackRef.current, { ...current }];
      setCanUndo(true);
      setCanRedo(redoStackRef.current.length > 0);
      return next;
    });
  }, []);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  // ── Theme Library ──
  const [themeLibrary, setThemeLibrary] = useState<BibleTheme[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<LayoutFilter>("all");
  const [activeRawTemplate, setActiveRawTemplate] = useState<BibleThemeRawTemplate | null>(null);

  const loadThemeLibrary = useCallback(async () => {
    try {
      const customThemes = await getCustomThemes();
      setThemeLibrary([...BIBLE_BUILTIN_THEMES, ...customThemes]);
    } catch {
      setThemeLibrary([...BIBLE_BUILTIN_THEMES]);
    }
  }, []);

  useEffect(() => {
    loadThemeLibrary();
  }, [loadThemeLibrary]);

  const filteredThemes = useMemo(() => {
    let list = themeLibrary;
    if (libraryFilter !== "all") {
      list = list.filter((t) => t.templateType === libraryFilter);
    }
    if (librarySearch.trim()) {
      const q = librarySearch.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [themeLibrary, librarySearch, libraryFilter]);

  const handleLoadTheme = useCallback((theme: BibleTheme) => {
    setTab(theme.templateType === "lower-third" ? "lower-third" : "fullscreen");
    setName(theme.name);
    setCategories(normalizeCategories(theme.categories || []));
    setSettings(normalizeThemeSettings({ ...DEFAULT_THEME_SETTINGS, ...theme.settings }));
    setActiveRawTemplate(theme.rawTemplate || null);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const handleNewTheme = useCallback(() => {
    setTab("fullscreen");
    setName("Untitled Theme");
    setCategories(["bible"]);
    setSettings({ ...DEFAULT_THEME_SETTINGS });
    setActiveRawTemplate(null);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const handleDeleteTheme = useCallback(async (themeId: string) => {
    try {
      await deleteCustomTheme(themeId);
      await loadThemeLibrary();
    } catch { /* silent */ }
  }, [loadThemeLibrary]);

  const handleExportTheme = useCallback(() => {
    const theme: BibleTheme = {
      id: uid(),
      name: name.trim() || "Untitled Theme",
      description: description.trim(),
      source: "custom",
      templateType: tab,
      categories,
      settings: { ...settings },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${theme.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [name, description, tab, categories, settings]);

  const handleImportTheme = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as BibleTheme;
        if (imported.settings) {
          handleLoadTheme(imported);
        }
      } catch { /* silent */ }
    };
    input.click();
  }, [handleLoadTheme]);

  // ── Inspector ──
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("typography");

  // ── Preview state ──
  const [previewOpts] = useState<PreviewOptions>(DEFAULT_PREVIEW_OPTIONS);
  type ZoomMode = "fit" | 50 | 75 | 100 | 125;
  const [previewZoom, setPreviewZoom] = useState<ZoomMode>("fit");
  const previewWrapperRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  useEffect(() => {
    if (previewZoom !== "fit") return;
    const wrapper = previewWrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
          setFitScale(Math.min(width / 1920, height / 1080));
        }
      }
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [previewZoom]);

  const canvasTransform = useMemo(() => {
    if (previewZoom === "fit") {
      return `scale(${fitScale})`;
    }
    const scale = previewZoom / 100;
    const scaledW = 1920 * scale;
    const scaledH = 1080 * scale;
    const offsetX = (containerSize.width - scaledW) / 2;
    const offsetY = (containerSize.height - scaledH) / 2;
    return `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }, [previewZoom, fitScale, containerSize]);

  // ── Background picker state ──
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [bgTab, setBgTab] = useState<BackgroundPickerTab>("color");
  const [backgroundMediaLibrary, setBackgroundMediaLibrary] = useState<MediaItem[]>([]);
  const [templateVideoAssets, setTemplateVideoAssets] = useState<TemplateVideoAsset[]>([]);
  const bgImportInputRef = useRef<HTMLInputElement>(null);

  const animKeyRef = useRef(0);
  const prevAnimRef = useRef<string>(settings.animation);
  const prevDurRef = useRef<number>(settings.animationDuration);

  if (prevAnimRef.current !== settings.animation || prevDurRef.current !== settings.animationDuration) {
    animKeyRef.current += 1;
    prevAnimRef.current = settings.animation;
    prevDurRef.current = settings.animationDuration;
  }

  const backgroundColorValue = tab === "fullscreen" ? settings.backgroundColor : settings.boxBackground;
  const backgroundImageValue = tab === "fullscreen" ? settings.backgroundImage : settings.boxBackgroundImage;
  const backgroundVideoValue = tab === "fullscreen" ? settings.backgroundVideo : "";
  const backgroundOpacityValue = settings.backgroundOpacity;
  const backgroundOpacityPercent = Math.round(backgroundOpacityValue * 100);

  const selectedBackgroundImageAsset = useMemo(
    () => backgroundMediaLibrary.find((item) => item.type === "image" && item.url === backgroundImageValue),
    [backgroundMediaLibrary, backgroundImageValue]
  );
  const selectedBackgroundVideoAsset = useMemo(
    () => backgroundMediaLibrary.find((item) => item.type === "video" && item.url === backgroundVideoValue),
    [backgroundMediaLibrary, backgroundVideoValue]
  );
  const selectedBackgroundPattern = useMemo(
    () => BACKGROUND_PATTERNS.find((p) => p.src === backgroundImageValue),
    [backgroundImageValue]
  );

  const activeBackgroundPreviewSrc = useMemo(() => {
    if (selectedBackgroundImageAsset) return resolveMediaPreviewSrc(selectedBackgroundImageAsset);
    if (selectedBackgroundVideoAsset?.thumbnailUrl) return selectedBackgroundVideoAsset.thumbnailUrl;
    if (selectedBackgroundPattern) return selectedBackgroundPattern.src;
    return "";
  }, [selectedBackgroundImageAsset, selectedBackgroundVideoAsset, selectedBackgroundPattern]);

  const backgroundPreviewTypeLabel = useMemo(() => {
    if (selectedBackgroundPattern) return "Pattern Background";
    if (selectedBackgroundImageAsset) return "Image Background";
    if (selectedBackgroundVideoAsset) return "Video Background";
    if (backgroundColorValue && backgroundColorValue !== "transparent") return "Color Background";
    return "Transparent";
  }, [selectedBackgroundPattern, selectedBackgroundImageAsset, selectedBackgroundVideoAsset, backgroundColorValue]);

  const backgroundPreviewNameLabel = useMemo(() => {
    if (selectedBackgroundPattern) return selectedBackgroundPattern.label;
    if (selectedBackgroundImageAsset) return selectedBackgroundImageAsset.name;
    if (selectedBackgroundVideoAsset) return selectedBackgroundVideoAsset.diskFileName ?? selectedBackgroundVideoAsset.name;
    if (backgroundColorValue && backgroundColorValue !== "transparent") return backgroundColorValue;
    return "No background";
  }, [selectedBackgroundPattern, selectedBackgroundImageAsset, selectedBackgroundVideoAsset, backgroundColorValue]);

  const hasPreviewBackgroundVideo = backgroundVideoValue !== "" && tab === "fullscreen";

  const previewHtml = useMemo(() => {
    if (activeRawTemplate) return getBibleThemePreviewHtml({ rawTemplate: activeRawTemplate } as BibleTheme, settings) || "";
    if (tab === "fullscreen") return buildFullscreenPreviewHtml(settings, categories[0] || "bible", previewOpts);
    return buildLowerThirdPreviewHtml(settings, categories[0] || "bible", previewOpts);
  }, [tab, settings, categories, previewOpts, activeRawTemplate]);

  const previewFrameKey = useMemo(() => {
    if (activeRawTemplate) {
      // Include key settings so the iframe re-renders on inspector changes
      return `raw-${activeRawTemplate.html.slice(0, 80)}-${settings.fontSize}-${settings.fontWeight}-${settings.fontStyle}-${settings.fontColor}-${settings.lineHeight}-${settings.textAlign}-${settings.textShadow}-${settings.textTransform}-${settings.refFontSize}-${settings.refFontWeight}-${settings.refFontColor}-${settings.refTextTransform}-${settings.refLetterSpacing}-${settings.refOpacity}-${settings.refTextAlign}-${settings.boxBackground}-${settings.borderRadius}-${settings.fontFamily}-${settings.referenceBackgroundEnabled}-${settings.referenceBackgroundColor}-${settings.referenceBackgroundStyle}-${settings.referenceBackgroundRadius}`;
    }
    return `${tab}-${animKeyRef.current}-${settings.fontFamily}-${settings.fontSize}-${settings.fontWeight}-${settings.fontStyle}-${settings.fontColor}-${settings.textAlign}-${settings.lineHeight}-${settings.textShadow}-${settings.textOutline}-${settings.textOutlineWidth}-${settings.textOutlineColor}-${settings.textTransform}-${settings.padding}-${settings.backgroundColor}-${settings.backgroundImage}-${settings.backgroundOpacity}-${settings.animation}-${settings.animationDuration}-${settings.boxBackground}-${settings.boxBackgroundImage}-${settings.borderRadius}-${settings.safeArea}-${settings.refPosition}-${settings.refFontSize}-${settings.refFontWeight}-${settings.refFontColor}-${settings.refTextTransform}-${settings.refTextAlign}-${settings.refLetterSpacing}-${settings.refSpacing}-${settings.refOpacity}-${settings.referenceBackgroundEnabled}-${settings.referenceBackgroundColor}-${settings.referenceBackgroundStyle}-${settings.referenceBackgroundRadius}-${settings.logoUrl}-${settings.logoSize}-${settings.logoPosition}-${settings.fullscreenShadeEnabled}-${settings.fullscreenShadeColor}-${settings.fullscreenShadeOpacity}-${settings.lowerThirdWidthPreset}-${settings.lowerThirdPosition}-${settings.lowerThirdOffsetX}-${settings.lowerThirdSize}-${settings.lowerThirdHeight}-${backgroundVideoValue}-${hasPreviewBackgroundVideo}`;
  }, [tab, settings, backgroundVideoValue, hasPreviewBackgroundVideo, activeRawTemplate]);

  // ── Handlers ──

  const patch = useCallback((partial: Partial<BibleThemeSettings>) => {
    setSettings((prev) => {
      const next = normalizeThemeSettings({ ...prev, ...partial });
      undoStackRef.current = [...undoStackRef.current.slice(-49), { ...prev }];
      redoStackRef.current = [];
      setCanUndo(true);
      setCanRedo(false);
      return next;
    });
  }, []);

  const refreshBackgroundMediaLibrary = useCallback(async () => {
    try {
      const items = await getAllMedia();
      setBackgroundMediaLibrary(items);
    } catch { /* silent */ }
  }, []);

  const loadTemplateVideoAssets = useCallback(async () => {
    if (tab !== "fullscreen") return;
    try {
      const assets = await fetchTemplateVideos();
      setTemplateVideoAssets(assets);
    } catch { /* silent */ }
  }, [tab]);

  useEffect(() => {
    if (!showBackgroundModal) return;
    refreshBackgroundMediaLibrary();
    if (tab === "fullscreen") loadTemplateVideoAssets();
  }, [loadTemplateVideoAssets, refreshBackgroundMediaLibrary, showBackgroundModal, tab]);

  const findTemplateVideoDownload = useCallback(
    (asset: TemplateVideoAsset) => backgroundMediaLibrary.find((item) => item.name === asset.fileName && item.type === "video"),
    [backgroundMediaLibrary]
  );

  const handleTemplateVideoDownload = useCallback(async (asset: TemplateVideoAsset) => {
    try {
      await downloadTemplateVideoToLibrary(asset);
      await refreshBackgroundMediaLibrary();
    } catch { /* silent */ }
  }, [refreshBackgroundMediaLibrary]);

  const openBackgroundModal = useCallback(() => {
    if (backgroundColorValue && backgroundColorValue !== "transparent" && !backgroundImageValue && !backgroundVideoValue) {
      setBgTab("color");
    } else if (backgroundImageValue) {
      if (backgroundMediaLibrary.some((item) => item.type === "image" && item.url === backgroundImageValue)) {
        setBgTab("my-images");
      } else {
        setBgTab("patterns");
      }
    } else if (backgroundVideoValue) {
      setBgTab("my-videos");
    } else {
      setBgTab("color");
    }
    refreshBackgroundMediaLibrary();
    setShowBackgroundModal(true);
  }, [backgroundColorValue, backgroundImageValue, backgroundVideoValue, backgroundMediaLibrary, refreshBackgroundMediaLibrary]);

  const handleBgImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await saveLibraryMediaFile(file);
      await refreshBackgroundMediaLibrary();
    } catch (err) {
      console.error("[ThemeCreator] Import failed:", err);
    }
    if (bgImportInputRef.current) bgImportInputRef.current.value = "";
  }, [refreshBackgroundMediaLibrary]);

  const saveTheme = useCallback(async (duplicate: boolean) => {
    setSaving(true);
    try {
      const themeToSave: BibleTheme = {
        id: isEditing && !duplicate ? editTheme!.id : uid(),
        name: name.trim() || "Untitled Theme",
        description: description.trim(),
        source: "custom",
        templateType: tab,
        categories,
        settings: { ...settings },
        ...(activeRawTemplate ? { rawTemplate: activeRawTemplate } : {}),
        createdAt: isEditing && !duplicate ? editTheme!.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveCustomTheme(themeToSave);
      try { await addBibleFavorite(themeToSave.id); } catch { /* ok */ }
      await loadThemeLibrary();
      onSaved?.(themeToSave);
      onClose();
    } catch {
      // save failed
    } finally {
      setSaving(false);
    }
  }, [name, description, categories, tab, settings, activeRawTemplate, onSaved, onClose, isEditing, editTheme, loadThemeLibrary]);

  const handleSave = useCallback(() => { saveTheme(false); }, [saveTheme]);
  const handleDuplicate = useCallback(() => { saveTheme(true); }, [saveTheme]);

  const handleDelete = useCallback(async () => {
    if (isEditing && editTheme) {
      await handleDeleteTheme(editTheme.id);
      handleNewTheme();
    }
  }, [isEditing, editTheme, handleDeleteTheme, handleNewTheme]);

  // ── Background Picker helpers ──
  const [bgPickerColor, setBgPickerColor] = useState(settings.backgroundColor);
  const bgPickerInputColor = /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(bgPickerColor) ? bgPickerColor : "#000000";

  const handleBgColorPickerConfirm = useCallback(() => {
    patch(tab === "fullscreen" ? { backgroundColor: bgPickerColor } : { boxBackground: bgPickerColor });
    setShowBackgroundModal(false);
  }, [bgPickerColor, patch, tab]);

  const handleBgTransparent = useCallback(() => {
    patch(
      tab === "fullscreen"
        ? { backgroundColor: "transparent", backgroundImage: "", backgroundVideo: "" }
        : { boxBackground: "transparent", boxBackgroundImage: "" }
    );
    setShowBackgroundModal(false);
  }, [patch, tab]);

  const handleBgSelectImage = useCallback(
    (url: string) => {
      patch(tab === "fullscreen" ? { backgroundImage: url, backgroundColor: "transparent" } : { boxBackgroundImage: url, boxBackground: "transparent" });
      setShowBackgroundModal(false);
    },
    [patch, tab],
  );

  const handleBgSelectVideo = useCallback(
    (url: string) => {
      patch({ backgroundVideo: url, backgroundImage: "" });
      setShowBackgroundModal(false);
    },
    [patch],
  );

  const handleBgSelectPattern = useCallback(
    (src: string) => {
      patch(tab === "fullscreen" ? { backgroundImage: src, backgroundColor: "transparent", backgroundVideo: "" } : { boxBackgroundImage: src, boxBackground: "transparent" });
      setShowBackgroundModal(false);
    },
    [patch, tab],
  );

  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);

  const showBibleTab = categories.includes("bible");
  const showWorshipTab = categories.includes("worship");

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div className="tc-editor">
      {/* ── Top Toolbar ── */}
      <div className="tc-toolbar">
        <div className="tc-toolbar-left">
          <button
            className="tc-toolbar-btn"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="tc-toolbar-btn"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 size={16} />
          </button>
          <div className="tc-toolbar-separator" />
          <input
            className="tc-theme-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Theme name..."
          />
        </div>
        <div className="tc-toolbar-center">
          <div className="tc-layout-switcher">
            <button
              className={`tc-layout-btn${tab === "fullscreen" ? " active" : ""}`}
              onClick={() => setTab("fullscreen")}
            >
              <Monitor size={14} />
              Fullscreen
            </button>
            <button
              className={`tc-layout-btn${tab === "lower-third" ? " active" : ""}`}
              onClick={() => setTab("lower-third")}
            >
              <LayoutGrid size={14} />
              Lower Third
            </button>
          </div>
        </div>
        <div className="tc-toolbar-right">
          <button className="tc-toolbar-btn" onClick={handleDuplicate} title="Duplicate">
            <Copy size={16} />
          </button>
          <button className="tc-toolbar-btn" onClick={handleDelete} title="Delete" disabled={!isEditing}>
            <Trash2 size={16} />
          </button>
          <button className="tc-toolbar-btn tc-toolbar-btn--save" onClick={handleSave} disabled={saving}>
            <Save size={16} />
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="tc-toolbar-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── 3-Panel Layout ── */}
      <div className="tc-panels">
        {/* ═══ Left Panel: Theme Library ═══ */}
        <aside className="tc-library">
          <div className="tc-library-header">
            <span className="tc-library-title">THEME LIBRARY</span>
          </div>

          <div className="tc-library-search">
            <Search size={14} className="tc-library-search-icon" />
            <input
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search themes…"
              className="tc-library-search-input"
            />
          </div>

          <div className="tc-layout-filter-tabs">
            {([
              { value: "all" as LayoutFilter, label: "All" },
              { value: "fullscreen" as LayoutFilter, label: "Fullscreen" },
              { value: "lower-third" as LayoutFilter, label: "Lower Third" },
            ]).map((f) => (
              <button
                key={f.value}
                className={`tc-layout-filter-btn${libraryFilter === f.value ? " active" : ""}`}
                onClick={() => setLibraryFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="tc-library-grid">
            {filteredThemes.length === 0 && (
              <div className="tc-library-empty">
                <Monitor size={32} />
                <span>No themes yet</span>
              </div>
            )}
            {filteredThemes.map((theme) => (
              <div
                key={theme.id}
                className={`tc-theme-card${editTheme?.id === theme.id ? " active" : ""}`}
                onClick={() => handleLoadTheme(theme)}
              >
                <div
                  className="tc-theme-card-thumb"
                  style={{
                    backgroundColor: theme.rawTemplate?.accentColor
                      ? `${theme.rawTemplate.accentColor}22`
                      : theme.settings.backgroundColor !== "transparent"
                        ? theme.settings.backgroundColor
                        : "#1a1a2e",
                  }}
                >
                  {theme.preview ? (
                    <img src={theme.preview} alt={theme.name} />
                  ) : (
                    <div className="tc-theme-card-thumb-placeholder">
                      <Monitor size={20} />
                    </div>
                  )}
                  {theme.source === "builtin" && (
                    <div className="tc-theme-card-badge">Built-in</div>
                  )}
                  {theme.source !== "builtin" && (
                    <div className="tc-theme-card-overlay">
                      <button
                        className="tc-theme-card-action"
                        title="Delete theme"
                        onClick={(e) => { e.stopPropagation(); handleDeleteTheme(theme.id); }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="tc-theme-card-info">
                  <div className="tc-theme-card-name">{theme.name}</div>
                  <div className="tc-theme-card-meta">
                    <span className="tc-theme-card-category">{theme.templateType}</span>
                    {theme.rawTemplate && (
                      <span className="tc-theme-card-source" style={{ color: theme.rawTemplate.accentColor }}>
                        {theme.category || "bible"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="tc-library-footer">
            <button className="tc-library-action-btn" onClick={handleNewTheme}>
              <Plus size={14} />
              New
            </button>
            <button className="tc-library-action-btn" onClick={handleImportTheme}>
              <Upload size={14} />
              Import
            </button>
            <button className="tc-library-action-btn" onClick={handleExportTheme}>
              <Download size={14} />
              Export
            </button>
          </div>
        </aside>

        {/* ═══ Center Panel: Live Preview ═══ */}
        <main className="tc-preview-area">
          <div className="tc-preview-wrapper" ref={previewWrapperRef}>
            <div className="tv-screen">
              <div
                className="preview-canvas"
                style={{ transform: canvasTransform }}
              >
                <iframe
                  key={previewFrameKey}
                  srcDoc={previewHtml}
                  sandbox="allow-same-origin"
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                    pointerEvents: "none",
                  }}
                  title="Theme Preview"
                />

                {/* Safe Area overlay */}
                {showSafeArea && (
                  <div
                    className="tc-safe-area-overlay"
                    style={{
                      position: "absolute",
                      inset: 0,
                      border: `1px dashed rgba(29,78,216,0.5)`,
                      pointerEvents: "none",
                      margin: `${settings.safeArea}px`,
                    }}
                  />
                )}

                {/* Grid overlay */}
                {showGrid && (
                  <div
                    className="tc-grid-overlay"
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      backgroundImage:
                        "linear-gradient(rgba(29,78,216,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(29,78,216,0.15) 1px, transparent 1px)",
                      backgroundSize: "192px 108px",
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Output Info Bar */}
          <div className="tc-output-bar">
            <span className="tc-output-info">1920 × 1080</span>
            <span className="tc-output-info">16:9</span>
            <div className="tc-output-separator" />
            <label className="tc-overlay-toggle">
              <input
                type="checkbox"
                checked={showSafeArea}
                onChange={(e) => setShowSafeArea(e.target.checked)}
              />
              <Eye size={12} />
              Safe Area
            </label>
            <label className="tc-overlay-toggle">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              <Grid3X3 size={12} />
              Grid
            </label>
          </div>

          {/* Zoom Controls */}
          <div className="tc-zoom-controls">
            {(["fit", 50, 75, 100, 125] as const).map((mode) => (
              <button
                key={mode}
                className={`tc-zoom-btn${previewZoom === mode ? " active" : ""}`}
                onClick={() => setPreviewZoom(mode)}
              >
                {mode === "fit" ? "Fit" : `${mode}%`}
              </button>
            ))}
          </div>
        </main>

        {/* ═══ Right Panel: Property Inspector ═══ */}
        <aside className="tc-inspector">
          <div className="tc-inspector-header">
            <span className="tc-inspector-title">INSPECTOR</span>
          </div>

          <div className="tc-inspector-tabs">
            {INSPECTOR_TABS.filter((t) => {
              if (t.key === "bible" && !showBibleTab) return false;
              if (t.key === "worship" && !showWorshipTab) return false;
              return true;
            }).map((t) => (
              <button
                key={t.key}
                className={`tc-inspector-tab${inspectorTab === t.key ? " active" : ""}`}
                onClick={() => setInspectorTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="tc-inspector-content">
            {/* ── Typography Tab ── */}
            {inspectorTab === "typography" && (
              <div className="tc-inspector-panel">
                <div className="typography-row">
                  <div
                    className="select-box"
                    style={{ position: "relative" }}
                    onClick={() => setFontDropdownOpen((v) => !v)}
                  >
                    <span>{FONT_FAMILY_LABELS[settings.fontFamily] ?? "Select"}</span>
                    <ChevronDown size={14} className="panel-header-icon" />
                    {fontDropdownOpen && (
                      <div className="tc-font-dropdown" onClick={(e) => e.stopPropagation()}>
                        {FONT_FAMILIES.map((f) => (
                          <div
                            key={f}
                            className={`tc-font-option${settings.fontFamily === f ? " active" : ""}`}
                            style={{ fontFamily: f }}
                            onClick={() => {
                              patch({ fontFamily: f });
                              setFontDropdownOpen(false);
                            }}
                          >
                            {FONT_FAMILY_LABELS[f] ?? f}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="value-box" style={{ display: "flex", gap: 0, padding: 0, overflow: "hidden" }}>
                    <button
                      onClick={() => patch({ fontSize: Math.max(8, settings.fontSize - 2) })}
                      style={{ background: "none", border: "none", color: "var(--on-surface)", cursor: "pointer", padding: "2px 6px", fontSize: 14, lineHeight: 1 }}
                    >
                      −
                    </button>
                    <span style={{ fontSize: 13, minWidth: 28, textAlign: "center", lineHeight: "26px" }}>{settings.fontSize}</span>
                    <button
                      onClick={() => patch({ fontSize: Math.min(200, settings.fontSize + 2) })}
                      style={{ background: "none", border: "none", color: "var(--on-surface)", cursor: "pointer", padding: "2px 6px", fontSize: 14, lineHeight: 1 }}
                    >
                      +
                    </button>
                  </div>
                  <label
                    className="color-box"
                    style={{ backgroundColor: settings.fontColor }}
                  >
                    <input
                      type="color"
                      value={settings.fontColor}
                      onChange={(e) => patch({ fontColor: e.target.value })}
                      style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
                    />
                  </label>
                </div>

                {/* Format row */}
                <div className="format-group">
                  <button
                    className={`format-btn${settings.fontWeight === "bold" ? " active" : ""}`}
                    onClick={() => patch({ fontWeight: settings.fontWeight === "bold" ? "normal" : "bold" })}
                  >
                    <Bold size={16} />
                  </button>
                  <div className="format-divider" />
                  <button
                    className={`format-btn${settings.fontStyle === "italic" ? " active" : ""}`}
                    onClick={() => patch({ fontStyle: settings.fontStyle === "italic" ? "normal" : "italic" })}
                  >
                    <Italic size={16} />
                  </button>
                  <div className="format-divider" />
                  <button className="format-btn">
                    <Underline size={16} />
                  </button>
                  <div className="format-divider" />
                  <button className="format-btn">
                    <Strikethrough size={16} />
                  </button>
                </div>

                {/* Casing row */}
                <div className="case-group">
                  {([
                    { value: "uppercase" as const, label: "Uppercase" },
                    { value: "lowercase" as const, label: "lowercase" },
                    { value: "capitalize" as const, label: "Title Case" },
                  ]).map((c) => (
                    <button
                      key={c.value}
                      className={`case-btn${settings.textTransform === c.value ? " active" : ""}`}
                      onClick={() => patch({ textTransform: settings.textTransform === c.value ? "none" : c.value })}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Sliders */}
                <div className="slider-row">
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>PAD</span>
                    <input
                      type="range"
                      min={0}
                      max={120}
                      value={settings.padding}
                      onChange={(e) => patch({ padding: Number(e.target.value) })}
                    />
                    <div className="slider-val">{settings.padding}</div>
                  </div>
                  <div className="slider-wrapper flex-1">
                    <span>LINE</span>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.1}
                      value={settings.lineHeight}
                      onChange={(e) => patch({ lineHeight: Number(e.target.value) })}
                    />
                  </div>
                </div>

                {/* Alignment row */}
                <div className="format-group" style={{ marginTop: "4px" }}>
                  {([
                    { value: "left" as const, IconComp: AlignLeft },
                    { value: "center" as const, IconComp: AlignCenter },
                    { value: "right" as const, IconComp: AlignRight },
                  ]).map((a, i) => (
                    <React.Fragment key={a.value}>
                      {i > 0 && <div className="format-divider" />}
                      <button
                        className={`format-btn${settings.textAlign === a.value ? " active" : ""}`}
                        onClick={() => patch({ textAlign: a.value })}
                      >
                        <a.IconComp size={16} />
                      </button>
                    </React.Fragment>
                  ))}
                  <div className="format-divider" />
                  <button className="format-btn">
                    <AlignJustify size={16} />
                  </button>
                </div>

                {/* Text Shadow */}
                <div className="slider-row" style={{ marginTop: "8px" }}>
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>SHADOW</span>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      step={1}
                      value={settings.textShadow !== "none" ? (Number(settings.textShadow.match(/(\d+)px/)?.[1]) || 0) : 0}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        patch({ textShadow: v > 0 ? `0 2px ${v}px rgba(0,0,0,0.6)` : "none" });
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Content Tab ── */}
            {inspectorTab === "content" && (
              <div className="tc-inspector-panel">
                <div className="tc-inspector-section-title">REFERENCE LABEL</div>

                {/* Position */}
                <div className="case-group">
                  {([
                    { value: "top" as const, label: "Above verse" },
                    { value: "bottom" as const, label: "Below verse" },
                  ]).map((p) => (
                    <button
                      key={p.value}
                      className={`case-btn${settings.refPosition === p.value ? " active" : ""}`}
                      onClick={() => patch({ refPosition: p.value })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Font Size */}
                <div className="slider-row">
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>FONT SIZE</span>
                    <input
                      type="range"
                      min={12}
                      max={72}
                      step={1}
                      value={settings.refFontSize}
                      onChange={(e) => patch({ refFontSize: Number(e.target.value) })}
                    />
                    <div className="slider-val">{settings.refFontSize}px</div>
                  </div>
                </div>

                {/* Weight */}
                <div className="case-group" style={{ marginTop: "8px" }}>
                  {([
                    { value: "light" as const, label: "Light" },
                    { value: "normal" as const, label: "Normal" },
                    { value: "bold" as const, label: "Bold" },
                  ]).map((w) => (
                    <button
                      key={w.value}
                      className={`case-btn${settings.refFontWeight === w.value ? " active" : ""}`}
                      style={{ fontWeight: w.value === "bold" ? 700 : w.value === "light" ? 300 : 500 }}
                      onClick={() => patch({ refFontWeight: w.value })}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>

                {/* Color */}
                <div className="typography-row" style={{ marginTop: "8px", marginBottom: "8px" }}>
                  <span className="tc-label-mono">COLOR</span>
                  <label
                    className="color-box"
                    style={{ backgroundColor: settings.refFontColor }}
                  >
                    <input
                      type="color"
                      value={settings.refFontColor}
                      onChange={(e) => patch({ refFontColor: e.target.value })}
                      style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
                    />
                  </label>
                </div>

                {/* Text Case */}
                <div className="case-group">
                  {([
                    { value: "none" as const, label: "Normal" },
                    { value: "uppercase" as const, label: "UPPER" },
                    { value: "lowercase" as const, label: "lower" },
                    { value: "capitalize" as const, label: "Title" },
                  ]).map((c) => (
                    <button
                      key={c.value}
                      className={`case-btn${settings.refTextTransform === c.value ? " active" : ""}`}
                      onClick={() => patch({ refTextTransform: c.value })}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Alignment */}
                <div className="case-group">
                  {([
                    { value: "match" as const, label: "Match verse" },
                    { value: "left" as const, label: "Left" },
                    { value: "center" as const, label: "Center" },
                    { value: "right" as const, label: "Right" },
                  ]).map((a) => (
                    <button
                      key={a.value}
                      className={`case-btn${settings.refTextAlign === a.value ? " active" : ""}`}
                      onClick={() => patch({ refTextAlign: a.value })}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>

                {/* Letter Spacing */}
                <div className="slider-row" style={{ marginTop: "8px" }}>
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>LETTER SPACING</span>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={settings.refLetterSpacing}
                      onChange={(e) => patch({ refLetterSpacing: Number(e.target.value) })}
                    />
                    <div className="slider-val">{settings.refLetterSpacing}px</div>
                  </div>
                </div>

                {/* Spacing */}
                <div className="slider-row" style={{ marginTop: "8px" }}>
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>SPACING</span>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      step={1}
                      value={settings.refSpacing}
                      onChange={(e) => patch({ refSpacing: Number(e.target.value) })}
                    />
                    <div className="slider-val">{settings.refSpacing}px</div>
                  </div>
                </div>

                {/* Opacity */}
                <div className="slider-row" style={{ marginTop: "8px" }}>
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>OPACITY</span>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={1}
                      value={Math.round(settings.refOpacity * 100)}
                      onChange={(e) => patch({ refOpacity: Number(e.target.value) / 100 })}
                    />
                    <div className="slider-val">{Math.round(settings.refOpacity * 100)}%</div>
                  </div>
                </div>

                {/* Reference Background */}
                <div className="tc-inspector-divider">
                  <div className="tc-inspector-toggle-row">
                    <span className="tc-label-mono">REF BACKGROUND</span>
                    <button
                      className="tc-toggle-switch"
                      data-active={settings.referenceBackgroundEnabled}
                      onClick={() => patch({ referenceBackgroundEnabled: !settings.referenceBackgroundEnabled })}
                    >
                      <span className="tc-toggle-knob" />
                    </button>
                  </div>
                  {settings.referenceBackgroundEnabled && (
                    <>
                      <div className="typography-row" style={{ marginBottom: "8px" }}>
                        <span className="tc-label-mono">COLOR</span>
                        <label
                          className="color-box"
                          style={{ backgroundColor: settings.referenceBackgroundColor }}
                        >
                          <input
                            type="color"
                            value={settings.referenceBackgroundColor}
                            onChange={(e) => patch({ referenceBackgroundColor: e.target.value })}
                            style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
                          />
                        </label>
                      </div>
                      <div className="case-group" style={{ marginBottom: "8px" }}>
                        {([
                          { value: "solid" as const, label: "Solid" },
                          { value: "pill" as const, label: "Pill" },
                          { value: "outline" as const, label: "Outline" },
                        ]).map((s) => (
                          <button
                            key={s.value}
                            className={`case-btn${settings.referenceBackgroundStyle === s.value ? " active" : ""}`}
                            onClick={() => patch({ referenceBackgroundStyle: s.value })}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                      <div className="slider-row">
                        <div className="slider-wrapper" style={{ flex: 1 }}>
                          <span>ROUNDNESS</span>
                          <input
                            type="range"
                            min={0}
                            max={40}
                            step={1}
                            value={settings.referenceBackgroundRadius}
                            onChange={(e) => patch({ referenceBackgroundRadius: Number(e.target.value) })}
                          />
                          <div className="slider-val">{settings.referenceBackgroundRadius}px</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Background Tab ── */}
            {inspectorTab === "background" && (
              <div className="tc-inspector-panel">
                <div
                  className="bg-row"
                  onClick={openBackgroundModal}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBackgroundModal(); } }}
                >
                  <div className="bg-thumb">
                    {activeBackgroundPreviewSrc ? (
                      <img src={activeBackgroundPreviewSrc} alt="Background" />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: backgroundColorValue !== "transparent" ? backgroundColorValue : "var(--tc-outline-variant)" }} />
                    )}
                  </div>
                  <div className="bg-info">
                    <div className="bg-title">{backgroundPreviewTypeLabel}</div>
                    <div className="bg-subtitle">{backgroundPreviewNameLabel}</div>
                    <div className="bg-action-hint">Click to change background</div>
                  </div>
                  <button
                    className="bg-change-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openBackgroundModal();
                    }}
                  >
                    Change
                  </button>
                </div>

                <div className="opacity-row">
                  <span>OPACITY</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={backgroundOpacityPercent}
                    onChange={(e) => patch({ backgroundOpacity: Number(e.target.value) / 100 })}
                  />
                  <span>{backgroundOpacityPercent}%</span>
                </div>

                {/* Shade */}
                <div className="tc-inspector-divider">
                  <div className="tc-inspector-toggle-row">
                    <span className="tc-label-mono">READABILITY SHADE</span>
                    <button
                      className="tc-toggle-switch"
                      data-active={settings.fullscreenShadeEnabled}
                      onClick={() => patch({ fullscreenShadeEnabled: !settings.fullscreenShadeEnabled })}
                    >
                      <span className="tc-toggle-knob" />
                    </button>
                  </div>
                  {settings.fullscreenShadeEnabled && (
                    <>
                      <div className="typography-row" style={{ marginBottom: "8px" }}>
                        <span className="tc-label-mono">COLOR</span>
                        <label
                          className="color-box"
                          style={{ backgroundColor: settings.fullscreenShadeColor }}
                        >
                          <input
                            type="color"
                            value={settings.fullscreenShadeColor}
                            onChange={(e) => patch({ fullscreenShadeColor: e.target.value })}
                            style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
                          />
                        </label>
                      </div>
                      <div className="slider-row">
                        <div className="slider-wrapper" style={{ flex: 1 }}>
                          <span>OPACITY</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={Math.round(settings.fullscreenShadeOpacity * 100)}
                            onChange={(e) => patch({ fullscreenShadeOpacity: Number(e.target.value) / 100 })}
                          />
                          <div className="slider-val">{Math.round(settings.fullscreenShadeOpacity * 100)}%</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Logo */}
                <div className="tc-inspector-divider">
                  <div className="tc-inspector-section-title">LOGO</div>
                  <div className="typography-row" style={{ marginBottom: "8px" }}>
                    <span className="tc-label-mono">URL</span>
                    <input
                      type="text"
                      className="tc-text-input"
                      value={settings.logoUrl}
                      onChange={(e) => patch({ logoUrl: e.target.value })}
                      placeholder="Logo URL…"
                    />
                  </div>
                  {settings.logoUrl && (
                    <>
                      <div className="case-group">
                        {([
                          { value: "top-left" as const, label: "TL" },
                          { value: "top-right" as const, label: "TR" },
                          { value: "bottom-left" as const, label: "BL" },
                          { value: "bottom-right" as const, label: "BR" },
                        ]).map((p) => (
                          <button
                            key={p.value}
                            className={`case-btn${settings.logoPosition === p.value ? " active" : ""}`}
                            onClick={() => patch({ logoPosition: p.value })}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <div className="slider-row">
                        <div className="slider-wrapper" style={{ flex: 1 }}>
                          <span>SIZE</span>
                          <input
                            type="range"
                            min={20}
                            max={200}
                            step={5}
                            value={settings.logoSize}
                            onChange={(e) => patch({ logoSize: Number(e.target.value) })}
                          />
                          <div className="slider-val">{settings.logoSize}px</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Layout Tab ── */}
            {inspectorTab === "layout" && (
              <div className="tc-inspector-panel">
                <div className="tc-inspector-section-title">SPACING & SAFE AREA</div>

                <div className="slider-row">
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>PADDING</span>
                    <input
                      type="range"
                      min={0}
                      max={120}
                      value={settings.padding}
                      onChange={(e) => patch({ padding: Number(e.target.value) })}
                    />
                    <div className="slider-val">{settings.padding}px</div>
                  </div>
                </div>

                <div className="slider-row">
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>SAFE AREA</span>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={settings.safeArea}
                      onChange={(e) => patch({ safeArea: Number(e.target.value) })}
                    />
                    <div className="slider-val">{settings.safeArea}px</div>
                  </div>
                </div>

                <div className="slider-row">
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>BORDER RADIUS</span>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={settings.borderRadius}
                      onChange={(e) => patch({ borderRadius: Number(e.target.value) })}
                    />
                    <div className="slider-val">{settings.borderRadius}px</div>
                  </div>
                </div>

                {tab === "lower-third" && (
                  <>
                    <div className="tc-inspector-divider">
                      <div className="tc-inspector-section-title">LOWER THIRD LAYOUT</div>

                      {/* Position */}
                      <div className="case-group">
                        {([
                          { value: "left" as const, label: "Left" },
                          { value: "center" as const, label: "Center" },
                          { value: "right" as const, label: "Right" },
                        ]).map((p) => (
                          <button
                            key={p.value}
                            className={`case-btn${settings.lowerThirdPosition === p.value ? " active" : ""}`}
                            onClick={() => patch({ lowerThirdPosition: p.value })}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>

                      {/* Width Preset */}
                      <div className="case-group">
                        {LT_WIDTHS.map((w) => (
                          <button
                            key={w.value}
                            className={`case-btn${settings.lowerThirdWidthPreset === w.value ? " active" : ""}`}
                            onClick={() => patch({ lowerThirdWidthPreset: w.value })}
                          >
                            {w.label}
                          </button>
                        ))}
                      </div>

                      {/* Height */}
                      <div className="slider-row">
                        <div className="slider-wrapper" style={{ flex: 1 }}>
                          <span>HEIGHT</span>
                          <input
                            type="range"
                            min={0}
                            max={650}
                            step={10}
                            value={settings.lowerThirdHeight}
                            onChange={(e) => patch({ lowerThirdHeight: Number(e.target.value) })}
                          />
                          <div className="slider-val">{settings.lowerThirdHeight || "Auto"}</div>
                        </div>
                      </div>

                      {/* Offset X */}
                      <div className="slider-row">
                        <div className="slider-wrapper" style={{ flex: 1 }}>
                          <span>OFFSET X</span>
                          <input
                            type="range"
                            min={-500}
                            max={500}
                            value={settings.lowerThirdOffsetX}
                            onChange={(e) => patch({ lowerThirdOffsetX: Number(e.target.value) })}
                          />
                          <div className="slider-val">{settings.lowerThirdOffsetX}px</div>
                        </div>
                      </div>

                      {/* Box Background */}
                      <div className="typography-row" style={{ marginBottom: "8px" }}>
                        <span className="tc-label-mono">BOX BG</span>
                        <label
                          className="color-box"
                          style={{ backgroundColor: settings.boxBackground }}
                        >
                          <input
                            type="color"
                            value={settings.boxBackground !== "transparent" ? settings.boxBackground : "#000000"}
                            onChange={(e) => patch({ boxBackground: e.target.value })}
                            style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
                          />
                        </label>
                      </div>

                      <div className="slider-row">
                        <div className="slider-wrapper" style={{ flex: 1 }}>
                          <span>BOX OPACITY</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={Math.round(settings.boxOpacity * 100)}
                            onChange={(e) => patch({ boxOpacity: Number(e.target.value) / 100 })}
                          />
                          <div className="slider-val">{Math.round(settings.boxOpacity * 100)}%</div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Bible Tab ── */}
            {inspectorTab === "bible" && showBibleTab && (
              <div className="tc-inspector-panel">
                <div className="tc-inspector-section-title">BIBLE DISPLAY</div>
                <div className="tc-inspector-hint">
                  Bible verse display settings. Adjust reference label in the Content tab.
                </div>

                <div className="case-group">
                  {([
                    { value: "top" as const, label: "Ref Above" },
                    { value: "bottom" as const, label: "Ref Below" },
                  ]).map((p) => (
                    <button
                      key={p.value}
                      className={`case-btn${settings.refPosition === p.value ? " active" : ""}`}
                      onClick={() => patch({ refPosition: p.value })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="slider-row">
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>TEXT SIZE</span>
                    <input
                      type="range"
                      min={12}
                      max={200}
                      step={2}
                      value={settings.fontSize}
                      onChange={(e) => patch({ fontSize: Number(e.target.value) })}
                    />
                    <div className="slider-val">{settings.fontSize}px</div>
                  </div>
                </div>

                <div className="slider-row">
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>REF SIZE</span>
                    <input
                      type="range"
                      min={12}
                      max={72}
                      step={1}
                      value={settings.refFontSize}
                      onChange={(e) => patch({ refFontSize: Number(e.target.value) })}
                    />
                    <div className="slider-val">{settings.refFontSize}px</div>
                  </div>
                </div>

                <div className="tc-inspector-divider">
                  <div className="tc-inspector-toggle-row">
                    <span className="tc-label-mono">TEXT OUTLINE</span>
                    <button
                      className="tc-toggle-switch"
                      data-active={settings.textOutline}
                      onClick={() => patch({ textOutline: !settings.textOutline })}
                    >
                      <span className="tc-toggle-knob" />
                    </button>
                  </div>
                  {settings.textOutline && (
                    <>
                      <div className="typography-row" style={{ marginBottom: "8px" }}>
                        <span className="tc-label-mono">OUTLINE COLOR</span>
                        <label
                          className="color-box"
                          style={{ backgroundColor: settings.textOutlineColor }}
                        >
                          <input
                            type="color"
                            value={settings.textOutlineColor}
                            onChange={(e) => patch({ textOutlineColor: e.target.value })}
                            style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
                          />
                        </label>
                      </div>
                      <div className="slider-row">
                        <div className="slider-wrapper" style={{ flex: 1 }}>
                          <span>WIDTH</span>
                          <input
                            type="range"
                            min={1}
                            max={8}
                            step={0.5}
                            value={settings.textOutlineWidth}
                            onChange={(e) => patch({ textOutlineWidth: Number(e.target.value) })}
                          />
                          <div className="slider-val">{settings.textOutlineWidth}px</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Worship Tab ── */}
            {inspectorTab === "worship" && showWorshipTab && (
              <div className="tc-inspector-panel">
                <div className="tc-inspector-section-title">WORSHIP DISPLAY</div>
                <div className="tc-inspector-hint">
                  Worship/lyrics display settings. Typography and layout apply globally.
                </div>

                <div className="slider-row">
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>TEXT SIZE</span>
                    <input
                      type="range"
                      min={12}
                      max={200}
                      step={2}
                      value={settings.fontSize}
                      onChange={(e) => patch({ fontSize: Number(e.target.value) })}
                    />
                    <div className="slider-val">{settings.fontSize}px</div>
                  </div>
                </div>

                <div className="slider-row">
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>LINE HEIGHT</span>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.1}
                      value={settings.lineHeight}
                      onChange={(e) => patch({ lineHeight: Number(e.target.value) })}
                    />
                    <div className="slider-val">{settings.lineHeight}</div>
                  </div>
                </div>

                <div className="case-group">
                  {([
                    { value: "left" as const, label: "Left" },
                    { value: "center" as const, label: "Center" },
                    { value: "right" as const, label: "Right" },
                  ]).map((a) => (
                    <button
                      key={a.value}
                      className={`case-btn${settings.textAlign === a.value ? " active" : ""}`}
                      onClick={() => patch({ textAlign: a.value })}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Animation Tab ── */}
            {inspectorTab === "animation" && (
              <div className="tc-inspector-panel">
                <div className="tc-inspector-section-title">ANIMATION</div>
                <div className="btn-group" style={{ flexWrap: "wrap", gap: "4px" }}>
                  {[
                    { value: "none" as const, label: "None" },
                    { value: "fade" as const, label: "Fade" },
                    { value: "slide-up" as const, label: "Slide Up" },
                    { value: "slide-left" as const, label: "Slide Left" },
                    { value: "scale-in" as const, label: "Scale" },
                    { value: "reveal-bg-then-text" as const, label: "Reveal" },
                  ].map((a) => (
                    <button
                      key={a.value}
                      className={`btn-tab${settings.animation === a.value ? " active" : ""}`}
                      onClick={() => patch({ animation: a.value })}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                <div className="slider-row" style={{ marginTop: "10px" }}>
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>DURATION</span>
                    <input
                      type="range"
                      min={100}
                      max={1500}
                      step={50}
                      value={settings.animationDuration}
                      onChange={(e) => patch({ animationDuration: Number(e.target.value) })}
                    />
                    <div className="slider-val">{settings.animationDuration}ms</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Background Picker Modal ── */}
      {showBackgroundModal && (
        <div className="tc-modal-overlay" onClick={() => setShowBackgroundModal(false)}>
          <div className="tc-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="tc-modal-header">
              <span>Choose Background</span>
              <button className="icon-btn" onClick={() => setShowBackgroundModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="tc-modal-tabs">
              {BACKGROUND_PICKER_TABS.map((t) => (
                <button
                  key={t.value}
                  className={`tc-modal-tab${bgTab === t.value ? " active" : ""}`}
                  onClick={() => setBgTab(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="tc-modal-body">
              <input
                ref={bgImportInputRef}
                type="file"
                accept={MEDIA_FILE_ACCEPT}
                style={{ display: "none" }}
                onChange={handleBgImportFile}
              />
              {bgTab === "color" && (
                <div className="tc-color-grid">
                  {BACKGROUND_COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      className={`tc-color-swatch${bgPickerColor === swatch ? " active" : ""}`}
                      style={{ backgroundColor: swatch }}
                      onClick={() => setBgPickerColor(swatch)}
                    />
                  ))}
                  <div className="tc-color-custom">
                    <input
                      type="color"
                      value={bgPickerInputColor}
                      onChange={(e) => setBgPickerColor(e.target.value)}
                    />
                    <span>{bgPickerColor}</span>
                  </div>
                </div>
              )}
              {bgTab === "transparent" && (
                <div className="tc-transparent-option">
                  <button className="tc-transparent-btn" onClick={handleBgTransparent}>
                    Transparent Background
                  </button>
                </div>
              )}
              {(bgTab === "my-images" || bgTab === "images") && (
                <div className="tc-media-grid">
                  <button
                    className="tc-media-thumb tc-media-thumb--import"
                    onClick={() => bgImportInputRef.current?.click()}
                  >
                    <Plus size={20} />
                    <span>Import</span>
                  </button>
                  {backgroundMediaLibrary
                    .filter((item) => item.type === "image")
                    .map((item) => (
                      <button
                        key={item.id}
                        className="tc-media-thumb"
                        onClick={() => handleBgSelectImage(item.url)}
                      >
                        <img src={resolveMediaPreviewSrc(item)} alt={item.name} />
                      </button>
                    ))}
                </div>
              )}
              {(bgTab === "my-videos" || bgTab === "template-videos") && (
                <div className="tc-media-grid">
                  {bgTab === "template-videos"
                    ? templateVideoAssets.map((asset) => {
                      const downloaded = findTemplateVideoDownload(asset);
                      return (
                        <div key={asset.id} className="tc-media-thumb tc-media-thumb--video">
                          <TemplateVideoPreview asset={asset} />
                          {!downloaded ? (
                            <button
                              className="tc-media-download"
                              onClick={() => handleTemplateVideoDownload(asset)}
                            >
                              <Icon name="download" size={16} />
                            </button>
                          ) : (
                            <button
                              className="tc-media-download tc-media-download--done"
                              onClick={() => handleBgSelectVideo(downloaded.url)}
                            >
                              <Icon name="check" size={16} />
                            </button>
                          )}
                        </div>
                      );
                    })
                    : <>
                      <button
                        className="tc-media-thumb tc-media-thumb--import"
                        onClick={() => bgImportInputRef.current?.click()}
                      >
                        <Plus size={20} />
                        <span>Import</span>
                      </button>
                      {backgroundMediaLibrary
                        .filter((item) => item.type === "video")
                        .map((item) => (
                          <button
                            key={item.id}
                            className="tc-media-thumb tc-media-thumb--video"
                            onClick={() => handleBgSelectVideo(item.url)}
                          >
                            {item.thumbnailUrl ? (
                              <img src={item.thumbnailUrl} alt={item.name} />
                            ) : (
                              <Icon name="videocam" size={24} />
                            )}
                          </button>
                        ))}
                    </>
                  }
                </div>
              )}
              {bgTab === "patterns" && (
                <div className="tc-media-grid">
                  {BACKGROUND_PATTERNS.map((p) => (
                    <button
                      key={p.label}
                      className="tc-media-thumb"
                      onClick={() => handleBgSelectPattern(p.src)}
                    >
                      <img src={p.src} alt={p.label} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {bgTab === "color" && (
              <div className="tc-modal-footer">
                <button className="tc-modal-confirm" onClick={handleBgColorPickerConfirm}>
                  Apply Color
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
