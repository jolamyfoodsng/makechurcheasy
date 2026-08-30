export type DockPresentationOutputTarget = "obs" | "link";

export function isPresentationLinkTarget(target?: DockPresentationOutputTarget): boolean {
  return target === "link";
}

/**
 * Free users publish through the presentation link. The Dock must not create
 * or mutate OBS scenes and sources for them, even when a parent view asks for
 * the normal OBS target.
 */
export function resolveDockPresentationOutputTarget(
  requestedTarget: DockPresentationOutputTarget | undefined,
  plan: string | undefined,
): DockPresentationOutputTarget {
  if (String(plan || "").trim().toLowerCase() === "free") return "link";
  return requestedTarget ?? "obs";
}
