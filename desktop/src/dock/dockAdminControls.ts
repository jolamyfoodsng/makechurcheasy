/**
 * dockAdminControls.ts — Admin off switches as seen by the OBS Dock.
 * The main app writes /uploads/dock-admin-controls.json (see App.tsx);
 * the Dock runs in OBS's browser, so it reads that file instead of the config cache.
 */
import type { DesktopFeatureSwitch } from "../services/desktopConfigTypes";

export const DOCK_ADMIN_CONTROLS_FILE = "dock-admin-controls";

let cached: { features: Partial<Record<DesktopFeatureSwitch, boolean>>; at: number } | null = null;
const TTL_MS = 30_000;

async function readFeatures(): Promise<Partial<Record<DesktopFeatureSwitch, boolean>>> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.features;
  try {
    const res = await fetch(`/uploads/${DOCK_ADMIN_CONTROLS_FILE}.json`, { cache: "no-store" });
    const data = res.ok ? ((await res.json()) as { features?: Partial<Record<DesktopFeatureSwitch, boolean>> }) : null;
    cached = { features: data?.features ?? {}, at: Date.now() };
  } catch {
    // No file yet (older app, or offline) — everything stays on.
    cached = { features: {}, at: Date.now() };
  }
  return cached.features;
}

export async function isDockFeatureEnabled(feature: DesktopFeatureSwitch): Promise<boolean> {
  return (await readFeatures())[feature] !== false;
}
