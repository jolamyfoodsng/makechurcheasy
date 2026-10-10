// Regenerates src/lowerthirds/kineticThemes.ts from public/kinetic/kinetic-lower-thirds.js.
// Run from desktop/:  node scripts/generate-kinetic-themes.cjs
require(require('path').resolve(__dirname, '../public/kinetic/kinetic-lower-thirds.js'));
// The runtime is a browser script. On Node versions that load it as an ES module,
// require() executes it but returns an empty namespace; its API remains on globalThis.
const api = globalThis.MCEKinetic;
// Extra strap families register themselves into the engine.
require(require('path').resolve(__dirname, '../public/kinetic/subscribe-lower-thirds.js'));
require(require('path').resolve(__dirname, '../public/kinetic/church-lower-thirds.js'));
require(require('path').resolve(__dirname, '../public/kinetic/sunday-lower-thirds.js'));
const CSS = `
/* Kinetic lower thirds — animated by public/kinetic/kinetic-lower-thirds.js (GSAP). */
@font-face { font-family: "MCE Archivo"; font-style: normal; font-weight: 100 900; font-stretch: 62% 125%; font-display: block;
  src: url("/fonts/archivo/archivo-latin-standard-normal.woff2") format("woff2-variations"), url("/fonts/archivo/archivo-latin-standard-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
@font-face { font-family: "MCE Archivo"; font-style: normal; font-weight: 100 900; font-stretch: 62% 125%; font-display: block;
  src: url("/fonts/archivo/archivo-latin-ext-standard-normal.woff2") format("woff2-variations"), url("/fonts/archivo/archivo-latin-ext-standard-normal.woff2") format("woff2");
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
@font-face { font-family: "MCE Archivo"; font-style: normal; font-weight: 100 900; font-stretch: 62% 125%; font-display: block;
  src: url("/fonts/archivo/archivo-vietnamese-standard-normal.woff2") format("woff2-variations"), url("/fonts/archivo/archivo-vietnamese-standard-normal.woff2") format("woff2");
  unicode-range: U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB; }
@font-face { font-family: "MCE Archivo"; font-style: italic; font-weight: 100 900; font-stretch: 62% 125%; font-display: block;
  src: url("/fonts/archivo/archivo-latin-standard-italic.woff2") format("woff2-variations"), url("/fonts/archivo/archivo-latin-standard-italic.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
@font-face { font-family: "MCE Archivo"; font-style: italic; font-weight: 100 900; font-stretch: 62% 125%; font-display: block;
  src: url("/fonts/archivo/archivo-latin-ext-standard-italic.woff2") format("woff2-variations"), url("/fonts/archivo/archivo-latin-ext-standard-italic.woff2") format("woff2");
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
@font-face { font-family: "MCE Archivo"; font-style: italic; font-weight: 100 900; font-stretch: 62% 125%; font-display: block;
  src: url("/fonts/archivo/archivo-vietnamese-standard-italic.woff2") format("woff2-variations"), url("/fonts/archivo/archivo-vietnamese-standard-italic.woff2") format("woff2");
  unicode-range: U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB; }

html, body { background: transparent; }
.kx-root {
  display: flex; align-items: flex-end; width: 100%;
  padding: 5.6em 6.2em;
  font-family: "MCE Archivo", "CMG Sans", sans-serif !important;
  font-size: 19.2px; font-stretch: 100%; line-height: .84;
  color: var(--kx-fg, #ffffff); pointer-events: none;
}
#overlay-root .kx-root, #overlay-root .kx-root * { font-family: "MCE Archivo", "CMG Sans", sans-serif !important; }
.kx-root * { box-sizing: border-box; }
.kx-root .kx-stage { position: relative; }
.kx-root .blk { position: relative; line-height: .84; white-space: nowrap; }
.kx-root .m { display: block; overflow: hidden; padding: .12em .1em .05em; margin: -.12em -.1em -.05em; }
.kx-root .mi { display: inline-block; vertical-align: bottom; overflow: hidden; padding: .12em .08em .08em; margin: -.12em -.08em -.08em; }
.kx-root .i { display: inline-block; }
.kx-root .ch { display: inline-block; white-space: pre; }
.kx-root .hv { font-weight: 900; font-stretch: 112%; letter-spacing: -.005em; }
.kx-root .lg { font-weight: 300; }
.kx-root .rg { font-weight: 400; }
.kx-root .sm { font-weight: 800; font-stretch: 108%; letter-spacing: .02em; line-height: 1.15; }
.kx-root .ol .ch { -webkit-text-stroke: .018em var(--kx-fg, #ffffff); }
.kx-root .rule { display: block; background: var(--kx-fg, #ffffff); }
/* Shown only if the animation engine could not load. */
.kx-root .kx-fallback { line-height: 1; }
.kx-root .kx-fb-name { font-size: 5.6em; font-weight: 900; font-stretch: 112%; }
.kx-root .kx-fb-sub { margin-top: .5em; font-size: 1.3em; font-weight: 800; letter-spacing: .04em; }

/* "Modern" family (mx-*): wide black-italic straps. Sizes are 1920px design sizes; .mx is scaled inside .mx-fit. */
.kx-root .mx-fit { position: relative; }
.kx-root .mx { --ink: #0b0b0b; --inv: #ffffff; --sw: 3px; position: absolute; left: 0; top: 0; transform-origin: 0 0; font-weight: 900; font-stretch: 125%; font-style: italic; color: var(--ink); line-height: .86; white-space: nowrap; width: max-content; }
.kx-root .mx .mx-ln { white-space: pre; display: block; width: max-content; }
.kx-root .mx .ch { display: inline-block; white-space: pre; color: color-mix(in srgb, var(--ink) calc(var(--f, 1) * 100%), transparent); }
.kx-root .mx .mx-st .ch { -webkit-text-stroke: var(--sw) var(--ink); }
.kx-root .mx .mx-of .ch { --f: 0; }
.kx-root .mx .mx-ol .ch { --f: 0; -webkit-text-stroke: var(--sw) var(--ink); }
.kx-root .mx .mx-inv { --ink: var(--inv); }
.kx-root .mx .mx-fill { background: var(--ink); }
/* 22 Glitch Dash */
.kx-root .mx3 { font-size: 124px; }
.kx-root .mx3 .mx-row2 { display: flex; align-items: flex-start; margin-top: .06em; }
.kx-root .mx3 .mx-role { font-size: .21em; padding-top: .32em; margin-right: .08em; }
.kx-root .mx3 .mx-dash { position: absolute; height: 6px; background: var(--ink); }
/* 23 Ghost Underline */
.kx-root .mx4 { font-size: 100px; }
.kx-root .mx4 .mx-uline { position: absolute; left: .4em; right: .05em; height: 7px; top: .93em; transform-origin: 100% 50%; }
.kx-root .mx4 .mx-rolewrap { position: relative; height: .5em; margin-top: .28em; }
.kx-root .mx4 .mx-role { font-size: .38em; position: absolute; right: .9em; top: 0; }
.kx-root .mx4 .mx-ghost { --sw: 1.5px; }
/* 25 Drawn Frame */
.kx-root .mx6 { font-size: 96px; }
.kx-root .mx6 .mx-role { font-size: .19em; margin: 0 .5em .5em auto; }
.kx-root .mx6 .mx-frame { position: relative; padding: .16em .22em .12em; }
.kx-root .mx6 .mx-e { position: absolute; background: var(--ink); }
.kx-root .mx6 .mx-et { left: 0; right: 0; top: 0; height: 6px; transform-origin: 100% 50%; }
.kx-root .mx6 .mx-el { left: 0; top: 0; bottom: 0; width: 6px; transform-origin: 50% 0; }
.kx-root .mx6 .mx-eb { left: 0; right: 0; bottom: 0; height: 6px; transform-origin: 0 50%; }
.kx-root .mx6 .mx-er { right: 0; top: 0; bottom: 0; width: 6px; transform-origin: 50% 100%; }
.kx-root .mx6 .mx-n2 { font-size: 1.13em; text-align: right; width: auto; margin-top: .02em; --sw: 2.4px; }
/* 26 Name Tag */
.kx-root .mx7 { font-size: 150px; display: flex; align-items: flex-start; }
.kx-root .mx7 .mx-n1 { transform-origin: 0 100%; }
.kx-root .mx7 .mx-side { margin-left: .03em; margin-top: -.12em; }
.kx-root .mx7 .mx-tag { font-size: .42em; padding: .12em .2em .08em .16em; position: relative; }
.kx-root .mx7 .mx-role { font-size: .135em; margin: .6em 0 0 .3em; }
/* 27 Leading Badge */
.kx-root .mx9 { font-size: 128px; }
.kx-root .mx9 .mx-tagrow { display: flex; padding-left: 2.35em; }
.kx-root .mx9 .mx-tag { position: relative; font-size: .34em; padding: .14em .6em .08em .5em; }
.kx-root .mx9 .mx-n1 { margin-top: .08em; }
.kx-root .mx9 .mx-role { font-size: .41em; margin: .14em 0 0 1.7em; --sw: 1.8px; }
.kx-root .mx .mx-tag .mx-bg { position: absolute; inset: 0; }
.kx-root .mx .mx-tag .mx-ln { position: relative; }
`;
const attr = k => 'data-v-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
const keys = ['firstName','lastName','title','organization'];
// Theme ids keep the number each strap first shipped with, so OBS favourites and
// saved Dock slots survive when straps are removed (Outline Slash and Ink Block were).
// Display names are numbered in list order.
const STABLE_NUMBER = { 'mx-glitch': 22, 'mx-underline': 23, 'mx-frame': 25, 'mx-tag': 26, 'mx-badge': 27 };
// Look settings edited in the Dock's Appearance panel (not shown as content fields).
const STYLE_VARS = [
  { key: 'kxSpeed', label: 'Speed', type: 'number', defaultValue: '1', group: 'Style' },
  { key: 'kxScale', label: 'Size', type: 'number', defaultValue: '0.5', group: 'Style' },
  { key: 'kxAutoOut', label: 'Hold (seconds)', type: 'number', defaultValue: '5', group: 'Style' },
  { key: 'kxLoop', label: 'Loop auto', type: 'toggle', defaultValue: '0', group: 'Style' },
];
let motionIndex = 0, subscribeIndex = 0;
// "Church graphics" (church-lower-thirds.js) and "Sunday graphics" (sunday-lower-thirds.js): service,
// giving, branding, subscribe and social graphics with their own typed fields (text / colour / select /
// list / image). Ids are stable (lt-<template id>) so OBS picks survive. `graphicCategory` files them
// under a Broadcast Graphics library category.
function churchTheme(t) {
  const content = t.fields.map((f) => {
    const v = { key: f.key, label: f.label, type: f.type || 'text', defaultValue: f.defaultValue, group: f.type === 'color' ? 'Style' : 'Content' };
    if (v.type === 'text') v.placeholder = f.defaultValue;
    if (v.type === 'list') v.separator = ',';
    if (f.options) v.options = f.options;
    return v;
  });
  const attrs = t.fields.map((f) => `${attr(f.key)}="{{${f.key}}}"`).join(' ');
  const firstText = t.fields.find((f) => (f.type || 'text') === 'text');
  const html = `<div class="kx-root" data-kx="${t.id}" data-state="{{state}}" ${attrs} data-v-kx-color="{{kxColor}}" data-v-kx-speed="{{kxSpeed}}" data-v-kx-scale="{{kxScale}}" data-v-kx-auto-out="{{kxAutoOut}}" data-v-kx-loop="{{kxLoop}}">` +
    `<div class="kx-fallback"><div class="kx-fb-name">{{${firstText ? firstText.key : 'title'}}}</div></div></div>`;
  return {
    id: `lt-${t.id}`,
    name: t.name,
    description: t.tech + '.',
    category: t.category || 'general',
    ...(t.group ? { graphicCategory: t.group } : {}),
    icon: t.category === 'speaker' ? 'badge' : 'campaign',
    accentColor: t.color,
    tags: t.tags || ['Church', 'Graphics', 'Motion', 'Animated'],
    usesTailwind: false,
    fontImports: ['/fonts/google/google-fonts.css'],
    variables: [
      ...content,
      // Church graphics are full 1920px layouts: Size 1 = the size they were designed at.
      ...STYLE_VARS.map((v) => (v.key === 'kxScale' ? { ...v, defaultValue: '1' }
        : v.key === 'kxAutoOut' && t.hold != null ? { ...v, defaultValue: String(t.hold) } : v)),
    ],
    html,
  };
}
const themes = api.templates.map((t) => {
  if (t.family === 'church' || t.family === 'sunday') return churchTheme(t);
  const isSub = t.family === 'subscribe';
  const ownKeys = t.fields.map(f => f.key);
  const fields = Object.fromEntries(t.fields.map(f => [f.key, f]));
  const fieldKeys = isSub ? ownKeys : keys.filter(k => fields[k]);
  const attrs = (isSub ? ownKeys : keys).map(k => `${attr(k)}="{{${k}}}"`).join(' ');
  const html = `<div class="kx-root" data-kx="${t.id}" data-state="{{state}}" ${attrs} data-v-kx-color="{{kxColor}}" data-v-kx-speed="{{kxSpeed}}" data-v-kx-scale="{{kxScale}}" data-v-kx-auto-out="{{kxAutoOut}}" data-v-kx-loop="{{kxLoop}}">` +
    (isSub
      ? `<div class="kx-fallback"><div class="kx-fb-name">{{title}}</div></div></div>`
      : `<div class="kx-fallback"><div class="kx-fb-name">{{firstName}} {{lastName}}</div><div class="kx-fb-sub">{{title}} · {{organization}}</div></div></div>`);
  const contentVars = fieldKeys.map(k => {
    const f = fields[k];
    if (/image$/i.test(k)) return { key: k, label: f.label, type: 'image', defaultValue: '', group: 'Content' };
    return { key: k, label: f.label, type: 'text', defaultValue: f.defaultValue, placeholder: f.defaultValue, group: 'Content', ...(k === 'firstName' || k === 'lastName' || (isSub && k === 'title') ? { required: true } : {}) };
  });
  if (isSub) {
    subscribeIndex += 1;
    const n = String(subscribeIndex).padStart(2, '0');
    return {
      id: `lt-sub-${n}-${t.id}`,
      name: `Subscribe ${n}: ${t.name}`,
      description: t.tech + '.',
      category: 'general',
      icon: 'subscriptions',
      accentColor: t.color,
      tags: ['Subscribe', 'Social', 'Motion', 'Animated'],
      usesTailwind: false,
      fontImports: ['/fonts/google/google-fonts.css'],
      variables: [
        ...contentVars,
        { key: 'kxColor', label: 'Accent colour', type: 'color', defaultValue: t.color, group: 'Style' },
        ...STYLE_VARS,
      ],
      html,
    };
  }
  motionIndex += 1;
  const n = String(STABLE_NUMBER[t.id] || motionIndex).padStart(2, '0');
  const label = String(motionIndex).padStart(2, '0');
  return {
    id: `lt-kx-${n}-${t.id}`,
    name: `Motion ${label}: ${t.name}`,
    description: t.tech + '.',
    category: 'speaker',
    icon: 'animation',
    accentColor: t.color === '#ffffff' ? '#9db0ff' : (t.id.startsWith('mx-') ? '#c9c9c9' : t.color),
    tags: t.id.startsWith('mx-') ? ['Motion', 'Modern', 'Speaker', 'Name', 'Animated'] : ['Motion', 'Speaker', 'Name', 'Animated'],
    usesTailwind: false,
    fontImports: [],
    variables: [
      ...contentVars,
      { key: 'kxColor', label: 'Text colour', type: 'color', defaultValue: t.color, group: 'Style' },
      ...STYLE_VARS,
    ],
    html,
  };
});
const out = `/**
 * kineticThemes.ts — ${themes.length} animated lower thirds: Motion name straps, Subscribe straps, Church graphics and Sunday graphics.
 *
 * GENERATED by scripts/generate-kinetic-themes.cjs from public/kinetic/kinetic-lower-thirds.js. The HTML here only
 * carries the field values; public/lower-third-overlay.html hands the rendered
 * \`.kx-root\` to window.MCEKinetic, which builds and animates the strap with GSAP.
 * If the engine fails to load, the plain fallback text inside \`.kx-root\` shows.
 *
 * These themes intentionally skip brand normalisation (fonts/colours) in
 * themes.ts so they keep the look of the original motion designs.
 */
import type { LowerThirdTheme } from "./types";

export const KINETIC_THEME_CSS = ${JSON.stringify(CSS)};

const KINETIC_THEME_DATA: Omit<LowerThirdTheme, "css">[] = ${JSON.stringify(themes, null, 2)};

export const KINETIC_LOWER_THIRD_THEMES: LowerThirdTheme[] = KINETIC_THEME_DATA.map((theme) => ({
  ...theme,
  css: KINETIC_THEME_CSS,
}));
`;
require('fs').writeFileSync(require('path').resolve(__dirname, '../src/lowerthirds/kineticThemes.ts'), out);
console.log(themes.length, 'themes');
