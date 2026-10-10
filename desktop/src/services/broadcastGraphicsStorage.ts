/**
 * broadcastGraphicsStorage.ts — User-customized Broadcast Graphics persistence.
 *
 * Stores personalized lower thirds, speaker introductions, giving details,
 * welcome banners, announcements and overlays.
 *
 * Separates built-in templates from user-customized saved graphics, and manages
 * their availability in the OBS Dock.
 */

import { getUserScopedKey } from "./userScopedStorage";
import type { LowerThirdTheme, LTPosition } from "../lowerthirds/types";

export interface SavedBroadcastGraphic {
  id: string;
  name: string;
  templateId: string;
  category: "speaker" | "service" | "welcome" | "giving" | "subscribe" | "announcements" | "countdown" | "social" | "branding" | "scripture" | "others";
  displayType: "lower-third" | "fullscreen" | "overlay";
  variables: Record<string, string>;
  design?: {
    textColor?: string;
    accentColor?: string;
    bgColor?: string;
    fontSizeScale?: number;
    fontFamily?: string;
    fontWeight?: string;
    textAlign?: "left" | "center" | "right";
  };
  animation?: {
    speed?: string;
    duration?: number;
    position?: string;
    animationIn?: string;
  };
  isAddedToObs: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "mce-saved-broadcast-graphics";
export const BROADCAST_GRAPHICS_UPDATED_EVENT = "broadcast-graphics-updated";

function notifyChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BROADCAST_GRAPHICS_UPDATED_EVENT));
  }
}

/**
 * Load all saved customized graphics for the current user.
 */
export function loadSavedBroadcastGraphics(): SavedBroadcastGraphic[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const key = getUserScopedKey(STORAGE_KEY);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.error("[broadcastGraphicsStorage] Failed to load saved graphics:", err);
    return [];
  }
}

/**
 * Persist the full array of saved graphics to localStorage.
 */
function persistAll(items: SavedBroadcastGraphic[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    const key = getUserScopedKey(STORAGE_KEY);
    localStorage.setItem(key, JSON.stringify(items));
    notifyChange();
    void syncSavedGraphicsToDock(items);
  } catch (err) {
    console.error("[broadcastGraphicsStorage] Failed to save graphics:", err);
  }
}

/**
 * Save a newly created broadcast graphic.
 */
export function saveBroadcastGraphic(
  graphic: Omit<SavedBroadcastGraphic, "id" | "createdAt" | "updatedAt"> & { id?: string },
): SavedBroadcastGraphic {
  const all = loadSavedBroadcastGraphics();
  const now = new Date().toISOString();
  const id = graphic.id || `bg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const newGraphic: SavedBroadcastGraphic = {
    ...graphic,
    id,
    createdAt: now,
    updatedAt: now,
  };

  const next = [newGraphic, ...all.filter((g) => g.id !== id)];
  persistAll(next);

  // If added to OBS, sync favorite state and dock memory slot
  if (newGraphic.isAddedToObs) {
    syncGraphicToObs(newGraphic);
  }

  return newGraphic;
}

/**
 * Update an existing saved broadcast graphic.
 */
export function updateBroadcastGraphic(
  id: string,
  patch: Partial<Omit<SavedBroadcastGraphic, "id" | "createdAt">>,
): SavedBroadcastGraphic | null {
  const all = loadSavedBroadcastGraphics();
  const index = all.findIndex((g) => g.id === id);
  if (index === -1) return null;

  const existing = all[index];
  const updated: SavedBroadcastGraphic = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  all[index] = updated;
  persistAll(all);

  if (updated.isAddedToObs) {
    syncGraphicToObs(updated);
  }

  return updated;
}

/**
 * Duplicate an existing saved graphic.
 */
export function duplicateBroadcastGraphic(id: string): SavedBroadcastGraphic | null {
  const all = loadSavedBroadcastGraphics();
  const original = all.find((g) => g.id === id);
  if (!original) return null;

  return saveBroadcastGraphic({
    ...original,
    id: undefined,
    name: `${original.name} (Copy)`,
    isAddedToObs: false,
  });
}

/**
 * Delete a saved graphic by id.
 */
export function deleteBroadcastGraphic(id: string): boolean {
  const all = loadSavedBroadcastGraphics();
  const filtered = all.filter((g) => g.id !== id);
  if (filtered.length === all.length) return false;
  persistAll(filtered);
  return true;
}

/**
 * Toggle whether a graphic is available in the OBS Dock.
 */
export function toggleGraphicObsAvailability(id: string): boolean {
  const all = loadSavedBroadcastGraphics();
  const graphic = all.find((g) => g.id === id);
  if (!graphic) return false;

  const nextState = !graphic.isAddedToObs;
  updateBroadcastGraphic(id, { isAddedToObs: nextState });

  if (nextState) {
    syncGraphicToObs(graphic);
  }

  return nextState;
}

/**
 * Kept for callers: a graphic marked "added to OBS" reaches the Dock through
 * syncSavedGraphicsToDock() (run on every save), where it is listed as its own
 * custom lower third.
 */
export function syncGraphicToObs(_graphic: SavedBroadcastGraphic): void {
  void syncSavedGraphicsToDock();
}

/** Dock data file (served at /uploads/dock-saved-graphics.json) read by the OBS Dock. */
export const DOCK_SAVED_GRAPHICS_FILE = "dock-saved-graphics";

/**
 * Write the graphics marked "added to OBS" to a Dock-readable JSON file, then tell
 * the Dock to refresh. The Dock runs inside OBS with its own storage, so it cannot
 * read this app's localStorage directly.
 */
export async function syncSavedGraphicsToDock(items: SavedBroadcastGraphic[] = loadSavedBroadcastGraphics()): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_dock_data", {
      name: DOCK_SAVED_GRAPHICS_FILE,
      data: JSON.stringify(await savedGraphicsForDock(items)),
    });
    const { dockBridge } = await import("./dockBridge");
    dockBridge.sendFavoriteThemesUpdated({ source: "saved-graphics" });
  } catch (err) {
    console.warn("[broadcastGraphicsStorage] Failed to sync saved graphics to the Dock:", err);
  }
}

/**
 * The saved graphics the Dock may show: added to OBS and built on a template the admin
 * has not paused, hidden or limited to another plan. Graphics made from an admin-published
 * package carry their full lower third (`theme`), because the Dock has no copy of it.
 */
export async function savedGraphicsForDock(
  items: SavedBroadcastGraphic[] = loadSavedBroadcastGraphics(),
): Promise<Array<SavedBroadcastGraphic & { theme?: LowerThirdTheme }>> {
  const added = items.filter((g) => g.isAddedToObs);
  try {
    const { getGraphicAvailability, getPackageThemes } = await import("./broadcastGraphicsCatalog");
    const packageThemes = getPackageThemes();
    return added
      .filter((g) => getGraphicAvailability(g.templateId).usable)
      .map((g) => {
        const template = packageThemes.find((t) => t.id === g.templateId);
        return template ? { ...g, theme: buildSavedGraphicTheme(g, template) } : g;
      });
  } catch {
    return added;
  }
}

/** Dock-side id of a saved graphic's lower third. */
export function savedGraphicThemeId(graphic: Pick<SavedBroadcastGraphic, "id">): string {
  return `saved-${graphic.id}`;
}

/**
 * Build the Dock lower third for a saved graphic: the template it was made from, under
 * the graphic's own name and id, with the saved text/colours as the field defaults and
 * the saved screen position as its starting position.
 */
export function buildSavedGraphicTheme(
  graphic: SavedBroadcastGraphic,
  template: LowerThirdTheme,
): LowerThirdTheme & { defaultPosition?: LTPosition } {
  const values = graphic.variables || {};
  return {
    ...template,
    id: savedGraphicThemeId(graphic),
    name: graphic.name || template.name,
    tags: [...(template.tags || []), "Custom"],
    variables: template.variables.map((v) => {
      const saved = values[v.key];
      return saved !== undefined && saved !== "" ? { ...v, defaultValue: String(saved) } : v;
    }),
    defaultPosition: (graphic.animation?.position as LTPosition | undefined) || undefined,
  };
}
