/**
 * presets.ts — ready-made countdown designs. Each one is a plain ThemeLayout (kind "countdown"),
 * so the same layer editor as Themes can change anything. One design works for countdowns,
 * count-ups, clocks and rundown timers: the layers just read tokens ({tm}, {mm}, {title}…).
 *
 * Sample text is placeholder only — users type their own title / subtitle.
 */
import type { ThemeLayout } from "../../themes/layout/types";
import type { RundownTimerKind } from "../rundownTypes";
import { anim, box, countdownLayout, line, outlineShadow, text } from "./dsl";

export interface CountdownPresetSample {
  kind: RundownTimerKind;
  /** Seconds shown in the gallery / editor preview. */
  value: number;
  durationSeconds: number;
  warnYellowSeconds: number;
  warnRedSeconds: number;
  title: string;
  subtitle: string;
}

export interface CountdownPreset {
  id: string;
  name: string;
  description: string;
  /** Main colour for gallery chips. */
  accent: string;
  layout: ThemeLayout;
  sample: CountdownPresetSample;
}

const W = 1920;
const H = 1080;
const CX = W / 2;
const CY = H / 2;

const sample = (over: Partial<CountdownPresetSample> = {}): CountdownPresetSample => ({
  kind: "countdown",
  value: 298,
  durationSeconds: 300,
  warnYellowSeconds: 60,
  warnRedSeconds: 15,
  title: "Welcome",
  subtitle: "Until we begin",
  ...over,
});

// ── 1 · Flip clock ─────────────────────────────────────────────────────────
function flipClock(): ThemeLayout {
  const units: Array<[string, string, string]> = [
    ["days", "{dd}", "DAYS"],
    ["hours", "{hh}", "HOURS"],
    ["mins", "{mm}", "MIN"],
    ["secs", "{ss}", "SEC"],
  ];
  const cardW = 270;
  const cardH = 320;
  const step = 330;
  const x0 = CX - (step * 3) / 2;
  const layers = [
    box("bg", CX, CY, W, H, {
      gradient: { type: "radial", stops: [{ color: "#3a3a3f", at: 0 }, { color: "#1b1b1f", at: 100 }] },
    }, { in: anim("none", 0), out: anim("none", 0) }),
    text("title", "{title}", CX, 230, 1500, 120, {
      fontFamily: "Montserrat", fontWeight: 800, fontSize: 92, letterSpacing: 18, color: "#f3f3f3", textTransform: "uppercase",
    }, { in: anim("slide-down", 600, 100) }),
  ];
  units.forEach(([id, token, label], i) => {
    const x = x0 + step * i;
    layers.push(
      box(`${id}-card`, x, 560, cardW, cardH, {
        radius: 22,
        shadow: "0 18px 40px rgba(0,0,0,0.55)",
        gradient: {
          type: "linear",
          angle: 180,
          stops: [
            { color: "#4a4a50", at: 0 },
            { color: "#34343a", at: 49.5 },
            { color: "#222226", at: 50.5 },
            { color: "#2c2c31", at: 100 },
          ],
        },
      }, { in: anim("pop", 500, 150 + i * 90) }),
      text(`${id}-num`, token, x, 560, cardW - 20, cardH - 40, {
        fontFamily: "Montserrat", fontWeight: 800, fontSize: 210, color: "#f5f5f5", flip: true,
      }, { in: anim("fade", 400, 350 + i * 90) }),
      line(`${id}-split`, x, 560, cardW, 5, "#0e0e10", { in: anim("none", 0), out: anim("none", 0) }),
      text(`${id}-label`, label, x, 770, cardW, 60, {
        fontFamily: "Montserrat", fontWeight: 700, fontSize: 38, letterSpacing: 8, color: "#b9b9c2",
      }, { in: anim("fade", 400, 450 + i * 90) }),
    );
  });
  return countdownLayout(layers);
}

// ── 2 · Red blocks (HRS / MIN / SEC) ───────────────────────────────────────
function redBlocks(): ThemeLayout {
  const blocks: Array<[string, string, string]> = [
    ["hrs", "{hh}", "HRS"],
    ["min", "{mm}", "MIN"],
    ["sec", "{ss}", "SEC"],
  ];
  const bw = 400;
  const step = 470;
  const x0 = CX - step;
  const layers = [
    box("bg", CX, CY, W, H, { fill: "#101012" }, { in: anim("none", 0), out: anim("none", 0) }),
    text("title", "{title}", CX, 190, 1500, 90, {
      fontFamily: "Montserrat", fontWeight: 700, fontSize: 52, letterSpacing: 12, color: "#f4f4f5", textTransform: "uppercase",
    }),
  ];
  blocks.forEach(([id, token, label], i) => {
    const x = x0 + step * i;
    layers.push(
      box(`${id}-block`, x, 560, bw, 440, {
        radius: 34,
        gradient: { type: "linear", angle: 160, stops: [{ color: "#f0242f", at: 0 }, { color: "#b80f1c", at: 100 }] },
        shadow: "0 24px 60px rgba(220,30,40,0.35)",
      }, { in: anim("pop", 520, 100 + i * 110) }),
      text(`${id}-num`, token, x, 520, bw - 30, 280, {
        fontFamily: "Montserrat", fontWeight: 900, fontSize: 250, color: "#ffffff",
      }, { in: anim("fade", 400, 300 + i * 110) }),
      text(`${id}-label`, label, x, 718, bw, 64, {
        fontFamily: "Montserrat", fontWeight: 700, fontSize: 44, letterSpacing: 10, color: "rgba(255,255,255,0.85)",
      }, { in: anim("fade", 400, 400 + i * 110) }),
    );
  });
  return countdownLayout(layers);
}

// ── 3 · Seven-segment on coral ─────────────────────────────────────────────
function segmentCoral(): ThemeLayout {
  return countdownLayout([
    box("bg", CX, CY, W, H, {
      gradient: { type: "linear", angle: 160, stops: [{ color: "#ff7a6b", at: 0 }, { color: "#f2503f", at: 100 }] },
    }, { in: anim("none", 0), out: anim("none", 0) }),
    text("title", "{title}", CX, 250, 1400, 90, {
      fontFamily: "Montserrat", fontWeight: 700, fontSize: 56, letterSpacing: 12, color: "rgba(255,255,255,0.92)", textTransform: "uppercase",
    }),
    text("time", "{sign}{tm}", CX, 560, 1500, 400, {
      color: "#ffffff",
      segment: { thickness: 13, gap: 2.6, spacing: 20, slant: 0, offColor: "#ffffff", offOpacity: 0.1 },
    }, { in: anim("scale", 600, 200) }),
    text("subtitle", "{subtitle}", CX, 840, 1400, 80, {
      fontFamily: "Montserrat", fontWeight: 600, fontSize: 40, letterSpacing: 8, color: "rgba(255,255,255,0.9)", textTransform: "uppercase",
    }),
  ]);
}

// ── 4 · Red LED on white ───────────────────────────────────────────────────
function ledWhite(): ThemeLayout {
  return countdownLayout([
    box("bg", CX, CY, W, H, {
      gradient: { type: "linear", angle: 180, stops: [{ color: "#ffffff", at: 0 }, { color: "#ececf0", at: 100 }] },
    }, { in: anim("none", 0), out: anim("none", 0) }),
    text("title", "{title}", CX, 280, 1400, 80, {
      fontFamily: "Montserrat", fontWeight: 700, fontSize: 46, letterSpacing: 12, color: "#3a3a42", textTransform: "uppercase",
    }),
    text("time", "{sign}{tmm}", CX, 540, 1700, 360, {
      color: "#e11d2e",
      segment: { thickness: 12, gap: 2.4, spacing: 22, slant: 7, offColor: "#e11d2e", offOpacity: 0.08, glow: 2 },
    }, { in: anim("scale", 600, 200) }),
    text("subtitle", "{subtitle}", CX, 800, 1400, 70, {
      fontFamily: "Montserrat", fontWeight: 500, fontSize: 36, letterSpacing: 8, color: "#6b6b76", textTransform: "uppercase",
    }),
  ]);
}

// ── 5 · Glowing LED, six digits ────────────────────────────────────────────
function ledGlow(): ThemeLayout {
  return countdownLayout([
    box("bg", CX, CY, W, H, {
      gradient: { type: "radial", stops: [{ color: "#1d0709", at: 0 }, { color: "#050203", at: 100 }] },
    }, { in: anim("none", 0), out: anim("none", 0) }),
    text("title", "{title}", CX, 280, 1400, 80, {
      fontFamily: "Orbitron", fontWeight: 700, fontSize: 46, letterSpacing: 14, color: "#ff5560", textTransform: "uppercase",
    }),
    text("time", "{sign}{tmm}", CX, 560, 1760, 380, {
      color: "#ff2a3a",
      segment: { thickness: 11, gap: 2.2, spacing: 20, slant: 0, offColor: "#ff2a3a", offOpacity: 0.1, glow: 14 },
    }, { in: anim("fade", 700, 200), loop: { preset: "pulse", duration: 3600 } }),
    text("subtitle", "{subtitle}", CX, 830, 1400, 70, {
      fontFamily: "Orbitron", fontWeight: 500, fontSize: 30, letterSpacing: 10, color: "rgba(255,120,130,0.8)", textTransform: "uppercase",
    }),
  ]);
}

// ── 6 · Retro parchment ────────────────────────────────────────────────────
function retroParchment(): ThemeLayout {
  return countdownLayout([
    box("bg", CX, CY, W, H, {
      gradient: { type: "radial", stops: [{ color: "#f3e7c9", at: 0 }, { color: "#d8c295", at: 100 }] },
    }, { in: anim("none", 0), out: anim("none", 0) }),
    box("frame", CX, CY, 1560, 760, { borderWidth: 6, borderColor: "#7a1410", radius: 10 }, { in: anim("grow-x", 700) }),
    box("frame-inner", CX, CY, 1520, 720, { borderWidth: 2, borderColor: "#7a1410", radius: 6 }, { in: anim("grow-x", 700, 120) }),
    text("title", "{title}", CX, 330, 1300, 90, {
      fontFamily: "Cinzel", fontWeight: 700, fontSize: 56, letterSpacing: 12, color: "#7a1410", textTransform: "uppercase",
    }),
    text("time", "{sign}{tm}", CX, 570, 1300, 330, {
      color: "#8a1712",
      segment: { thickness: 13, gap: 2.4, spacing: 20, slant: 4, offColor: "#8a1712", offOpacity: 0.07 },
    }, { in: anim("scale", 600, 200) }),
    text("subtitle", "{subtitle}", CX, 790, 1300, 70, {
      fontFamily: "Cinzel", fontWeight: 600, fontSize: 38, letterSpacing: 8, color: "#7a1410", textTransform: "uppercase",
    }),
  ]);
}

// ── 7 · Bold outline on purple ─────────────────────────────────────────────
function outlinePurple(): ThemeLayout {
  return countdownLayout([
    box("bg", CX, CY, W, H, {
      gradient: { type: "linear", angle: 150, stops: [{ color: "#7c3aed", at: 0 }, { color: "#4c1d95", at: 100 }] },
    }, { in: anim("none", 0), out: anim("none", 0) }),
    box("card", CX, CY, 1240, 620, { fill: "#ffffff", radius: 70, shadow: "0 30px 80px rgba(20,0,60,0.45)" }, { in: anim("pop", 600) }),
    text("title", "{title}", CX, 330, 1000, 70, {
      fontFamily: "Montserrat", fontWeight: 700, fontSize: 40, letterSpacing: 10, color: "#6d28d9", textTransform: "uppercase",
    }),
    text("time", "{sign}{tm}", CX, 560, 1100, 320, {
      fontFamily: "Montserrat", fontWeight: 900, fontSize: 280, color: "#ffffff", textShadow: outlineShadow("#6d28d9", 6),
    }, { in: anim("scale", 600, 250) }),
    text("subtitle", "{subtitle}", CX, 770, 1000, 60, {
      fontFamily: "Montserrat", fontWeight: 600, fontSize: 34, letterSpacing: 8, color: "#6d28d9", textTransform: "uppercase",
    }),
  ]);
}

// ── 8 · StageTimer style ───────────────────────────────────────────────────
function stageTimer(): ThemeLayout {
  const trackW = 1500;
  return countdownLayout([
    box("bg", CX, CY, W, H, { fill: "#08080a" }, { in: anim("none", 0), out: anim("none", 0) }),
    text("title", "{name}", 210, 130, 900, 80, {
      fontFamily: "Inter", fontWeight: 600, fontSize: 46, color: "#8d8d98", align: "left",
    }, { anchor: "top-left", in: anim("fade", 400) }),
    text("time", "{sign}{tm}", CX, 520, 1700, 520, {
      fontFamily: "Inter", fontWeight: 800, fontSize: 440, color: "#ffffff", letterSpacing: -6,
    }, { in: anim("fade", 500, 100) }),
    box("track", CX, 860, trackW, 34, { fill: "#222228", radius: 17 }, { in: anim("grow-x", 600, 200) }),
    box("zones", 0, 0, trackW, 34, {
      radius: 17, progress: "zones", warnColors: { green: "#22c55e", yellow: "#f59e0b", red: "#ef4444" },
    }, { anchor: "top-left", parentId: "track", opacity: 0.4, in: anim("none", 0), out: anim("none", 0) }),
    box("elapsed", 0, 0, trackW, 34, {
      radius: 17, progress: "elapsed", warn: "fill", warnColors: { green: "#22c55e", yellow: "#f59e0b", red: "#ef4444" },
    }, { anchor: "top-left", parentId: "track", in: anim("none", 0), out: anim("none", 0) }),
    text("subtitle", "{speaker}", CX, 960, 1500, 60, {
      fontFamily: "Inter", fontWeight: 500, fontSize: 38, color: "#9a9aa6",
    }),
  ]);
}

// ── 9–11 · Welcome card (three backgrounds) ────────────────────────────────
function welcomeCard(bg: { stops: Array<{ color: string; at: number }>; angle?: number; type?: "linear" | "radial" }, accent: string, extra: boolean): ThemeLayout {
  const layers = [
    box("bg", CX, CY, W, H, { gradient: { type: bg.type ?? "linear", angle: bg.angle ?? 160, stops: bg.stops } }, {
      in: anim("none", 0), out: anim("none", 0),
    }),
  ];
  if (extra) {
    // Soft blurred lights — stand-in for a night-photo backdrop; replace with any picture in the editor.
    const lights: Array<[number, number, number, string]> = [
      [320, 260, 360, "rgba(255,190,90,0.35)"],
      [1560, 220, 300, "rgba(120,170,255,0.32)"],
      [1300, 860, 420, "rgba(255,120,160,0.28)"],
      [420, 820, 280, "rgba(120,230,200,0.22)"],
    ];
    lights.forEach(([x, y, d, c], i) => {
      layers.push(box(`light-${i + 1}`, x, y, d, d, {
        radius: 9999, gradient: { type: "radial", stops: [{ color: c, at: 0 }, { color: "rgba(0,0,0,0)", at: 70 }] },
      }, { in: anim("fade", 900, i * 120), loop: { preset: "drift", duration: 9000 + i * 1500 } }));
    });
  }
  layers.push(
    box("card", CX, CY, 1180, 640, {
      fill: "rgba(10,10,20,0.55)", radius: 36, borderWidth: 2, borderColor: "rgba(255,255,255,0.18)",
      backdropBlur: 0, shadow: "0 30px 90px rgba(0,0,0,0.5)",
    }, { in: anim("pop", 600) }),
    text("title", "{title}", CX, 340, 1000, 110, {
      fontFamily: "Montserrat", fontWeight: 800, fontSize: 88, letterSpacing: 14, color: "#ffffff", textTransform: "uppercase",
    }, { in: anim("slide-down", 500, 250) }),
    line("rule", CX, 420, 220, 6, accent, { in: anim("grow-x", 500, 350) }),
    text("time", "{sign}{tm}", CX, 575, 1000, 260, {
      fontFamily: "Montserrat", fontWeight: 900, fontSize: 230, color: accent, warn: "text",
      warnColors: { green: accent, yellow: "#facc15", red: "#ff5a5a" },
    }, { in: anim("scale", 600, 400) }),
    text("subtitle", "{subtitle}", CX, 780, 1000, 80, {
      fontFamily: "Montserrat", fontWeight: 600, fontSize: 46, letterSpacing: 10, color: "rgba(255,255,255,0.92)", textTransform: "uppercase",
    }, { in: anim("fade", 500, 550) }),
  );
  return countdownLayout(layers);
}

// ── 12 · Brush script in a double circle ───────────────────────────────────
function brushCircle(): ThemeLayout {
  return countdownLayout([
    box("bg", CX, CY, W, H, {
      gradient: { type: "linear", angle: 170, stops: [{ color: "#1d2a3a", at: 0 }, { color: "#0c1119", at: 100 }] },
    }, { in: anim("none", 0), out: anim("none", 0) }),
    box("shade", CX, CY, W, H, { fill: "rgba(0,0,0,0.28)" }, { in: anim("none", 0), out: anim("none", 0) }),
    box("ring-outer", CX, CY, 720, 720, { radius: 9999, borderWidth: 5, borderColor: "#ffffff" }, { in: anim("pop", 650) }),
    box("ring-inner", CX, CY, 664, 664, { radius: 9999, borderWidth: 2, borderColor: "rgba(255,255,255,0.8)" }, { in: anim("pop", 650, 100) }),
    text("time", "{sign}{tm}", CX, CY - 10, 560, 330, {
      fontFamily: "Kaushan Script", fontWeight: 400, fontSize: 290, color: "#ffffff", textShadow: "0 6px 30px rgba(0,0,0,0.5)",
    }, { in: anim("scale", 600, 300) }),
    text("subtitle", "{subtitle}", CX, CY + 215, 460, 60, {
      fontFamily: "Montserrat", fontWeight: 600, fontSize: 32, letterSpacing: 10, color: "rgba(255,255,255,0.9)", textTransform: "uppercase",
    }, { in: anim("fade", 500, 500) }),
    text("title", "{title}", CX, CY - 255, 460, 60, {
      fontFamily: "Montserrat", fontWeight: 700, fontSize: 34, letterSpacing: 12, color: "rgba(255,255,255,0.95)", textTransform: "uppercase",
    }, { in: anim("fade", 500, 500) }),
  ]);
}

// ── 13 · Red stamp on parchment ────────────────────────────────────────────
function stamp(): ThemeLayout {
  return countdownLayout([
    box("bg", CX, CY, W, H, {
      gradient: { type: "radial", stops: [{ color: "#f1e4c4", at: 0 }, { color: "#cdb685", at: 100 }] },
    }, { in: anim("none", 0), out: anim("none", 0) }),
    box("stamp-frame", CX, CY, 1180, 560, { borderWidth: 14, borderColor: "#b3261e", radius: 18 }, { rotation: -4, opacity: 0.92, in: anim("scale", 450) }),
    box("stamp-frame-inner", CX, CY, 1120, 500, { borderWidth: 4, borderColor: "#b3261e", radius: 12 }, { rotation: -4, opacity: 0.92, in: anim("scale", 450, 80) }),
    text("title", "{title}", CX, 372, 900, 100, {
      fontFamily: "Anton", fontWeight: 400, fontSize: 78, letterSpacing: 10, color: "#b3261e", textTransform: "uppercase", roughen: 3,
    }, { rotation: -4, opacity: 0.92, in: anim("fade", 400, 250) }),
    text("time", "{sign}{tm}", CX, 560, 1000, 340, {
      fontFamily: "Anton", fontWeight: 400, fontSize: 320, color: "#b3261e", roughen: 3, warn: "text",
      warnColors: { green: "#b3261e", yellow: "#c26a00", red: "#e11d2e" },
    }, { rotation: -4, opacity: 0.92, in: anim("scale", 450, 250) }),
    text("subtitle", "{subtitle}", CX, 750, 900, 70, {
      fontFamily: "Anton", fontWeight: 400, fontSize: 50, letterSpacing: 10, color: "#b3261e", textTransform: "uppercase", roughen: 3,
    }, { rotation: -4, opacity: 0.92, in: anim("fade", 400, 400) }),
  ]);
}

export const COUNTDOWN_PRESETS: CountdownPreset[] = [
  {
    id: "flip-clock",
    name: "Flip Clock",
    description: "Days, hours, minutes and seconds on flipping cards.",
    accent: "#3a3a3f",
    layout: flipClock(),
    sample: sample({ value: 2 * 86400 + 3 * 3600 + 4 * 60 + 5, durationSeconds: 0, warnYellowSeconds: 0, warnRedSeconds: 0, title: "Coming Soon", subtitle: "" }),
  },
  {
    id: "red-blocks",
    name: "Red Blocks",
    description: "Hours, minutes and seconds in bold red blocks.",
    accent: "#e11d2e",
    layout: redBlocks(),
    sample: sample({ value: 3725, durationSeconds: 7200, warnYellowSeconds: 300, warnRedSeconds: 60, title: "Starting soon", subtitle: "" }),
  },
  {
    id: "segment-coral",
    name: "7-Segment Coral",
    description: "White seven-segment digits on coral.",
    accent: "#f2503f",
    layout: segmentCoral(),
    sample: sample({ value: 599, durationSeconds: 600, title: "Countdown", subtitle: "Until we begin" }),
  },
  {
    id: "led-white",
    name: "Red LED on White",
    description: "Clean LED readout with unlit segments showing.",
    accent: "#e11d2e",
    layout: ledWhite(),
    sample: sample({ value: 595, durationSeconds: 600, title: "Countdown", subtitle: "Until we begin" }),
  },
  {
    id: "led-glow",
    name: "Glowing LED",
    description: "Six glowing red digits on black.",
    accent: "#ff2a3a",
    layout: ledGlow(),
    sample: sample({ value: 595, durationSeconds: 600, title: "Countdown", subtitle: "Until we begin" }),
  },
  {
    id: "retro-parchment",
    name: "Retro Parchment",
    description: "Dark red segments inside a framed parchment.",
    accent: "#8a1712",
    layout: retroParchment(),
    sample: sample({ value: 297, durationSeconds: 300, title: "Countdown", subtitle: "Until we begin" }),
  },
  {
    id: "outline-purple",
    name: "Purple Outline",
    description: "Bold outlined digits in a white rounded card.",
    accent: "#6d28d9",
    layout: outlinePurple(),
    sample: sample({ value: 297, durationSeconds: 300, title: "Starting in", subtitle: "" }),
  },
  {
    id: "stage-timer",
    name: "Stage Timer",
    description: "Huge white digits with a green / amber / red progress bar.",
    accent: "#22c55e",
    layout: stageTimer(),
    sample: sample({ value: 298, durationSeconds: 300, title: "Timer 1", subtitle: "Speaker name" }),
  },
  {
    id: "welcome-crimson",
    name: "Welcome · Crimson",
    description: "Welcome card on a deep crimson background.",
    accent: "#ffd27a",
    layout: welcomeCard({ stops: [{ color: "#8a1228", at: 0 }, { color: "#2a0610", at: 100 }] }, "#ffd27a", false),
    sample: sample(),
  },
  {
    id: "welcome-night",
    name: "Welcome · Night Lights",
    description: "Welcome card over soft night lights — swap in your own photo.",
    accent: "#ffffff",
    layout: welcomeCard({ stops: [{ color: "#16203a", at: 0 }, { color: "#070a14", at: 100 }] }, "#ffffff", true),
    sample: sample(),
  },
  {
    id: "welcome-violet",
    name: "Welcome · Violet",
    description: "Welcome card on a rich violet background.",
    accent: "#f0abfc",
    layout: welcomeCard({ stops: [{ color: "#6d28d9", at: 0 }, { color: "#1e1b4b", at: 100 }] }, "#f0abfc", false),
    sample: sample(),
  },
  {
    id: "brush-circle",
    name: "Brush Circle",
    description: "Hand-lettered time inside a double circle.",
    accent: "#ffffff",
    layout: brushCircle(),
    sample: sample({ value: 299, durationSeconds: 300, title: "Starting in", subtitle: "Minutes" }),
  },
  {
    id: "stamp",
    name: "Rubber Stamp",
    description: "Distressed red stamp on parchment.",
    accent: "#b3261e",
    layout: stamp(),
    sample: sample({ value: 300, durationSeconds: 300, title: "Time left", subtitle: "Minutes" }),
  },
];

export function countdownPresetById(id: string | undefined | null): CountdownPreset | undefined {
  return COUNTDOWN_PRESETS.find((p) => p.id === id);
}

export const DEFAULT_COUNTDOWN_PRESET_ID = "welcome-crimson";
