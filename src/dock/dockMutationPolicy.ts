/**
 * Guard the OBS side of the Dock for Free-plan users.
 *
 * Free users can still browse the Dock and use the presentation-link output,
 * but the Dock must never change OBS scenes, sources, scene items, routing,
 * or other OBS state on their behalf.
 */

import { getDockPlan } from "./dockEntitlement";

export const FREE_DOCK_OBS_MUTATION_MESSAGE =
  "You are using the Free plan. MakeChurchEasy will not create or update OBS scenes or sources, including MCE Presentation. Copy the presentation link below and add it once to OBS as a Browser Source. Bible, worship, Notes, Media, and other Dock updates will then appear through that same link. Upgrade to enable direct OBS control.";

/** OBS requests beginning with Get are read-only. Every other request used by
 * the Dock is treated as a mutation so a new OBS write cannot bypass the gate.
 */
export function isDockObsMutationRequest(requestType: string): boolean {
  return !/^Get[A-Z]/.test(String(requestType || "").trim());
}

export function isFreeDockPlan(): boolean {
  return getDockPlan() === "free";
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
