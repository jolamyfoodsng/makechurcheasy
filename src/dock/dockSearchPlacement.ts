export type DockSearchPlacement = "top" | "bottom";

export const DEFAULT_DOCK_SEARCH_PLACEMENT: DockSearchPlacement = "top";

export function normalizeDockSearchPlacement(value: unknown): DockSearchPlacement {
  return value === "bottom" ? "bottom" : DEFAULT_DOCK_SEARCH_PLACEMENT;
}
