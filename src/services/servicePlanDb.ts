/**
 * servicePlanDb.ts — IndexedDB persistence for Service Plans
 *
 * A service plan is an ordered list of items describing a church service flow:
 *   Welcome Media → Worship Songs → Bible Readings → Speaker → Announcements → etc.
 *
 * Plans are saved locally and can be loaded from the MakeChurchEasy Dock.
 * They sync to a JSON file via save_dock_data so the dock can fetch them.
 * All records are scoped to the current user via userId.
 */

import { openDB, type IDBPDatabase } from "idb";
import { getCurrentUserId } from "./db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServicePlanItemType =
  | "media"        // Welcome video / image
  | "worship"      // Worship song
  | "bible"        // Bible verse(s)
  | "speaker"      // Speaker lower third
  | "announcement" // Announcement / giving
  | "sermon"       // Sermon point
  | "prayer"       // Prayer time
  | "offering"     // Offering / giving moment
  | "custom";      // Free-text item

export interface ServicePlanItem {
  id: string;
  type: ServicePlanItemType;
  label: string;
  /** Optional details (verse reference, song name, speaker name, etc.) */
  details: string;
  /** Optional duration in seconds */
  durationSec?: number;
  /** Whether this item has been completed during the live service */
  completed?: boolean;
  /** Additional data (song ID, verse reference object, media path, etc.) */
  meta?: Record<string, unknown>;
}

export interface ServicePlan {
  id: string;
  name: string;
  /** ISO date string */
  createdAt: string;
  updatedAt: string;
  /** Ordered list of service items */
  items: ServicePlanItem[];
  /** Optional notes */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const DB_NAME = "obs-church-studio-plans";
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
        // Always ensure the plans store exists (migration may have created
        // the DB at a higher version without an upgrade function)
        if (!db.objectStoreNames.contains("plans")) {
          const store = db.createObjectStore("plans", { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
          store.createIndex("serviceDate", "serviceDate");
          store.createIndex("status", "status");
        }
        // Ensure userId index exists on the plans store
        if (db.objectStoreNames.contains("plans")) {
          const store = transaction.objectStore("plans") as unknown as IDBObjectStore;
          if (!store.indexNames.contains("userId")) {
            store.createIndex("userId", "userId", { unique: false });
          }
        }
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Get all plans for the current user, sorted by updatedAt descending */
export async function getAllPlans(): Promise<ServicePlan[]> {
  const db = await getDb();
  const uid = getCurrentUserId();
  let all: ServicePlan[];
  if (uid) {
    all = await db.getAllFromIndex("plans", "userId", uid) as ServicePlan[];
  } else {
    all = await db.getAll("plans") as ServicePlan[];
  }
  return all.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** Get a single plan by id */
export async function getPlan(id: string): Promise<ServicePlan | undefined> {
  const db = await getDb();
  return db.get("plans", id) as Promise<ServicePlan | undefined>;
}

/** Create or update a plan — auto-injects userId */
export async function savePlan(plan: ServicePlan): Promise<void> {
  const db = await getDb();
  const uid = getCurrentUserId();
  plan.updatedAt = new Date().toISOString();
  const tagged = uid ? { ...plan, userId: uid } : plan;
  await db.put("plans", tagged);
  // Sync to dock (fire-and-forget)
  syncPlansToDock().catch(() => { });
}

/** Delete a plan by id */
export async function deletePlan(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("plans", id);
  syncPlansToDock().catch(() => { });
}

/** Duplicate a plan */
export async function duplicatePlan(id: string): Promise<ServicePlan | null> {
  const plan = await getPlan(id);
  if (!plan) return null;
  const { nanoid } = await import("nanoid");
  const newPlan: ServicePlan = {
    ...plan,
    id: nanoid(12),
    name: `${plan.name} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await savePlan(newPlan);
  return newPlan;
}

// ---------------------------------------------------------------------------
// Dock sync
// ---------------------------------------------------------------------------

/**
 * Sync all plans to a JSON file the overlay server can serve to the dock.
 * The dock fetches from /uploads/dock-service-plans.json
 */
export async function syncPlansToDock(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const plans = await getAllPlans();
    await invoke("save_dock_data", {
      name: "dock-service-plans",
      data: JSON.stringify(plans),
    });
  } catch (err) {
    console.warn("[servicePlanDb] Failed to sync plans to dock:", err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a default/empty plan */
export function createEmptyPlan(name?: string): ServicePlan {
  const id = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  return {
    id,
    name: name || "Sunday Service",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [],
    notes: "",
  };
}

/** Get a new plan item */
export function createPlanItem(type: ServicePlanItemType, label: string, details = ""): ServicePlanItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    type,
    label,
    details,
    completed: false,
  };
}

/** Get icon for a plan item type */
export function planItemIcon(type: ServicePlanItemType): string {
  switch (type) {
    case "media": return "play_circle";
    case "worship": return "music_note";
    case "bible": return "auto_stories";
    case "speaker": return "person";
    case "announcement": return "campaign";
    case "sermon": return "record_voice_over";
    case "prayer": return "self_improvement";
    case "offering": return "volunteer_activism";
    case "custom": return "edit_note";
    default: return "radio_button_unchecked";
  }
}

/** Get display label for a plan item type */
export function planItemTypeLabel(type: ServicePlanItemType): string {
  switch (type) {
    case "media": return "Media";
    case "worship": return "Worship";
    case "bible": return "Bible";
    case "speaker": return "Speaker";
    case "announcement": return "Announcement";
    case "sermon": return "Sermon";
    case "prayer": return "Prayer";
    case "offering": return "Offering";
    case "custom": return "Custom";
    default: return type;
  }
}
