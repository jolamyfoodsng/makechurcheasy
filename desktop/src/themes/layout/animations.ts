/**
 * Animation presets. Everything here animates transform, opacity or clip-path
 * only (plus a light blur for "blur-in"), so OBS's browser can run it on the
 * compositor without layout work.
 */
import type { AnimationEasing, AnimationPreset, LayerAnimation, LoopPreset } from "./types";

export const EASING_CSS: Record<AnimationEasing, string> = {
  linear: "linear",
  "out-cubic": "cubic-bezier(0.215, 0.61, 0.355, 1)",
  "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
  "in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
};

/** Presets that animate words/lines inside a text layer instead of the layer itself. */
export function isSplitPreset(preset: AnimationPreset): boolean {
  return preset === "word-rise" || preset === "line-rise";
}

/**
 * Keyframes from "hidden" to "shown" for a layer-level preset.
 * Out animations play the same frames in reverse.
 */
export function layerKeyframes(preset: AnimationPreset, distance = 40): Keyframe[] | null {
  const d = `${distance}px`;
  switch (preset) {
    case "fade":
      return [{ opacity: 0 }, { opacity: 1 }];
    case "slide-up":
      return [{ opacity: 0, transform: `translateY(${d})` }, { opacity: 1, transform: "translateY(0)" }];
    case "slide-down":
      return [{ opacity: 0, transform: `translateY(-${d})` }, { opacity: 1, transform: "translateY(0)" }];
    case "slide-left":
      return [{ opacity: 0, transform: `translateX(${d})` }, { opacity: 1, transform: "translateX(0)" }];
    case "slide-right":
      return [{ opacity: 0, transform: `translateX(-${d})` }, { opacity: 1, transform: "translateX(0)" }];
    case "wipe-left":
      return [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }];
    case "wipe-right":
      return [{ clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 0%)" }];
    case "wipe-up":
      return [{ clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)" }];
    case "wipe-down":
      return [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)" }];
    case "grow-x":
      return [{ transform: "scaleX(0)", transformOrigin: "left center" }, { transform: "scaleX(1)", transformOrigin: "left center" }];
    case "grow-y":
      return [{ transform: "scaleY(0)", transformOrigin: "center top" }, { transform: "scaleY(1)", transformOrigin: "center top" }];
    case "scale":
      return [{ opacity: 0, transform: "scale(0.88)" }, { opacity: 1, transform: "scale(1)" }];
    case "pop":
      return [
        { opacity: 0, transform: "scale(0.6)" },
        { opacity: 1, transform: "scale(1.06)", offset: 0.7 },
        { opacity: 1, transform: "scale(1)" },
      ];
    case "blur-in":
      return [{ opacity: 0, filter: "blur(12px)" }, { opacity: 1, filter: "blur(0px)" }];
    case "word-rise":
    case "line-rise":
      // The layer itself just fades quickly; the words/lines carry the motion.
      return [{ opacity: 0 }, { opacity: 1 }];
    default:
      return null;
  }
}

/** Keyframes for each word / line in split presets. */
export function splitKeyframes(distance = 18): Keyframe[] {
  return [
    { opacity: 0, transform: `translateY(${distance}px)` },
    { opacity: 1, transform: "translateY(0)" },
  ];
}

export function timing(anim: LayerAnimation, direction: "in" | "out", extraDelay = 0): KeyframeAnimationOptions {
  return {
    duration: Math.max(0, anim.duration),
    delay: Math.max(0, anim.delay + extraDelay),
    easing: EASING_CSS[anim.easing] || EASING_CSS["out-cubic"],
    // "in" holds the first frame during its delay so nothing flashes;
    // "out" holds the last frame until the layer is hidden.
    fill: direction === "in" ? "backwards" : "forwards",
    direction: direction === "in" ? "normal" : "reverse",
  };
}

export function totalDuration(anims: LayerAnimation[]): number {
  return anims.reduce((max, a) => (a.preset === "none" ? max : Math.max(max, a.delay + a.duration)), 0);
}

export function loopKeyframes(preset: LoopPreset): Keyframe[] | null {
  switch (preset) {
    case "drift":
      return [{ transform: "translateX(0)" }, { transform: "translateX(-50%)" }];
    case "pulse":
      return [{ opacity: 1 }, { opacity: 0.78 }];
    case "shimmer":
      return [{ transform: "translateX(-120%)" }, { transform: "translateX(320%)" }];
    default:
      return null;
  }
}
