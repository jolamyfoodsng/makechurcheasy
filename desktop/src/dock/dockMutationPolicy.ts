/**
 * Guard the OBS side of the Dock for Free-plan users.
 *
 * Free users can still browse the Dock and use the presentation-link output,
 * but the Dock must never change OBS scenes, sources, scene items, routing,
 * or other OBS state on their behalf.
 */

import { isDockFreePlan } from "./dockEntitlement";

export const FREE_DOCK_OBS_MUTATION_MESSAGE =
  "You are using the Free plan. MakeChurchEasy will not create or update OBS scenes or sources, including MCE Presentation. Copy the presentation link below and add it once to OBS as a Browser Source. Bible, worship, Notes, Media, and other Dock updates will then appear through that same link. Upgrade to enable direct OBS control.";

/** OBS requests beginning with Get are read-only. Every other request used by
 * the Dock is treated as a mutation so a new OBS write cannot bypass the gate.
 */
export function isDockObsMutationRequest(requestType: string): boolean {
  return !/^Get[A-Z]/.test(String(requestType || "").trim());
}

export function isFreeDockPlan(): boolean {
  return isDockFreePlan();
}

export function assertDockObsMutationAllowed(requestType: string): void {
  if (isFreeDockPlan() && isDockObsMutationRequest(requestType)) {
    const error = new Error(FREE_DOCK_OBS_MUTATION_MESSAGE);
    error.name = "FreeDockObsMutationBlocked";
    throw error;
  }
}

/** Legacy BroadcastChannel commands can reach the main app's OBS services
 * instead of dockObsClient, so protect those paths with the same policy.
 */
export function isDockObsCommand(commandType: string): boolean {
  return /^(speaker|bible|lt|worship):(go-live|send-preview|clear(?:-lyrics)?)$/.test(
    String(commandType || "").trim(),
  );
}

/** OBS requests a Free-plan user may still make from the app: streaming
 * start/stop and the stream destination (single-destination streaming). */
export const FREE_PLAN_ALLOWED_OBS_REQUESTS = new Set([
  "StartStream",
  "StopStream",
  "ToggleStream",
  "SetStreamServiceSettings",
]);

/** Main-app version of the gate. The main app knows the signed-in plan
 * directly (the Dock's plan flag lives in OBS's browser storage), so the
 * caller passes it in. */
export function assertAppObsRequestAllowed(requestType: string, isFreePlan: boolean): void {
  const type = String(requestType || "").trim();
  if (!isFreePlan || FREE_PLAN_ALLOWED_OBS_REQUESTS.has(type) || !isDockObsMutationRequest(type)) return;
  const error = new Error(FREE_DOCK_OBS_MUTATION_MESSAGE);
  error.name = "FreeDockObsMutationBlocked";
  throw error;
}

/** True for the Browser Source a Free user adds themselves: the presentation
 * link (…/p/<token> or …?sessionId=…). It must never be removed by cleanup. */
export function isPresentationLinkUrl(url: unknown): boolean {
  const value = String(url || "").trim();
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return /^\/p\/[^/]+\/?$/i.test(parsed.pathname) || parsed.searchParams.has("sessionId");
  } catch {
    return /\/p\/[^/?#]+/i.test(value) || /[?&]sessionId=/i.test(value);
  }
}
