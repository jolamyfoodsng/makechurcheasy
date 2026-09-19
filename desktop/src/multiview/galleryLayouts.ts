/**
 * galleryLayouts.ts — JSON-driven Multi-View layout definitions
 *
 * Sources layouts from two places:
 *   1. All TEMPLATE_LIBRARY entries from templates.ts (auto-mapped)
 *   2. Extra hand-crafted gallery layouts (GALLERY_EXTRA)
 *
 * New layouts can be added without changing frontend code —
 * either append to GALLERY_EXTRA or add to TEMPLATE_LIBRARY.
 */

import { TEMPLATE_LIBRARY } from "./templates";
import type { TemplateDefinition } from "./types";

export type GalleryLayoutCategory =
  | "cameras"
  | "scripture"
  | "translation"
  | "speaker-focus"
  | "hybrid"
  | "multimedia"
  | "custom"
  | "added";

export interface GallerySlot {
  id: string;
  label: string;
  /** OBS source kind the slot expects */
  contentType: "camera" | "scripture" | "translation" | "lower-third" | "browser" | "image";
  /** Position on 1920×1080 canvas */
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface GalleryLayout {
  id: string;
  name: string;
  description: string;
  category: GalleryLayoutCategory;
  slots: GallerySlot[];
  useCases: string[];
  /** Scene name prefix used when creating in OBS */
  scenePrefix: string;
  /** Optional frame defaults applied when this layout is selected in the dock. */
  defaultFrameId?: string | null;
  defaultSlotFrames?: Record<string, string>;
}

export const GALLERY_CATEGORIES: { key: GalleryLayoutCategory | "all"; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "apps" },
  { key: "added", label: "Added", icon: "check_circle" },
  { key: "cameras", label: "Multi-source", icon: "view_week" },
  { key: "scripture", label: "Scripture", icon: "menu_book" },
  { key: "translation", label: "Translation", icon: "translate" },
  { key: "speaker-focus", label: "Speaker Focus", icon: "person" },
  { key: "hybrid", label: "Combined", icon: "dashboard" },
  { key: "multimedia", label: "Media", icon: "perm_media" },
  { key: "custom", label: "Custom", icon: "tune" },
];

// ── Template → Gallery mapping helpers ─────────────────────────────────────

const CATEGORY_MAP: Record<string, GalleryLayoutCategory> = {
  sermon: "speaker-focus",
  worship: "hybrid",
  "multi-camera": "cameras",
  announcement: "custom",
  multimedia: "multimedia",
  ceremony: "hybrid",
  youth: "custom",
  kids: "custom",
};

/**
 * Gallery copy describes the arrangement, not the equipment a user may put
 * into it. The underlying template names stay unchanged for compatibility;
 * these names are used by the user-facing gallery and Dock list.
 */
const GALLERY_COPY_OVERRIDES: Record<string, Pick<GalleryLayout, "name" | "description">> = {
  "tpl_worship": {
    name: "Full Frame + Lyrics Panel",
    description: "A full-canvas layout with a lower content panel for lyrics, Scripture, or media.",
  },
  "tpl_pip": {
    name: "Full Frame + Inset",
    description: "A full-canvas layout with a smaller inset area. Assign the content you want in each area.",
  },
  "tpl_two-up-split": {
    name: "Two-Up Split",
    description: "Two equal content areas side by side. Choose the scenes or sources to place in each area.",
  },
  "tpl_pre-service": {
    name: "Centered Content",
    description: "A centered content area on a branded background for countdowns, welcome screens, or announcements.",
  },
  "tpl_quad": {
    name: "Four-Up Grid",
    description: "Four equal content areas for monitoring or side-by-side content.",
  },
  "tpl_sermon-scripture": {
    name: "Main Content + Scripture",
    description: "A large content area beside a Scripture or notes panel. Assign your own scenes to both areas.",
  },
  "tpl_announcement": {
    name: "Full-Frame Content",
    description: "A full-screen content area for slides, graphics, announcements, or media.",
  },
  "tpl_three-up": {
    name: "Three-Up Columns",
    description: "Three equal content areas for monitoring or comparison.",
  },
  "tpl_logo-tr": {
    name: "Full Frame + Top-Right Overlay",
    description: "A full-frame layout with a top-right overlay area. Add your own image, logo, or browser source.",
  },
  "tpl_logo-tl": {
    name: "Full Frame + Top-Left Overlay",
    description: "A full-frame layout with a top-left overlay area. Add your own image, logo, or browser source.",
  },
  "tpl_logo-br": {
    name: "Full Frame + Bottom-Right Overlay",
    description: "A full-frame layout with a bottom-right overlay area. Add your own image, logo, or browser source.",
  },
  "tpl_logo-bl": {
    name: "Full Frame + Bottom-Left Overlay",
    description: "A full-frame layout with a bottom-left overlay area. Add your own image, logo, or browser source.",
  },
  "tpl_logo-2-top": {
    name: "Full Frame + Dual Top Overlays",
    description: "A full-frame layout with two overlay areas across the top. Add the branding or content you need.",
  },
  "tpl_logo-2-bottom": {
    name: "Full Frame + Dual Bottom Overlays",
    description: "A full-frame layout with two overlay areas across the bottom. Add the branding or content you need.",
  },
  "tpl_logo-4-corners": {
    name: "Full Frame + Corner Overlays",
    description: "A full-frame layout with four corner overlay areas for flexible branding or content.",
  },
  "tpl_sermon-slides": {
    name: "Main Content + Slides",
    description: "A main content area with a dedicated slides panel for teaching or presentations.",
  },
  "tpl_sermon-focus-pip": {
    name: "Main Content + Slide Inset",
    description: "A main content area with a smaller slide preview inset.",
  },
  "tpl_six-up": {
    name: "Six-Up Grid",
    description: "Six equal content areas for monitoring multiple scenes at once.",
  },
  "tpl_main-two-inserts": {
    name: "Main + Two Insets",
    description: "A main content area with two smaller inset areas.",
  },
  "tpl_multimedia-scene-portrait": {
    name: "Main + Portrait Panel",
    description: "A full-canvas area with a portrait panel for vertical media or a secondary scene.",
  },
  "tpl_multimedia-scene-half-left": {
    name: "Main + Left Panel",
    description: "A full-canvas area with a half-width panel on the left for secondary content.",
  },
};

const GALLERY_TAG_LABELS: Record<string, string> = {
  camera: "content",
  "multi-camera": "multi-source",
  logo: "overlay",
  branding: "overlays",
  scene: "content",
};

const LOGO_POSITION_BY_TEMPLATE: Record<string, string> = {
  "tpl_logo-tr": "top-right",
  "tpl_logo-tl": "top-left",
  "tpl_logo-br": "bottom-right",
  "tpl_logo-bl": "bottom-left",
};

function mapContentType(regionType: string, name: string, slotLabel?: string): GallerySlot["contentType"] {
  const haystack = `${name} ${slotLabel || ""}`.toLowerCase();
  if (regionType === "image-overlay") return "image";
  if (regionType === "color") return "lower-third";
  if (regionType === "browser") return "browser";
  if (regionType === "media") return "camera";
  if (regionType === "video-input") return "camera";
  // obs-scene — infer from name
  if (/scripture|verse|bible|notes|liturgy|reading/.test(haystack)) return "scripture";
  if (/translation|lang(uage)?|caption|subtitle/.test(haystack)) return "translation";
  if (/lower.?third|name.?bar|info.?text|info.?strip|topic|hashtag/.test(haystack)) return "lower-third";
  if (/logo|photo|qr|frame|overlay|graphic/.test(haystack)) return "image";
  return "camera";
}

function getGallerySlotLabel(
  templateId: string,
  contentType: GallerySlot["contentType"],
  name: string,
  slotLabel?: string,
): string {
  const label = (slotLabel || name).trim();

  if (contentType === "camera" && /^(main|primary|full[- ]screen)\s+(source|slot)$/i.test(label)) {
    return "Main content";
  }

  if (contentType === "camera" && /camera/i.test(label)) {
    return label.replace(/camera/gi, "content");
  }

  if (contentType === "image" && /logo/i.test(label)) {
    const position = label.match(/top[- ]left|top[- ]right|bottom[- ]left|bottom[- ]right/i)?.[0]
      ?? LOGO_POSITION_BY_TEMPLATE[templateId];
    return position ? `${position.replace(/-/g, " ")} overlay` : "Overlay area";
  }

  return label;
}

function getGalleryUseCases(tags: string[]): string[] {
  return tags.slice(0, 3).map((tag) => GALLERY_TAG_LABELS[tag.toLowerCase()] ?? tag);
}

function templateToGalleryLayout(tpl: TemplateDefinition): GalleryLayout {
  const id = tpl.id.replace("tpl_", "");
  const copy = GALLERY_COPY_OVERRIDES[tpl.id];
  return {
    id,
    name: copy?.name ?? tpl.name,
    description: copy?.description ?? tpl.description,
    category: CATEGORY_MAP[tpl.category] || "custom",
    scenePrefix: `MultiView - ${tpl.name}`,
    useCases: getGalleryUseCases(tpl.tags),
    defaultFrameId: tpl.dockFrameId,
    defaultSlotFrames: tpl.dockSlotFrames
      ? Object.fromEntries(
          Object.entries(tpl.dockSlotFrames).map(([key, value]) => [key.replace(/^tpl_r_/, ""), value]),
        )
      : undefined,
    slots: tpl.regions.map((r) => ({
      id: r.id.replace("tpl_r_", ""),
      label: getGallerySlotLabel(
        tpl.id,
        mapContentType(r.type, r.name, r.slotLabel),
        r.name,
        r.slotLabel,
      ),
      contentType: mapContentType(r.type, r.name, r.slotLabel),
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      zIndex: r.zIndex,
    })),
  };
}

// ── Auto-generated from templates.ts ───────────────────────────────────────

const GALLERY_FROM_TEMPLATES: GalleryLayout[] = TEMPLATE_LIBRARY.map(templateToGalleryLayout);

// ── Extra hand-crafted layouts (not in TEMPLATE_LIBRARY) ───────────────────

const GALLERY_EXTRA: GalleryLayout[] = [
  {
    id: "translation-layout",
    name: "Main Content + Translation",
    description: "A full-width content area with two translation bands. Assign the languages you need.",
    category: "translation",
    scenePrefix: "MultiView - Translation",
    useCases: ["Multilingual services", "International broadcasts", "Mission events"],
    slots: [
      { id: "camera", label: "Main content", contentType: "camera", x: 0, y: 0, width: 1920, height: 702, zIndex: 1 },
      { id: "lang-primary", label: "Primary translation", contentType: "translation", x: 0, y: 702, width: 1920, height: 189, zIndex: 2 },
      { id: "lang-secondary", label: "Secondary translation", contentType: "translation", x: 0, y: 891, width: 1920, height: 189, zIndex: 3 },
    ],
  },
  {
    id: "speaker-scripture-translation",
    name: "Main Content + Scripture + Translation",
    description: "A main content area with Scripture and translation areas. Assign your own scenes to each area.",
    category: "hybrid",
    scenePrefix: "MultiView - Speaker Scripture Translation",
    useCases: ["Premium church broadcasts", "Full-service production", "Simultaneous translation services"],
    slots: [
      { id: "camera", label: "Main content", contentType: "camera", x: 0, y: 0, width: 1056, height: 702, zIndex: 1 },
      { id: "scripture", label: "Scripture area", contentType: "scripture", x: 1056, y: 0, width: 864, height: 702, zIndex: 2 },
      { id: "translation", label: "Translation area", contentType: "translation", x: 0, y: 702, width: 1920, height: 378, zIndex: 3 },
    ],
  },
];

// ── Exported combined list ─────────────────────────────────────────────────

export const GALLERY_LAYOUTS: GalleryLayout[] = [
  ...GALLERY_FROM_TEMPLATES,
  ...GALLERY_EXTRA,
];
