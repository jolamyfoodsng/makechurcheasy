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
    fontImports: ["/fonts/google/google-fonts.css"],
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
    fontImports: ["/fonts/google/google-fonts.css"],
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
    fontImports: ["/fonts/google/google-fonts.css"],
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
body { font-family: "Charis SIL", "Noto Sans", "CMG Sans", sans-serif; }

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
body { font-family: "Charis SIL", "Noto Sans", "CMG Sans", sans-serif; }

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
  {
    id: "lt-sage-forest-badge",
    name: "Sage Forest Badge",
    description: "Deep sage green card with high-contrast top-left black scripture badge.",
    category: "bible",
    accentColor: "#264E41",
    tags: ["bible", "scripture", "badge", "forest", "sage", "modern"],
    variables: [
      { key: "label", label: "Label", type: "text", defaultValue: "Scripture", placeholder: "e.g. Scripture Reading", group: "Header" },
      { key: "verseText", label: "Verse Text", type: "text", defaultValue: "Trust in the Lord with all your heart, and lean not on your own understanding.", placeholder: "Enter verse text", required: true, group: "Content" },
      { key: "reference", label: "Reference", type: "text", defaultValue: "PROVERBS 3:5", placeholder: "e.g. Habakkuk 3:17-19", required: true, group: "Content" },
      { key: "state", label: "State", type: "select", defaultValue: "in", options: [{ label: "In", value: "in" }, { label: "Out", value: "out" }], group: "Animation" },
    ],
    html: `<div class="lt pos-bc in-up" data-state="in">
  <div class="panel sage-forest-card" style="--bg:#264E41;--fg:#FFFFFF;--badge-bg:#000000;--badge-fg:#FFFFFF;">
    <div class="badge-wrapper left">
      <span class="badge-ref">{{reference}}</span>
    </div>
    <p class="quote-text">{{verseText}}</p>
  </div>
</div>`,
    fontImports: ["/fonts/google/google-fonts.css"],
    animation: { name: "sageFadeInUp", duration: 600, easing: "cubic-bezier(0.16,1,0.3,1)" },
    exitAnimation: { name: "sageFadeOutDown", duration: 400, easing: "cubic-bezier(.4,0,1,1)" },
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Inter", sans-serif; }

@keyframes sageFadeInUp {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes sageFadeOutDown {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(20px); }
}

.lt { position: fixed; z-index: 40; pointer-events: none; }
.lt[data-state="in"] { animation: sageFadeInUp .6s cubic-bezier(0.16,1,0.3,1) both; }
.lt[data-state="out"] { animation: sageFadeOutDown .4s cubic-bezier(.4,0,1,1) both; }
.pos-bc { left: 50%; bottom: 36px; transform: translateX(-50%); }

.sage-forest-card {
  position: relative;
  background: var(--bg, #264E41);
  color: var(--fg, #FFFFFF);
  border-radius: 6px;
  max-width: min(1500px, calc(100vw - 80px));
  min-width: 680px;
  padding: 24px 34px 26px;
  box-shadow: 0 16px 48px rgba(0,0,0,.35);
}

.badge-wrapper.left {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 14px;
}

.badge-ref {
  display: inline-block;
  background: var(--badge-bg, #000000);
  color: var(--badge-fg, #FFFFFF);
  font-family: "Cinzel", "Playfair Display", "Georgia", serif;
  font-size: clamp(14px, 1.1vw, 22px);
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  padding: 5px 14px;
  border-radius: 3px;
}

.quote-text {
  font-family: "Inter", sans-serif;
  font-size: clamp(26px, 1.9vw, 44px);
  line-height: 1.35;
  font-weight: 500;
}

@media (max-width: 1180px) {
  .pos-bc { left: 20px; right: 20px; transform: none; }
  .sage-forest-card { min-width: 0; max-width: calc(100vw - 40px); }
}`,
  },
  {
    id: "lt-obsidian-floating-header",
    name: "Obsidian Floating Header",
    description: "Minimal obsidian black card with floating uppercase header reference anchored on the top-right.",
    category: "bible",
    accentColor: "#CBD5E1",
    tags: ["bible", "scripture", "obsidian", "minimal", "modern", "header"],
    variables: [
      { key: "label", label: "Label", type: "text", defaultValue: "Scripture", placeholder: "e.g. Scripture Reading", group: "Header" },
      { key: "verseText", label: "Verse Text", type: "text", defaultValue: "Trust in the Lord with all your heart, and lean not on your own understanding.", placeholder: "Enter verse text", required: true, group: "Content" },
      { key: "reference", label: "Reference", type: "text", defaultValue: "PROVERBS 3:5", placeholder: "e.g. Romans 8:28", required: true, group: "Content" },
      { key: "state", label: "State", type: "select", defaultValue: "in", options: [{ label: "In", value: "in" }, { label: "Out", value: "out" }], group: "Animation" },
    ],
    html: `<div class="lt pos-bc in-up" data-state="in">
  <div class="panel obsidian-card" style="--bg:#0D0D11;--fg:#FFFFFF;--header-fg:#CBD5E1;">
    <div class="header-wrapper right">
      <span class="header-ref">{{reference}}</span>
    </div>
    <p class="quote-text">{{verseText}}</p>
  </div>
</div>`,
    fontImports: ["/fonts/google/google-fonts.css"],
    animation: { name: "obsidianIn", duration: 550, easing: "cubic-bezier(0.16,1,0.3,1)" },
    exitAnimation: { name: "obsidianOut", duration: 380, easing: "cubic-bezier(.4,0,1,1)" },
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Inter", sans-serif; }

@keyframes obsidianIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes obsidianOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(16px); }
}

.lt { position: fixed; z-index: 40; pointer-events: none; }
.lt[data-state="in"] { animation: obsidianIn .55s cubic-bezier(0.16,1,0.3,1) both; }
.lt[data-state="out"] { animation: obsidianOut .38s cubic-bezier(.4,0,1,1) both; }
.pos-bc { left: 50%; bottom: 36px; transform: translateX(-50%); }

.obsidian-card {
  position: relative;
  background: var(--bg, #0D0D11);
  color: var(--fg, #FFFFFF);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 4px;
  max-width: min(1500px, calc(100vw - 80px));
  min-width: 680px;
  padding: 22px 32px 24px;
  box-shadow: 0 14px 44px rgba(0,0,0,.4);
}

.header-wrapper.right {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.header-ref {
  display: inline-block;
  color: var(--header-fg, #CBD5E1);
  font-family: "Inter", sans-serif;
  font-size: clamp(13px, 0.95vw, 20px);
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.quote-text {
  font-family: "Inter", sans-serif;
  font-size: clamp(26px, 1.9vw, 44px);
  line-height: 1.4;
  font-weight: 400;
}

@media (max-width: 1180px) {
  .pos-bc { left: 20px; right: 20px; transform: none; }
  .obsidian-card { min-width: 0; max-width: calc(100vw - 40px); }
}`,
  },
  {
    id: "lt-midnight-plum-crest",
    name: "Midnight Plum Crest",
    description: "Royal midnight plum lower third crowned with a centered white scripture reference badge.",
    category: "bible",
    accentColor: "#A855F7",
    tags: ["bible", "scripture", "plum", "badge", "royal", "centered"],
    variables: [
      { key: "label", label: "Label", type: "text", defaultValue: "Scripture", placeholder: "e.g. Scripture Reading", group: "Header" },
      { key: "verseText", label: "Verse Text", type: "text", defaultValue: "Trust in the Lord with all your heart, and lean not on your own understanding.", placeholder: "Enter verse text", required: true, group: "Content" },
      { key: "reference", label: "Reference", type: "text", defaultValue: "PROVERBS 3:5", placeholder: "e.g. Romans 8:28", required: true, group: "Content" },
      { key: "state", label: "State", type: "select", defaultValue: "in", options: [{ label: "In", value: "in" }, { label: "Out", value: "out" }], group: "Animation" },
    ],
    html: `<div class="lt pos-bc in-up" data-state="in">
  <div class="panel plum-card" style="--bg:#231936;--fg:#FFFFFF;--badge-bg:#FFFFFF;--badge-fg:#311B45;">
    <div class="badge-wrapper center">
      <span class="badge-ref plum-badge">{{reference}}</span>
    </div>
    <p class="quote-text">{{verseText}}</p>
  </div>
</div>`,
    fontImports: ["/fonts/google/google-fonts.css"],
    animation: { name: "plumIn", duration: 600, easing: "cubic-bezier(0.16,1,0.3,1)" },
    exitAnimation: { name: "plumOut", duration: 400, easing: "cubic-bezier(.4,0,1,1)" },
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Inter", sans-serif; }

@keyframes plumIn {
  from { opacity: 0; transform: translateY(22px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes plumOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(18px); }
}

.lt { position: fixed; z-index: 40; pointer-events: none; }
.lt[data-state="in"] { animation: plumIn .6s cubic-bezier(0.16,1,0.3,1) both; }
.lt[data-state="out"] { animation: plumOut .4s cubic-bezier(.4,0,1,1) both; }
.pos-bc { left: 50%; bottom: 36px; transform: translateX(-50%); }

.plum-card {
  position: relative;
  background: var(--bg, #231936);
  color: var(--fg, #FFFFFF);
  border: 1px solid rgba(168,85,247,.25);
  border-radius: 6px;
  max-width: min(1500px, calc(100vw - 80px));
  min-width: 680px;
  padding: 24px 34px 26px;
  box-shadow: 0 16px 50px rgba(0,0,0,.45);
}

.badge-wrapper.center {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}

.plum-badge {
  display: inline-block;
  background: var(--badge-bg, #FFFFFF);
  color: var(--badge-fg, #311B45);
  font-family: "Inter", sans-serif;
  font-size: clamp(14px, 1.05vw, 22px);
  font-weight: 700;
  letter-spacing: .09em;
  text-transform: uppercase;
  padding: 5px 18px;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,.2);
}

.quote-text {
  font-family: "Inter", sans-serif;
  font-size: clamp(26px, 1.9vw, 44px);
  line-height: 1.38;
  font-weight: 450;
  text-align: center;
}

@media (max-width: 1180px) {
  .pos-bc { left: 20px; right: 20px; transform: none; }
  .plum-card { min-width: 0; max-width: calc(100vw - 40px); }
}`,
  },
  {
    id: "lt-cobalt-compact-card",
    name: "Cobalt Compact Card",
    description: "Punchy cobalt blue card with bold uppercase verse and bottom-right navy reference badge.",
    category: "bible",
    accentColor: "#93C5FD",
    tags: ["bible", "scripture", "cobalt", "compact", "badge"],
    variables: [
      { key: "label", label: "Label", type: "text", defaultValue: "Scripture", placeholder: "e.g. Scripture Reading", group: "Header" },
      { key: "verseText", label: "Verse Text", type: "text", defaultValue: "TRUST IN THE LORD WITH ALL YOUR HEART, AND LEAN NOT ON YOUR OWN UNDERSTANDING.", placeholder: "Enter verse text", required: true, group: "Content" },
      { key: "reference", label: "Reference", type: "text", defaultValue: "PROVERBS 3:5", placeholder: "e.g. Romans 8:28", required: true, group: "Content" },
      { key: "state", label: "State", type: "select", defaultValue: "in", options: [{ label: "In", value: "in" }, { label: "Out", value: "out" }], group: "Animation" },
    ],
    html: `<div class="lt pos-bl in-left" data-state="in">
  <div class="panel cobalt-card" style="--bg:#162C7A;--fg:#FFFFFF;--badge-bg:#080F26;--badge-fg:#93C5FD;">
    <p class="quote-text uppercase-verse">{{verseText}}</p>
    <div class="badge-wrapper right">
      <span class="badge-ref cobalt-badge">{{reference}}</span>
    </div>
  </div>
</div>`,
    fontImports: ["/fonts/google/google-fonts.css"],
    animation: { name: "cobaltIn", duration: 550, easing: "cubic-bezier(0.16,1,0.3,1)" },
    exitAnimation: { name: "cobaltOut", duration: 380, easing: "cubic-bezier(.4,0,1,1)" },
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Montserrat", sans-serif; }

@keyframes cobaltIn {
  from { opacity: 0; transform: translateX(-24px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes cobaltOut {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(-20px); }
}

.lt { position: fixed; z-index: 40; pointer-events: none; }
.lt[data-state="in"] { animation: cobaltIn .55s cubic-bezier(0.16,1,0.3,1) both; }
.lt[data-state="out"] { animation: cobaltOut .38s cubic-bezier(.4,0,1,1) both; }
.pos-bl { left: 40px; bottom: 36px; right: auto; }

.cobalt-card {
  position: relative;
  background: var(--bg, #162C7A);
  color: var(--fg, #FFFFFF);
  border: 1px solid rgba(59,130,246,.25);
  border-radius: 4px;
  max-width: min(1000px, calc(100vw - 80px));
  min-width: 480px;
  padding: 22px 28px 20px;
  box-shadow: 0 16px 44px rgba(0,0,0,.4);
}

.uppercase-verse {
  font-family: "Montserrat", sans-serif;
  font-size: clamp(24px, 1.8vw, 40px);
  line-height: 1.28;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .02em;
}

.badge-wrapper.right {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.cobalt-badge {
  display: inline-block;
  background: var(--badge-bg, #080F26);
  color: var(--badge-fg, #93C5FD);
  font-family: "Montserrat", sans-serif;
  font-size: clamp(14px, 1vw, 20px);
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  padding: 5px 14px;
  border-radius: 4px;
}

@media (max-width: 1180px) {
  .pos-bl { left: 20px; right: 20px; }
  .cobalt-card { min-width: 0; max-width: calc(100vw - 40px); }
}`,
  },
  {
    id: "lt-cyan-wave-broadcast",
    name: "Cyan Wave Broadcast",
    description: "Full-width live broadcast banner with a glowing cyan wave accent and two-column scripture presentation.",
    category: "bible",
    accentColor: "#22D3EE",
    tags: ["bible", "scripture", "broadcast", "cyan", "full-width", "wave"],
    variables: [
      { key: "label", label: "Label", type: "text", defaultValue: "Scripture", placeholder: "e.g. Scripture Reading", group: "Header" },
      { key: "verseText", label: "Verse Text", type: "text", defaultValue: "TRUST IN THE LORD WITH ALL YOUR HEART, AND LEAN NOT ON YOUR OWN UNDERSTANDING.", placeholder: "Enter verse text", required: true, group: "Content" },
      { key: "reference", label: "Reference", type: "text", defaultValue: "PROVERBS 3:5", placeholder: "e.g. Romans 8:28", required: true, group: "Content" },
      { key: "state", label: "State", type: "select", defaultValue: "in", options: [{ label: "In", value: "in" }, { label: "Out", value: "out" }], group: "Animation" },
    ],
    html: `<div class="lt pos-full in-up" data-state="in">
  <div class="panel cyan-broadcast-banner" style="--bg:#0A1838;--fg:#FFFFFF;--accent:#22D3EE;">
    <div class="cyan-wave-top"></div>
    <div class="broadcast-body">
      <div class="pillar-col">
        <span class="pillar-label">SCRIPTURE</span>
        <span class="pillar-ref quote-ref">{{reference}}</span>
      </div>
      <div class="content-col">
        <p class="quote-text uppercase-verse">{{verseText}}</p>
      </div>
    </div>
  </div>
</div>`,
    fontImports: ["/fonts/google/google-fonts.css"],
    animation: { name: "cyanBannerIn", duration: 600, easing: "cubic-bezier(0.16,1,0.3,1)" },
    exitAnimation: { name: "cyanBannerOut", duration: 400, easing: "cubic-bezier(.4,0,1,1)" },
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Inter", sans-serif; }

@keyframes cyanBannerIn {
  from { opacity: 0; transform: translateY(100%); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes cyanBannerOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(100%); }
}

.lt { position: fixed; z-index: 40; pointer-events: none; }
.lt[data-state="in"] { animation: cyanBannerIn .6s cubic-bezier(0.16,1,0.3,1) both; }
.lt[data-state="out"] { animation: cyanBannerOut .4s cubic-bezier(.4,0,1,1) both; }
.pos-full { left: 0; right: 0; bottom: 0; width: 100%; }

.cyan-broadcast-banner {
  position: relative;
  width: 100%;
  background: var(--bg, #0A1838);
  color: var(--fg, #FFFFFF);
  overflow: hidden;
  box-shadow: 0 -8px 40px rgba(0,0,0,.5);
}

.cyan-wave-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, #0284C7 0%, #22D3EE 30%, #38BDF8 70%, #0284C7 100%);
  box-shadow: 0 0 16px rgba(34,211,238,.65), 0 0 30px rgba(6,182,212,.4);
}

.broadcast-body {
  display: flex;
  align-items: center;
  padding: 18px 48px 22px;
  gap: 36px;
}

.pillar-col {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 240px;
  padding-right: 32px;
  border-right: 2px solid rgba(34,211,238,.35);
}

.pillar-label {
  font-family: "Inter", sans-serif;
  font-size: clamp(14px, 1.1vw, 20px);
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--accent, #22D3EE);
}

.pillar-ref {
  font-family: "Inter", sans-serif;
  font-size: clamp(18px, 1.35vw, 28px);
  font-weight: 800;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: #FFFFFF;
  margin-top: 4px;
}

.content-col {
  flex: 1;
}

.quote-text.uppercase-verse {
  font-family: "Inter", sans-serif;
  font-size: clamp(22px, 1.7vw, 36px);
  line-height: 1.28;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .02em;
}

@media (max-width: 1180px) {
  .broadcast-body { padding: 14px 20px 16px; gap: 20px; }
  .pillar-col { min-width: 180px; padding-right: 18px; }
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

  // Extract panel background and foreground if embedded in HTML style
  const bgMatch = raw.html.match(/--bg:\s*([^;"]+)/);
  const fgMatch = raw.html.match(/--fg:\s*([^;"]+)/);

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
    settings.boxBackground = bgMatch ? bgMatch[1].trim() : "rgba(15, 23, 42, 0.85)";
    settings.fontColor = fgMatch ? fgMatch[1].trim() : "#FAF5FF";
    settings.borderRadius = 16;
  }

  settings.textAlign = "center";
  settings.refTextAlign = "right";
  settings.refPosition = "bottom";

  // Specialized settings for the 5 curated lower-third reference themes
  if (raw.id === "lt-sage-forest-badge") {
    settings.boxBackground = "#264E41";
    settings.fontColor = "#FFFFFF";
    settings.borderRadius = 6;
    settings.refPosition = "top";
    settings.refTextAlign = "left";
    settings.refFontColor = "#FFFFFF";
    settings.refFontFamily = '"Cinzel", "Playfair Display", "Georgia", serif';
    settings.refFontWeight = "bold";
    settings.refTextTransform = "uppercase";
    settings.refLetterSpacing = 1.5;
    settings.refSpacing = 14;
    settings.referenceBackgroundEnabled = true;
    settings.referenceBackgroundColor = "#000000";
    settings.referenceBackgroundStyle = "solid";
    settings.referenceBackgroundRadius = 3;
    settings.lowerThirdPosition = "center";
    settings.lowerThirdWidthPreset = "lg";
  } else if (raw.id === "lt-obsidian-floating-header") {
    settings.boxBackground = "#0D0D11";
    settings.fontColor = "#FFFFFF";
    settings.borderRadius = 4;
    settings.refPosition = "top";
    settings.refTextAlign = "right";
    settings.refFontColor = "#CBD5E1";
    settings.refFontWeight = "bold";
    settings.refTextTransform = "uppercase";
    settings.refLetterSpacing = 2;
    settings.refSpacing = 12;
    settings.referenceBackgroundEnabled = false;
    settings.lowerThirdPosition = "center";
    settings.lowerThirdWidthPreset = "lg";
  } else if (raw.id === "lt-midnight-plum-crest") {
    settings.boxBackground = "#231936";
    settings.fontColor = "#FFFFFF";
    settings.borderRadius = 6;
    settings.refPosition = "top";
    settings.refTextAlign = "center";
    settings.refFontColor = "#311B45";
    settings.refFontWeight = "bold";
    settings.refTextTransform = "uppercase";
    settings.refLetterSpacing = 1.5;
    settings.refSpacing = 14;
    settings.referenceBackgroundEnabled = true;
    settings.referenceBackgroundColor = "#FFFFFF";
    settings.referenceBackgroundStyle = "solid";
    settings.referenceBackgroundRadius = 4;
    settings.lowerThirdPosition = "center";
    settings.lowerThirdWidthPreset = "lg";
  } else if (raw.id === "lt-cobalt-compact-card") {
    settings.boxBackground = "#162C7A";
    settings.fontColor = "#FFFFFF";
    settings.textTransform = "uppercase";
    settings.fontWeight = "bold";
    settings.borderRadius = 4;
    settings.refPosition = "bottom";
    settings.refTextAlign = "right";
    settings.refFontColor = "#93C5FD";
    settings.refFontWeight = "bold";
    settings.refTextTransform = "uppercase";
    settings.refLetterSpacing = 1.2;
    settings.refSpacing = 14;
    settings.referenceBackgroundEnabled = true;
    settings.referenceBackgroundColor = "#080F26";
    settings.referenceBackgroundStyle = "solid";
    settings.referenceBackgroundRadius = 4;
    settings.lowerThirdPosition = "center";
    settings.lowerThirdWidthPreset = "md";
  } else if (raw.id === "lt-cyan-wave-broadcast") {
    settings.boxBackground = "#0A1838";
    settings.fontColor = "#FFFFFF";
    settings.textTransform = "uppercase";
    settings.fontWeight = "bold";
    settings.borderRadius = 0;
    settings.refPosition = "top";
    settings.refTextAlign = "left";
    settings.refFontColor = "#22D3EE";
    settings.refFontWeight = "black";
    settings.refTextTransform = "uppercase";
    settings.referenceBackgroundEnabled = false;
    settings.lowerThirdPosition = "center";
    settings.lowerThirdWidthPreset = "full";
    settings.boxBorderTop = "3px solid #06B6D4";
    settings.boxShadow = "0 -4px 20px rgba(6, 182, 212, 0.35)";
  }

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

  const rawTemplate = buildRawTemplate(raw);

  return {
    id: `builtin-${raw.id}`,
    name: raw.name,
    description: raw.description,
    source: "builtin",
    templateType: "lower-third",
    category: raw.category === "bible" ? "bible" : "worship",
    categories,
    settings,
    rawTemplate,
    variants: {
      lowerThird: {
        settings: { ...settings },
        rawTemplate,
      },
    },
    enabledVariants: ["lower-third"],
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
  ".quote-text, .glow-text, .ribbon-text, .lt-transparent-main, .uppercase-verse";

/** CSS selectors that hold the reference / subtitle text */
const REF_SELECTORS =
  ".quote-ref, .glow-ref, .ribbon-ref, .lt-transparent-sub, .badge-ref, .header-ref, .cobalt-badge, .plum-badge, .pillar-ref";

/** CSS selectors that hold the kicker / label */
const LABEL_SELECTORS = ".kicker, .pillar-label";

/** CSS selectors for the containing panel / shell */
const PANEL_SELECTORS =
  ".panel, .glow-panel, .ribbon-panel, .ribbon-body, .sage-forest-card, .obsidian-card, .plum-card, .cobalt-card, .cyan-broadcast-banner";

function inspectorFontWeight(weight: BibleThemeSettings["fontWeight"]): string {
  if (weight === "light") return "300";
  if (weight === "normal") return "400";
  if (weight === "bold") return "700";
  if (weight === "extrabold") return "800";
  if (weight === "black") return "900";
  return "600";
}

function inspectorReferenceFontWeight(weight: BibleThemeSettings["refFontWeight"]): string {
  if (weight === "light") return "300";
  if (weight === "normal") return "400";
  if (weight === "bold") return "700";
  if (weight === "extrabold") return "800";
  if (weight === "black") return "900";
  return "600";
}

/**
 * Build a CSS string of overrides driven by the inspector panel settings.
 * These are injected after the template's own CSS so they take precedence
 * (using !important where the template already has a rule).
 */
function buildInspectorOverrides(settings: BibleThemeSettings): string {
  const fontScale = 1; // 1920x1080 canvas uses 1:1 px font sizes
  const rules: string[] = [];

  // ── Verse text ──
  rules.push(`${VERSE_SELECTORS} {
  font-size: ${Math.round(settings.fontSize * fontScale)}px !important;
  font-weight: ${inspectorFontWeight(settings.fontWeight)} !important;
  font-style: ${settings.fontStyle || "normal"} !important;
  color: ${settings.fontColor} !important;
  line-height: ${settings.lineHeight} !important;
  text-align: ${settings.textAlign} !important;
  text-transform: ${settings.textTransform !== "none" ? settings.textTransform : "none"} !important;
  ${settings.textShadow !== "none" ? `text-shadow: ${settings.textShadow} !important;` : ""}
  font-family: ${settings.fontFamily} !important;
}`);

  // ── Reference text ──
  const refWeight = inspectorReferenceFontWeight(settings.refFontWeight);
  const refAlign = settings.refTextAlign === "match" ? settings.textAlign : settings.refTextAlign;
  rules.push(`${REF_SELECTORS} {
  font-size: ${Math.round(settings.refFontSize * fontScale)}px !important;
  font-weight: ${refWeight} !important;
  color: ${settings.refFontColor} !important;
  text-transform: ${settings.refTextTransform !== "none" ? settings.refTextTransform : "none"} !important;
  letter-spacing: ${settings.refLetterSpacing}px !important;
  opacity: ${settings.refOpacity} !important;
  text-align: ${refAlign} !important;
  ${settings.refFontFamily ? `font-family: ${settings.refFontFamily} !important;` : ""}
}`);

  // ── Reference wrapper alignment ──
  const justifyVal = refAlign === "right" ? "flex-end" : refAlign === "left" ? "flex-start" : "center";
  rules.push(`.badge-wrapper, .header-wrapper {
  justify-content: ${justifyVal} !important;
}`);

  // ── Label / kicker ──
  rules.push(`${LABEL_SELECTORS} {
  color: ${settings.refFontColor} !important;
}`);

  // ── Panel / box background ──
  if (settings.boxBackground !== "transparent") {
    rules.push(`${PANEL_SELECTORS} {
  background: ${settings.boxBackground} !important;
  border-radius: ${settings.borderRadius}px !important;
}`);
  }

  // ── Reference background ──
  if (settings.referenceBackgroundEnabled) {
    const bg = settings.referenceBackgroundColor;
    const r = settings.referenceBackgroundRadius ?? 12;
    let refBgCss: string;
    if (settings.referenceBackgroundStyle === "pill") {
      refBgCss = `display:inline-block !important;background:${bg} !important;border-radius:999px !important;padding:4px 16px !important;border:none !important;`;
    } else if (settings.referenceBackgroundStyle === "outline") {
      refBgCss = `display:inline-block !important;border:2px solid ${bg} !important;border-radius:${r}px !important;padding:4px 16px !important;background:transparent !important;`;
    } else {
      refBgCss = `display:inline-block !important;background:${bg} !important;border-radius:${r}px !important;padding:4px 16px !important;border:none !important;`;
    }
    rules.push(`${REF_SELECTORS} {
  ${refBgCss}
}`);
  } else {
    rules.push(`.badge-ref, .cobalt-badge, .plum-badge {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
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

  const googleFontsFallback = `@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Montserrat:ital,wght@0,300;0,400;0,700;0,900;1,400&family=Inter:wght@300;400;600;700;900&display=swap');`;

  const overrides = settings ? buildInspectorOverrides(settings) : "";

  return `<!DOCTYPE html><html><head><style>
${googleFontsFallback}
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
