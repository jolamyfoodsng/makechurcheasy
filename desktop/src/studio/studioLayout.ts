/**
 * studioLayout.ts — the Studio's saved layout: which section is open, panel sizes, the
 * Schedule / History dock, the Queue drawer, Full screen / Lower third, and the camera.
 *
 * Saved on every change and read back when the Studio opens. The microphone and Auto mode are
 * NOT restored as running: the operator starts listening and turns Auto mode on again.
 */
import type { StudioCameraLayout, StudioMode, StudioTransition } from "./studioEngine";

export type StudioSection = "bible" | "worship" | "media" | "docs";

export interface StudioLayout {
  section: StudioSection;
  /** Verse AI sidebar width (px). */
  verseAiWidth: number;
  /** Verse AI folded to a slim rail (mic button and counts). */
  verseAiCollapsed: boolean;
  /** Preview column width (px); the Bible / song / media workspace gets the rest. */
  previewWidth: number;
  drawer: { open: boolean; tab: "queue" | "suggestions" | "graphics" | "mine"; height: number };
  dock: { open: boolean; pinned: boolean; tab: "schedule" | "history"; width: number };
  displayMode: StudioMode;
  transition: StudioTransition;
  /** Clicking a slide previews it (true) or shows it at once (false). */
  previewFirst: boolean;
  camera: { deviceId: string; layout: StudioCameraLayout };
  /** "Show Bible / Lyrics / Text": the words are on the screen (true) or hidden (false), whatever the camera does. */
  wordsOn: boolean;
  /** Last microphone the operator picked (Verse AI keeps its own copy too). */
  micId: string;
  /** Quick text size for words on the screen, percent of the theme's own size. */
  textScale: number;
  /** Quick Bold / Italic on top of any theme. */
  textBold: boolean;
  textItalic: boolean;
  /** Logo size on the screen, percent of its normal size. */
  logoScale: number;
}

export const LAYOUT_LIMITS = {
  verseAi: { min: 240, max: 480 },
  preview: { min: 300, max: 1100 },
  drawer: { min: 44, max: 520 },
  dock: { min: 240, max: 520 },
  /** The workspace beside the Preview never gets narrower than this. */
  workspaceMin: 400,
  /** Even stacked, the middle never gets narrower than this (the dock floats / Verse AI folds first). */
  centerMin: 460,
  /**
   * Small window, still side by side: a slimmer Preview (controls shown as icons) and a slimmer
   * workspace, instead of stacking the Preview on top of the workspace.
   */
  compact: { preview: 200, previewWanted: 260, workspace: 320 },
  /** Padding and gaps between the columns. */
  chrome: 16 + 3 * 8,
} as const;

/** Height of the drawer when it is collapsed to its tab row. */
export const DRAWER_COLLAPSED = 40;

/** Width of the folded Verse AI rail. */
export const VERSE_AI_RAIL = 58;

const KEY = "mce-studio-layout-v3";
const OLD_PREFS_KEY = "mce-studio-prefs";

export const DEFAULT_LAYOUT: StudioLayout = {
  section: "bible",
  verseAiWidth: 320,
  verseAiCollapsed: false,
  previewWidth: 560,
  drawer: { open: true, tab: "queue", height: 170 },
  dock: { open: false, pinned: false, tab: "schedule", width: 300 },
  displayMode: "fullscreen",
  transition: "fade",
  previewFirst: true,
  camera: { deviceId: "", layout: "behind-content" },
  wordsOn: true,
  micId: "",
  textScale: 100,
  textBold: false,
  textItalic: false,
  logoScale: 100,
};

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

const SECTIONS: StudioSection[] = ["bible", "worship", "media", "docs"];
const LAYOUTS: StudioCameraLayout[] = ["camera-only", "behind-content", "in-front", "hidden"];

/** Merge saved values over the defaults, dropping anything unknown or out of range. */
export function normalizeLayout(raw: unknown): StudioLayout {
  const d = DEFAULT_LAYOUT;
  if (!raw || typeof raw !== "object") return { ...d, drawer: { ...d.drawer }, dock: { ...d.dock }, camera: { ...d.camera } };
  const r = raw as Partial<StudioLayout> & { source?: string; look?: StudioMode };
  const drawer: Partial<StudioLayout["drawer"]> = r.drawer && typeof r.drawer === "object" ? r.drawer : {};
  const dock: Partial<StudioLayout["dock"]> = r.dock && typeof r.dock === "object" ? r.dock : {};
  const camera: Partial<StudioLayout["camera"]> = r.camera && typeof r.camera === "object" ? r.camera : {};
  // The old Studio called Docs "notes" and kept the look as `look`.
  const sectionRaw = r.section ?? (r.source === "notes" ? "docs" : r.source);
  return {
    section: SECTIONS.includes(sectionRaw as StudioSection) ? (sectionRaw as StudioSection) : d.section,
    verseAiWidth: clamp(Number(r.verseAiWidth ?? d.verseAiWidth), LAYOUT_LIMITS.verseAi.min, LAYOUT_LIMITS.verseAi.max),
    verseAiCollapsed: r.verseAiCollapsed === true,
    previewWidth: clamp(Number(r.previewWidth ?? d.previewWidth), LAYOUT_LIMITS.preview.min, LAYOUT_LIMITS.preview.max),
    drawer: {
      open: typeof drawer.open === "boolean" ? drawer.open : d.drawer.open,
      tab: drawer.tab === "graphics" ? "graphics" : drawer.tab === "mine" ? "mine" : drawer.tab === "suggestions" ? "suggestions" : "queue",
      height: clamp(Number(drawer.height ?? d.drawer.height), 100, LAYOUT_LIMITS.drawer.max),
    },
    dock: {
      open: typeof dock.open === "boolean" ? dock.open : d.dock.open,
      pinned: typeof dock.pinned === "boolean" ? dock.pinned : d.dock.pinned,
      tab: dock.tab === "history" ? "history" : "schedule",
      width: clamp(Number(dock.width ?? d.dock.width), LAYOUT_LIMITS.dock.min, LAYOUT_LIMITS.dock.max),
    },
    displayMode: (r.displayMode ?? r.look) === "lower-third" ? "lower-third" : "fullscreen",
    transition: r.transition === "cut" ? "cut" : "fade",
    previewFirst: typeof r.previewFirst === "boolean" ? r.previewFirst : d.previewFirst,
    camera: {
      deviceId: typeof camera.deviceId === "string" ? camera.deviceId : "",
      layout: LAYOUTS.includes(camera.layout as StudioCameraLayout) ? (camera.layout as StudioCameraLayout) : d.camera.layout,
    },
    // Older saves: "Camera only" meant the words were off.
    wordsOn: typeof r.wordsOn === "boolean" ? r.wordsOn : camera.layout !== "camera-only",
    micId: typeof r.micId === "string" ? r.micId : "",
    textScale: clamp(Number(r.textScale ?? d.textScale), 70, 160),
    textBold: r.textBold === true,
    textItalic: r.textItalic === true,
    logoScale: clamp(Number(r.logoScale ?? d.logoScale), 30, 250),
  };
}

export function readLayout(): StudioLayout {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeLayout(JSON.parse(raw));
    // First run of this Studio: carry over the old Studio's choices.
    const old = localStorage.getItem(OLD_PREFS_KEY);
    return normalizeLayout(old ? JSON.parse(old) : null);
  } catch {
    return normalizeLayout(null);
  }
}

export function saveLayout(layout: StudioLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* storage full or blocked: the layout just isn't remembered */
  }
}

export interface ColumnPlan {
  /** Verse AI sidebar (0 when hidden). */
  verseAi: number;
  /** Schedule / History dock (0 when closed). */
  dock: number;
  /** Preview column. */
  preview: number;
  /** Workspace beside the Preview. */
  workspace: number;
  /** Too narrow for side by side: the Preview goes above the workspace. */
  stacked: boolean;
  /** Small window, but still side by side: the Preview column is slim and its controls are icons. */
  compact: boolean;
  /** Too narrow to share the row: the Schedule / History floats over the right edge instead. */
  dockOverlay: boolean;
  /** Too narrow for the full Verse AI sidebar: show its slim rail. */
  verseAiRail: boolean;
}

/**
 * Fit the columns into the window. The docked Schedule / History takes its own space (it never
 * covers the Preview); the Verse AI sidebar and the dock give way first on small screens, then
 * the Preview, and below that the Preview stacks over the workspace instead of getting unusable.
 */
export function planColumns(
  total: number,
  opts: { verseAi: number | null; dock: number | null; preview: number },
): ColumnPlan {
  const plan = planColumnsFlat(total, opts);
  if (!plan.stacked) return plan;
  const width = Math.max(0, total - LAYOUT_LIMITS.chrome);
  // A) Small window: keep Bible / Worship / Media on the left and a slim Preview on the right. The
  //    Schedule becomes a dropdown over the edge, and Verse AI folds to its rail if it has to.
  const dropdownDock = opts.dock === null ? 0 : clamp(opts.dock, LAYOUT_LIMITS.dock.min, Math.max(LAYOUT_LIMITS.dock.min, width - 24));
  const withoutDock = { ...opts, dock: null };
  let slim = planColumnsFlat(total, withoutDock, true);
  if (!slim.stacked) {
    return { ...slim, dock: dropdownDock, dockOverlay: opts.dock !== null, compact: true };
  }
  if (opts.verseAi !== null && opts.verseAi > VERSE_AI_RAIL) {
    slim = planColumnsFlat(total, { ...withoutDock, verseAi: VERSE_AI_RAIL }, true);
    if (!slim.stacked) {
      return { ...slim, dock: dropdownDock, dockOverlay: opts.dock !== null, verseAiRail: true, compact: true };
    }
  }
  // B) Not even that fits: the Preview goes above the workspace.
  if (plan.workspace >= LAYOUT_LIMITS.centerMin) return plan;
  // 1) The dock stops sharing the row: it floats over the right edge, the middle keeps its room.
  let next = plan;
  let dockOverlay = false;
  if (opts.dock !== null) {
    next = planColumnsFlat(total, { ...opts, dock: null });
    dockOverlay = true;
  }
  // 2) Still too tight: Verse AI folds to its slim rail.
  let verseAiRail = false;
  if (next.stacked && next.workspace < LAYOUT_LIMITS.centerMin && opts.verseAi !== null && next.verseAi > VERSE_AI_RAIL) {
    const center = Math.max(0, width - VERSE_AI_RAIL);
    next = { ...next, verseAi: VERSE_AI_RAIL, preview: center, workspace: center };
    verseAiRail = true;
  }
  const dock = dockOverlay ? clamp(opts.dock ?? 0, LAYOUT_LIMITS.dock.min, Math.max(LAYOUT_LIMITS.dock.min, width - 24)) : 0;
  return { ...next, dock, dockOverlay, verseAiRail };
}

function planColumnsFlat(
  total: number,
  opts: { verseAi: number | null; dock: number | null; preview: number },
  compact = false,
): ColumnPlan {
  const width = Math.max(0, total - LAYOUT_LIMITS.chrome);
  const previewMin = compact ? LAYOUT_LIMITS.compact.preview : LAYOUT_LIMITS.preview.min;
  const workspaceMin = compact ? LAYOUT_LIMITS.compact.workspace : LAYOUT_LIMITS.workspaceMin;
  let verseAi = opts.verseAi === null ? 0 : opts.verseAi;
  let dock = opts.dock === null ? 0 : opts.dock;
  const minCenter = workspaceMin + previewMin;
  // Shrink the side panels (down to their minimums) before squeezing the centre.
  let center = width - verseAi - dock;
  if (center < minCenter) {
    let need = minCenter - center;
    const shrink = (current: number, min: number) => {
      if (current === 0) return current;
      const room = Math.max(0, current - min);
      const take = Math.min(room, need);
      need -= take;
      return current - take;
    };
    dock = shrink(dock, LAYOUT_LIMITS.dock.min);
    verseAi = shrink(verseAi, LAYOUT_LIMITS.verseAi.min);
    center = width - verseAi - dock;
  }
  if (center < minCenter) {
    return { verseAi, dock, preview: Math.max(0, center), workspace: Math.max(0, center), stacked: true, compact: false, dockOverlay: false, verseAiRail: false };
  }
  // Small window: the Preview gives way, the workspace keeps the room.
  const wantedPreview = compact ? Math.min(opts.preview, LAYOUT_LIMITS.compact.previewWanted) : opts.preview;
  const preview = clamp(wantedPreview, previewMin, Math.min(LAYOUT_LIMITS.preview.max, center - workspaceMin));
  return { verseAi, dock, preview, workspace: center - preview, stacked: false, compact: false, dockOverlay: false, verseAiRail: false };
}
