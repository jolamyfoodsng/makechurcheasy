/**
 * countdownDefaults.ts — Default values for countdown templates and configs
 */

import type {
  CountdownConfig,
  CountdownTemplate,
  CountdownTemplateId,
} from "./types";

// ── Available templates ────────────────────────────────────────────────────

export const COUNTDOWN_TEMPLATES: CountdownTemplate[] = [
  {
    id: "circular",
    name: "Circular Countdown",
    description: "Animated circular progress ring with large timer",
    icon: "circle-dot",
  },
  {
    id: "minimal",
    name: "Minimal Countdown",
    description: "Clean timer with subtitle, no ring",
    icon: "minus",
  },
  {
    id: "modern",
    name: "Modern Countdown",
    description: "Sleek modern design with gradient ring",
    icon: "sparkles",
  },
  {
    id: "conference",
    name: "Conference Countdown",
    description: "Event title, logo area, timer, and speaker image",
    icon: "presentation",
  },
  {
    id: "lower-third",
    name: "Lower Third",
    description: "Small countdown in corner, perfect before service",
    icon: "panel-bottom",
  },
  {
    id: "full-screen",
    name: "Full Screen",
    description: "Massive timer with motion background",
    icon: "maximize",
  },
  {
    id: "custom",
    name: "Custom Countdown",
    description: "Start from scratch with full creative control",
    icon: "sliders-horizontal",
  },
];

// ── Default background ─────────────────────────────────────────────────────

function defaultBackground(): CountdownConfig["background"] {
  return {
    type: "solid",
    color: "#0f172a",
    gradientStart: "#0f172a",
    gradientEnd: "#1e293b",
    gradientAngle: 135,
    imageUrl: "",
    videoUrl: "",
    blur: 0,
    brightness: 100,
    overlayOpacity: 0.4,
    zoom: 1,
    positionX: 50,
    positionY: 50,
    source: "upload",
    assetId: "",
    builtinId: "",
    imageFit: "cover",
    loop: true,
    muted: true,
    flyerMode: false,
  };
}

// ── Default text ───────────────────────────────────────────────────────────

function defaultText(): CountdownConfig["text"] {
  return {
    title: "Service Starts Soon",
    subtitle: "",
    fontFamily: "Inter, sans-serif",
    fontWeight: 700,
    fontSize: 48,
    letterSpacing: 0,
    lineHeight: 1.2,
    color: "#ffffff",
    shadowEnabled: true,
    shadowColor: "rgba(0,0,0,0.5)",
    shadowBlur: 12,
    shadowOffsetX: 0,
    shadowOffsetY: 4,
  };
}

// ── Per-template overrides ─────────────────────────────────────────────────

interface TemplateOverrides {
  timer: Partial<CountdownConfig["timer"]>;
  text: Partial<CountdownConfig["text"]>;
  background?: Partial<CountdownConfig["background"]>;
  animation: Partial<CountdownConfig["animation"]>;
}

const TEMPLATE_OVERRIDES: Record<CountdownTemplateId, TemplateOverrides> = {
  circular: {
    timer: { durationSeconds: 600, showHours: false, showMinutes: true, showSeconds: true },
    text: { title: "Service Starts Soon", fontSize: 42, fontWeight: 600 },
    animation: { entrance: "fade-in", backgroundMotion: "none", speed: 1 },
  },
  minimal: {
    timer: { durationSeconds: 600, showHours: false, showMinutes: true, showSeconds: true },
    text: { title: "Welcome To Worship", fontSize: 56, fontWeight: 800 },
    background: { color: "#ffffff", overlayOpacity: 0 },
    animation: { entrance: "scale", backgroundMotion: "none", speed: 1 },
  },
  modern: {
    timer: { durationSeconds: 600, showHours: false, showMinutes: true, showSeconds: true },
    text: { title: "VANTAGE 2026", subtitle: "Starts Soon", fontSize: 44, fontWeight: 800, letterSpacing: 4 },
    background: { type: "gradient", gradientStart: "#7c3aed", gradientEnd: "#2563eb", gradientAngle: 135 },
    animation: { entrance: "slide-up", backgroundMotion: "none", speed: 1 },
  },
  conference: {
    timer: { durationSeconds: 900, showHours: false, showMinutes: true, showSeconds: true },
    text: { title: "Conference 2026", subtitle: "Day 1 — General Session", fontSize: 36, fontWeight: 700 },
    background: { type: "gradient", gradientStart: "#0f172a", gradientEnd: "#1e293b", gradientAngle: 180 },
    animation: { entrance: "fade-in", backgroundMotion: "none", speed: 1 },
  },
  "lower-third": {
    timer: { durationSeconds: 600, showHours: false, showMinutes: true, showSeconds: true },
    text: { title: "Service Begins In", fontSize: 28, fontWeight: 600 },
    background: { color: "#111827", overlayOpacity: 0.8 },
    animation: { entrance: "slide-up", backgroundMotion: "none", speed: 1 },
  },
  "full-screen": {
    timer: { durationSeconds: 600, showHours: false, showMinutes: true, showSeconds: true },
    text: { title: "Prayer Begins In", fontSize: 64, fontWeight: 800 },
    animation: { entrance: "scale", backgroundMotion: "zoom-pulse", speed: 1 },
  },
  custom: {
    timer: { durationSeconds: 300, showHours: false, showMinutes: true, showSeconds: true },
    text: { title: "Countdown", fontSize: 48, fontWeight: 700 },
    animation: { entrance: "none", backgroundMotion: "none", speed: 1 },
  },
};

// ── Public helpers ─────────────────────────────────────────────────────────

export function getDefaultTimer(templateId: CountdownTemplateId): CountdownConfig["timer"] {
  const base: CountdownConfig["timer"] = {
    mode: "fixed-duration",
    durationSeconds: 600,
    showHours: false,
    showMinutes: true,
    showSeconds: true,
  };
  return { ...base, ...TEMPLATE_OVERRIDES[templateId].timer };
}

export function getDefaultText(templateId: CountdownTemplateId): CountdownConfig["text"] {
  return { ...defaultText(), ...TEMPLATE_OVERRIDES[templateId].text };
}

export function getDefaultBackground(templateId: CountdownTemplateId): CountdownConfig["background"] {
  return { ...defaultBackground(), ...TEMPLATE_OVERRIDES[templateId].background };
}

export function getDefaultAnimation(templateId: CountdownTemplateId): CountdownConfig["animation"] {
  const base: CountdownConfig["animation"] = {
    entrance: "fade-in",
    backgroundMotion: "none",
    speed: 1,
  };
  return { ...base, ...TEMPLATE_OVERRIDES[templateId].animation };
}

export function createDefaultCountdown(
  templateId: CountdownTemplateId,
  id: string,
): CountdownConfig {
  const now = new Date().toISOString();
  return {
    id,
    title: "",
    templateId,
    timer: getDefaultTimer(templateId),
    background: getDefaultBackground(templateId),
    text: getDefaultText(templateId),
    animation: getDefaultAnimation(templateId),
    obs: {
      sceneName: "",
      autoAction: "none",
      autoActionScene: "",
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function getTemplateName(templateId: CountdownTemplateId): string {
  return COUNTDOWN_TEMPLATES.find((t) => t.id === templateId)?.name ?? templateId;
}
