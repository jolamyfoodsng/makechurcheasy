export type DockPresentationOutputTarget = "obs" | "link";

export function isPresentationLinkTarget(target?: DockPresentationOutputTarget): boolean {
  return target === "link";
}
