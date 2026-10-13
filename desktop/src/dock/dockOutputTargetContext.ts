import { createContext, useContext } from "react";
import type { DockPresentationOutputTarget } from "./dockPresentationTarget";

/**
 * Where the Dock's actions go: "obs" (the OBS Custom Dock) or "link" (the
 * Presentation link and the Presentation Studio). OBS-only controls, like
 * "Output → Send to another scene", hide themselves when it is "link".
 */
export const DockOutputTargetContext = createContext<DockPresentationOutputTarget>("obs");

export function useDockOutputTarget(): DockPresentationOutputTarget {
  return useContext(DockOutputTargetContext);
}
