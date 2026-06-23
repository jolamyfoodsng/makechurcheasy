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
}

export const GALLERY_CATEGORIES: { key: GalleryLayoutCategory | "all"; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "apps" },
  { key: "added", label: "Added", icon: "check_circle" },
  { key: "cameras", label: "Cameras", icon: "videocam" },
  { key: "scripture", label: "Scripture", icon: "menu_book" },
  { key: "translation", label: "Translation", icon: "translate" },
  { key: "speaker-focus", label: "Speaker Focus", icon: "person" },
  { key: "hybrid", label: "Hybrid", icon: "dashboard" },
  { key: "custom", label: "Custom", icon: "tune" },
];

// ── Template → Gallery mapping helpers ─────────────────────────────────────

const CATEGORY_MAP: Record<string, GalleryLayoutCategory> = {
  sermon: "speaker-focus",
  worship: "hybrid",
  "multi-camera": "cameras",
  announcement: "custom",
  ceremony: "hybrid",
  youth: "custom",
  kids: "custom",
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

function templateToGalleryLayout(tpl: TemplateDefinition): GalleryLayout {
  const id = tpl.id.replace("tpl_", "");
  return {
    id,
    name: tpl.name,
    description: tpl.description,
    category: CATEGORY_MAP[tpl.category] || "custom",
    scenePrefix: `MultiView - ${tpl.name}`,
    useCases: tpl.tags.slice(0, 3),
    slots: tpl.regions.map((r) => ({
      id: r.id.replace("tpl_r_", ""),
      label: r.slotLabel || r.name,
      contentType: mapContentType(r.type, r.name, r.slotLabel),
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
    })),
  };
}

// ── Auto-generated from templates.ts ───────────────────────────────────────

const GALLERY_FROM_TEMPLATES: GalleryLayout[] = TEMPLATE_LIBRARY.map(templateToGalleryLayout);

// ── Extra hand-crafted layouts (not in TEMPLATE_LIBRARY) ───────────────────

const GALLERY_EXTRA: GalleryLayout[] = [
  {
    id: "translation-layout",
    name: "Translation Layout",
    description: "Display translated captions under the speaker video.",
    category: "translation",
    scenePrefix: "MultiView - Translation",
    useCases: ["Multilingual services", "International broadcasts", "Mission events"],
    slots: [
      { id: "camera", label: "Camera", contentType: "camera", x: 0, y: 0, width: 1920, height: 702 },
      { id: "lang-primary", label: "English", contentType: "translation", x: 0, y: 702, width: 1920, height: 189 },
      { id: "lang-secondary", label: "Yoruba", contentType: "translation", x: 0, y: 891, width: 1920, height: 189 },
    ],
  },
  {
    id: "speaker-scripture-translation",
    name: "Speaker + Scripture + Translation",
    description: "Combined sermon layout showing speaker, scripture, and translation.",
    category: "hybrid",
    scenePrefix: "MultiView - Speaker Scripture Translation",
    useCases: ["Premium church broadcasts", "Full-service production", "Simultaneous translation services"],
    slots: [
      { id: "camera", label: "Camera", contentType: "camera", x: 0, y: 0, width: 1056, height: 702 },
      { id: "scripture", label: "Scripture", contentType: "scripture", x: 1056, y: 0, width: 864, height: 702 },
      { id: "translation", label: "Translation", contentType: "translation", x: 0, y: 702, width: 1920, height: 378 },
    ],
  },
];

// ── Exported combined list ─────────────────────────────────────────────────

export const GALLERY_LAYOUTS: GalleryLayout[] = [
  ...GALLERY_FROM_TEMPLATES,
  ...GALLERY_EXTRA,
];
