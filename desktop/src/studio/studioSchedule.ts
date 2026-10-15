/**
 * studioSchedule.ts — Schedule and History for the Studio, on top of the Dock's schedule service
 * (the same plans the Dock and the Service Planner use, so all three stay in step).
 */
import {
  addItemToActiveSchedule,
  getOrCreateActiveSchedule,
  recordPresentationHistory,
  removeItemFromActiveSchedule,
  saveSchedulePlan,
} from "../dock/dockScheduleService";
import type { ServicePlan, ServicePlanItem } from "../service-planner/types";
import { moveItem } from "./studioQueue";
import type { PlanItemDraft } from "./studioItems";

export function readActivePlan(): ServicePlan | null {
  try {
    return getOrCreateActiveSchedule().activePlan;
  } catch {
    return null;
  }
}

/** Add to the END of today's schedule (a running order reads top to bottom). */
export function appendToSchedule(draft: PlanItemDraft): ServicePlanItem | null {
  try {
    const { overlayMode, ...rest } = draft;
    const added = addItemToActiveSchedule({ ...rest, payloadSnapshot: { ...rest.payloadSnapshot, overlayMode } });
    const plan = readActivePlan();
    if (plan && plan.items[0]?.id === added.id && plan.items.length > 1) {
      saveSchedulePlan({ ...plan, items: [...plan.items.slice(1), plan.items[0]] });
    }
    return added;
  } catch {
    return null;
  }
}

export function moveScheduleItem(itemId: string, toIndex: number): void {
  const plan = readActivePlan();
  if (!plan) return;
  const from = plan.items.findIndex((i) => i.id === itemId);
  if (from < 0) return;
  const items = moveItem(plan.items, from, toIndex);
  if (items !== plan.items) saveSchedulePlan({ ...plan, items });
}

export function removeScheduleItem(itemId: string): void {
  removeItemFromActiveSchedule(itemId);
}

/** Mark an item as done (dimmed with ✓). */
export function markScheduleItemDone(itemId: string, done = true): void {
  const plan = readActivePlan();
  if (!plan || !plan.items.some((i) => i.id === itemId)) return;
  const current = new Set(plan.completedItemIds ?? []);
  if (done === current.has(itemId)) return;
  if (done) current.add(itemId);
  else current.delete(itemId);
  saveSchedulePlan({ ...plan, completedItemIds: Array.from(current) });
}

export function clearScheduleDone(): void {
  const plan = readActivePlan();
  if (!plan || !(plan.completedItemIds ?? []).length) return;
  saveSchedulePlan({ ...plan, completedItemIds: [] });
}

/** Record something that really reached the screen. Previews never come here. */
export function recordProjected(draft: PlanItemDraft): void {
  try {
    recordPresentationHistory({
      type: draft.type,
      label: draft.label,
      subtitle: draft.subtitle,
      sourceKind: draft.sourceKind,
      sourceId: draft.sourceId,
      notes: draft.notes,
      payloadSnapshot: draft.payloadSnapshot,
      overlayMode: draft.overlayMode,
    });
  } catch {
    /* history is a convenience; never block the screen for it */
  }
}

/**
 * NEXT in the schedule: the first item after the live one that isn't done
 * (or the first not-done item when nothing from the schedule is live).
 */
export function nextScheduleItemId(items: ServicePlanItem[], liveId: string | null, done: ReadonlySet<string>): string | null {
  const start = liveId ? items.findIndex((i) => i.id === liveId) + 1 : 0;
  for (let i = Math.max(0, start); i < items.length; i += 1) {
    if (items[i].id !== liveId && !done.has(items[i].id)) return items[i].id;
  }
  return null;
}
