/**
 * bibleThemes.ts — Built-in Bible lower-third themes from all_themes.json
 *
 * Extracts themes with category "bible" or tag "bible" from the lower_thirds
 * theme pack and converts them to BibleTheme objects for the Theme Creator.
 */

import type { BibleTheme, BibleThemeRawTemplate, BibleThemeSettings } from "./types";
import { DEFAULT_THEME_SETTINGS } from "./types";

// ---------------------------------------------------------------------------
// Raw theme data (extracted from lower_thirds/all_themes.json)
// ---------------------------------------------------------------------------

interface RawLowerThirdTheme {
  id: string;
  name: string;
  description: string;
  category: string;
  accentColor: string;
  tags: string[];
  html: string;
  css: string;
  fontImports: string[];
  animation: { name: string; duration: number; easing: string };
  exitAnimation: { name: string; duration: number; easing: string };
  variables: Array<{
    key: string;
    label: string;
    type: string;
    defaultValue: string;
    placeholder?: string;
    required?: boolean;
    group?: string;
    options?: Array<{ label: string; value: string }>;
  }>;
}

const BIBLE_LT_THEMES: RawLowerThirdTheme[] = [
  {
    id: "lt-143-style-verse-focus",
    name: "Stylish Verse Focus",
    description: "Bible verse focus card with elevated modern contrast.",
    category: "bible",
    accentColor: "#C026D3",
    tags: ["stylish", "scripture", "verse", "bible"],
    variables: [
      { key: "label", label: "Label", type: "text", defaultValue: "Scripture", placeholder: "e.g. Scripture Reading", group: "Header" },
      { key: "verseText", label: "Verse Text", type: "text", defaultValue: "Trust in the Lord with all your heart, and lean not on your own understanding.", placeholder: "Enter verse text", required: true, group: "Content" },
      { key: "reference", label: "Reference", type: "text", defaultValue: "Proverbs 3:5", placeholder: "e.g. Romans 8:28", required: true, group: "Content" },
    ],
    html: `<div class="lt pos-bc in-up" data-state="in">
  <div class="panel quote-panel" style="--bg:rgba(30,27,75,.9);--fg:#FAF5FF;--accent:#C026D3;--bd:rgba(192,38,211,.35);">
    <span class="kicker">{{label}}</span>
    <p class="quote-text">{{verseText}}</p>
    <p class="quote-ref">{{reference}}</p>
  </div>
</div>`,
    fontImports: ["https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Source+Serif+4:wght@400;600;700&display=swap"],
    animation: { name: "fadeInUp", duration: 600, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    exitAnimation: { name: "fadeOutDown", duration: 400, easing: "cubic-bezier(.4,0,1,1)" },
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Montserrat", sans-serif; }

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeOutDown {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(20px); }
}

.lt { position: fixed; z-index: 40; pointer-events: none; }
.lt[data-state="in"] { animation: fadeInUp .6s cubic-bezier(0.16,1,0.3,1) both; }
.lt[data-state="out"] { animation: fadeOutDown .4s cubic-bezier(.4,0,1,1) both; }

.pos-bc { left: 50%; bottom: 32px; transform: translateX(-50%); }

.panel {
  background: var(--bg, rgba(20,20,20,.85));
  color: var(--fg, #fff);
  border: 1px solid var(--bd, rgba(255,255,255,.14));
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,.28);
  backdrop-filter: blur(2px);
}

.kicker {
  display: inline-block;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  margin-bottom: 8px;
  color: var(--accent, #4a6bcb);
}

.quote-panel {
  max-width: min(1450px, calc(100vw - 80px));
  min-width: 680px;
  padding: 18px 24px 20px;
}

.quote-text {
  font-family: "Source Serif 4", serif;
  font-size: clamp(29px, 2.25vw, 55px);
  line-height: 1.22;
  font-weight: 600;
}

.quote-ref {
  margin-top: 10px;
  text-align: right;
  font-size: clamp(16px, 1.1vw, 26px);
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
  opacity: .9;
}

@media (max-width: 1180px) {
  .pos-bc { left: 20px; right: 20px; transform: none; }
  .quote-panel { min-width: 0; max-width: calc(100vw - 40px); }
}`,
  },
  {
    id: "lt-205-youth-scripture-glow-electric-indigo",
    name: "Scripture Glow — Electric Indigo",
    description: "Animated scripture glow card with electric indigo accent for modern youth settings.",
    category: "bible",
    accentColor: "#38bdf8",
    tags: ["bible", "scripture", "verse", "animated", "in-out", "modern-youth", "electric-indigo"],
    variables: [
      { key: "label", label: "Label", type: "text", defaultValue: "Scripture", placeholder: "e.g. Scripture Reading", group: "Header" },
      { key: "verseText", label: "Verse Text", type: "text", defaultValue: "Do not be conformed to this world, but be transformed by the renewing of your mind.", placeholder: "Verse text", required: true, group: "Content" },
      { key: "reference", label: "Reference", type: "text", defaultValue: "Romans 12:2", placeholder: "e.g. Romans 12:2", required: true, group: "Content" },
      { key: "state", label: "State", type: "select", defaultValue: "in", options: [{ label: "In", value: "in" }, { label: "Out", value: "out" }], group: "Animation" },
    ],
    html: `<div class="lt pos-bc" data-state="in">
  <div class="glow-panel" style="--accent:#38bdf8;--accent2:#6366f1;--bg:rgba(15,10,40,.92);--fg:#E0F2FE;">
    <span class="kicker">{{label}}</span>
    <p class="glow-text">{{verseText}}</p>
    <p class="glow-ref">{{reference}}</p>
  </div>
</div>`,
    fontImports: ["https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Source+Serif+4:wght@400;600;700&display=swap"],
    animation: { name: "glowIn", duration: 700, easing: "cubic-bezier(0.16,1,0.3,1)" },
    exitAnimation: { name: "glowOut", duration: 450, easing: "cubic-bezier(.4,0,1,1)" },
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Inter", sans-serif; }

@keyframes glowIn {
  0% { opacity: 0; transform: translateY(24px) scale(.97); filter: blur(6px); }
  60% { filter: blur(0); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes glowOut {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(16px) scale(.97); filter: blur(4px); }
}

.lt { position: fixed; z-index: 40; pointer-events: none; }
.lt[data-state="in"] { animation: glowIn .7s cubic-bezier(0.16,1,0.3,1) both; }
.lt[data-state="out"] { animation: glowOut .45s cubic-bezier(.4,0,1,1) both; }
.pos-bc { left: 50%; bottom: 36px; transform: translateX(-50%); }

.glow-panel {
  position: relative;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid rgba(99,102,241,.3);
  border-radius: 16px;
  padding: 20px 28px 22px;
  max-width: min(1400px, calc(100vw - 80px));
  min-width: 640px;
  box-shadow: 0 0 60px rgba(56,189,248,.12), 0 12px 40px rgba(0,0,0,.3);
  overflow: hidden;
}

.glow-panel::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: 16px;
  padding: 1px;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: .5;
  pointer-events: none;
}

.kicker {
  display: inline-block;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: .1em;
  text-transform: uppercase;
  margin-bottom: 10px;
  color: var(--accent);
}

.glow-text {
  font-family: "Source Serif 4", serif;
  font-size: clamp(28px, 2.1vw, 52px);
  line-height: 1.2;
  font-weight: 600;
}

.glow-ref {
  margin-top: 12px;
  text-align: right;
  font-size: clamp(15px, 1.05vw, 24px);
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--accent);
  opacity: .9;
}

@media (max-width: 1180px) {
  .pos-bc { left: 20px; right: 20px; transform: none; }
  .glow-panel { min-width: 0; max-width: calc(100vw - 40px); }
}`,
  },
  {
    id: "lt-105-traditional-scripture-ribbon",
    name: "Traditional Scripture Ribbon",
    description: "Traditional green ribbon scripture card with elegant serif typography.",
    category: "bible",
    accentColor: "#4ADE80",
    tags: ["traditional", "scripture", "verse", "bible"],
    variables: [
      { key: "label", label: "Label", type: "text", defaultValue: "Scripture", placeholder: "e.g. Scripture Reading", group: "Header" },
      { key: "verseText", label: "Verse Text", type: "text", defaultValue: "Trust in the Lord with all your heart, and lean not on your own understanding.", placeholder: "Enter verse text", required: true, group: "Content" },
      { key: "reference", label: "Reference", type: "text", defaultValue: "Proverbs 3:5", placeholder: "e.g. Romans 8:28", required: true, group: "Content" },
    ],
    html: `<div class="lt pos-bc in-up" data-state="in">
  <div class="ribbon-panel" style="--accent:#4ADE80;--bg:rgba(10,25,10,.92);--fg:#F0FDF4;">
    <div class="ribbon-accent"></div>
    <div class="ribbon-body">
      <span class="kicker">{{label}}</span>
      <p class="ribbon-text">{{verseText}}</p>
      <p class="ribbon-ref">{{reference}}</p>
    </div>
  </div>
</div>`,
    fontImports: ["https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Inter:wght@400;500;600;700;800&display=swap"],
    animation: { name: "ribbonIn", duration: 650, easing: "cubic-bezier(0.16,1,0.3,1)" },
    exitAnimation: { name: "ribbonOut", duration: 400, easing: "cubic-bezier(.4,0,1,1)" },
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Inter", sans-serif; }

@keyframes ribbonIn {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ribbonOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(20px); }
}

.lt { position: fixed; z-index: 40; pointer-events: none; }
.lt[data-state="in"] { animation: ribbonIn .65s cubic-bezier(0.16,1,0.3,1) both; }
.lt[data-state="out"] { animation: ribbonOut .4s cubic-bezier(.4,0,1,1) both; }
.pos-bc { left: 50%; bottom: 32px; transform: translateX(-50%); }

.ribbon-panel {
  display: flex;
  max-width: min(1400px, calc(100vw - 80px));
  min-width: 660px;
  background: var(--bg);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,.3);
}

.ribbon-accent {
  width: 6px;
  min-width: 6px;
  background: var(--accent);
}

.ribbon-body {
  padding: 18px 24px 20px;
  color: var(--fg);
}

.kicker {
  display: inline-block;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: .1em;
  text-transform: uppercase;
  margin-bottom: 8px;
  color: var(--accent);
}

.ribbon-text {
  font-family: "Libre Baskerville", serif;
  font-size: clamp(28px, 2.1vw, 52px);
  line-height: 1.24;
  font-weight: 400;
}

.ribbon-ref {
  margin-top: 10px;
  text-align: right;
  font-size: clamp(15px, 1vw, 24px);
  font-weight: 600;
  letter-spacing: .05em;
  text-transform: uppercase;
  opacity: .85;
}

@media (max-width: 1180px) {
  .pos-bc { left: 20px; right: 20px; transform: none; }
  .ribbon-panel { min-width: 0; max-width: calc(100vw - 40px); }
}`,
  },
  {
    id: "lt-transparent-scripture-white",
    name: "Transparent Scripture (White)",
    description: "Transparent lower-third with plain white text for scripture readings.",
    category: "worship",
    accentColor: "#4ADE80",
    tags: ["transparent", "plain-text", "worship", "bible", "shared-worship-bible"],
    variables: [
      { key: "state", label: "State", type: "select", defaultValue: "in", options: [{ label: "In", value: "in" }, { label: "Out", value: "out" }], group: "Animation" },
      { key: "animMode", label: "Animation", type: "select", defaultValue: "stagger", options: [{ label: "Stagger", value: "stagger" }, { label: "Together", value: "together" }], group: "Animation" },
      { key: "verseText", label: "Main Text", type: "text", defaultValue: "For God so loved the world that He gave His only begotten Son.", placeholder: "Enter primary line", required: true, group: "Content" },
      { key: "reference", label: "Reference", type: "text", defaultValue: "John 3:16", placeholder: "Enter secondary line", required: true, group: "Content" },
    ],
    html: `<div class="lt-transparent-text lt-transparent-white" data-state="in" data-mode="stagger">
  <p class="lt-transparent-main">{{verseText}}</p>
  <p class="lt-transparent-sub">{{reference}}</p>
</div>`,
    fontImports: [],
    animation: { name: "ltTransparentInUp", duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    exitAnimation: { name: "ltTransparentOutUp", duration: 400, easing: "cubic-bezier(.4,0,1,1)" },
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "CMG Sans", sans-serif; }

.lt-transparent-text {
  position: fixed;
  left: 32px;
  right: auto;
  bottom: 42px;
  max-width: min(1840px, calc(100vw - 64px));
  color: #ffffff;
  text-shadow: 0 3px 22px rgba(0, 0, 0, 0.55);
  pointer-events: none;
}

.lt-transparent-main {
  font-size: clamp(38px, 2.55vw, 74px);
  line-height: 1.08;
  font-weight: 800;
  letter-spacing: 0.004em;
  white-space: pre-wrap;
}

.lt-transparent-sub {
  margin-top: 9px;
  font-size: clamp(24px, 1.55vw, 42px);
  line-height: 1.16;
  font-weight: 650;
  opacity: 0.95;
  white-space: pre-wrap;
}

@keyframes ltTransparentInUp {
  from { opacity: 0; transform: translateY(16px); filter: blur(1px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
@keyframes ltTransparentOutUp {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-12px); }
}

.lt-transparent-text[data-state="in"] .lt-transparent-main {
  animation: ltTransparentInUp .42s cubic-bezier(0.16,1,0.3,1) both;
}
.lt-transparent-text[data-state="in"] .lt-transparent-sub {
  animation: ltTransparentInUp .36s cubic-bezier(0.16,1,0.3,1) .12s both;
}
.lt-transparent-text[data-state="out"] .lt-transparent-main {
  animation: ltTransparentOutUp .25s cubic-bezier(.4,0,1,1) both;
}
.lt-transparent-text[data-state="out"] .lt-transparent-sub {
  animation: ltTransparentOutUp .24s cubic-bezier(.4,0,1,1) .07s both;
}

@media (max-width: 1180px) {
  .lt-transparent-text { left: 16px; right: 16px; bottom: 24px; max-width: calc(100vw - 32px); }
}`,
  },
  {
    id: "lt-transparent-scripture-colored",
    name: "Transparent Scripture (Accent)",
    description: "Transparent lower-third with accent-colored text for scripture readings.",
    category: "worship",
    accentColor: "#4ADE80",
    tags: ["transparent", "plain-text", "worship", "bible", "shared-worship-bible"],
    variables: [
      { key: "state", label: "State", type: "select", defaultValue: "in", options: [{ label: "In", value: "in" }, { label: "Out", value: "out" }], group: "Animation" },
      { key: "animMode", label: "Animation", type: "select", defaultValue: "stagger", options: [{ label: "Stagger", value: "stagger" }, { label: "Together", value: "together" }], group: "Animation" },
      { key: "verseText", label: "Main Text", type: "text", defaultValue: "For God so loved the world that He gave His only begotten Son.", placeholder: "Enter primary line", required: true, group: "Content" },
      { key: "reference", label: "Reference", type: "text", defaultValue: "John 3:16", placeholder: "Enter secondary line", required: true, group: "Content" },
    ],
    html: `<div class="lt-transparent-text lt-transparent-accent" data-state="in" data-mode="stagger">
  <p class="lt-transparent-main">{{verseText}}</p>
  <p class="lt-transparent-sub">{{reference}}</p>
</div>`,
    fontImports: [],
    animation: { name: "ltTransparentInUp", duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    exitAnimation: { name: "ltTransparentOutUp", duration: 400, easing: "cubic-bezier(.4,0,1,1)" },
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "CMG Sans", sans-serif; }

.lt-transparent-text {
  position: fixed;
  left: 32px;
  right: auto;
  bottom: 42px;
  max-width: min(1840px, calc(100vw - 64px));
  pointer-events: none;
}

.lt-transparent-accent .lt-transparent-main {
  color: #4ADE80;
  text-shadow: 0 3px 22px rgba(74, 222, 128, 0.3);
}

.lt-transparent-accent .lt-transparent-sub {
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}

.lt-transparent-main {
  font-size: clamp(38px, 2.55vw, 74px);
  line-height: 1.08;
  font-weight: 800;
  letter-spacing: 0.004em;
  white-space: pre-wrap;
}

.lt-transparent-sub {
  margin-top: 9px;
  font-size: clamp(24px, 1.55vw, 42px);
  line-height: 1.16;
  font-weight: 650;
  opacity: 0.95;
  white-space: pre-wrap;
}

@keyframes ltTransparentInUp {
  from { opacity: 0; transform: translateY(16px); filter: blur(1px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
@keyframes ltTransparentOutUp {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-12px); }
}

.lt-transparent-text[data-state="in"] .lt-transparent-main {
  animation: ltTransparentInUp .42s cubic-bezier(0.16,1,0.3,1) both;
}
.lt-transparent-text[data-state="in"] .lt-transparent-sub {
  animation: ltTransparentInUp .36s cubic-bezier(0.16,1,0.3,1) .12s both;
}
.lt-transparent-text[data-state="out"] .lt-transparent-main {
  animation: ltTransparentOutUp .25s cubic-bezier(.4,0,1,1) both;
}
.lt-transparent-text[data-state="out"] .lt-transparent-sub {
  animation: ltTransparentOutUp .24s cubic-bezier(.4,0,1,1) .07s both;
}

@media (max-width: 1180px) {
  .lt-transparent-text { left: 16px; right: 16px; bottom: 24px; max-width: calc(100vw - 32px); }
}`,
  },
];

// ---------------------------------------------------------------------------
// Convert raw theme → BibleTheme
// ---------------------------------------------------------------------------

function substituteTemplate(html: string, values: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
}

function extractSettingsFromTheme(raw: RawLowerThirdTheme): Partial<BibleThemeSettings> {
  const settings: Partial<BibleThemeSettings> = {};

  // Map font from CSS body rule
  if (raw.css.includes('font-family: "Source Serif 4"')) {
    settings.fontFamily = '"Source Serif 4", serif';
  } else if (raw.css.includes('font-family: "Libre Baskerville"')) {
    settings.fontFamily = '"Libre Baskerville", serif';
  } else if (raw.css.includes('font-family: "Montserrat"')) {
    settings.fontFamily = '"Montserrat", sans-serif';
  } else if (raw.css.includes('font-family: "Inter"')) {
    settings.fontFamily = '"Inter", sans-serif';
  }

  // Map accent color
  if (raw.accentColor) {
    settings.refFontColor = raw.accentColor;
  }

  // Transparent themes have no box background
  if (raw.tags.includes("transparent")) {
    settings.boxBackground = "transparent";
    settings.backgroundColor = "transparent";
    settings.borderRadius = 0;
    // White transparent theme
    if (raw.id.includes("white")) {
      settings.fontColor = "#FFFFFF";
    } else {
      settings.fontColor = raw.accentColor || "#4ADE80";
    }
  } else {
    // Panel-based themes
    settings.boxBackground = "rgba(30,27,75,0.9)";
    settings.fontColor = "#FAF5FF";
    settings.borderRadius = 14;
  }

  settings.textAlign = "left";
  settings.refTextAlign = "right";
  settings.refPosition = "bottom";

  return settings;
}

function buildRawTemplate(raw: RawLowerThirdTheme): BibleThemeRawTemplate {
  // Build default preview values from variables
  const previewValues: Record<string, string> = {};
  for (const v of raw.variables) {
    previewValues[v.key] = v.defaultValue;
  }
  // Ensure state is "in" for preview
  previewValues.state = "in";

  return {
    html: raw.html,
    css: raw.css,
    variables: raw.variables,
    fontImports: raw.fontImports,
    animation: raw.animation,
    exitAnimation: raw.exitAnimation,
    accentColor: raw.accentColor,
    previewValues,
  };
}

function rawToBibleTheme(raw: RawLowerThirdTheme): BibleTheme {
  const settingsOverrides = extractSettingsFromTheme(raw);
  const settings: BibleThemeSettings = {
    ...DEFAULT_THEME_SETTINGS,
    ...settingsOverrides,
  };

  const categories: Array<"bible" | "worship" | "general"> = [];
  if (raw.tags.includes("bible") || raw.category === "bible") categories.push("bible");
  if (raw.tags.includes("worship") || raw.category === "worship") categories.push("worship");
  if (categories.length === 0) categories.push("general");

  return {
    id: `builtin-${raw.id}`,
    name: raw.name,
    description: raw.description,
    source: "builtin",
    templateType: "lower-third",
    category: raw.category === "bible" ? "bible" : "worship",
    categories,
    settings,
    rawTemplate: buildRawTemplate(raw),
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// CSS selector mapping per template — lets inspector overrides target the
// right elements even though each template uses unique class names.
// ---------------------------------------------------------------------------

/** CSS selectors that hold the main verse / content text */
const VERSE_SELECTORS =
  ".quote-text, .glow-text, .ribbon-text, .lt-transparent-main";

/** CSS selectors that hold the reference / subtitle text */
const REF_SELECTORS =
  ".quote-ref, .glow-ref, .ribbon-ref, .lt-transparent-sub";

/** CSS selectors that hold the kicker / label */
const LABEL_SELECTORS = ".kicker";

/** CSS selectors for the containing panel / shell */
const PANEL_SELECTORS =
  ".panel, .glow-panel, .ribbon-panel, .ribbon-body";

/**
 * Build a CSS string of overrides driven by the inspector panel settings.
 * These are injected after the template's own CSS so they take precedence
 * (using !important where the template already has a rule).
 */
function buildInspectorOverrides(settings: BibleThemeSettings): string {
  const fontScale = 0.5; // template uses clamp() values sized for 1920px; halve for px literals
  const rules: string[] = [];

  // ── Verse text ──
  rules.push(`${VERSE_SELECTORS} {
  font-size: ${Math.round(settings.fontSize * fontScale)}px;
  font-weight: ${settings.fontWeight === "light" ? "300" : settings.fontWeight === "bold" ? "700" : "600"};
  font-style: ${settings.fontStyle || "normal"};
  color: ${settings.fontColor};
  line-height: ${settings.lineHeight};
  text-align: ${settings.textAlign};
  text-transform: ${settings.textTransform !== "none" ? settings.textTransform : "none"};
  ${settings.textShadow !== "none" ? `text-shadow: ${settings.textShadow};` : ""}
  font-family: ${settings.fontFamily};
}`);

  // ── Reference text ──
  const refWeight = settings.refFontWeight === "light" ? "300" : settings.refFontWeight === "bold" ? "700" : "600";
  rules.push(`${REF_SELECTORS} {
  font-size: ${Math.round(settings.refFontSize * fontScale)}px;
  font-weight: ${refWeight};
  color: ${settings.refFontColor};
  text-transform: ${settings.refTextTransform !== "none" ? settings.refTextTransform : "none"};
  letter-spacing: ${settings.refLetterSpacing}px;
  opacity: ${settings.refOpacity};
  text-align: ${settings.refTextAlign === "match" ? settings.textAlign : settings.refTextAlign};
}`);

  // ── Label / kicker ──
  rules.push(`${LABEL_SELECTORS} {
  color: ${settings.refFontColor};
}`);

  // ── Panel / box background ──
  if (settings.boxBackground !== "transparent") {
    rules.push(`${PANEL_SELECTORS} {
  background: ${settings.boxBackground};
  border-radius: ${settings.borderRadius}px;
}`);
  }

  // ── Reference background ──
  if (settings.referenceBackgroundEnabled) {
    const bg = settings.referenceBackgroundColor;
    const r = settings.referenceBackgroundRadius ?? 12;
    let refBgCss: string;
    if (settings.referenceBackgroundStyle === "pill") {
      refBgCss = `display:inline-block;background:${bg};border-radius:999px;padding:4px 16px;`;
    } else if (settings.referenceBackgroundStyle === "outline") {
      refBgCss = `display:inline-block;border:2px solid ${bg};border-radius:${r}px;padding:4px 16px;`;
    } else {
      refBgCss = `display:inline-block;background:${bg};border-radius:${r}px;padding:4px 16px;`;
    }
    rules.push(`${REF_SELECTORS} {
  ${refBgCss}
}`);
  }

  return rules.join("\n\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All built-in bible themes derived from all_themes.json */
export const BIBLE_BUILTIN_THEMES: BibleTheme[] = BIBLE_LT_THEMES.map(rawToBibleTheme);

/**
 * Build preview HTML for a theme that has a raw template.
 * Substitutes the preview values into the HTML, applies inspector-driven
 * CSS overrides, and wraps everything in a full document.
 */
export function buildRawTemplatePreviewHtml(
  raw: BibleThemeRawTemplate,
  settings?: BibleThemeSettings,
): string {
  const html = substituteTemplate(raw.html, raw.previewValues || {});
  const fontCss = (raw.fontImports || [])
    .filter((f) => f.startsWith("http"))
    .map((f) => `@import url('${f}');`)
    .join("\n");

  const overrides = settings ? buildInspectorOverrides(settings) : "";

  return `<!DOCTYPE html><html><head><style>
${fontCss}
${raw.css}
${overrides ? `\n/* ── Inspector Overrides ── */\n${overrides}` : ""}
</style></head><body>
${html}
</body></html>`;
}

/**
 * Get the raw template preview HTML for a BibleTheme, or null if no raw template.
 * Optionally applies inspector settings as CSS overrides.
 */
export function getBibleThemePreviewHtml(
  theme: BibleTheme,
  settings?: BibleThemeSettings,
): string | null {
  if (!theme.rawTemplate) return null;
  return buildRawTemplatePreviewHtml(theme.rawTemplate, settings);
}
