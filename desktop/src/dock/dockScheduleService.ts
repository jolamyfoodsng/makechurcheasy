/**
 * dockScheduleService.ts — Centralized service for managing service schedules in the Dock.
 *
 * Connects the Dock tabs (Bible, Worship, Media, Sermon) directly to the Service Planner
 * using dockClient and local caching for instant, zero-latency feedback.
 */

import { dockClient } from "../services/dockBridge";
import {
  createServicePlan,
  createServicePlanItem,
  isServicePlannerSnapshot,
  type ServicePlan,
  type ServicePlanItem,
  type ServicePlannerSnapshot,
} from "../service-planner/types";
import { isDockFreePlan } from "./dockEntitlement";

const DOCK_SCHEDULE_CACHE_KEY = "__mce_dock_service_plans_v1";
const DOCK_ACTIVE_PLAN_ID_KEY = "__mce_dock_active_plan_id_v1";
export const DOCK_HISTORY_CACHE_KEY = "__mce_dock_presentation_history_v1";

export const DOCK_SCHEDULE_CHANGED_EVENT = "dock:schedule-changed";
export const DOCK_SCHEDULE_TOAST_EVENT = "dock:schedule-toast";
export const DOCK_HISTORY_CHANGED_EVENT = "dock:history-changed";
export const DOCK_SELECT_WORSHIP_SONG_EVENT = "dock:select-worship-song";
export const DOCK_SELECT_NOTE_EVENT = "dock:select-note";

export interface DockSelectWorshipSongDetail {
  songId?: string;
  songTitle?: string;
}

export interface DockSelectNoteDetail {
  noteId?: string;
  noteTitle?: string;
}

let pendingWorshipSongSelection: DockSelectWorshipSongDetail | null = null;
let pendingNoteSelection: DockSelectNoteDetail | null = null;

export function setPendingWorshipSongSelection(detail: DockSelectWorshipSongDetail | null): void {
  pendingWorshipSongSelection = detail;
}

export function getPendingWorshipSongSelection(): DockSelectWorshipSongDetail | null {
  return pendingWorshipSongSelection;
}

export function setPendingNoteSelection(detail: DockSelectNoteDetail | null): void {
  pendingNoteSelection = detail;
}

export function getPendingNoteSelection(): DockSelectNoteDetail | null {
  return pendingNoteSelection;
}

export interface ScheduleToastPayload {
  message: string;
  type?: "success" | "info" | "error";
}

let inMemorySnapshot: ServicePlannerSnapshot | null = null;
let inMemoryHistory: ServicePlanItem[] | null = null;

export function notifyScheduleToast(message: string, type: "success" | "info" | "error" = "success"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ScheduleToastPayload>(DOCK_SCHEDULE_TOAST_EVENT, {
    detail: { message, type },
  }));
}

export function notifyScheduleChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DOCK_SCHEDULE_CHANGED_EVENT));
}

export function notifyHistoryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DOCK_HISTORY_CHANGED_EVENT));
}

/**
 * Normalizes a Bible reference display label by deduplicating parenthesized version suffixes
 * like "(KJV) (KJV)" -> "(KJV)".
 */
export function normalizeBibleReferenceLabel(label: string): string {
  if (!label) return "";
  return label
    .replace(/(\([A-Za-z0-9_/-]+\))(?:\s*\1)+/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function readCachedScheduleSnapshot(): ServicePlannerSnapshot | null {
  if (inMemorySnapshot) return inMemorySnapshot;
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(DOCK_SCHEDULE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (isServicePlannerSnapshot(parsed)) {
      const isFree = isDockFreePlan();
      const sanitized: ServicePlannerSnapshot = {
        ...parsed,
        plans: parsed.plans.map((p) => {
          const items = p.items.map((it) => (it.type === "bible" ? { ...it, label: normalizeBibleReferenceLabel(it.label) } : it));
          return {
            ...p,
            items: isFree && items.length > 3 ? items.slice(0, 3) : items,
          };
        }),
        activePlan: parsed.activePlan
          ? {
              ...parsed.activePlan,
              items: (() => {
                const items = parsed.activePlan.items.map((it) => (it.type === "bible" ? { ...it, label: normalizeBibleReferenceLabel(it.label) } : it));
                return isFree && items.length > 3 ? items.slice(0, 3) : items;
              })(),
            }
          : parsed.activePlan,
      };
      inMemorySnapshot = sanitized;
      return sanitized;
    }
  } catch {
    // Ignore cache parse errors
  }
  return null;
}

export function writeCachedScheduleSnapshot(snapshot: ServicePlannerSnapshot): void {
  inMemorySnapshot = snapshot;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DOCK_SCHEDULE_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage quota or restricted context
  }
}

export function getCachedActivePlanId(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(DOCK_ACTIVE_PLAN_ID_KEY) || "";
}

export function setCachedActivePlanId(id: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DOCK_ACTIVE_PLAN_ID_KEY, id);
}

/**
 * Returns the currently active plan, creating a default one if none exist.
 */
export function getOrCreateActiveSchedule(): { snapshot: ServicePlannerSnapshot; activePlan: ServicePlan } {
  let snapshot = readCachedScheduleSnapshot();
  const cachedActiveId = getCachedActivePlanId();

  if (!snapshot || snapshot.plans.length === 0) {
    const defaultPlan = createServicePlan({
      title: "Sunday Service",
      status: "active",
      serviceDate: new Date().toISOString().slice(0, 10),
    });
    snapshot = {
      plans: [defaultPlan],
      activePlan: defaultPlan,
    };
    writeCachedScheduleSnapshot(snapshot);
    setCachedActivePlanId(defaultPlan.id);
    return { snapshot, activePlan: defaultPlan };
  }

  let activePlan = (cachedActiveId ? snapshot.plans.find((p) => p.id === cachedActiveId) : null)
    ?? snapshot.plans.find((p) => p.status === "active")
    ?? snapshot.plans[0];

  if (!activePlan) {
    activePlan = createServicePlan({
      title: "Sunday Service",
      status: "active",
    });
    snapshot.plans.push(activePlan);
    snapshot.activePlan = activePlan;
  }

  return { snapshot, activePlan };
}

/**
 * Saves a plan to the local cache and pushes it to the main desktop application over dockClient.
 */
export function saveSchedulePlan(plan: ServicePlan): void {
  const { snapshot } = getOrCreateActiveSchedule();
  const existingIdx = snapshot.plans.findIndex((p) => p.id === plan.id);
  const items = isDockFreePlan() && plan.items.length > 3 ? plan.items.slice(0, 3) : plan.items;
  const updatedPlan: ServicePlan = { ...plan, items, updatedAt: Date.now() };

  let nextPlans: ServicePlan[];
  if (existingIdx >= 0) {
    nextPlans = snapshot.plans.map((p, i) => (i === existingIdx ? updatedPlan : p));
  } else {
    nextPlans = [...snapshot.plans, updatedPlan];
  }

  const updatedSnapshot: ServicePlannerSnapshot = {
    plans: nextPlans,
    activePlan: updatedPlan,
  };

  writeCachedScheduleSnapshot(updatedSnapshot);
  setCachedActivePlanId(updatedPlan.id);
  notifyScheduleChanged();

  // Send update to the main desktop app
  dockClient.sendCommand({
    type: "service-plan:save",
    payload: updatedPlan,
    timestamp: Date.now(),
    commandId: `dock-plan-save-${updatedPlan.id}-${Date.now()}`,
  });
}

/**
 * Add a generic item to the active schedule.
 */
export function addItemToActiveSchedule(item: Omit<ServicePlanItem, "id" | "createdAt" | "updatedAt">): ServicePlanItem {
  const { activePlan } = getOrCreateActiveSchedule();
  const fullItem = createServicePlanItem(item);
  const prepended = [fullItem, ...activePlan.items];
  const nextItems = isDockFreePlan() && prepended.length > 3
    ? prepended.slice(0, 3)
    : prepended;

  const updatedPlan: ServicePlan = {
    ...activePlan,
    // Prepend new item to active schedule: items: [fullItem, ...activePlan.items]
    items: nextItems,
    updatedAt: Date.now(),
  };

  saveSchedulePlan(updatedPlan);
  notifyScheduleToast(`Added "${fullItem.label}" to ${activePlan.title}`);
  return fullItem;
}

/**
 * Add Bible passage to the active schedule.
 */
export function addBibleToActiveSchedule(params: {
  reference: string;
  text: string;
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  verseEnd?: number;
  verseRange?: string;
  overlayMode?: "fullscreen" | "lower-third";
  theme?: string;
  bibleThemeSettings?: Record<string, unknown> | null;
}): ServicePlanItem {
  const verseRange = params.verseRange || (params.verseEnd && params.verseEnd !== params.verse
    ? `${params.verse}-${params.verseEnd}`
    : String(params.verse));

  const rawRef = (params.reference || "").trim();
  const cleanRef = params.translation
    ? rawRef.replace(new RegExp(`\\s*\\(${params.translation}\\)\\s*$`, "i"), "").trim()
    : rawRef;
  const displayRef = normalizeBibleReferenceLabel(
    params.translation ? `${cleanRef} (${params.translation})` : cleanRef
  );

  return addItemToActiveSchedule({
    type: "bible",
    sourceKind: "bible-reference",
    label: displayRef,
    subtitle: params.text.slice(0, 120),
    notes: `${params.translation} · ${params.reference}`,
    payloadSnapshot: {
      book: params.book,
      chapter: params.chapter,
      verse: params.verse,
      verseEnd: params.verseEnd,
      verseRange,
      referenceLabel: params.reference,
      translation: params.translation,
      verseText: params.text,
      overlayMode: params.overlayMode || "fullscreen",
      theme: params.theme,
      bibleThemeSettings: params.bibleThemeSettings,
    },
  });
}

/**
 * Add Media item (picture or video) to the active schedule.
 */
export function addMediaToActiveSchedule(params: {
  name: string;
  filePath: string;
  fileName: string;
  mediaType: "image" | "video";
  id?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
}): ServicePlanItem {
  return addItemToActiveSchedule({
    type: "media",
    sourceId: params.id,
    sourceKind: "media-library-item",
    label: params.name,
    subtitle: params.mediaType === "video" ? "Video media" : "Picture media",
    notes: params.fileName,
    payloadSnapshot: {
      filePath: params.filePath,
      fileName: params.fileName,
      mediaType: params.mediaType,
      thumbnailUrl: params.thumbnailUrl,
      previewUrl: params.previewUrl,
    },
  });
}

/**
 * Add Worship song or lyric section to the active schedule.
 */
export function addWorshipToActiveSchedule(params: {
  songTitle: string;
  sectionLabel: string;
  sectionText: string;
  artist?: string;
  songId?: string;
  sectionIdx?: number;
  overlayMode?: "fullscreen" | "lower-third";
  theme?: string;
  bibleThemeSettings?: Record<string, unknown> | null;
  linesPerSlide?: number;
  autoSplit?: boolean;
}): ServicePlanItem {
  const cleanLabel = `${params.songTitle} · ${params.sectionLabel}`;
  return addItemToActiveSchedule({
    type: "worship",
    sourceId: params.songId,
    sourceKind: "worship-song-section",
    label: cleanLabel,
    subtitle: params.sectionText.split("\n").filter((l) => l.trim()).slice(0, 2).join(" / "),
    notes: params.artist,
    payloadSnapshot: {
      songTitle: params.songTitle,
      sectionLabel: params.sectionLabel,
      sectionText: params.sectionText,
      artist: params.artist,
      sectionIdx: params.sectionIdx,
      overlayMode: params.overlayMode || "lower-third",
      theme: params.theme,
      bibleThemeSettings: params.bibleThemeSettings,
      linesPerSlide: params.linesPerSlide,
      autoSplit: params.autoSplit,
    },
  });
}

/**
 * Add an entire Worship song to the active schedule.
 */
export function addWholeWorshipSongToActiveSchedule(params: {
  songTitle: string;
  artist?: string;
  lyrics: string;
  songId?: string;
  overlayMode?: "fullscreen" | "lower-third";
  theme?: string;
  bibleThemeSettings?: Record<string, unknown> | null;
  linesPerSlide?: number;
  autoSplit?: boolean;
}): ServicePlanItem {
  const cleanTitle = params.songTitle.trim();
  const firstLines = params.lyrics.split("\n").map((l) => l.trim()).filter(Boolean);
  const previewSubtitle = firstLines.slice(0, 2).join(" / ");
  return addItemToActiveSchedule({
    type: "worship",
    sourceId: params.songId,
    sourceKind: "worship-song-section",
    label: cleanTitle,
    subtitle: previewSubtitle || cleanTitle,
    notes: params.artist,
    payloadSnapshot: {
      isWholeSong: true,
      songId: params.songId,
      songTitle: cleanTitle,
      sectionLabel: "Song",
      sectionText: params.lyrics,
      artist: params.artist,
      sectionIdx: 0,
      overlayMode: params.overlayMode || "lower-third",
      theme: params.theme,
      bibleThemeSettings: params.bibleThemeSettings,
      linesPerSlide: params.linesPerSlide,
      autoSplit: params.autoSplit,
    },
  });
}

/**
 * Add Notes slide to the active schedule.
 */
export function addNoteToActiveSchedule(params: {
  noteTitle: string;
  slideIndex: number;
  slideText: string;
  overlayMode?: "fullscreen" | "lower-third";
  theme?: string;
  bibleThemeSettings?: Record<string, unknown> | null;
}): ServicePlanItem {
  const cleanLabel = `${params.noteTitle} · Slide ${params.slideIndex + 1}`;
  return addItemToActiveSchedule({
    type: "sermon",
    sourceKind: "sermon-point",
    label: cleanLabel,
    subtitle: params.slideText.split("\n").filter((l) => l.trim()).slice(0, 2).join(" / "),
    payloadSnapshot: {
      isNoteSlide: true,
      slideText: params.slideText,
      slideIndex: params.slideIndex,
      noteTitle: params.noteTitle,
      overlayMode: params.overlayMode || "lower-third",
      theme: params.theme,
      bibleThemeSettings: params.bibleThemeSettings,
    },
  });
}

/**
 * Add an entire Note document to the active schedule.
 */
export function addWholeNoteToActiveSchedule(params: {
  noteTitle: string;
  noteContent: string;
  noteId?: string;
  overlayMode?: "fullscreen" | "lower-third";
  theme?: string;
  bibleThemeSettings?: Record<string, unknown> | null;
}): ServicePlanItem {
  const cleanTitle = params.noteTitle.trim();
  const firstLines = params.noteContent.split("\n").map((l) => l.trim()).filter(Boolean);
  const previewSubtitle = firstLines.slice(0, 2).join(" / ");
  return addItemToActiveSchedule({
    type: "sermon",
    sourceId: params.noteId,
    sourceKind: "sermon-point",
    label: cleanTitle,
    subtitle: previewSubtitle || cleanTitle,
    payloadSnapshot: {
      isWholeNote: true,
      isNoteSlide: true,
      noteId: params.noteId,
      slideText: params.noteContent,
      slideIndex: 0,
      noteTitle: cleanTitle,
      overlayMode: params.overlayMode || "lower-third",
      theme: params.theme,
      bibleThemeSettings: params.bibleThemeSettings,
    },
  });
}

/**
 * Add Sermon point or quote to the active schedule.
 */
export function addSermonToActiveSchedule(params: {
  text: string;
  speaker?: string;
  series?: string;
  kind?: "point" | "quote";
}): ServicePlanItem {
  const isQuote = params.kind === "quote";
  const label = params.text.slice(0, 80);
  const subtitle = [params.speaker, params.series].filter(Boolean).join(" · ");

  return addItemToActiveSchedule({
    type: "sermon",
    sourceKind: isQuote ? "sermon-quote" : "sermon-point",
    label: isQuote ? `“${label}”` : label,
    subtitle,
    payloadSnapshot: {
      text: params.text,
      label: subtitle || undefined,
      itemType: params.kind || "point",
      overlayMode: "lower-third",
    },
  });
}

/**
 * Remove an item from the active schedule.
 */
export function removeItemFromActiveSchedule(itemId: string): void {
  const { activePlan } = getOrCreateActiveSchedule();
  const nextItems = activePlan.items.filter((item) => item.id !== itemId);
  saveSchedulePlan({
    ...activePlan,
    items: nextItems,
    updatedAt: Date.now(),
  });
  notifyScheduleToast("Removed item from schedule", "info");
}

/**
 * Switch which schedule is active.
 */
export function setActiveScheduleId(planId: string): void {
  const snapshot = readCachedScheduleSnapshot();
  if (!snapshot) return;

  const targetPlan = snapshot.plans.find((p) => p.id === planId);
  if (!targetPlan) return;

  const nextPlans = snapshot.plans.map((p) => ({
    ...p,
    status: (p.id === planId ? "active" : "draft") as "active" | "draft",
  }));

  const updatedSnapshot: ServicePlannerSnapshot = {
    plans: nextPlans,
    activePlan: { ...targetPlan, status: "active" },
  };

  writeCachedScheduleSnapshot(updatedSnapshot);
  setCachedActivePlanId(planId);
  notifyScheduleChanged();

  dockClient.sendCommand({
    type: "service-plan:save",
    payload: { ...targetPlan, status: "active" },
    timestamp: Date.now(),
  });
}

/**
 * Create a new empty schedule plan.
 */
export function createNewSchedulePlan(title = "New Schedule"): ServicePlan {
  const newPlan = createServicePlan({
    title,
    status: "active",
    serviceDate: new Date().toISOString().slice(0, 10),
  });
  saveSchedulePlan(newPlan);
  notifyScheduleToast(`Created "${title}"`);
  return newPlan;
}

const MAX_HISTORY_ITEMS = 60;

/**
 * Reads presentation history from localStorage cache.
 */
export function getPresentationHistory(): ServicePlanItem[] {
  if (inMemoryHistory) {
    if (isDockFreePlan() && inMemoryHistory.length > 1) {
      return inMemoryHistory.slice(0, 1);
    }
    return inMemoryHistory;
  }
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(DOCK_HISTORY_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const sanitized = parsed.map((it: ServicePlanItem) => (
        it?.type === "bible" && typeof it.label === "string"
          ? { ...it, label: normalizeBibleReferenceLabel(it.label) }
          : it
      ));
      const finalItems = isDockFreePlan() && sanitized.length > 1 ? sanitized.slice(0, 1) : sanitized;
      inMemoryHistory = finalItems;
      return finalItems;
    }
  } catch {
    // Ignore cache parse error
  }
  return [];
}

/**
 * Writes presentation history to cache and notifies listeners.
 */
export function writePresentationHistory(history: ServicePlanItem[]): void {
  const finalHistory = isDockFreePlan() && history.length > 1 ? history.slice(0, 1) : history;
  inMemoryHistory = finalHistory;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DOCK_HISTORY_CACHE_KEY, JSON.stringify(finalHistory));
  } catch {
    // Storage quota or restricted context
  }
  notifyHistoryChanged();
}

/**
 * Records an item that was projected or clicked into presentation history.
 * Deduplicates existing identical items, moving them to the top with the latest timestamp.
 */
export function recordPresentationHistory(item: {
  type: ServicePlanItem["type"];
  label: string;
  subtitle?: string;
  sourceKind?: ServicePlanItem["sourceKind"];
  sourceId?: string;
  notes?: string;
  payloadSnapshot: Record<string, unknown>;
  overlayMode?: "fullscreen" | "lower-third";
}): ServicePlanItem {
  const current = getPresentationHistory();
  const overlayMode = item.overlayMode || (item.payloadSnapshot?.overlayMode as "fullscreen" | "lower-third") || (item.type === "bible" ? "fullscreen" : "lower-third");
  const payloadSnapshot: Record<string, unknown> = {
    ...item.payloadSnapshot,
    overlayMode,
  };
  const cleanedLabel = item.type === "bible"
    ? normalizeBibleReferenceLabel(item.label)
    : item.label;

  const existingIdx = current.findIndex((h) => {
    if (h.type !== item.type) return false;
    if (item.type === "media") {
      const hFile = (h.payloadSnapshot?.filePath as string) || h.label;
      const iFile = (payloadSnapshot.filePath as string) || cleanedLabel;
      return hFile === iFile;
    }
    return h.label === cleanedLabel;
  });

  let historyItem: ServicePlanItem;
  let nextHistory: ServicePlanItem[];

  if (existingIdx >= 0) {
    const existing = current[existingIdx];
    historyItem = {
      ...existing,
      label: cleanedLabel,
      subtitle: item.subtitle ?? existing.subtitle,
      notes: item.notes ?? existing.notes,
      payloadSnapshot: {
        ...existing.payloadSnapshot,
        ...payloadSnapshot,
      },
      updatedAt: Date.now(),
    };
    nextHistory = [
      historyItem,
      ...current.filter((_, i) => i !== existingIdx),
    ];
  } else {
    historyItem = createServicePlanItem({
      type: item.type,
      label: cleanedLabel,
      subtitle: item.subtitle,
      sourceKind: item.sourceKind,
      sourceId: item.sourceId,
      notes: item.notes,
      payloadSnapshot,
    });
    nextHistory = [historyItem, ...current];
  }

  if (isDockFreePlan()) {
    // Free plan: History does not accumulate; it only retains 1 item (changes to the latest projected item)
    nextHistory = [historyItem];
  } else if (nextHistory.length > MAX_HISTORY_ITEMS) {
    nextHistory = nextHistory.slice(0, MAX_HISTORY_ITEMS);
  }

  writePresentationHistory(nextHistory);
  return historyItem;
}

/**
 * Remove an item from presentation history.
 */
export function removeHistoryItem(itemId: string): void {
  const current = getPresentationHistory();
  const next = current.filter((h) => h.id !== itemId);
  writePresentationHistory(next);
}

/**
 * Clear all presentation history.
 */
export function clearPresentationHistory(): void {
  writePresentationHistory([]);
  notifyScheduleToast("Presentation history cleared", "info");
}

/**
 * Update the overlayMode (FULL vs LT) on a schedule item or history item.
 */
export function updateItemOverlayMode(
  itemId: string,
  mode: "fullscreen" | "lower-third",
  scope: "schedule" | "history" = "schedule",
): void {
  if (scope === "history") {
    const current = getPresentationHistory();
    const updated = current.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        payloadSnapshot: {
          ...item.payloadSnapshot,
          overlayMode: mode,
        },
        updatedAt: Date.now(),
      };
    });
    writePresentationHistory(updated);
  } else {
    const { activePlan } = getOrCreateActiveSchedule();
    const updatedItems = activePlan.items.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        payloadSnapshot: {
          ...item.payloadSnapshot,
          overlayMode: mode,
        },
        updatedAt: Date.now(),
      };
    });
    saveSchedulePlan({
      ...activePlan,
      items: updatedItems,
      updatedAt: Date.now(),
    });
  }
}

/**
 * Rename an item's label in the active schedule or history.
 */
export function renameScheduleItem(
  itemId: string,
  newLabel: string,
  scope: "schedule" | "history" = "schedule",
): void {
  const trimmed = newLabel.trim();
  if (!trimmed) return;

  if (scope === "history") {
    const current = getPresentationHistory();
    const updated = current.map((item) =>
      item.id === itemId ? { ...item, label: trimmed, updatedAt: Date.now() } : item,
    );
    writePresentationHistory(updated);
  } else {
    const { activePlan } = getOrCreateActiveSchedule();
    const updated = activePlan.items.map((item) =>
      item.id === itemId ? { ...item, label: trimmed, updatedAt: Date.now() } : item,
    );
    saveSchedulePlan({
      ...activePlan,
      items: updated,
      updatedAt: Date.now(),
    });
  }
  notifyScheduleToast(`Renamed to "${trimmed}"`);
}

/**
 * Move a schedule item to the very top (pin to top) of the active schedule.
 */
export function pinScheduleItemToTop(itemId: string): void {
  const { activePlan } = getOrCreateActiveSchedule();
  const target = activePlan.items.find((i) => i.id === itemId);
  if (!target) return;
  const rest = activePlan.items.filter((i) => i.id !== itemId);
  saveSchedulePlan({
    ...activePlan,
    items: [target, ...rest],
    updatedAt: Date.now(),
  });
  notifyScheduleToast(`Pinned "${target.label}" to top`);
}

/**
 * Pin (copy) an item from presentation history into the active schedule.
 */
export function pinItemToSchedule(item: ServicePlanItem): ServicePlanItem {
  return addItemToActiveSchedule({
    type: item.type,
    label: item.label,
    subtitle: item.subtitle,
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
    notes: item.notes,
    payloadSnapshot: item.payloadSnapshot,
  });
}

