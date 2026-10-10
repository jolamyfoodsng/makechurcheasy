/**
 * ThemeCreatorModal.tsx — Theme Designer V3
 *
 * Full-screen editor with independent Fullscreen + Lower Third variants.
 * 3-panel layout: Theme Library | Live Preview | Theme Settings.
 * Top toolbar with Undo/Redo, variant tabs, sync, and Save/Close.
 */

import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import type { ChangeEvent } from "react";
import Icon from "../components/Icon";
import {
  X,
  ChevronDown,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
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
  ArrowRightLeft,
} from "lucide-react";
import type {
  BibleTheme,
  BibleThemeCategory,
  BibleThemeSettings,
  BibleThemeRawTemplate,
  LowerThirdSize,
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
import { getBibleThemePreviewHtml } from "../bible/bibleThemes";
import { LAYOUT_PRESET_THEMES } from "../themes/layout/presetThemes";
import ThemeLayoutPreview from "../themes/layout/ThemeLayoutPreview";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VariantType = "fullscreen" | "lower-third";

type BackgroundPickerTab =
  | "my-images"
  | "my-videos"
  | "patterns"
  | "color"
  | "transparent";

type InspectorTab =
  | "text"
  | "background"
  | "position"
  | "effects";

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
  '"Poppins", sans-serif',
  '"Lora", serif',
  '"Merriweather", serif',
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
  { value: "my-images", label: "Images" },
  { value: "my-videos", label: "Videos" },
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

const SIMPLE_LT_WIDTHS: Array<{ value: LowerThirdWidthPreset; label: string }> = [
  { value: "full", label: "Wide" },
  { value: "md", label: "Medium" },
  { value: "xl", label: "Compact" },
];

const SIMPLE_LT_SIZES: Array<{ value: LowerThirdSize; label: string }> = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Normal" },
  { value: "big", label: "Large" },
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
  { key: "text", label: "Text" },
  { key: "background", label: "Background" },
  { key: "position", label: "Position" },
  { key: "effects", label: "Effects" },
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
  const requestedReduction = LT_WIDTH_REDUCTION[settings.lowerThirdWidthPreset || "md"] ?? 0;
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
    lowerThirdPosition: settings.lowerThirdPosition || "center",
    lowerThirdWidthPreset: settings.lowerThirdWidthPreset || "md",
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

function defaultSettingsForVariant(): BibleThemeSettings {
  return { ...DEFAULT_THEME_SETTINGS };
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
  const content = SAMPLE_CONTENT[category] || SAMPLE_CONTENT.bible;
  const shadowCss = settings.textShadow && settings.textShadow !== "none" ? `text-shadow: ${settings.textShadow};` : "";
  const outlineCss = settings.textOutline ? `-webkit-text-stroke: ${settings.textOutlineWidth || 4}px ${settings.textOutlineColor || "#000000"};` : "";
  const transformCss = settings.textTransform && settings.textTransform !== "none" ? `text-transform: ${settings.textTransform};` : "";
  const alignCss = `text-align: ${settings.textAlign || "center"};`;
  const shadeCss = settings.fullscreenShadeEnabled
    ? `background: ${settings.fullscreenShadeColor || "#000000"}; opacity: ${settings.fullscreenShadeOpacity ?? 0.42}; position: absolute; inset: 0;`
    : "";

  let bgHtml = "";
  if (settings.backgroundVideo) {
    bgHtml = `<video src="${settings.backgroundVideo}" autoplay loop muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:${settings.backgroundOpacity ?? 1};"></video>`;
  } else if (settings.backgroundImage) {
    bgHtml = `<div class="bg" style="position:absolute;inset:0;background-image:url('${settings.backgroundImage}');background-size:cover;background-position:center;opacity:${settings.backgroundOpacity ?? 1};"></div>`;
  } else if (settings.backgroundPattern) {
    const patUrl = settings.backgroundPattern.startsWith("data:") || settings.backgroundPattern.startsWith("http")
      ? `url('${settings.backgroundPattern}')`
      : settings.backgroundPattern;
    const baseColor = settings.backgroundColor && settings.backgroundColor !== "transparent" ? settings.backgroundColor : "#0B1426";
    bgHtml = `<div class="bg" style="position:absolute;inset:0;background-color:${baseColor};background-image:${patUrl};background-repeat:repeat;opacity:${settings.backgroundOpacity ?? 1};"></div>`;
  } else if (settings.backgroundColor && settings.backgroundColor !== "transparent") {
    if (settings.backgroundColorEnd) {
      const angle = settings.bgGradientAngle ?? 135;
      bgHtml = `<div class="bg" style="position:absolute;inset:0;background:linear-gradient(${angle}deg, ${settings.backgroundColor}, ${settings.backgroundColorEnd});opacity:${settings.backgroundOpacity ?? 1};"></div>`;
    } else {
      bgHtml = `<div class="bg" style="position:absolute;inset:0;background-color:${settings.backgroundColor};opacity:${settings.backgroundOpacity ?? 1};"></div>`;
    }
  } else {
    bgHtml = `<div class="bg" style="position:absolute;inset:0;background-color:#0B1426;"></div>`;
  }

  const refAlign = settings.refTextAlign === "match" ? settings.textAlign : settings.refTextAlign;
  const refSpacing = settings.refSpacing ?? 24;
  const refMarginTop = settings.refPosition === "top" ? `0 0 ${refSpacing}px 0` : `${refSpacing}px 0 0 0`;
  const refBgCss = settings.referenceBackgroundEnabled
    ? (() => {
      const bg = settings.referenceBackgroundColor || "#F4D17B";
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
@import url('/fonts/google/google-fonts.css');
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Montserrat:ital,wght@0,300;0,400;0,700;0,900;1,400&family=Inter:wght@300;400;600;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{width:1920px;height:1080px;overflow:hidden;font-family:${settings.fontFamily || "Inter, sans-serif"};${alignCss}}
.bg{position:absolute;inset:0;}
.shade{${shadeCss}}
.content{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:${settings.padding || 80}px;${alignCss}}
.verse{font-size:${settings.fontSize ? settings.fontSize / 2 : 48}px;font-weight:${settings.fontWeight || "normal"};font-style:${settings.fontStyle || "normal"};color:${settings.fontColor || "#FFFFFF"};line-height:${settings.lineHeight || 1.5};${shadowCss}${outlineCss}${transformCss}}
.reference{font-size:${settings.refFontSize ? settings.refFontSize / 2 : 24}px;font-weight:${settings.refFontWeight === "light" ? "300" : (settings.refFontWeight || "bold")};color:${settings.refFontColor || "#FACC15"};text-transform:${settings.refTextTransform !== "none" ? (settings.refTextTransform || "none") : "none"};text-align:${refAlign || "center"};letter-spacing:${settings.refLetterSpacing || 0}px;opacity:${settings.refOpacity ?? 1}}
</style></head><body>
${bgHtml}
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
  const shadowCss = settings.textShadow && settings.textShadow !== "none" ? `text-shadow: ${settings.textShadow};` : "";
  const outlineCss = settings.textOutline ? `-webkit-text-stroke: ${settings.textOutlineWidth || 4}px ${settings.textOutlineColor || "#000000"};` : "";
  const transformCss = settings.textTransform && settings.textTransform !== "none" ? `text-transform: ${settings.textTransform};` : "";
  const alignCss = `text-align: ${settings.textAlign || "center"};`;
  const boxBg = settings.boxBackgroundImage
    ? `background-image: url('${settings.boxBackgroundImage}'); background-size: cover; background-position: center;`
    : settings.boxBackground && settings.boxBackground !== "transparent"
      ? `background-color: ${settings.boxBackground};`
      : "background: rgba(15, 23, 42, 0.85);";
  const isFullWidth = settings.lowerThirdWidthPreset === "full";
  const borderRadius = isFullWidth ? 0 : (settings.borderRadius ?? 16);
  const ltHeight = settings.lowerThirdHeight ? `height: ${settings.lowerThirdHeight}px;` : "";
  const refFontFam = settings.refFontFamily ? `font-family: ${settings.refFontFamily};` : "";

  const refAlign = settings.refTextAlign === "match" ? settings.textAlign : settings.refTextAlign;
  const refSpacing = settings.refSpacing ?? 16;
  const refMargin = settings.refPosition === "top" ? `0 0 ${refSpacing}px 0` : `${refSpacing}px 0 0 0`;
  const refBgCss = settings.referenceBackgroundEnabled
    ? (() => {
      const bg = settings.referenceBackgroundColor || "#000000";
      const r = settings.referenceBackgroundRadius ?? 4;
      if (settings.referenceBackgroundStyle === "pill") return `background:${bg};border-radius:999px;padding:5px 18px;display:inline-block;`;
      if (settings.referenceBackgroundStyle === "outline") return `border:1.5px solid ${bg};border-radius:${r}px;padding:5px 16px;display:inline-block;background:transparent;`;
      return `background:${bg};border-radius:${r}px;padding:5px 16px;display:inline-block;`;
    })()
    : "";
  const refSelfAlign = refAlign === "right" ? "flex-end" : refAlign === "left" ? "flex-start" : "center";
  const refHtml = `<div style="display:flex;justify-content:${refSelfAlign};width:100%;"><p class="reference" style="margin:${refMargin};${refBgCss}${refFontFam}">${content.refAbbr}</p></div>`;

  // Placement styles
  let positionStyle = "left: 50%; transform: translateX(-50%);";
  if (isFullWidth) {
    positionStyle = "left: 0; right: 0; bottom: 0; width: 100%; max-width: 100%; border-radius: 0;";
  } else if (settings.lowerThirdPosition === "left") {
    positionStyle = `left: ${settings.safeArea || 40}px; right: auto; transform: none;`;
  } else if (settings.lowerThirdPosition === "right") {
    positionStyle = `right: ${settings.safeArea || 40}px; left: auto; transform: none;`;
  }

  // Width preset
  let widthLimit = "max-width: 1500px;";
  if (isFullWidth) {
    widthLimit = "max-width: 100%; width: 100%;";
  } else if (settings.lowerThirdWidthPreset === "sm") {
    widthLimit = "max-width: 900px;";
  } else if (settings.lowerThirdWidthPreset === "md") {
    widthLimit = "max-width: 1100px;";
  } else if (settings.lowerThirdWidthPreset === "lg") {
    widthLimit = "max-width: 1450px;";
  } else if (settings.lowerThirdWidthPreset === "xl") {
    widthLimit = "max-width: 1650px;";
  }

  // Cyan wave / top glow accent banner if full width
  const isCyanWave = isFullWidth && (settings.boxBackground.toLowerCase().includes("0a1838") || settings.boxBackground.toLowerCase().includes("0a193b"));
  const waveTopHtml = isCyanWave
    ? `<div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg, #0284C7 0%, #22D3EE 30%, #38BDF8 70%, #0284C7 100%);box-shadow:0 0 16px rgba(34,211,238,0.65), 0 0 30px rgba(6,182,212,0.4);"></div>`
    : "";

  return `<!DOCTYPE html><html><head><style>
@import url('/fonts/google/google-fonts.css');
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Montserrat:ital,wght@0,300;0,400;0,700;0,900;1,400&family=Inter:wght@300;400;600;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{width:1920px;height:1080px;overflow:hidden;font-family:${settings.fontFamily || "Inter, sans-serif"};background:transparent}
.lt{position:absolute;bottom:${isFullWidth ? 0 : 36}px;${positionStyle}width:calc(100% - ${(settings.safeArea || 40) * 2}px);${widthLimit}padding:${settings.padding || 24}px 36px;${boxBg}border-radius:${borderRadius}px;border:1px solid rgba(255,255,255,0.12);box-shadow:0 20px 50px rgba(0,0,0,0.45);${ltHeight}display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden;}
.verse{font-size:${settings.fontSize ? settings.fontSize / 2 : 36}px;font-weight:${settings.fontWeight || "normal"};font-style:${settings.fontStyle || "normal"};color:${settings.fontColor || "#FFFFFF"};line-height:${settings.lineHeight || 1.3};${shadowCss}${outlineCss}${transformCss}${alignCss}}
.reference{font-size:${settings.refFontSize ? settings.refFontSize / 2 : 20}px;font-weight:${settings.refFontWeight === "light" ? "300" : (settings.refFontWeight || "bold")};color:${settings.refFontColor || "#FACC15"};text-transform:${settings.refTextTransform !== "none" ? (settings.refTextTransform || "none") : "none"};text-align:${refAlign || "left"};letter-spacing:${settings.refLetterSpacing || 0}px;opacity:${settings.refOpacity ?? 1}}
</style></head><body>
<div class="lt">
  ${waveTopHtml}
  ${settings.refPosition === "top" ? refHtml : ""}
  <p class="verse">${content.verse}</p>
  ${settings.refPosition === "bottom" ? refHtml : ""}
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

  // Hide the app sidebar while this modal is open
  useEffect(() => {
    const sidebar = document.querySelector(".sidebar") as HTMLElement | null;
    const main = document.querySelector(".app-main") as HTMLElement | null;
    if (sidebar) sidebar.style.display = "none";
    if (main) main.style.marginLeft = "0";
    return () => {
      if (sidebar) sidebar.style.display = "";
      if (main) main.style.marginLeft = "";
    };
  }, []);

  // ── Variant state ──
  const [activeVariant, setActiveVariant] = useState<VariantType>(
    editTheme?.templateType === "lower-third" ? "lower-third" : "fullscreen"
  );
  const [enabledVariants, setEnabledVariants] = useState<Set<VariantType>>(() => {
    if (editTheme?.enabledVariants && editTheme.enabledVariants.length > 0) {
      return new Set(editTheme.enabledVariants as VariantType[]);
    }
    return new Set<VariantType>(["fullscreen", "lower-third"]);
  });

  // ── Per-variant settings ──
  const initFsSettings = useMemo(() => {
    if (editTheme?.variants?.fullscreen) {
      return normalizeThemeSettings({ ...DEFAULT_THEME_SETTINGS, ...editTheme.variants.fullscreen.settings });
    }
    if (editTheme?.templateType === "fullscreen" && editTheme?.settings) {
      return normalizeThemeSettings({ ...DEFAULT_THEME_SETTINGS, ...editTheme.settings });
    }
    return defaultSettingsForVariant();
  }, []);

  const initLtSettings = useMemo(() => {
    if (editTheme?.variants?.lowerThird) {
      return normalizeThemeSettings({ ...DEFAULT_THEME_SETTINGS, ...editTheme.variants.lowerThird.settings });
    }
    if (editTheme?.templateType === "lower-third" && editTheme?.settings) {
      return normalizeThemeSettings({ ...DEFAULT_THEME_SETTINGS, ...editTheme.settings });
    }
    return defaultSettingsForVariant();
  }, []);

  const [fullscreenSettings, setFullscreenSettings] = useState<BibleThemeSettings>(initFsSettings);
  const [lowerThirdSettings, setLowerThirdSettings] = useState<BibleThemeSettings>(initLtSettings);
  const [fullscreenRawTemplate, setFullscreenRawTemplate] = useState<BibleThemeRawTemplate | null>(
    editTheme?.variants?.fullscreen?.rawTemplate ?? (editTheme?.templateType === "fullscreen" ? editTheme?.rawTemplate ?? null : null)
  );
  const [lowerThirdRawTemplate, setLowerThirdRawTemplate] = useState<BibleThemeRawTemplate | null>(
    editTheme?.variants?.lowerThird?.rawTemplate ?? (editTheme?.templateType === "lower-third" ? editTheme?.rawTemplate ?? null : null)
  );

  // Derived: current active settings for the inspector/preview
  const settings = activeVariant === "fullscreen" ? fullscreenSettings : lowerThirdSettings;
  const activeRawTemplate = activeVariant === "fullscreen" ? fullscreenRawTemplate : lowerThirdRawTemplate;

  const setActiveSettings = useCallback((partial: BibleThemeSettings | ((prev: BibleThemeSettings) => BibleThemeSettings)) => {
    if (activeVariant === "fullscreen") {
      setFullscreenSettings((prev) => typeof partial === "function" ? partial(prev) : partial);
    } else {
      setLowerThirdSettings((prev) => typeof partial === "function" ? partial(prev) : partial);
    }
  }, [activeVariant]);

  // ── Core state ──
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(editTheme?.name || "Untitled Theme");
  const [description] = useState(editTheme?.description || "");
  const [categories, setCategories] = useState<BibleThemeCategory[]>(
    () => normalizeCategories(editTheme?.categories || (initialCategory ? [initialCategory] : []))
  );

  // ── Undo / Redo (per variant) ──
  const undoStackRef = useRef<BibleThemeSettings[]>([]);
  const redoStackRef = useRef<BibleThemeSettings[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setActiveSettings((current) => {
      redoStackRef.current = [...redoStackRef.current, { ...current }];
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(true);
      return prev;
    });
  }, [setActiveSettings]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    setActiveSettings((current) => {
      undoStackRef.current = [...undoStackRef.current, { ...current }];
      setCanUndo(true);
      setCanRedo(redoStackRef.current.length > 0);
      return next;
    });
  }, [setActiveSettings]);

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

  // ── Variant Management ──

  const handleSwitchVariant = useCallback((variant: VariantType) => {
    setActiveVariant(variant);
    setEnabledVariants((prev) => {
      if (prev.has(variant)) return prev;
      const next = new Set(prev);
      next.add(variant);
      return next;
    });
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const handleToggleVariant = useCallback((variant: VariantType) => {
    setEnabledVariants((prev) => {
      const next = new Set(prev);
      if (next.has(variant)) {
        if (next.size <= 1) return prev;
        next.delete(variant);
        if (activeVariant === variant) {
          const remaining = variant === "fullscreen" ? "lower-third" : "fullscreen";
          handleSwitchVariant(remaining);
        }
      } else {
        next.add(variant);
      }
      return next;
    });
  }, [activeVariant, handleSwitchVariant]);

  const handleSyncVariant = useCallback(() => {
    const source = activeVariant === "fullscreen" ? fullscreenSettings : lowerThirdSettings;
    if (activeVariant === "fullscreen") {
      const ltLayout = {
        boxBackground: lowerThirdSettings.boxBackground,
        boxOpacity: lowerThirdSettings.boxOpacity,
        boxBackgroundImage: lowerThirdSettings.boxBackgroundImage,
        borderRadius: lowerThirdSettings.borderRadius,
        lowerThirdSize: lowerThirdSettings.lowerThirdSize,
        lowerThirdPosition: lowerThirdSettings.lowerThirdPosition,
        lowerThirdHeight: lowerThirdSettings.lowerThirdHeight,
        lowerThirdWidthPreset: lowerThirdSettings.lowerThirdWidthPreset,
        lowerThirdOffsetX: lowerThirdSettings.lowerThirdOffsetX,
        padding: lowerThirdSettings.padding,
        safeArea: lowerThirdSettings.safeArea,
      };
      setLowerThirdSettings(normalizeThemeSettings({ ...source, ...ltLayout }));
    } else {
      const fsLayout = {
        padding: fullscreenSettings.padding,
        safeArea: fullscreenSettings.safeArea,
        borderRadius: 0,
      };
      setFullscreenSettings(normalizeThemeSettings({ ...source, ...fsLayout }));
    }
  }, [activeVariant, fullscreenSettings, lowerThirdSettings]);

  // ── Theme Library ──
  const [themeLibrary, setThemeLibrary] = useState<BibleTheme[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");

  const loadThemeLibrary = useCallback(async () => {
    try {
      const customThemes = await getCustomThemes();
      setThemeLibrary([...LAYOUT_PRESET_THEMES, ...customThemes]);
    } catch {
      setThemeLibrary([...LAYOUT_PRESET_THEMES]);
    }
  }, []);

  useEffect(() => {
    loadThemeLibrary();
  }, [loadThemeLibrary]);

  const filteredThemes = useMemo(() => {
    // Layout themes are listed in both variants; picking one switches to its format.
    let list = themeLibrary.filter((t) => t.templateType === activeVariant || Boolean(t.settings.layout));
    if (librarySearch.trim()) {
      const q = librarySearch.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [themeLibrary, librarySearch, activeVariant]);

  const handleLoadTheme = useCallback((theme: BibleTheme) => {
    const incomingSettings = normalizeThemeSettings({ ...DEFAULT_THEME_SETTINGS, ...theme.settings });
    const incomingRawTemplate = theme.rawTemplate || null;
    const layoutFormat = theme.settings.layout?.format;
    const targetVariant: VariantType = layoutFormat ?? activeVariant;
    if (layoutFormat && layoutFormat !== activeVariant) setActiveVariant(layoutFormat);
    if (targetVariant === "fullscreen") {
      setFullscreenSettings(incomingSettings);
      setFullscreenRawTemplate(incomingRawTemplate);
    } else {
      setLowerThirdSettings(incomingSettings);
      setLowerThirdRawTemplate(incomingRawTemplate);
    }
    if (theme.name) setName(theme.name);
    if (theme.categories) setCategories(normalizeCategories(theme.categories));
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, [activeVariant]);

  const handleNewTheme = useCallback(() => {
    setFullscreenSettings(defaultSettingsForVariant());
    setLowerThirdSettings(defaultSettingsForVariant());
    setFullscreenRawTemplate(null);
    setLowerThirdRawTemplate(null);
    setName("Untitled Theme");
    setCategories(["bible"]);
    setEnabledVariants(new Set(["fullscreen", "lower-third"]));
    setActiveVariant("fullscreen");
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
      templateType: activeVariant,
      categories,
      settings: { ...settings },
      ...(activeRawTemplate ? { rawTemplate: activeRawTemplate } : {}),
      variants: {
        ...(enabledVariants.has("fullscreen") ? { fullscreen: { settings: { ...fullscreenSettings }, ...(fullscreenRawTemplate ? { rawTemplate: fullscreenRawTemplate } : {}) } } : {}),
        ...(enabledVariants.has("lower-third") ? { lowerThird: { settings: { ...lowerThirdSettings }, ...(lowerThirdRawTemplate ? { rawTemplate: lowerThirdRawTemplate } : {}) } } : {}),
      },
      enabledVariants: Array.from(enabledVariants),
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
  }, [name, description, activeVariant, categories, settings, activeRawTemplate, enabledVariants, fullscreenSettings, fullscreenRawTemplate, lowerThirdSettings, lowerThirdRawTemplate]);

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
          if (imported.name) setName(imported.name);
          if (imported.variants) {
            if (imported.variants.fullscreen) {
              setFullscreenSettings(normalizeThemeSettings({ ...DEFAULT_THEME_SETTINGS, ...imported.variants.fullscreen.settings }));
              setFullscreenRawTemplate(imported.variants.fullscreen.rawTemplate || null);
            }
            if (imported.variants.lowerThird) {
              setLowerThirdSettings(normalizeThemeSettings({ ...DEFAULT_THEME_SETTINGS, ...imported.variants.lowerThird.settings }));
              setLowerThirdRawTemplate(imported.variants.lowerThird.rawTemplate || null);
            }
          }
          if (imported.enabledVariants) {
            setEnabledVariants(new Set(imported.enabledVariants as VariantType[]));
          }
        }
      } catch { /* silent */ }
    };
    input.click();
  }, [handleLoadTheme]);

  // ── Inspector ──
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("text");

  // ── Preview state ──
  const [previewOpts] = useState<PreviewOptions>(DEFAULT_PREVIEW_OPTIONS);
  type ZoomMode = "fit" | 50 | 75 | 100 | 125;
  const [previewZoom, setPreviewZoom] = useState<ZoomMode>("fit");
  const previewWrapperRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.4);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  useLayoutEffect(() => {
    const el = previewWrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const availW = Math.max(100, rect.width - 48);
      const availH = Math.max(100, rect.height - 48);
      setFitScale(Math.max(0.05, Math.min(availW / 1920, availH / 1080)));
    }
  }, []);

  useEffect(() => {
    const wrapper = previewWrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const availW = Math.max(100, width - 48);
          const availH = Math.max(100, height - 48);
          const target = Math.max(0.05, Math.min(availW / 1920, availH / 1080));
          setFitScale((prev) => (Math.abs(prev - target) > 0.005 ? target : prev));
        }
      }
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  const currentScale = useMemo(() => {
    if (previewZoom === "fit") {
      return fitScale;
    }
    return previewZoom / 100;
  }, [previewZoom, fitScale]);

  const tvWidth = Math.max(10, Math.round(1920 * currentScale));
  const tvHeight = Math.max(10, Math.round(1080 * currentScale));

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

  const backgroundColorValue = activeVariant === "fullscreen" ? settings.backgroundColor : settings.boxBackground;
  const backgroundImageValue = activeVariant === "fullscreen" ? settings.backgroundImage : settings.boxBackgroundImage;
  const backgroundVideoValue = activeVariant === "fullscreen" ? settings.backgroundVideo : "";
  const activeBackgroundOpacity = activeVariant === "fullscreen" ? settings.backgroundOpacity : settings.boxOpacity;
  const backgroundOpacityPercent = Math.round(activeBackgroundOpacity * 100);

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

  const hasPreviewBackgroundVideo = backgroundVideoValue !== "" && activeVariant === "fullscreen";

  const previewHtml = useMemo(() => {
    if (activeRawTemplate) return getBibleThemePreviewHtml({ rawTemplate: activeRawTemplate } as BibleTheme, settings) || "";
    if (activeVariant === "fullscreen") return buildFullscreenPreviewHtml(settings, categories[0] || "bible", previewOpts);
    return buildLowerThirdPreviewHtml(settings, categories[0] || "bible", previewOpts);
  }, [activeVariant, settings, categories, previewOpts, activeRawTemplate]);

  const previewFrameKey = useMemo(() => {
    if (activeRawTemplate) {
      return `raw-${activeRawTemplate.html.slice(0, 80)}-${settings.fontSize}-${settings.fontWeight}-${settings.fontStyle}-${settings.fontColor}-${settings.lineHeight}-${settings.textAlign}-${settings.textShadow}-${settings.textTransform}-${settings.refFontSize}-${settings.refFontWeight}-${settings.refFontColor}-${settings.refTextTransform}-${settings.refLetterSpacing}-${settings.refOpacity}-${settings.refTextAlign}-${settings.boxBackground}-${settings.borderRadius}-${settings.fontFamily}-${settings.referenceBackgroundEnabled}-${settings.referenceBackgroundColor}-${settings.referenceBackgroundStyle}-${settings.referenceBackgroundRadius}`;
    }
    return `${activeVariant}-${animKeyRef.current}-${settings.fontFamily}-${settings.fontSize}-${settings.fontWeight}-${settings.fontStyle}-${settings.fontColor}-${settings.textAlign}-${settings.lineHeight}-${settings.textShadow}-${settings.textOutline}-${settings.textOutlineWidth}-${settings.textOutlineColor}-${settings.textTransform}-${settings.padding}-${settings.backgroundColor}-${settings.backgroundImage}-${settings.backgroundOpacity}-${settings.animation}-${settings.animationDuration}-${settings.boxBackground}-${settings.boxBackgroundImage}-${settings.borderRadius}-${settings.safeArea}-${settings.refPosition}-${settings.refFontSize}-${settings.refFontWeight}-${settings.refFontColor}-${settings.refTextTransform}-${settings.refTextAlign}-${settings.refLetterSpacing}-${settings.refSpacing}-${settings.refOpacity}-${settings.referenceBackgroundEnabled}-${settings.referenceBackgroundColor}-${settings.referenceBackgroundStyle}-${settings.referenceBackgroundRadius}-${settings.logoUrl}-${settings.logoSize}-${settings.logoPosition}-${settings.fullscreenShadeEnabled}-${settings.fullscreenShadeColor}-${settings.fullscreenShadeOpacity}-${settings.lowerThirdWidthPreset}-${settings.lowerThirdPosition}-${settings.lowerThirdOffsetX}-${settings.lowerThirdSize}-${settings.lowerThirdHeight}-${backgroundVideoValue}-${hasPreviewBackgroundVideo}`;
  }, [activeVariant, settings, backgroundVideoValue, hasPreviewBackgroundVideo, activeRawTemplate]);

  // ── Handlers ──

  const patch = useCallback((partial: Partial<BibleThemeSettings>) => {
    setActiveSettings((prev) => {
      const next = normalizeThemeSettings({ ...prev, ...partial });
      undoStackRef.current = [...undoStackRef.current.slice(-49), { ...prev }];
      redoStackRef.current = [];
      setCanUndo(true);
      setCanRedo(false);
      return next;
    });
  }, [setActiveSettings]);

  const refreshBackgroundMediaLibrary = useCallback(async () => {
    try {
      const items = await getAllMedia();
      setBackgroundMediaLibrary(items);
    } catch { /* silent */ }
  }, []);

  const loadTemplateVideoAssets = useCallback(async () => {
    if (activeVariant !== "fullscreen") return;
    try {
      const assets = await fetchTemplateVideos();
      setTemplateVideoAssets(assets);
    } catch { /* silent */ }
  }, [activeVariant]);

  useEffect(() => {
    if (!showBackgroundModal) return;
    refreshBackgroundMediaLibrary();
    if (activeVariant === "fullscreen") loadTemplateVideoAssets();
  }, [loadTemplateVideoAssets, refreshBackgroundMediaLibrary, showBackgroundModal, activeVariant]);

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

  const handleBgImportFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
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
      const resolvedVariants = new Set(enabledVariants);
      resolvedVariants.add(activeVariant);
      resolvedVariants.add("fullscreen");
      resolvedVariants.add("lower-third");
      const primaryType = activeVariant || (resolvedVariants.has("fullscreen") ? "fullscreen" : "lower-third");
      const primarySettings = primaryType === "fullscreen" ? fullscreenSettings : lowerThirdSettings;
      const primaryRawTemplate = primaryType === "fullscreen" ? fullscreenRawTemplate : lowerThirdRawTemplate;

      const themeToSave: BibleTheme = {
        id: isEditing && !duplicate ? editTheme!.id : uid(),
        name: name.trim() || "Untitled Theme",
        description: description.trim(),
        source: "custom",
        templateType: primaryType,
        categories,
        settings: { ...primarySettings },
        ...(primaryRawTemplate ? { rawTemplate: primaryRawTemplate } : {}),
        variants: {
          fullscreen: { settings: { ...fullscreenSettings }, ...(fullscreenRawTemplate ? { rawTemplate: fullscreenRawTemplate } : {}) },
          lowerThird: { settings: { ...lowerThirdSettings }, ...(lowerThirdRawTemplate ? { rawTemplate: lowerThirdRawTemplate } : {}) },
        },
        enabledVariants: Array.from(resolvedVariants),
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
  }, [name, description, categories, activeVariant, enabledVariants, fullscreenSettings, fullscreenRawTemplate, lowerThirdSettings, lowerThirdRawTemplate, onSaved, onClose, isEditing, editTheme, loadThemeLibrary, settings, activeRawTemplate]);

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
    patch(activeVariant === "fullscreen" ? { backgroundColor: bgPickerColor } : { boxBackground: bgPickerColor });
    setShowBackgroundModal(false);
  }, [bgPickerColor, patch, activeVariant]);

  const handleBgTransparent = useCallback(() => {
    patch(
      activeVariant === "fullscreen"
        ? { backgroundColor: "transparent", backgroundImage: "", backgroundVideo: "" }
        : { boxBackground: "transparent", boxBackgroundImage: "" }
    );
    setShowBackgroundModal(false);
  }, [patch, activeVariant]);

  const handleBgSelectImage = useCallback(
    (url: string) => {
      patch(activeVariant === "fullscreen" ? { backgroundImage: url, backgroundColor: "transparent" } : { boxBackgroundImage: url, boxBackground: "transparent" });
      setShowBackgroundModal(false);
    },
    [patch, activeVariant],
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
      patch(activeVariant === "fullscreen" ? { backgroundImage: src, backgroundColor: "transparent", backgroundVideo: "" } : { boxBackgroundImage: src, boxBackground: "transparent" });
      setShowBackgroundModal(false);
    },
    [patch, activeVariant],
  );

  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  const modalContent = (
    <div className="tc-editor">
      {/* ── Top Toolbar ── */}
      <div className="tc-toolbar">
        <div className="tc-toolbar-left">
          <button className="tc-toolbar-btn" onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={16} />
          </button>
          <button className="tc-toolbar-btn" onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={16} />
          </button>
          <div className="tc-toolbar-separator" />
          <input className="tc-theme-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Theme name..." />
        </div>

        <div className="tc-toolbar-center">
          {/* Variant Tabs */}
          <div className="tc-variant-tabs">
            {(["fullscreen", "lower-third"] as VariantType[]).map((v) => (
              <button
                key={v}
                className={`tc-variant-tab${activeVariant === v ? " active" : ""}`}
                onClick={() => handleSwitchVariant(v)}
                title={`Edit ${v === "fullscreen" ? "Fullscreen" : "Lower Third"}`}
              >
                {v === "fullscreen" ? <Monitor size={14} /> : <LayoutGrid size={14} />}
                {v === "fullscreen" ? "Fullscreen" : "Lower Third"}
              </button>
            ))}
          </div>

          {/* Variant Enable Toggles */}
          <div className="tc-variant-toggles">
            {(["fullscreen", "lower-third"] as VariantType[]).map((v) => (
              <label key={v} className="tc-variant-toggle" title={`Enable ${v === "fullscreen" ? "Fullscreen" : "Lower Third"} variant`}>
                <input
                  type="checkbox"
                  checked={enabledVariants.has(v)}
                  onChange={() => handleToggleVariant(v)}
                />
                <span className="tc-variant-toggle-label">{v === "fullscreen" ? "FS" : "LT"}</span>
              </label>
            ))}
          </div>

          {/* Sync Button */}
          {enabledVariants.size === 2 && (
            <button
              className="tc-toolbar-btn tc-sync-btn"
              onClick={handleSyncVariant}
              title={`Sync style from ${activeVariant === "fullscreen" ? "Fullscreen \u2192 Lower Third" : "Lower Third \u2192 Fullscreen"}`}
            >
              <ArrowRightLeft size={14} />
              <span className="tc-sync-label">
                {activeVariant === "fullscreen" ? "FS \u2192 LT" : "LT \u2192 FS"}
              </span>
            </button>
          )}
        </div>

        <div className="tc-toolbar-right">
          <button className="tc-toolbar-btn" onClick={handleDuplicate} title="Duplicate">
            <Copy size={16} />
          </button>
          <button className="tc-toolbar-btn" onClick={handleDelete} title="Delete" disabled={!isEditing}>
            <Trash2 size={16} />
          </button>
          <button className="tc-toolbar-btn tc-toolbar-btn--save" onClick={handleSave} disabled={saving} title="Save">
            <Save size={16} />
            {saving ? "Saving\u2026" : "Save"}
          </button>
          <button className="tc-toolbar-btn tc-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ── 3-Panel Layout ── */}
      <div className="tc-panels">
        {/* Left Panel: Theme Library */}
        <aside className="tc-library">
          <div className="tc-library-header">
            <span className="tc-library-title">THEME LIBRARY</span>
            <span className="tc-library-variant-label">
              {activeVariant === "fullscreen" ? "Fullscreen" : "Lower Third"} Presets
            </span>
          </div>

          <div className="tc-library-search">
            <Search size={14} className="tc-library-search-icon" />
            <input
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search themes..."
              className="tc-library-search-input"
            />
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
                  {theme.settings.layout ? (
                    <ThemeLayoutPreview layout={theme.settings.layout} />
                  ) : theme.preview ? (
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
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="tc-library-footer">
            <button className="tc-library-action-btn" onClick={handleNewTheme} title="Add">
              <Plus size={14} />
              New
            </button>
            <button className="tc-library-action-btn" onClick={handleImportTheme} title="Import">
              <Upload size={14} />
              Import
            </button>
            <button className="tc-library-action-btn" onClick={handleExportTheme} title="Export">
              <Download size={14} />
              Export
            </button>
          </div>
        </aside>

        {/* Center Panel: Live Preview */}
        <main className="tc-preview-area">
          <div
            className="tc-preview-wrapper"
            ref={previewWrapperRef}
            style={{
              overflow: previewZoom === "fit" ? "hidden" : "auto",
            }}
          >
            <div
              className="tv-screen"
              style={{
                width: `${tvWidth}px`,
                height: `${tvHeight}px`,
                position: "relative",
                overflow: "hidden",
                borderRadius: "8px",
                backgroundColor: activeVariant === "fullscreen"
                  ? (settings.backgroundColor && settings.backgroundColor !== "transparent" ? settings.backgroundColor : "#0f1118")
                  : "#0f1118",
                boxShadow: "0 25px 60px -12px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(255, 255, 255, 0.08)",
                flexShrink: 0,
              }}
            >
              {/* Background Plate layer simulating broadcast video for lower-thirds */}
              {activeVariant === "lower-third" && (
                <>
                  <div
                    className="tv-bg-plate"
                    style={{
                      backgroundImage: "url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=2000')",
                    }}
                  />
                  <div className="tv-gradient" />
                </>
              )}

              <div
                className="preview-canvas"
                style={{
                  width: "1920px",
                  height: "1080px",
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transformOrigin: "top left",
                  transform: `scale(${currentScale})`,
                }}
              >
                {settings.layout ? (
                  <ThemeLayoutPreview layout={settings.layout} animate style={{ width: "1920px", height: "1080px" }} />
                ) : (
                <iframe
                  key={previewFrameKey}
                  srcDoc={previewHtml}
                  sandbox="allow-same-origin"
                  style={{ width: "1920px", height: "1080px", border: "none", pointerEvents: "none", display: "block" }}
                  title="Theme Preview"
                />
                )}
                {showSafeArea && (
                  <div
                    className="tc-safe-area-overlay"
                    style={{
                      position: "absolute",
                      inset: 0,
                      border: "2px dashed rgba(59,130,246,0.6)",
                      pointerEvents: "none",
                      margin: `${settings.safeArea || 40}px`,
                    }}
                  />
                )}
                {showGrid && (
                  <div
                    className="tc-grid-overlay"
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      backgroundImage:
                        "linear-gradient(rgba(59,130,246,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.15) 1px, transparent 1px)",
                      backgroundSize: "192px 108px",
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="tc-output-bar">
            <span className="tc-output-info">1920 x 1080</span>
            <span className="tc-output-info">16:9</span>
            <div className="tc-output-separator" />
            <label className="tc-overlay-toggle">
              <input type="checkbox" checked={showSafeArea} onChange={(e) => setShowSafeArea(e.target.checked)} />
              <Eye size={12} />
              Safe Area
            </label>
            <label className="tc-overlay-toggle">
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
              <Grid3X3 size={12} />
              Grid
            </label>
          </div>

          <div className="tc-zoom-controls">
            {(["fit", 50, 75, 100, 125] as const).map((mode) => (
              <button key={mode} className={`tc-zoom-btn${previewZoom === mode ? " active" : ""}`} onClick={() => setPreviewZoom(mode)} title="%`">
                {mode === "fit" ? "Fit" : `${mode}%`}
              </button>
            ))}
          </div>
        </main>

        {/* Right Panel: Theme Settings */}
        <aside className="tc-inspector">
          <div className="tc-inspector-header">
            <span className="tc-inspector-title">SETTINGS</span>
            <span className="tc-inspector-variant-badge">
              {activeVariant === "fullscreen" ? "Fullscreen" : "Lower Third"}
            </span>
          </div>

          <div className="tc-inspector-tabs">
            {INSPECTOR_TABS.map((t) => (
              <button key={t.key} className={`tc-inspector-tab${inspectorTab === t.key ? " active" : ""}`} onClick={() => setInspectorTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="tc-inspector-content">
            {inspectorTab === "text" && (
              <div className="tc-inspector-panel">
                <div className="tc-inspector-section-title">MAIN TEXT</div>
                <div className="typography-row">
                  <div className="select-box" style={{ position: "relative" }} onClick={() => setFontDropdownOpen((v) => !v)}>
                    <span>{FONT_FAMILY_LABELS[settings.fontFamily] ?? "Select"}</span>
                    <ChevronDown size={14} className="panel-header-icon" />
                    {fontDropdownOpen && (
                      <div className="tc-font-dropdown" onClick={(e) => e.stopPropagation()}>
                        {FONT_FAMILIES.map((f) => (
                          <div key={f} className={`tc-font-option${settings.fontFamily === f ? " active" : ""}`} style={{ fontFamily: f }} onClick={() => { patch({ fontFamily: f }); setFontDropdownOpen(false); }}>
                            {FONT_FAMILY_LABELS[f] ?? f}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="value-box" style={{ display: "flex", gap: 0, padding: 0, overflow: "hidden" }}>
                    <button onClick={() => patch({ fontSize: Math.max(8, settings.fontSize - 2) })} style={{ background: "none", border: "none", color: "var(--on-surface)", cursor: "pointer", padding: "2px 6px", fontSize: 14, lineHeight: 1 }} title="Decrease font size">-</button>
                    <span style={{ fontSize: 13, minWidth: 34, textAlign: "center", lineHeight: "26px" }}>{settings.fontSize}px</span>
                    <button onClick={() => patch({ fontSize: Math.min(200, settings.fontSize + 2) })} style={{ background: "none", border: "none", color: "var(--on-surface)", cursor: "pointer", padding: "2px 6px", fontSize: 14, lineHeight: 1 }} title="Increase font size">+</button>
                  </div>
                </div>

                <div className="typography-row" style={{ marginTop: 10 }}>
                  <span className="tc-label-mono">COLOR</span>
                  <label className="color-box" style={{ backgroundColor: settings.fontColor }}>
                    <input type="color" value={settings.fontColor} onChange={(e) => patch({ fontColor: e.target.value })} style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }} />
                  </label>
                </div>

                <div className="format-group">
                  <button className={`format-btn${settings.fontWeight === "bold" ? " active" : ""}`} onClick={() => patch({ fontWeight: settings.fontWeight === "bold" ? "normal" : "bold" })} title="Bold"><Bold size={16} /></button>
                  <div className="format-divider" />
                  <button className={`format-btn${settings.fontStyle === "italic" ? " active" : ""}`} onClick={() => patch({ fontStyle: settings.fontStyle === "italic" ? "normal" : "italic" })} title="Italic"><Italic size={16} /></button>
                </div>

                <div className="case-group">
                  {([
                    { value: "none" as const, label: "Normal" },
                    { value: "uppercase" as const, label: "Upper" },
                    { value: "capitalize" as const, label: "Title" },
                  ]).map((c) => (
                    <button key={c.value} className={`case-btn${settings.textTransform === c.value ? " active" : ""}`} onClick={() => patch({ textTransform: c.value })}>{c.label}</button>
                  ))}
                </div>

                <div className="format-group">
                  {([
                    { value: "left" as const, IconComp: AlignLeft },
                    { value: "center" as const, IconComp: AlignCenter },
                    { value: "right" as const, IconComp: AlignRight },
                  ]).map((a) => (
                    <button key={a.value} className={`format-btn${settings.textAlign === a.value ? " active" : ""}`} onClick={() => patch({ textAlign: a.value })} title={a.value}>
                      <a.IconComp size={16} />
                    </button>
                  ))}
                </div>

                <div className="slider-row">
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>LINE HEIGHT</span>
                    <input type="range" min={1} max={3} step={0.1} value={settings.lineHeight} onChange={(e) => patch({ lineHeight: Number(e.target.value) })} />
                    <div className="slider-val">{settings.lineHeight}</div>
                  </div>
                </div>

                <div className="tc-inspector-divider">
                  <div className="tc-inspector-section-title">REFERENCE</div>
                  <div className="case-group">
                    {([{ value: "top" as const, label: "Above" }, { value: "bottom" as const, label: "Below" }]).map((p) => (
                      <button key={p.value} className={`case-btn${settings.refPosition === p.value ? " active" : ""}`} onClick={() => patch({ refPosition: p.value })}>{p.label}</button>
                    ))}
                  </div>

                  <div className="format-group" style={{ marginTop: "6px" }}>
                    {([
                      { value: "left" as const, IconComp: AlignLeft, label: "Left" },
                      { value: "center" as const, IconComp: AlignCenter, label: "Center" },
                      { value: "right" as const, IconComp: AlignRight, label: "Right" },
                    ]).map((a) => (
                      <button key={a.value} className={`format-btn${settings.refTextAlign === a.value ? " active" : ""}`} onClick={() => patch({ refTextAlign: a.value })} title={a.label}>
                        <a.IconComp size={16} />
                      </button>
                    ))}
                  </div>

                  <div className="case-group" style={{ marginTop: "6px" }}>
                    {([
                      { value: "uppercase" as const, label: "UPPER" },
                      { value: "capitalize" as const, label: "Title" },
                      { value: "none" as const, label: "Normal" },
                    ]).map((c) => (
                      <button key={c.value} className={`case-btn${settings.refTextTransform === c.value ? " active" : ""}`} onClick={() => patch({ refTextTransform: c.value })}>{c.label}</button>
                    ))}
                  </div>

                  <div className="slider-row">
                    <div className="slider-wrapper" style={{ flex: 1 }}>
                      <span>SIZE</span>
                      <input type="range" min={12} max={72} step={1} value={settings.refFontSize} onChange={(e) => patch({ refFontSize: Number(e.target.value) })} />
                      <div className="slider-val">{settings.refFontSize}px</div>
                    </div>
                  </div>

                  <div className="slider-row">
                    <div className="slider-wrapper" style={{ flex: 1 }}>
                      <span>LETTER SPACING</span>
                      <input type="range" min={0} max={6} step={0.5} value={settings.refLetterSpacing || 0} onChange={(e) => patch({ refLetterSpacing: Number(e.target.value) })} />
                      <div className="slider-val">{settings.refLetterSpacing || 0}px</div>
                    </div>
                  </div>

                  <div className="slider-row">
                    <div className="slider-wrapper" style={{ flex: 1 }}>
                      <span>SPACING</span>
                      <input type="range" min={4} max={40} step={2} value={settings.refSpacing || 16} onChange={(e) => patch({ refSpacing: Number(e.target.value) })} />
                      <div className="slider-val">{settings.refSpacing || 16}px</div>
                    </div>
                  </div>

                  <div className="typography-row">
                    <span className="tc-label-mono">COLOR</span>
                    <label className="color-box" style={{ backgroundColor: settings.refFontColor }}>
                      <input type="color" value={settings.refFontColor} onChange={(e) => patch({ refFontColor: e.target.value })} style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }} />
                    </label>
                  </div>

                  <div className="tc-inspector-toggle-row" style={{ marginTop: "10px" }}>
                    <span className="tc-label-mono">BADGE BOX</span>
                    <button className="tc-toggle-switch" data-active={settings.referenceBackgroundEnabled} onClick={() => patch({ referenceBackgroundEnabled: !settings.referenceBackgroundEnabled })} title="Toggle reference badge">
                      <span className="tc-toggle-knob" />
                    </button>
                  </div>

                  {settings.referenceBackgroundEnabled && (
                    <>
                      <div className="case-group" style={{ marginTop: "6px" }}>
                        {([
                          { value: "solid" as const, label: "Solid" },
                          { value: "pill" as const, label: "Pill" },
                          { value: "outline" as const, label: "Outline" },
                        ]).map((st) => (
                          <button key={st.value} className={`case-btn${settings.referenceBackgroundStyle === st.value ? " active" : ""}`} onClick={() => patch({ referenceBackgroundStyle: st.value })}>{st.label}</button>
                        ))}
                      </div>
                      <div className="typography-row" style={{ marginTop: "6px" }}>
                        <span className="tc-label-mono">BADGE COLOR</span>
                        <label className="color-box" style={{ backgroundColor: settings.referenceBackgroundColor }}>
                          <input type="color" value={settings.referenceBackgroundColor} onChange={(e) => patch({ referenceBackgroundColor: e.target.value })} style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }} />
                        </label>
                      </div>
                      <div className="slider-row">
                        <div className="slider-wrapper" style={{ flex: 1 }}>
                          <span>BADGE RADIUS</span>
                          <input type="range" min={0} max={24} step={1} value={settings.referenceBackgroundRadius ?? 4} onChange={(e) => patch({ referenceBackgroundRadius: Number(e.target.value) })} />
                          <div className="slider-val">{settings.referenceBackgroundRadius ?? 4}px</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {inspectorTab === "background" && (
              <div className="tc-inspector-panel">
                <div className="bg-row" onClick={openBackgroundModal} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBackgroundModal(); } }}>
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
                  </div>
                  <button className="bg-change-btn" onClick={(e) => { e.stopPropagation(); openBackgroundModal(); }} title="Change">Change</button>
                </div>
                <div className="opacity-row">
                  <span>OPACITY</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={backgroundOpacityPercent}
                    onChange={(e) => {
                      const nextOpacity = Number(e.target.value) / 100;
                      patch(activeVariant === "fullscreen" ? { backgroundOpacity: nextOpacity } : { boxOpacity: nextOpacity });
                    }}
                  />
                  <span>{backgroundOpacityPercent}%</span>
                </div>
                {activeVariant === "fullscreen" && (
                  <div className="tc-inspector-divider">
                    <div className="tc-inspector-toggle-row">
                      <span className="tc-label-mono">SHADE</span>
                      <button className="tc-toggle-switch" data-active={settings.fullscreenShadeEnabled} onClick={() => patch({ fullscreenShadeEnabled: !settings.fullscreenShadeEnabled })} title="Toggle shade">
                        <span className="tc-toggle-knob" />
                      </button>
                    </div>
                    {settings.fullscreenShadeEnabled && (
                      <div className="slider-row">
                        <div className="slider-wrapper" style={{ flex: 1 }}>
                          <span>SHADE OPACITY</span>
                          <input type="range" min={0} max={100} step={1} value={Math.round(settings.fullscreenShadeOpacity * 100)} onChange={(e) => patch({ fullscreenShadeOpacity: Number(e.target.value) / 100 })} />
                          <div className="slider-val">{Math.round(settings.fullscreenShadeOpacity * 100)}%</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {inspectorTab === "position" && (
              <div className="tc-inspector-panel">
                <div className="tc-inspector-section-title">SCREEN SPACE</div>
                <div className="slider-row">
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>PADDING</span>
                    <input type="range" min={0} max={120} value={settings.padding} onChange={(e) => patch({ padding: Number(e.target.value) })} />
                    <div className="slider-val">{settings.padding}px</div>
                  </div>
                </div>
                <div className="slider-row">
                  <div className="slider-wrapper" style={{ flex: 1 }}>
                    <span>SAFE AREA</span>
                    <input type="range" min={0} max={200} value={settings.safeArea} onChange={(e) => patch({ safeArea: Number(e.target.value) })} />
                    <div className="slider-val">{settings.safeArea}px</div>
                  </div>
                </div>

                {activeVariant === "lower-third" && (
                  <div className="tc-inspector-divider">
                    <div className="tc-inspector-section-title">LOWER THIRD</div>
                    <div className="case-group">
                      {([{ value: "left" as const, label: "Left" }, { value: "center" as const, label: "Center" }, { value: "right" as const, label: "Right" }]).map((p) => (
                        <button key={p.value} className={`case-btn${settings.lowerThirdPosition === p.value ? " active" : ""}`} onClick={() => patch({ lowerThirdPosition: p.value })}>{p.label}</button>
                      ))}
                    </div>
                    <div className="case-group">
                      {SIMPLE_LT_WIDTHS.map((w) => (
                        <button key={w.value} className={`case-btn${settings.lowerThirdWidthPreset === w.value ? " active" : ""}`} onClick={() => patch({ lowerThirdWidthPreset: w.value })}>{w.label}</button>
                      ))}
                    </div>
                    <div className="case-group">
                      {SIMPLE_LT_SIZES.map((s) => (
                        <button key={s.value} className={`case-btn${settings.lowerThirdSize === s.value ? " active" : ""}`} onClick={() => patch({ lowerThirdSize: s.value })}>{s.label}</button>
                      ))}
                    </div>
                    <div className="slider-row">
                      <div className="slider-wrapper" style={{ flex: 1 }}>
                        <span>HEIGHT</span>
                        <input type="range" min={0} max={650} step={10} value={settings.lowerThirdHeight} onChange={(e) => patch({ lowerThirdHeight: Number(e.target.value) })} />
                        <div className="slider-val">{settings.lowerThirdHeight || "Auto"}</div>
                      </div>
                    </div>
                    <div className="slider-row">
                      <div className="slider-wrapper" style={{ flex: 1 }}>
                        <span>CORNERS</span>
                        <input type="range" min={0} max={40} value={settings.borderRadius} onChange={(e) => patch({ borderRadius: Number(e.target.value) })} />
                        <div className="slider-val">{settings.borderRadius}px</div>
                      </div>
                    </div>
                    <div className="typography-row" style={{ marginTop: "8px" }}>
                      <span className="tc-label-mono">CARD COLOR</span>
                      <label className="color-box" style={{ backgroundColor: settings.boxBackground !== "transparent" ? settings.boxBackground : "#1e293b" }}>
                        <input type="color" value={settings.boxBackground.startsWith("#") ? settings.boxBackground : "#1e293b"} onChange={(e) => patch({ boxBackground: e.target.value })} style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }} />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {inspectorTab === "effects" && (
              <div className="tc-inspector-panel">
                <div className="tc-inspector-section-title">ANIMATION</div>
                <div className="btn-group" style={{ flexWrap: "wrap", gap: "4px" }}>
                  {([
                    { value: "none" as const, label: "None" },
                    { value: "fade" as const, label: "Fade" },
                    { value: "slide-up" as const, label: "Slide Up" },
                  ]).map((a) => (
                    <button key={a.value} className={`btn-tab${settings.animation === a.value ? " active" : ""}`} onClick={() => patch({ animation: a.value })}>{a.label}</button>
                  ))}
                </div>
                <div className="case-group">
                  {([
                    { value: 250, label: "Fast" },
                    { value: 500, label: "Normal" },
                    { value: 800, label: "Smooth" },
                  ]).map((d) => (
                    <button key={d.value} className={`case-btn${Math.abs(settings.animationDuration - d.value) <= 75 ? " active" : ""}`} onClick={() => patch({ animationDuration: d.value })}>{d.label}</button>
                  ))}
                </div>

                <div className="tc-inspector-divider">
                  <div className="tc-inspector-section-title">READABILITY</div>
                  <div className="slider-row">
                    <div className="slider-wrapper" style={{ flex: 1 }}>
                      <span>SHADOW</span>
                      <input type="range" min={0} max={20} step={1} value={settings.textShadow !== "none" ? (Number(settings.textShadow.match(/(\d+)px/)?.[1]) || 0) : 0} onChange={(e) => { const v = Number(e.target.value); patch({ textShadow: v > 0 ? `0 2px ${v}px rgba(0,0,0,0.6)` : "none" }); }} />
                    </div>
                  </div>
                  <div className="tc-inspector-toggle-row">
                    <span className="tc-label-mono">OUTLINE</span>
                    <button className="tc-toggle-switch" data-active={settings.textOutline} onClick={() => patch({ textOutline: !settings.textOutline })} title="Toggle outline">
                      <span className="tc-toggle-knob" />
                    </button>
                  </div>
                  {settings.textOutline && (
                    <>
                      <div className="typography-row" style={{ marginBottom: "8px" }}>
                        <span className="tc-label-mono">COLOR</span>
                        <label className="color-box" style={{ backgroundColor: settings.textOutlineColor }}>
                          <input type="color" value={settings.textOutlineColor} onChange={(e) => patch({ textOutlineColor: e.target.value })} style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }} />
                        </label>
                      </div>
                      <div className="slider-row">
                        <div className="slider-wrapper" style={{ flex: 1 }}>
                          <span>WIDTH</span>
                          <input type="range" min={1} max={8} step={0.5} value={settings.textOutlineWidth} onChange={(e) => patch({ textOutlineWidth: Number(e.target.value) })} />
                          <div className="slider-val">{settings.textOutlineWidth}px</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Background Picker Modal */}
      {showBackgroundModal && (
        <div className="tc-modal-overlay" onClick={() => setShowBackgroundModal(false)}>
          <div className="tc-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="tc-modal-header">
              <span>Choose Background</span>
              <button className="icon-btn" onClick={() => setShowBackgroundModal(false)} title="Close"><X size={16} /></button>
            </div>
            <div className="tc-modal-tabs">
              {BACKGROUND_PICKER_TABS.map((t) => (
                <button key={t.value} className={`tc-modal-tab${bgTab === t.value ? " active" : ""}`} onClick={() => setBgTab(t.value)}>{t.label}</button>
              ))}
            </div>
            <div className="tc-modal-body">
              <input ref={bgImportInputRef} type="file" accept={MEDIA_FILE_ACCEPT} style={{ display: "none" }} onChange={handleBgImportFile} />
              {bgTab === "color" && (
                <div className="tc-color-grid">
                  {BACKGROUND_COLOR_SWATCHES.map((swatch) => (
                    <button key={swatch} className={`tc-color-swatch${bgPickerColor === swatch ? " active" : ""}`} style={{ backgroundColor: swatch }} onClick={() => setBgPickerColor(swatch)} />
                  ))}
                  <div className="tc-color-custom">
                    <input type="color" value={bgPickerInputColor} onChange={(e) => setBgPickerColor(e.target.value)} />
                    <span>{bgPickerColor}</span>
                  </div>
                </div>
              )}
              {bgTab === "transparent" && (
                <div className="tc-transparent-option">
                  <button className="tc-transparent-btn" onClick={handleBgTransparent} title="Transparent Background">Transparent Background</button>
                </div>
              )}
              {bgTab === "my-images" && (
                <div className="tc-media-grid">
                  <button className="tc-media-thumb tc-media-thumb--import" onClick={() => bgImportInputRef.current?.click()} title="Import">
                    <Plus size={20} />
                    <span>Import</span>
                  </button>
                  {backgroundMediaLibrary.filter((item) => item.type === "image").map((item) => (
                    <button key={item.id} className="tc-media-thumb" onClick={() => handleBgSelectImage(item.url)}>
                      <img src={resolveMediaPreviewSrc(item)} alt={item.name} />
                    </button>
                  ))}
                </div>
              )}
              {bgTab === "my-videos" && (
                <div className="tc-media-grid">
                  {activeVariant === "fullscreen" && templateVideoAssets.map((asset) => {
                      const downloaded = findTemplateVideoDownload(asset);
                      return (
                        <div key={asset.id} className="tc-media-thumb tc-media-thumb--video">
                          <TemplateVideoPreview asset={asset} />
                          {!downloaded ? (
                            <button className="tc-media-download" onClick={() => handleTemplateVideoDownload(asset)} title="Download">
                              <Icon name="download" size={16} />
                            </button>
                          ) : (
                            <button className="tc-media-download tc-media-download--done" onClick={() => handleBgSelectVideo(downloaded.url)} title="Confirm">
                              <Icon name="check" size={16} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  <button className="tc-media-thumb tc-media-thumb--import" onClick={() => bgImportInputRef.current?.click()} title="Import">
                    <Plus size={20} />
                    <span>Import</span>
                  </button>
                  {backgroundMediaLibrary.filter((item) => item.type === "video").map((item) => (
                    <button key={item.id} className="tc-media-thumb tc-media-thumb--video" onClick={() => handleBgSelectVideo(item.url)} title={item.name}>
                      {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt={item.name} />
                      ) : (
                        <Icon name="videocam" size={24} />
                      )}
                    </button>
                  ))}
                </div>
              )}
              {bgTab === "patterns" && (
                <div className="tc-media-grid">
                  {BACKGROUND_PATTERNS.map((p) => (
                    <button key={p.label} className="tc-media-thumb" onClick={() => handleBgSelectPattern(p.src)}>
                      <img src={p.src} alt={p.label} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {bgTab === "color" && (
              <div className="tc-modal-footer">
                <button className="tc-modal-confirm" onClick={handleBgColorPickerConfirm} title="Apply">Apply Color</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}
