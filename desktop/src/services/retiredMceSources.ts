/**
 * retiredMceSources.ts
 *
 * Removes OBS sources that older MakeChurchEazy versions created and the app no
 * longer uses, so they stop showing up in the user's source list.
 *
 * Today that is the source of the Media tab's Text overlay. The Text overlay was
 * removed; older versions left its source in OBS for good (hidden), and it kept
 * showing. This file is the ONLY place in the codebase that still names it, because
 * the cleanup has to know what to remove from users' OBS.
 *
 * Safe by design:
 *  - only the exact names below are touched, never a source the church made;
 *  - a source OBS says is on air right now is left alone and tried again at the
 *    next connect;
 *  - if OBS cannot say whether it is on air, it is left alone too;
 *  - it never throws.
 */

import type { ObsRequest } from "./obsBrowserSourceRefresh";

/** Exact OBS input names of retired MakeChurchEazy sources (current and older spellings). */
export const RETIRED_MCE_SOURCE_NAMES: readonly string[] = [
  "Text - MCE Media",
  "MCE Media - Text",
];

export interface RetiredSourceActiveState {
  videoActive?: boolean;
  videoShowing?: boolean;
}

/** True when a retired source can be deleted: OBS answered and it is not on air. */
export function canRemoveRetiredMceSource(state: RetiredSourceActiveState | null | undefined): boolean {
  if (!state) return false;
  return state.videoActive !== true;
}

export interface RetiredSourceCleanupResult {
  removed: string[];
  /** Retired sources that were left because they are on air or OBS would not say. */
  kept: string[];
}

/** Remove every retired MakeChurchEazy source that is present and not on air. Never throws. */
export async function removeRetiredMceSources(request: ObsRequest): Promise<RetiredSourceCleanupResult> {
  const result: RetiredSourceCleanupResult = { removed: [], kept: [] };
  try {
    const list = (await request("GetInputList")) as { inputs?: Array<{ inputName?: unknown }> } | null;
    const present = (list?.inputs ?? [])
      .map((input) => (typeof input.inputName === "string" ? input.inputName.trim() : ""))
      .filter((name) => RETIRED_MCE_SOURCE_NAMES.includes(name));

    for (const inputName of present) {
      let state: RetiredSourceActiveState | null = null;
      try {
        state = (await request("GetSourceActive", { sourceName: inputName })) as RetiredSourceActiveState | null;
      } catch {
        state = null;
      }
      if (!canRemoveRetiredMceSource(state)) {
        result.kept.push(inputName);
        continue;
      }
      try {
        await request("RemoveInput", { inputName });
        result.removed.push(inputName);
      } catch (err) {
        console.warn(`[MCE] Could not remove retired OBS source "${inputName}":`, err);
        result.kept.push(inputName);
      }
    }
  } catch (err) {
    console.warn("[MCE] Retired OBS source cleanup failed:", err);
  }
  return result;
}

const START_DELAY_MS = 1000;
const finishedSessions = new Set<string>();
const runningSessions = new Set<string>();

/**
 * Call this when OBS connects. It waits a moment, removes the retired sources,
 * and is done for this app session. If a retired source was left (on air, or OBS
 * did not answer) it tries again at the next connect.
 */
export async function scheduleRetiredMceSourceCleanup(
  request: ObsRequest,
  context: string,
  onRemoved?: (removed: string[]) => void,
): Promise<void> {
  if (finishedSessions.has(context) || runningSessions.has(context)) return;
  runningSessions.add(context);
  try {
    await new Promise<void>((resolve) => setTimeout(resolve, START_DELAY_MS));
    const result = await removeRetiredMceSources(request);
    if (result.removed.length > 0) {
      console.info("[MCE] Removed retired OBS source(s):", result.removed);
      try {
        onRemoved?.(result.removed);
      } catch {
        // best effort
      }
    }
    if (result.kept.length === 0) finishedSessions.add(context);
  } finally {
    runningSessions.delete(context);
  }
}
