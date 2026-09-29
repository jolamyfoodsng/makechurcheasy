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

const DOCK_SCHEDULE_CACHE_KEY = "__mce_dock_service_plans_v1";
const DOCK_ACTIVE_PLAN_ID_KEY = "__mce_dock_active_plan_id_v1";

export const DOCK_SCHEDULE_CHANGED_EVENT = "dock:schedule-changed";
export const DOCK_SCHEDULE_TOAST_EVENT = "dock:schedule-toast";

export interface ScheduleToastPayload {
  message: string;
  type?: "success" | "info" | "error";
}

let inMemorySnapshot: ServicePlannerSnapshot | null = null;

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

export function readCachedScheduleSnapshot(): ServicePlannerSnapshot | null {
  if (inMemorySnapshot) return inMemorySnapshot;
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(DOCK_SCHEDULE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (isServicePlannerSnapshot(parsed)) {
      inMemorySnapshot = parsed;
      return parsed;
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
  const updatedPlan: ServicePlan = { ...plan, updatedAt: Date.now() };

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
  const updatedPlan: ServicePlan = {
    ...activePlan,
    items: [...activePlan.items, fullItem],
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

  const displayRef = `${params.reference} (${params.translation})`;

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
