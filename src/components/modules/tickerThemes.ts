/**
 * tickerThemes.ts — Ticker overlay themes for broadcast
 *
 * Inspired by overlays.uno ticker designs (Fresh, Fitness, Daily Burn).
 * Each theme generates an HTML overlay for an OBS Browser Source.
 *
 * Themes are customisable: accent color, heading text, font family,
 * background opacity, text color, separator style, animation speed.
 */

import { normalizeDockFontFamily } from "../../dock/dockFontFamily";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TickerThemeColors {
  /** Primary accent / heading background */
  accent: string;
  /** Accent text color (text on accent bg) */
  accentText: string;
  /** Ticker bar background */
  barBg: string;
  /** Ticker bar text color */
  barText: string;
  /** Separator / divider color */
  separator: string;
}

export interface TickerThemeConfig {
  /** Unique id */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Material icon name */
  icon: string;
  /** Preview tags */
  tags: string[];
  /** Default colors (user can override) */
  defaultColors: TickerThemeColors;
  /** Default heading text */
  defaultHeading: string;
  /** Font family stack */
  fontFamily: string;
  /** Google Fonts import URL (optional) */
  fontImport?: string;
  /** Whether the heading badge has an icon */
  headingIcon?: string;
  /** CSS border-radius for the heading badge */
  headingRadius?: string;
  /** Separator character between messages */
  separatorChar: string;
  /** Whether bar has a gradient or solid bg */
  barStyle: "solid" | "gradient" | "glass";
  /** Optional alternate renderer for ticker layouts that need custom markup */
  layout?: "standard" | "rotating-logo";
}

// ---------------------------------------------------------------------------
// Built-in Themes
// ---------------------------------------------------------------------------

export const TICKER_THEMES: TickerThemeConfig[] = [
  // ── 1. Fresh ──
  {
    id: "ticker-fresh",
    name: "Fresh",
    description: "Clean modern ticker with rounded badge heading and smooth scroll",
    icon: "auto_awesome",
    tags: ["modern", "clean", "rounded"],
    defaultColors: {
      accent: "#6366F1",
      accentText: "#FFFFFF",
      barBg: "#0F172A",
      barText: "#F1F5F9",
      separator: "#6366F1",
    },
    defaultHeading: "LIVE",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontImport: "/fonts/google/google-fonts.css",
    headingIcon: "bolt",
    headingRadius: "6px",
    separatorChar: "•",
    barStyle: "solid",
  },

  // ── 2. Fitness (Weather Ticker) ──
  {
    id: "ticker-fitness",
    name: "Fitness",
    description: "High-energy fitness-inspired ticker with bold gradient bar",
    icon: "fitness_center",
    tags: ["bold", "gradient", "energetic"],
    defaultColors: {
      accent: "#EF4444",
      accentText: "#FFFFFF",
      barBg: "#18181B",
      barText: "#FAFAFA",
      separator: "#EF4444",
    },
    defaultHeading: "BREAKING",
    fontFamily: "'Oswald', 'Impact', sans-serif",
    fontImport: "/fonts/google/google-fonts.css",
    headingIcon: "local_fire_department",
    headingRadius: "0px",
    separatorChar: "//",
    barStyle: "gradient",
  },

  // ── 3. Daily Burn ──
  {
    id: "ticker-daily-burn",
    name: "Daily Burn",
    description: "Sleek dark ticker with amber accent and sharp edges",
    icon: "whatshot",
    tags: ["dark", "sharp", "amber"],
    defaultColors: {
      accent: "#F59E0B",
      accentText: "#000000",
      barBg: "#1C1917",
      barText: "#FEF3C7",
      separator: "#F59E0B",
    },
    defaultHeading: "ALERT",
    fontFamily: "'Montserrat', 'Helvetica Neue', sans-serif",
    fontImport: "/fonts/google/google-fonts.css",
    headingIcon: "notifications_active",
    headingRadius: "2px",
    separatorChar: "—",
    barStyle: "solid",
  },

  // ── 4. Minimal ──
  {
    id: "ticker-minimal",
    name: "Minimal",
    description: "Ultra-clean white ticker with subtle accent line",
    icon: "remove",
    tags: ["minimal", "white", "subtle"],
    defaultColors: {
      accent: "#10B981",
      accentText: "#FFFFFF",
      barBg: "#FFFFFF",
      barText: "#1E293B",
      separator: "#CBD5E1",
    },
    defaultHeading: "UPDATE",
    fontFamily: "'Inter', system-ui, sans-serif",
    fontImport: "/fonts/google/google-fonts.css",
    headingIcon: "info",
    headingRadius: "20px",
    separatorChar: "|",
    barStyle: "solid",
  },

  // ── 5. Glass ──
  {
    id: "ticker-glass",
    name: "Glass",
    description: "Frosted glass translucent bar with blur backdrop effect",
    icon: "blur_on",
    tags: ["glass", "blur", "translucent"],
    defaultColors: {
      accent: "#8B5CF6",
      accentText: "#FFFFFF",
      barBg: "rgba(15, 23, 42, 0.65)",
      barText: "#F8FAFC",
      separator: "#A78BFA",
    },
    defaultHeading: "NOW",
    fontFamily: "'Inter', 'SF Pro Display', sans-serif",
    fontImport: "/fonts/google/google-fonts.css",
    headingIcon: "fiber_manual_record",
    headingRadius: "8px",
    separatorChar: "◆",
    barStyle: "glass",
  },

  // ── 6. Rotating Logo ──
  {
    id: "ticker-rotating-logo",
    name: "Rotating Logo",
    description: "Branded ticker where the church logo rotates in, the line opens, then text scrolls",
    icon: "cached",
    tags: ["logo", "brand", "animated"],
    defaultColors: {
      accent: "#1D4ED8",
      accentText: "#FFFFFF",
      barBg: "rgba(15, 23, 42, 0.92)",
      barText: "#F8FAFC",
      separator: "#F59E0B",
    },
    defaultHeading: "LIVE",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontImport: "/fonts/google/google-fonts.css",
    headingRadius: "0px",
    separatorChar: "•",
    barStyle: "solid",
    layout: "rotating-logo",
  },
];

// ---------------------------------------------------------------------------
// HTML Generator — builds the overlay HTML for OBS Browser Source
// ---------------------------------------------------------------------------

/**
 * Generate complete ticker overlay HTML for an OBS Browser Source.
 */
export function generateTickerHTML(
  theme: TickerThemeConfig,
  colors: TickerThemeColors,
  heading: string,
  messages: string[],
  speed: number,
  position: "top" | "bottom",
  loop: boolean = true,
  paused: boolean = false,
  brandLogoUrl: string = "",
  brandName: string = "",
  fontFamilyOverride?: string,
): string {
  // OBS Text Source v1 default is 32px. Use it as ticker base size for readability on program output.

  const OBS_TEXT_DEFAULT_PX = 36;
  const TICKER_BAR_HEIGHT_PX = 80;
  const pxPerSecond = Math.max(60, Math.min(320, 40 + speed * 2.8));
  const positionCSS = position === "top" ? "top: 0;" : "bottom: 0;";
  const fontFamily = normalizeDockFontFamily(fontFamilyOverride) || theme.fontFamily;
  const safeMessages = messages.map((m) => m.trim()).filter(Boolean);
  const cycleMessages = (safeMessages.length > 0 ? safeMessages : [" "])
    .map((m) => `<span class="tk-msg">${escapeHTML(m)}</span>`)
    .join(`<span class="tk-sep">${escapeHTML(theme.separatorChar)}</span>`);
  const cycleContent = `${cycleMessages}<span class="tk-sep">${escapeHTML(theme.separatorChar)}</span>`;

  const barBgCSS =
    theme.barStyle === "gradient"
      ? `background: linear-gradient(90deg, ${colors.barBg} 0%, ${lighten(colors.barBg, 12)} 100%);`
      : theme.barStyle === "glass"
        ? `background: ${colors.barBg}; backdrop-filter: blur(16px) saturate(1.5); -webkit-backdrop-filter: blur(16px) saturate(1.5);`
        : `background: ${colors.barBg};`;

  if (theme.layout === "rotating-logo") {
    return generateRotatingLogoTickerHTML({
      theme,
      colors,
      heading,
      cycleContent,
      loop,
      paused,
      position,
      pxPerSecond,
      brandLogoUrl,
      brandName,
      fontFamily,
    });
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${theme.fontImport ? `<link rel="stylesheet" href="${theme.fontImport}">` : ""}
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent;overflow:hidden;width:100%;height:100%}

.tk-bar{
  position:fixed;left:0;right:0;${positionCSS}
  display:flex;align-items:center;
  height:${TICKER_BAR_HEIGHT_PX}px;
  ${barBgCSS}
  font-family:${fontFamily};
  z-index:9999;
  box-shadow:0 2px 12px rgba(0,0,0,0.3);
}

.tk-heading{
  display:flex;align-items:center;gap:6px;
  flex-shrink:0;
  padding:0 16px;
  height:100%;
  background:${colors.accent};
  color:${colors.accentText};
  font-size:16px;
  font-weight:800;
  letter-spacing:0.08em;
  text-transform:uppercase;
  white-space:nowrap;
  border-radius:${theme.headingRadius ?? "0px"};
  position:relative;
  z-index:2;
}

.tk-heading::after{
  content:'';
  position:absolute;
  right:-12px;top:0;
  width:24px;height:100%;
  background:${colors.accent};
  clip-path:polygon(0 0,100% 50%,0 100%);
}

.tk-scroll-wrap{
  flex:1;overflow:hidden;
  display:flex;align-items:center;
  height:100%;
  padding-left:20px;
  min-width:0;
}

.tk-scroll-track{
  display:flex;
  white-space:nowrap;
  will-change:transform;
  transform:translate3d(0,0,0);
}

.tk-scroll-half{
  display:flex;align-items:center;
  white-space:nowrap;
  flex-shrink:0;
  padding-right:40px;
}

.tk-cycle{
  display:flex;align-items:center;
  white-space:nowrap;
  flex-shrink:0;
}

.tk-msg{
  color:${colors.barText};
  font-size:${OBS_TEXT_DEFAULT_PX}px;
  font-weight:600;
  padding:0 12px;
  letter-spacing:0.01em;
}

.tk-sep{
  color:${colors.separator};
  font-size:16px;
  font-weight:700;
  opacity:0.7;
  padding:0 4px;
}

@keyframes tkScroll{
  0%{transform:translate3d(0,0,0)}
  100%{transform:translate3d(calc(-1 * var(--tk-half-width, 50%)),0,0)}
}

/* Entrance animation */
.tk-bar{
  animation:tkSlideIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
}
@keyframes tkSlideIn{
  from{transform:translateY(${position === "top" ? "-100%" : "100%"});opacity:0}
  to{transform:translateY(0);opacity:1}
}
</style>
</head>
<body>
<div class="tk-bar">
  <div class="tk-heading">
    ${escapeHTML(heading)}
  </div>
  <div class="tk-scroll-wrap" id="tkWrap">
    <div class="tk-scroll-track" id="tkTrack">
      <div class="tk-scroll-half"><div class="tk-cycle">${cycleContent}</div></div>
      <div class="tk-scroll-half"><div class="tk-cycle">${cycleContent}</div></div>
    </div>
  </div>
</div>
<template id="tkTemplate">${cycleContent}</template>
<script>
(() => {
  const wrap = document.getElementById("tkWrap");
  const track = document.getElementById("tkTrack");
  const template = document.getElementById("tkTemplate");
  if (!wrap || !track || !template) return;

  const pxPerSecond = ${pxPerSecond.toFixed(2)};
  const shouldLoop = ${loop ? "true" : "false"};
  let resizeFrame = 0;

  const buildTrack = () => {
    track.innerHTML = "";
    track.style.animation = "none";
    void track.offsetWidth;

    const wrapWidth = Math.max(wrap.clientWidth, 1);
    const half = document.createElement("div");
    half.className = "tk-scroll-half";
    track.appendChild(half);

    let copies = 0;
    while (half.scrollWidth < wrapWidth * 2.2 && copies < 36) {
      const cycle = document.createElement("div");
      cycle.className = "tk-cycle";
      cycle.innerHTML = template.innerHTML;
      half.appendChild(cycle);
      copies += 1;
    }

    if (copies === 0) {
      const cycle = document.createElement("div");
      cycle.className = "tk-cycle";
      cycle.innerHTML = template.innerHTML;
      half.appendChild(cycle);
    }

    const halfWidth = Math.max(half.scrollWidth, wrapWidth + 120);
    const halfClone = half.cloneNode(true);
    track.appendChild(halfClone);

    track.style.setProperty("--tk-half-width", halfWidth + "px");
    const duration = Math.max(8, halfWidth / pxPerSecond);
    track.style.animationName = "tkScroll";
    track.style.animationDuration = duration + "s";
    track.style.animationTimingFunction = "linear";
    track.style.animationIterationCount = shouldLoop ? "infinite" : "1";
    track.style.animationFillMode = shouldLoop ? "none" : "forwards";
    track.style.animationPlayState = ${paused ? '"paused"' : '"running"'};
  };

  const handleResize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(buildTrack);
  };

  buildTrack();
  window.addEventListener("resize", handleResize);
})();
</script>
</body>
</html>`;
}

function generateRotatingLogoTickerHTML({
  theme,
  colors,
  heading,
  cycleContent,
  loop,
  paused,
  position,
  pxPerSecond,
  brandLogoUrl,
  brandName,
  fontFamily,
}: {
  theme: TickerThemeConfig;
  colors: TickerThemeColors;
  heading: string;
  cycleContent: string;
  loop: boolean;
  paused: boolean;
  position: "top" | "bottom";
  pxPerSecond: number;
  brandLogoUrl: string;
  brandName: string;
  fontFamily: string;
}): string {
  const TICKER_BAR_HEIGHT_PX = 80;
  const positionCSS = position === "top" ? "top: 0;" : "bottom: 0;";
  const trimmedBrandName = brandName.trim();
  const fallbackText = (trimmedBrandName || heading || "MCE")
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase() || "MCE";
  const safeLogoUrl = brandLogoUrl.trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${theme.fontImport ? `<link rel="stylesheet" href="${theme.fontImport}">` : ""}
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent;overflow:hidden;width:100%;height:100%}

.logo-ticker{
  position:fixed;left:0;right:0;${positionCSS}
  height:${TICKER_BAR_HEIGHT_PX}px;
  display:flex;align-items:center;
  font-family:${fontFamily};
  z-index:9999;
  pointer-events:none;
  filter:drop-shadow(0 10px 24px rgba(0,0,0,.34));
}

.logo-ticker__mark{
  position:relative;
  width:${TICKER_BAR_HEIGHT_PX}px;
  height:${TICKER_BAR_HEIGHT_PX}px;
  margin-left:10px;
  border-radius:999px;
  background:${colors.accent};
  border:4px solid rgba(255,255,255,.92);
  display:flex;align-items:center;justify-content:center;
  overflow:hidden;
  flex-shrink:0;
  animation:logoTickerRise .9s cubic-bezier(.16,1,.3,1) both;
  z-index:3;
}

.logo-ticker__mark img{
  width:100%;height:100%;
  object-fit:cover;
  display:${safeLogoUrl ? "block" : "none"};
}

.logo-ticker__fallback{
  display:${safeLogoUrl ? "none" : "flex"};
  align-items:center;justify-content:center;
  width:100%;height:100%;
  color:${colors.accentText};
  font-size:20px;
  font-weight:900;
}

.logo-ticker__body{
  position:relative;
  flex:1;
  min-width:0;
  height:56px;
  margin-left:-8px;
  padding-left:24px;
  padding-right:18px;
  overflow:hidden;
  background:${colors.barBg};
  border:1px solid rgba(255,255,255,.16);
  border-left:0;
  border-radius:0 10px 10px 0;
  transform-origin:left center;
  animation:logoTickerBodyOpen .72s cubic-bezier(.16,1,.3,1) .42s both;
}

.logo-ticker__line{
  position:absolute;left:24px;right:18px;
  height:2px;
  background:linear-gradient(90deg, ${colors.separator}, rgba(255,255,255,.12));
  transform-origin:left center;
  animation:logoTickerLineSpread .62s cubic-bezier(.16,1,.3,1) .55s both;
}

.logo-ticker__line--top{top:10px}
.logo-ticker__line--bottom{bottom:10px}

.logo-ticker__track-wrap{
  position:relative;
  height:100%;
  display:flex;align-items:center;
  overflow:hidden;
  opacity:0;
  animation:logoTickerTextIn .28s ease-out 1.08s forwards;
}

.logo-ticker__track{
  display:flex;
  align-items:center;
  white-space:nowrap;
  will-change:transform;
  transform:translate3d(0,0,0);
}

.logo-ticker__half,
.logo-ticker__cycle{
  display:flex;
  align-items:center;
  white-space:nowrap;
  flex-shrink:0;
}

.logo-ticker__half{padding-right:44px}

.tk-msg{
  color:${colors.barText};
  font-size:34px;
  font-weight:700;
  padding:0 14px;
  letter-spacing:0;
}

.tk-sep{
  color:${colors.separator};
  font-size:18px;
  font-weight:900;
  opacity:.9;
  padding:0 4px;
}

@keyframes logoTickerRise{
  0%{opacity:0;transform:translateY(${position === "top" ? "-42px" : "42px"}) rotate(-95deg) scale(.72)}
  68%{opacity:1;transform:translateY(0) rotate(8deg) scale(1.04)}
  100%{opacity:1;transform:translateY(0) rotate(0deg) scale(1)}
}

@keyframes logoTickerBodyOpen{
  0%{opacity:0;transform:scaleX(.05)}
  100%{opacity:1;transform:scaleX(1)}
}

@keyframes logoTickerLineSpread{
  0%{transform:scaleX(0);opacity:0}
  100%{transform:scaleX(1);opacity:1}
}

@keyframes logoTickerTextIn{
  from{opacity:0;transform:translateY(6px)}
  to{opacity:1;transform:translateY(0)}
}

@keyframes logoTickerScroll{
  0%{transform:translate3d(0,0,0)}
  100%{transform:translate3d(calc(-1 * var(--logo-ticker-half-width, 50%)),0,0)}
}
</style>
</head>
<body>
<div class="logo-ticker">
  <div class="logo-ticker__mark">
    <img src="${escapeHTML(safeLogoUrl)}" alt="">
    <div class="logo-ticker__fallback">${escapeHTML(fallbackText)}</div>
  </div>
  <div class="logo-ticker__body">
    <div class="logo-ticker__line logo-ticker__line--top"></div>
    <div class="logo-ticker__line logo-ticker__line--bottom"></div>
    <div class="logo-ticker__track-wrap" id="logoTickerWrap">
      <div class="logo-ticker__track" id="logoTickerTrack"></div>
    </div>
  </div>
</div>
<template id="logoTickerTemplate">${cycleContent}</template>
<script>
(() => {
  const wrap = document.getElementById("logoTickerWrap");
  const track = document.getElementById("logoTickerTrack");
  const template = document.getElementById("logoTickerTemplate");
  if (!wrap || !track || !template) return;

  const pxPerSecond = ${pxPerSecond.toFixed(2)};
  const shouldLoop = ${loop ? "true" : "false"};
  let resizeFrame = 0;

  const buildTrack = () => {
    track.innerHTML = "";
    track.style.animation = "none";
    void track.offsetWidth;

    const wrapWidth = Math.max(wrap.clientWidth, 1);
    const half = document.createElement("div");
    half.className = "logo-ticker__half";
    track.appendChild(half);

    let copies = 0;
    while (half.scrollWidth < wrapWidth * 2.2 && copies < 36) {
      const cycle = document.createElement("div");
      cycle.className = "logo-ticker__cycle";
      cycle.innerHTML = template.innerHTML;
      half.appendChild(cycle);
      copies += 1;
    }

    if (copies === 0) {
      const cycle = document.createElement("div");
      cycle.className = "logo-ticker__cycle";
      cycle.innerHTML = template.innerHTML;
      half.appendChild(cycle);
    }

    const halfWidth = Math.max(half.scrollWidth, wrapWidth + 120);
    const halfClone = half.cloneNode(true);
    track.appendChild(halfClone);

    track.style.setProperty("--logo-ticker-half-width", halfWidth + "px");
    const duration = Math.max(8, halfWidth / pxPerSecond);
    track.style.animationName = "logoTickerScroll";
    track.style.animationDuration = duration + "s";
    track.style.animationTimingFunction = "linear";
    track.style.animationDelay = "1.2s";
    track.style.animationIterationCount = shouldLoop ? "infinite" : "1";
    track.style.animationFillMode = shouldLoop ? "none" : "forwards";
    track.style.animationPlayState = ${paused ? '"paused"' : '"running"'};
  };

  const handleResize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(buildTrack);
  };

  buildTrack();
  window.addEventListener("resize", handleResize);
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Lighten a hex color by a percentage */
function lighten(hex: string, percent: number): string {
  // If it's rgba or non-hex, return as-is
  if (!hex.startsWith("#")) return hex;
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * percent / 100));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * percent / 100));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * percent / 100));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
