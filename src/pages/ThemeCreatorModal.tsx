/**
 * ThemeCreatorModal.tsx — Create new fullscreen & lower-third Bible themes
 *
 * Layout matches UpdatedModalForThemes exactly.
 * Uses app.css design tokens for colors/fonts/theme only.
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
  Image as ImageIcon,
  Link,
  Type,
  Bookmark,
  LayoutGrid,
  BookOpen,
  Plus,
} from "lucide-react";
import type {
  BibleTheme,
  BibleThemeCategory,
  BibleThemeSettings,
  LowerThirdWidthPreset,
} from "../bible/types";
import { DEFAULT_THEME_SETTINGS } from "../bible/types";
import { saveCustomTheme } from "../bible/bibleDb";
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type CreatorTab = "fullscreen" | "lower-third";
type BackgroundPickerTab =
  | "my-images"
  | "my-videos"
  | "template-videos"
  | "images"
  | "patterns"
  | "animations"
  | "color"
  | "transparent";

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
  // { value: "animations", label: "Animations" },
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
  {
    full: 0,
    sm: 120,
    md: 240,
    lg: 360,
    xl: 520,
    xxl: 680,
  }
);

const OBS_CANVAS_WIDTH = 1920;
const LT_MIN_WIDTH = 480;

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

interface PreviewOptions {
  showVerse: boolean;
  showRef: boolean;
  abbreviateBooks: boolean;
}

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

  const [tab, setTab] = useState<CreatorTab>("fullscreen");
  const [saving, setSaving] = useState(false);

  const [name] = useState(editTheme?.name || "");
  const [description] = useState(editTheme?.description || "");
  const [categories, setCategories] = useState<BibleThemeCategory[]>(
    () => normalizeCategories(editTheme?.categories || (initialCategory ? [initialCategory] : []))
  );

  const [settings, setSettings] = useState<BibleThemeSettings>(() =>
    editTheme?.settings
      ? normalizeThemeSettings({ ...DEFAULT_THEME_SETTINGS, ...editTheme.settings })
      : { ...DEFAULT_THEME_SETTINGS }
  );

  const [previewOpts] = useState<PreviewOptions>(DEFAULT_PREVIEW_OPTIONS);

  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [bgTab, setBgTab] = useState<BackgroundPickerTab>("color");

  const [backgroundMediaLibrary, setBackgroundMediaLibrary] = useState<MediaItem[]>([]);
  const [templateVideoAssets, setTemplateVideoAssets] = useState<TemplateVideoAsset[]>([]);

  // ── Preview zoom state ──
  type ZoomMode = "fit" | 100 | 75 | 50;
  const [previewZoom, setPreviewZoom] = useState<ZoomMode>("fit");
  const previewWrapperRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

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

  const animKeyRef = useRef(0);
  const bgImportInputRef = useRef<HTMLInputElement>(null);
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
    if (tab === "fullscreen") return buildFullscreenPreviewHtml(settings, categories[0] || "bible", previewOpts);
    return buildLowerThirdPreviewHtml(settings, categories[0] || "bible", previewOpts);
  }, [tab, settings, categories, previewOpts]);

  const previewCategory = categories[0] || "bible";

  const previewFrameKey = useMemo(() => {
    return `${tab}-${animKeyRef.current}-${settings.fontFamily}-${settings.fontSize}-${settings.fontWeight}-${settings.fontStyle}-${settings.fontColor}-${settings.textAlign}-${settings.lineHeight}-${settings.textShadow}-${settings.textOutline}-${settings.textOutlineWidth}-${settings.textOutlineColor}-${settings.textTransform}-${settings.padding}-${settings.backgroundColor}-${settings.backgroundImage}-${settings.backgroundOpacity}-${settings.animation}-${settings.animationDuration}-${settings.boxBackground}-${settings.boxBackgroundImage}-${settings.borderRadius}-${settings.safeArea}-${settings.refPosition}-${settings.refFontSize}-${settings.refFontWeight}-${settings.refFontColor}-${settings.refTextTransform}-${settings.refTextAlign}-${settings.refLetterSpacing}-${settings.refSpacing}-${settings.refOpacity}-${settings.referenceBackgroundEnabled}-${settings.referenceBackgroundColor}-${settings.referenceBackgroundStyle}-${settings.referenceBackgroundRadius}-${settings.logoUrl}-${settings.logoSize}-${settings.logoPosition}-${settings.fullscreenShadeEnabled}-${settings.fullscreenShadeColor}-${settings.fullscreenShadeOpacity}-${settings.lowerThirdWidthPreset}-${settings.lowerThirdPosition}-${settings.lowerThirdOffsetX}-${settings.lowerThirdSize}-${settings.lowerThirdHeight}-${backgroundVideoValue}-${hasPreviewBackgroundVideo}`;
  }, [tab, settings, backgroundVideoValue, hasPreviewBackgroundVideo]);

  // ── Handlers ──

  const patch = useCallback((partial: Partial<BibleThemeSettings>) => {
    setSettings((prev) => normalizeThemeSettings({ ...prev, ...partial }));
  }, []);

  const toggleCategory = useCallback((value: BibleThemeCategory) => {
    setCategories((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((v) => v !== value);
        return next.length === 0 ? [value] : next;
      }
      return [...prev, value];
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
    } catch {
      // failed to load template videos
    }
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
        createdAt: isEditing && !duplicate ? editTheme!.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveCustomTheme(themeToSave);
      try { await addBibleFavorite(themeToSave.id); } catch { /* ok */ }
      onSaved?.(themeToSave);
      onClose();
    } catch {
      // save failed
    } finally {
      setSaving(false);
    }
  }, [name, description, categories, tab, settings, onSaved, onClose, isEditing, editTheme]);

  const handleSave = useCallback(() => { saveTheme(false); }, [saveTheme]);

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

  // ── Render ──

  const categoryLabel = (cat: BibleThemeCategory) =>
    CATEGORY_OPTIONS.find((c) => c.value === cat)?.label ?? cat;

  return (
    <div className="tc-editor">
      <div className="app-container">
        <div className="workspace">
          {/* ── Left Sidebar ── */}
          <aside className="sidebar">
            <div className="sidebar-header">
              <span className="sidebar-title">PROPERTIES</span>
              <button className="icon-btn" onClick={onClose}>
                <X size={15} />
              </button>
            </div>

            <div className="sidebar-content">
              {/* ── Layout Panel ── */}
              <div className="panel">
                <div className="panel-header">
                  <LayoutGrid size={14} className="panel-header-icon" />
                  LAYOUT
                </div>
                <div className="panel-body">
                  <div className="btn-group">
                    <button
                      className={`btn-tab${tab === "fullscreen" ? " active" : ""}`}
                      onClick={() => setTab("fullscreen")}
                    >
                      Fullscreen
                    </button>
                    <button
                      className={`btn-tab${tab === "lower-third" ? " active" : ""}`}
                      onClick={() => setTab("lower-third")}
                    >
                      Lower Third
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Categories Panel ── */}
              <div className="panel panel-categories">
                <div className="panel-header">
                  <Bookmark size={14} className="panel-header-icon" />
                  CATEGORIES
                </div>
                <div className="panel-body">
                  <div className="btn-group" style={{ gap: "8px", padding: "0", border: "none", backgroundColor: "transparent" }}>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className={`btn-tab${categories.includes(opt.value) ? " active" : ""}`}
                        style={{ width: "80px", flex: "none" }}
                        onClick={() => toggleCategory(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <ImageIcon size={14} className="panel-header-icon" />
                  BACKGROUND
                </div>
                <div className="panel-body">
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
                </div>
              </div>
              {/* ── Typography Panel ── */}
              <div className="panel">
                <div className="panel-header">
                  <Type size={14} className="panel-header-icon" />
                  TYPOGRAPHY
                </div>
                <div className="panel-body">
                  {/* Font selector row */}
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

                  {/* Format row: Bold / Italic / Underline / Strikethrough */}
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

                  {/* Sliders: PAD + LINE */}
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
                </div>
              </div>

              {/* ── Reference Panel ── */}
              <div className="panel">
                <div className="panel-header">
                  <BookOpen size={14} className="panel-header-icon" />
                  REFERENCE
                </div>
                <div className="panel-body">
                  {/* Position */}
                  <div className="case-group" style={{ marginBottom: "8px" }}>
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
                    <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", color: "var(--text-muted)", lineHeight: "26px" }}>COLOR</span>
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
                  <div style={{ marginTop: "8px", borderTop: "1px solid var(--outline-variant)", paddingTop: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", color: "var(--text-muted)" }}>REF BACKGROUND</span>
                      <button
                        onClick={() => patch({ referenceBackgroundEnabled: !settings.referenceBackgroundEnabled })}
                        style={{
                          width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", position: "relative",
                          background: settings.referenceBackgroundEnabled ? "var(--primary)" : "var(--surface-container-high)",
                          transition: "background 0.2s",
                        }}
                      >
                        <span style={{
                          position: "absolute", top: 2, left: settings.referenceBackgroundEnabled ? 18 : 2,
                          width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s",
                        }} />
                      </button>
                    </div>
                    {settings.referenceBackgroundEnabled && (
                      <>
                        <div className="typography-row" style={{ marginBottom: "8px" }}>
                          <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", color: "var(--text-muted)", lineHeight: "26px" }}>COLOR</span>
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
              </div>

              {/* ── Background Panel ── */}


              {/* ── Animation Panel ── */}
              <div className="panel">
                <div className="panel-header">
                  <Link size={14} className="panel-header-icon" />
                  ANIMATION
                </div>
                <div className="panel-body">
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
              </div>
            </div>

            {/* ── Save Area ── */}
            <div className="save-area">
              <button className="save-btn" onClick={handleSave} disabled={saving}>
                {saving ? "SAVING…" : "SAVE"}
              </button>
            </div>
          </aside>

          {/* ── Main Canvas Area ── */}
          <main className="canvas-area">
            {/* Floating Indicators */}
            <div className="floating-indicators">
              <div className="indicator-pill">
                <div className="indicator-left">
                  <div className="dot-wrapper">
                    <div className="dot-ping" />
                    <div className="dot-core" />
                  </div>
                  <span className="indicator-text">LIVE PREVIEW</span>
                </div>
                <div className="indicator-right">
                  <span className="indicator-text">{categoryLabel(previewCategory).toUpperCase()}</span>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="preview-wrapper" ref={previewWrapperRef}>
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
                </div>
              </div>
            </div>

            {/* Zoom Controls */}
            <div className="preview-zoom-controls">
              {(["fit", 100, 75, 50] as const).map((mode) => (
                <button
                  key={mode}
                  className={`preview-zoom-btn${previewZoom === mode ? " active" : ""}`}
                  onClick={() => setPreviewZoom(mode)}
                >
                  {mode === "fit" ? "Fit" : `${mode}%`}
                </button>
              ))}
            </div>

            {/* Resolution */}
            <div className="resolution-info">1920x1080 • 16:9</div>
          </main>
        </div>
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