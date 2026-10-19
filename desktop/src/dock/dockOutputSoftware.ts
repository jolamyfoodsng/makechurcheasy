/**
 * Which production software the Dock is driving.
 *
 * "obs"  – the existing OBS WebSocket integration (default).
 * "vmix" – vMix: the Dock publishes through the presentation link, which a
 *          vMix Web Browser input shows; the vMix HTTP API shows/hides it.
 *
 * `?output=vmix` in the Dock URL selects it and is remembered locally.
 */
export type DockOutputSoftware = "obs" | "vmix";

export const DOCK_OUTPUT_SOFTWARE_STORAGE_KEY = "mce-dock-output-software";

function normalize(value: unknown): DockOutputSoftware | null {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "vmix" || v === "obs" ? v : null;
}

export function readDockOutputSoftware(): DockOutputSoftware {
  try {
    const fromUrl = normalize(new URLSearchParams(window.location.search).get("output"));
    if (fromUrl) {
      writeDockOutputSoftware(fromUrl);
      return fromUrl;
    }
  } catch {
    /* no window / bad URL */
  }
  try {
    return normalize(localStorage.getItem(DOCK_OUTPUT_SOFTWARE_STORAGE_KEY)) ?? "obs";
  } catch {
    return "obs";
  }
}

export function writeDockOutputSoftware(value: DockOutputSoftware): void {
  try {
    localStorage.setItem(DOCK_OUTPUT_SOFTWARE_STORAGE_KEY, value);
  } catch {
    /* storage unavailable */
  }
}
