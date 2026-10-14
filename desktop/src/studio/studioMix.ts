/**
 * studioMix.ts — Screen Mix: extra layers on the projector screen (a looping video or camera
 * behind the words; a "Subscribe" banner or the church logo on top). The layers are plain
 * data kept in the Studio's program state; `public/studio-output.html` draws them.
 */

export type MixKind = "video" | "image" | "camera" | "banner" | "logo";
export type MixCorner = "bottom-left" | "bottom-center" | "bottom-right" | "top-left" | "top-right";

export interface StudioMixLayer {
  id: string;
  kind: MixKind;
  name: string;
  /** On the screen now? */
  shown: boolean;
  /** video / image: path on the overlay server. */
  url?: string;
  loop?: boolean;
  muted?: boolean;
  fit?: "cover" | "contain";
  /** camera: the chosen device (empty = the default camera). */
  deviceId?: string;
  /** banner: the big line and the small line. */
  text?: string;
  subtext?: string;
  /** banner / logo: where it sits. */
  corner?: MixCorner;
  /** banner: hide itself after this many seconds (0 = stay until hidden). */
  seconds?: number;
  /** logo: picture to show. */
  logoUrl?: string;
}

/** Layers behind the words (video, picture, camera) and in front of them (banner, logo). */
export function isBackdrop(layer: StudioMixLayer): boolean {
  return layer.kind === "video" || layer.kind === "image" || layer.kind === "camera";
}

export const CORNER_LABELS: Record<MixCorner, string> = {
  "bottom-left": "Bottom left",
  "bottom-center": "Bottom centre",
  "bottom-right": "Bottom right",
  "top-left": "Top left",
  "top-right": "Top right",
};

export const BANNER_PRESETS: Array<{ name: string; text: string; subtext: string; seconds: number }> = [
  { name: "Subscribe to our channel", text: "Subscribe to our channel", subtext: "Like · Share · Turn on notifications", seconds: 12 },
  { name: "Welcome", text: "Welcome home", subtext: "We are glad you are here", seconds: 10 },
  { name: "Follow us", text: "Follow us on social media", subtext: "", seconds: 12 },
  { name: "Give online", text: "Give online", subtext: "", seconds: 12 },
  { name: "Your own words", text: "Your words here", subtext: "", seconds: 0 },
];

let counter = 0;
export function newLayerId(): string {
  counter += 1;
  return `mix-${Date.now().toString(36)}-${counter}`;
}

const KEY = "mce-studio-mix";

/** Saved layers come back hidden, so nothing pops onto the screen after a restart. */
export function loadMix(): StudioMixLayer[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return (parsed as StudioMixLayer[])
      .filter((layer) => layer && typeof layer.id === "string" && typeof layer.kind === "string")
      .map((layer) => ({ ...layer, shown: false }));
  } catch {
    return [];
  }
}

export function saveMix(layers: StudioMixLayer[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layers));
  } catch {
    /* ignore */
  }
}
