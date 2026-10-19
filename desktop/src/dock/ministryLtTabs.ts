/**
 * ministryLtTabs.ts — browser-style tabs for the Dock's Lower Thirds section.
 *
 * Each tab remembers its own theme, size and content slots, so an operator can keep
 * several lower thirds ready and switch between them. The + button clones the current
 * tab. How many tabs a church gets depends on its plan.
 */

import type { LTSize } from "../lowerthirds/types";

export interface MinistryLtTab {
  id: string;
  /** ltEntryKey() of the chosen theme; null until one is picked. */
  themeKey: string | null;
  size?: LTSize;
}

export const MINISTRY_LT_TABS_STORAGE_KEY = "dock-ministry-lower-third-tabs";
/** The first tab keeps the slots the single editor used before tabs existed. */
export const FIRST_LT_TAB_ID = "main";

/** -1 = unlimited. Free has one tab (the + button is disabled). */
const LT_TAB_LIMITS: Record<string, number> = {
  free: 1,
  basic: 3,
  growth: 10,
  pro: -1,
};

export function ltTabLimitForPlan(plan: string | null | undefined): number {
  const key = String(plan || "free").trim().toLowerCase();
  return LT_TAB_LIMITS[key] ?? 1;
}

export function canAddLtTab(count: number, limit: number): boolean {
  return limit < 0 || count < limit;
}

/** Tabs the plan allows; extra tabs from a higher plan are kept but hidden until an upgrade. */
export function usableLtTabs(tabs: MinistryLtTab[], limit: number): MinistryLtTab[] {
  return limit < 0 ? tabs : tabs.slice(0, Math.max(1, limit));
}

/** Content-slot editor id for a tab. */
export function ltTabEditorId(tab: Pick<MinistryLtTab, "id">): string {
  return tab.id === FIRST_LT_TAB_ID ? "default" : `tab-${tab.id}`;
}

export function createFirstLtTab(themeKey: string | null, size?: LTSize): MinistryLtTab {
  return { id: FIRST_LT_TAB_ID, themeKey, ...(size ? { size } : {}) };
}

export function newLtTabId(existing: MinistryLtTab[]): string {
  const taken = new Set(existing.map((t) => t.id));
  let id = "";
  do {
    id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  } while (taken.has(id));
  return id;
}

/** Insert a copy of `source` right after it. */
export function cloneLtTab(tabs: MinistryLtTab[], sourceId: string, newId: string): MinistryLtTab[] {
  const index = tabs.findIndex((t) => t.id === sourceId);
  if (index < 0) return tabs;
  const copy: MinistryLtTab = { ...tabs[index], id: newId };
  return [...tabs.slice(0, index + 1), copy, ...tabs.slice(index + 1)];
}

/** Remove a tab (never the last one) and say which tab to show next. */
export function closeLtTab(
  tabs: MinistryLtTab[],
  closingId: string,
  activeId: string,
): { tabs: MinistryLtTab[]; activeId: string } {
  if (tabs.length <= 1) return { tabs, activeId };
  const index = tabs.findIndex((t) => t.id === closingId);
  if (index < 0) return { tabs, activeId };
  const next = tabs.filter((t) => t.id !== closingId);
  if (closingId !== activeId) return { tabs: next, activeId };
  return { tabs: next, activeId: next[Math.min(index, next.length - 1)].id };
}

export function updateLtTab(tabs: MinistryLtTab[], id: string, patch: Partial<Omit<MinistryLtTab, "id">>): MinistryLtTab[] {
  return tabs.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

/** Read the saved tabs; null when there are none (or the value is not usable). */
export function parseLtTabs(raw: unknown): { tabs: MinistryLtTab[]; activeId: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as { tabs?: unknown; activeId?: unknown };
  if (!Array.isArray(data.tabs)) return null;
  const seen = new Set<string>();
  const tabs: MinistryLtTab[] = [];
  for (const item of data.tabs) {
    if (!item || typeof item !== "object") continue;
    const { id, themeKey, size } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    tabs.push({
      id,
      themeKey: typeof themeKey === "string" ? themeKey : null,
      ...(typeof size === "string" ? { size: size as LTSize } : {}),
    });
  }
  if (tabs.length === 0) return null;
  const activeId = typeof data.activeId === "string" && seen.has(data.activeId) ? data.activeId : tabs[0].id;
  return { tabs, activeId };
}
