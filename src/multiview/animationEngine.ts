/**
 * animationEngine.ts — Per-region animation system for MultiView layouts.
 *
 * Drives intro/outro effects by interpolating OBS scene item transforms
 * frame-by-frame via SetSceneItemTransform (same approach as
 * dockObsClient.animateSceneItemWithMove, but generalized to many effects).
 *
 * Each effect maps a normalized time t ∈ [0,1] to a set of transform values
 * (x, y, width, height, opacity, crop). The engine steps through frames at
 * ~60fps using requestAnimationFrame-style timing via setTimeout.
 */

import type {
  RegionAnimation,
  IntroAnimationType,
  OutroAnimationType,
  AnimationEasing,
} from "./types";

// ---------------------------------------------------------------------------
// Easing functions
// ---------------------------------------------------------------------------

function applyEasing(t: number, easing: AnimationEasing): number {
  switch (easing) {
    case "linear":
      return t;
    case "ease-in":
      return t * t * t;
    case "ease-out":
      return 1 - Math.pow(1 - t, 3);
    case "ease-in-out":
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case "bounce": {
      // Bounce easing (ease-out bounce)
      const n1 = 7.5625;
      const d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
    default:
      return 1 - Math.pow(1 - t, 3);
  }
}

// ---------------------------------------------------------------------------
// Frame state — what the engine interpolates
// ---------------------------------------------------------------------------

interface FrameState {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  cropLeft: number;
  cropRight: number;
  cropTop: number;
  cropBottom: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// Intro keyframe generators — map t ∈ [0,1] to FrameState
// target* = final resting position/size
// ---------------------------------------------------------------------------

function introKeyframe(
  effect: IntroAnimationType,
  t: number,
  target: FrameState,
  canvasW: number,
  canvasH: number,
): FrameState {
  const { x, y, width, height } = target;

  switch (effect) {
    case "none":
      return { ...target };

    case "fade":
      return { ...target, opacity: t };

    case "zoom-in": {
      const s = 0.7 + 0.3 * t; // 0.7 → 1.0
      const w = width * s;
      const h = height * s;
      return { ...target, x: x + (width - w) / 2, y: y + (height - h) / 2, width: w, height: h, opacity: t };
    }

    case "slide-left":
      return { ...target, x: lerp(-width, x, t), opacity: Math.min(1, t * 2) };

    case "slide-right":
      return { ...target, x: lerp(canvasW, x, t), opacity: Math.min(1, t * 2) };

    case "slide-up":
      return { ...target, y: lerp(canvasH, y, t), opacity: Math.min(1, t * 2) };

    case "slide-down":
      return { ...target, y: lerp(-height, y, t), opacity: Math.min(1, t * 2) };

    case "push-left":
      return { ...target, x: lerp(canvasW * 0.3, x, t), opacity: t };

    case "push-right":
      return { ...target, x: lerp(-canvasW * 0.3 - width, x, t), opacity: t };

    case "grow-center": {
      const s2 = t; // 0 → 1
      const w2 = width * s2;
      const h2 = height * s2;
      return { ...target, x: x + (width - w2) / 2, y: y + (height - h2) / 2, width: w2, height: h2, opacity: t };
    }

    case "pop": {
      // Overshoot then settle
      const s3 = t < 0.7 ? (t / 0.7) * 1.08 : 1.08 - ((t - 0.7) / 0.3) * 0.08;
      const w3 = width * s3;
      const h3 = height * s3;
      return { ...target, x: x + (width - w3) / 2, y: y + (height - h3) / 2, width: w3, height: h3, opacity: Math.min(1, t * 1.5) };
    }

    case "wipe-left":
      return { ...target, cropRight: lerp(width, 0, t) };

    case "wipe-right":
      return { ...target, cropLeft: lerp(width, 0, t) };

    case "wipe-up":
      return { ...target, cropBottom: lerp(height, 0, t) };

    case "wipe-down":
      return { ...target, cropTop: lerp(height, 0, t) };

    case "bounce": {
      // Drop from above with bounce
      const bt = applyEasing(t, "bounce");
      return { ...target, y: lerp(-height - 40, y, bt), opacity: Math.min(1, t * 2) };
    }

    case "blur-in":
      // Simulated blur via opacity ramp (OBS doesn't support per-item blur easily)
      return { ...target, opacity: t < 0.3 ? t * 1.5 : Math.min(1, t * 1.2) };

    default:
      return { ...target };
  }
}

// ---------------------------------------------------------------------------
// Outro keyframe generators
// ---------------------------------------------------------------------------

function outroKeyframe(
  effect: OutroAnimationType,
  t: number,
  start: FrameState,
  canvasW: number,
  canvasH: number,
): FrameState {
  const { x, y, width, height } = start;

  switch (effect) {
    case "none":
      return { ...start };

    case "fade":
      return { ...start, opacity: 1 - t };

    case "zoom-out": {
      const s = 1 - 0.3 * t; // 1.0 → 0.7
      const w = width * s;
      const h = height * s;
      return { ...start, x: x + (width - w) / 2, y: y + (height - h) / 2, width: w, height: h, opacity: 1 - t };
    }

    case "slide-left":
      return { ...start, x: lerp(x, -width, t), opacity: Math.max(0, 1 - t * 2) };

    case "slide-right":
      return { ...start, x: lerp(x, canvasW, t), opacity: Math.max(0, 1 - t * 2) };

    case "slide-up":
      return { ...start, y: lerp(y, -height, t), opacity: Math.max(0, 1 - t * 2) };

    case "slide-down":
      return { ...start, y: lerp(y, canvasH, t), opacity: Math.max(0, 1 - t * 2) };

    case "shrink-center": {
      const s2 = 1 - t;
      const w2 = width * s2;
      const h2 = height * s2;
      return { ...start, x: x + (width - w2) / 2, y: y + (height - h2) / 2, width: w2, height: h2, opacity: 1 - t };
    }

    case "wipe-left":
      return { ...start, cropLeft: lerp(0, width, t) };

    case "wipe-right":
      return { ...start, cropRight: lerp(0, width, t) };

    case "wipe-up":
      return { ...start, cropTop: lerp(0, height, t) };

    case "wipe-down":
      return { ...start, cropBottom: lerp(0, height, t) };

    case "blur-out":
      return { ...start, opacity: Math.max(0, 1 - t * 1.5) };

    default:
      return { ...start };
  }
}

// ---------------------------------------------------------------------------
// Animation runner — drives frame-by-frame OBS transform updates
// ---------------------------------------------------------------------------

interface AnimationRunnerDeps {
  /** Call OBS SetSceneItemTransform */
  transformSceneItem: (
    sceneName: string,
    sceneItemId: number,
    x: number,
    y: number,
    width: number,
    height: number,
    options?: { opacity?: number; cropLeft?: number; cropRight?: number; cropTop?: number; cropBottom?: number },
  ) => Promise<void>;
  /** Call OBS SetSceneItemEnabled */
  setSceneItemEnabled: (sceneName: string, sceneItemId: number, enabled: boolean) => Promise<void>;
  /** Sleep helper */
  sleep: (ms: number) => Promise<void>;
  /** Get canvas size */
  getCanvasSize: () => Promise<{ width: number; height: number }>;
}

/** Minimum frame interval in ms (~60fps) */
const FRAME_INTERVAL = 16;

/**
 * Play an intro animation on a scene item.
 * The item should already be created and enabled before calling this.
 */
export async function playIntroAnimation(
  deps: AnimationRunnerDeps,
  sceneName: string,
  sceneItemId: number,
  animation: RegionAnimation,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
): Promise<void> {
  const effect = animation.intro;
  if (effect === "none" || animation.durationMs <= 0) return;

  const canvas = await deps.getCanvasSize();
  const target: FrameState = {
    x: targetX,
    y: targetY,
    width: targetWidth,
    height: targetHeight,
    opacity: 1,
    cropLeft: 0,
    cropRight: 0,
    cropTop: 0,
    cropBottom: 0,
  };

  await runAnimationFrames(
    deps,
    sceneName,
    sceneItemId,
    animation,
    (t) => introKeyframe(effect, t, target, canvas.width, canvas.height),
    target,
  );
}

/**
 * Play an outro animation on a scene item.
 * After the animation completes, the item is disabled.
 */
export async function playOutroAnimation(
  deps: AnimationRunnerDeps,
  sceneName: string,
  sceneItemId: number,
  animation: RegionAnimation,
  startX: number,
  startY: number,
  startWidth: number,
  startHeight: number,
): Promise<void> {
  const effect = animation.outro;
  if (effect === "none" || animation.durationMs <= 0) {
    await deps.setSceneItemEnabled(sceneName, sceneItemId, false);
    return;
  }

  const canvas = await deps.getCanvasSize();
  const start: FrameState = {
    x: startX,
    y: startY,
    width: startWidth,
    height: startHeight,
    opacity: 1,
    cropLeft: 0,
    cropRight: 0,
    cropTop: 0,
    cropBottom: 0,
  };

  await runAnimationFrames(
    deps,
    sceneName,
    sceneItemId,
    animation,
    (t) => outroKeyframe(effect, t, start, canvas.width, canvas.height),
    start,
  );

  // Disable the item after outro completes
  await deps.setSceneItemEnabled(sceneName, sceneItemId, false).catch(() => {});
}

/**
 * Run animation frames by interpolating from t=0 to t=1.
 */
async function runAnimationFrames(
  deps: AnimationRunnerDeps,
  sceneName: string,
  sceneItemId: number,
  animation: RegionAnimation,
  keyframeFn: (t: number) => FrameState,
  _endState: FrameState,
): Promise<void> {
  const { durationMs, easing } = animation;
  const totalFrames = Math.max(1, Math.round(durationMs / FRAME_INTERVAL));
  const startTime = Date.now();

  for (let frame = 1; frame <= totalFrames; frame++) {
    const elapsed = Date.now() - startTime;
    const rawT = Math.min(1, elapsed / durationMs);
    const t = applyEasing(rawT, easing);
    const state = keyframeFn(t);

    await deps.transformSceneItem(
      sceneName,
      sceneItemId,
      state.x,
      state.y,
      state.width,
      state.height,
      {
        opacity: state.opacity,
        cropLeft: state.cropLeft,
        cropRight: state.cropRight,
        cropTop: state.cropTop,
        cropBottom: state.cropBottom,
      },
    ).catch(() => {});

    // Sleep for remaining frame time
    const frameEnd = startTime + frame * FRAME_INTERVAL;
    const sleepMs = Math.max(0, frameEnd - Date.now());
    if (sleepMs > 0) await deps.sleep(sleepMs);
  }

  // Ensure final frame is exact
  const finalState = keyframeFn(1);
  await deps.transformSceneItem(
    sceneName,
    sceneItemId,
    finalState.x,
    finalState.y,
    finalState.width,
    finalState.height,
    {
      opacity: finalState.opacity,
      cropLeft: finalState.cropLeft,
      cropRight: finalState.cropRight,
      cropTop: finalState.cropTop,
      cropBottom: finalState.cropBottom,
    },
  ).catch(() => {});
}
