/**
 * backgroundAssets.ts — Shared background patterns and assets
 *
 * Used by both ThemeCreatorModal (background picker) and DockMediaTab (media browsing).
 * Contains SVG-based patterns with optional SMIL animations.
 */

const makeSvgBackground = (svg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export type BackgroundPattern = {
  label: string;
  src: string;
};

/**
 * 30 animated/static SVG background patterns.
 * Each pattern is a data URI SVG with gradients, patterns, and optional SMIL animations.
 */
export const BACKGROUND_PATTERNS: BackgroundPattern[] = [
  {
    label: "Soft Crosshatch",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#101827"/><stop offset="1" stop-color="#24324a"/></linearGradient><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 24 24 0M-6 6 6-6M18 30 30 18" stroke="#ffffff" stroke-opacity=".08" stroke-width="2"/></pattern></defs><rect width="320" height="180" fill="url(#g)"/><rect width="320" height="180" fill="url(#p)"/></svg>`),
  },
  {
    label: "Warm Grain",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="g" cx=".75" cy=".15" r="1"><stop stop-color="#7a3a20"/><stop offset=".45" stop-color="#291d1b"/><stop offset="1" stop-color="#0f1115"/></radialGradient><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs><rect width="320" height="180" fill="url(#g)"/><rect width="320" height="180" filter="url(#n)" opacity=".18"/></svg>`),
  },
  {
    label: "Blue Depth",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0b1220"/><stop offset="1" stop-color="#123a73"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><circle cx="260" cy="40" r="92" fill="#6A34DE" opacity=".18"/><circle cx="70" cy="160" r="120" fill="#22c55e" opacity=".08"/></svg>`),
  },
  {
    label: "Dark Lines",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#111827"/><g stroke="#94a3b8" stroke-opacity=".12" stroke-width="1"><path d="M0 30h320M0 60h320M0 90h320M0 120h320M0 150h320"/></g><path d="M0 180 320 0" stroke="#6A34DE" stroke-opacity=".16" stroke-width="18"/></svg>`),
  },
  {
    label: "Emerald",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#081f17"/><stop offset="1" stop-color="#14532d"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><path d="M-20 140C70 80 120 210 220 110S340 70 360 30" fill="none" stroke="#86efac" stroke-opacity=".18" stroke-width="20"/></svg>`),
  },
  {
    label: "Midnight Bloom",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="g" cx=".5" cy=".5" r=".78"><stop stop-color="#20345c"/><stop offset=".48" stop-color="#121827"/><stop offset="1" stop-color="#070a12"/></radialGradient><filter id="soft"><feGaussianBlur stdDeviation="10"/></filter></defs><rect width="320" height="180" fill="url(#g)"/><g filter="url(#soft)" opacity=".34"><circle cx="92" cy="84" r="34" fill="#60A5FA"><animate attributeName="r" values="28;38;28" dur="8s" repeatCount="indefinite"/></circle><circle cx="226" cy="92" r="42" fill="#60A5FA"><animate attributeName="cy" values="82;104;82" dur="10s" repeatCount="indefinite"/></circle></g><path d="M0 138C52 118 92 122 142 140S250 166 320 128" fill="none" stroke="#f8fafc" stroke-opacity=".08" stroke-width="18"><animate attributeName="d" values="M0 138C52 118 92 122 142 140S250 166 320 128;M0 128C62 150 112 108 160 132S250 152 320 116;M0 138C52 118 92 122 142 140S250 166 320 128" dur="12s" repeatCount="indefinite"/></path></svg>`),
  },
  {
    label: "Golden Veil",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" x2="1" y1="1" y2="0"><stop stop-color="#17110c"/><stop offset=".55" stop-color="#2b2016"/><stop offset="1" stop-color="#5a3215"/></linearGradient><linearGradient id="line" x1="0" x2="1"><stop stop-color="#fbbf24" stop-opacity="0"/><stop offset=".5" stop-color="#fbbf24" stop-opacity=".34"/><stop offset="1" stop-color="#fbbf24" stop-opacity="0"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><g fill="none" stroke="url(#line)" stroke-width="2"><path d="M-20 58C48 32 96 86 158 54S246 22 340 68"><animate attributeName="d" values="M-20 58C48 32 96 86 158 54S246 22 340 68;M-20 66C58 28 106 74 164 64S254 26 340 58;M-20 58C48 32 96 86 158 54S246 22 340 68" dur="11s" repeatCount="indefinite"/></path><path d="M-20 112C70 82 118 146 190 104S270 78 340 114" opacity=".62"><animate attributeName="d" values="M-20 112C70 82 118 146 190 104S270 78 340 114;M-20 102C58 132 130 88 190 118S276 92 340 104;M-20 112C70 82 118 146 190 104S270 78 340 114" dur="13s" repeatCount="indefinite"/></path></g></svg>`),
  },
  {
    label: "Calm Grid",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#0d1520"/><stop offset="1" stop-color="#182131"/></linearGradient><pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0v28" fill="none" stroke="#c4b5fd" stroke-opacity=".12"/></pattern></defs><rect width="320" height="180" fill="url(#g)"/><rect width="320" height="180" fill="url(#p)"><animateTransform attributeName="transform" type="translate" values="0 0;28 0;0 0" dur="18s" repeatCount="indefinite"/></rect><circle cx="278" cy="38" r="84" fill="#6A34DE" opacity=".12"/></svg>`),
  },
  {
    label: "Purple Mist",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="g" cx=".35" cy=".42" r=".86"><stop stop-color="#50318f"/><stop offset=".5" stop-color="#181526"/><stop offset="1" stop-color="#0d0f16"/></radialGradient><filter id="blur"><feGaussianBlur stdDeviation="14"/></filter></defs><rect width="320" height="180" fill="url(#g)"/><g filter="url(#blur)" opacity=".45"><ellipse cx="86" cy="48" rx="68" ry="28" fill="#c084fc"><animate attributeName="cx" values="70;118;70" dur="12s" repeatCount="indefinite"/></ellipse><ellipse cx="235" cy="130" rx="78" ry="34" fill="#38bdf8"><animate attributeName="rx" values="58;86;58" dur="10s" repeatCount="indefinite"/></ellipse></g></svg>`),
  },
  {
    label: "Soft Aurora",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" x1="0" x2="1"><stop stop-color="#06131a"/><stop offset="1" stop-color="#10251d"/></linearGradient><linearGradient id="a" x1="0" x2="1"><stop stop-color="#22c55e" stop-opacity="0"/><stop offset=".45" stop-color="#22d3ee" stop-opacity=".32"/><stop offset="1" stop-color="#a7f3d0" stop-opacity="0"/></linearGradient></defs><rect width="320" height="180" fill="url(#bg)"/><path d="M-30 92C38 48 86 48 142 90S246 132 350 70" fill="none" stroke="url(#a)" stroke-width="34" stroke-linecap="round" opacity=".75"><animate attributeName="d" values="M-30 92C38 48 86 48 142 90S246 132 350 70;M-30 112C48 62 96 90 150 70S252 96 350 54;M-30 92C38 48 86 48 142 90S246 132 350 70" dur="14s" repeatCount="indefinite"/></path></svg>`),
  },
  {
    label: "Charcoal Waves",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" y1="0" y2="1"><stop stop-color="#171717"/><stop offset="1" stop-color="#0a0a0a"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><g fill="none" stroke="#f8fafc" stroke-opacity=".08" stroke-width="1.6"><path d="M0 40C40 20 80 60 120 40S200 20 240 42S290 60 320 46"><animateTransform attributeName="transform" type="translate" values="0 0;18 0;0 0" dur="12s" repeatCount="indefinite"/></path><path d="M0 82C48 56 78 108 130 84S212 58 260 84S300 105 320 94"><animateTransform attributeName="transform" type="translate" values="0 0;-20 0;0 0" dur="14s" repeatCount="indefinite"/></path><path d="M0 126C52 98 92 144 142 124S224 102 270 126S302 144 320 136"><animateTransform attributeName="transform" type="translate" values="0 0;14 0;0 0" dur="16s" repeatCount="indefinite"/></path></g></svg>`),
  },
  {
    label: "Crimson Ember",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="g" cx=".7" cy=".8" r=".9"><stop stop-color="#7f1d1d"/><stop offset=".45" stop-color="#2b1215"/><stop offset="1" stop-color="#0f1115"/></radialGradient><filter id="b"><feGaussianBlur stdDeviation="6"/></filter></defs><rect width="320" height="180" fill="url(#g)"/><g filter="url(#b)"><circle cx="72" cy="132" r="3" fill="#fb923c" opacity=".5"><animate attributeName="cy" values="142;52;142" dur="9s" repeatCount="indefinite"/></circle><circle cx="210" cy="148" r="4" fill="#f87171" opacity=".42"><animate attributeName="cy" values="148;62;148" dur="12s" repeatCount="indefinite"/></circle><circle cx="270" cy="122" r="2.6" fill="#fbbf24" opacity=".45"><animate attributeName="cy" values="132;44;132" dur="10s" repeatCount="indefinite"/></circle></g></svg>`),
  },
  {
    label: "Blue Silk",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#07111f"/><stop offset=".52" stop-color="#12325c"/><stop offset="1" stop-color="#07111f"/></linearGradient><linearGradient id="s" x1="0" x2="1"><stop stop-color="#ddd6fe" stop-opacity="0"/><stop offset=".5" stop-color="#ddd6fe" stop-opacity=".28"/><stop offset="1" stop-color="#ddd6fe" stop-opacity="0"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><path d="M-20 36C70 2 116 78 190 36S280 18 340 44" fill="none" stroke="url(#s)" stroke-width="20" opacity=".8"><animate attributeName="d" values="M-20 36C70 2 116 78 190 36S280 18 340 44;M-20 54C64 28 116 30 176 58S270 70 340 34;M-20 36C70 2 116 78 190 36S280 18 340 44" dur="13s" repeatCount="indefinite"/></path><path d="M-20 130C62 92 118 166 190 126S270 102 340 130" fill="none" stroke="url(#s)" stroke-width="24" opacity=".45"><animate attributeName="d" values="M-20 130C62 92 118 166 190 126S270 102 340 130;M-20 118C72 148 130 100 190 142S280 110 340 118;M-20 130C62 92 118 166 190 126S270 102 340 130" dur="15s" repeatCount="indefinite"/></path></svg>`),
  },
  {
    label: "Ivory Dust",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#f7f0df"/><stop offset="1" stop-color="#d8c7aa"/></linearGradient><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="2"/><feColorMatrix type="saturate" values="0"/></filter></defs><rect width="320" height="180" fill="url(#g)"/><rect width="320" height="180" filter="url(#n)" opacity=".08"/><circle cx="255" cy="48" r="92" fill="#b45309" opacity=".12"><animate attributeName="cx" values="238;270;238" dur="16s" repeatCount="indefinite"/></circle><path d="M0 156C82 112 132 180 208 138S286 120 320 130" fill="none" stroke="#78350f" stroke-opacity=".1" stroke-width="18"/></svg>`),
  },
  {
    label: "Starlit Navy",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="g" cx=".5" cy=".45" r=".82"><stop stop-color="#172554"/><stop offset=".6" stop-color="#0f172a"/><stop offset="1" stop-color="#030712"/></radialGradient></defs><rect width="320" height="180" fill="url(#g)"/><g fill="#e0f2fe"><circle cx="44" cy="36" r="1" opacity=".35"><animate attributeName="opacity" values=".15;.65;.15" dur="4s" repeatCount="indefinite"/></circle><circle cx="96" cy="72" r="1.2" opacity=".24"><animate attributeName="opacity" values=".1;.55;.1" dur="5s" repeatCount="indefinite"/></circle><circle cx="174" cy="38" r=".9" opacity=".32"><animate attributeName="opacity" values=".12;.62;.12" dur="4.4s" repeatCount="indefinite"/></circle><circle cx="262" cy="78" r="1.3" opacity=".28"><animate attributeName="opacity" values=".1;.58;.1" dur="5.6s" repeatCount="indefinite"/></circle><circle cx="234" cy="138" r=".9" opacity=".26"><animate attributeName="opacity" values=".08;.5;.08" dur="4.8s" repeatCount="indefinite"/></circle></g><path d="M-20 150C70 120 142 166 220 130S300 112 340 122" fill="none" stroke="#38bdf8" stroke-opacity=".13" stroke-width="14"/></svg>`),
  },
  {
    label: "Dawn Cathedral",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" y1="1" y2="0"><stop stop-color="#160f18"/><stop offset=".58" stop-color="#312037"/><stop offset="1" stop-color="#f59e0b"/></linearGradient><radialGradient id="sun" cx=".5" cy=".18" r=".5"><stop stop-color="#fde68a" stop-opacity=".7"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></radialGradient></defs><rect width="320" height="180" fill="url(#bg)"/><rect width="320" height="180" fill="url(#sun)"><animate attributeName="opacity" values=".55;.85;.55" dur="9s" repeatCount="indefinite"/></rect><g fill="none" stroke="#fff7ed" stroke-opacity=".12" stroke-width="2"><path d="M62 178V92c0-22 18-40 40-40s40 18 40 40v86"/><path d="M178 178V76c0-28 22-50 50-50s50 22 50 50v102"/></g><path d="M0 158H320" stroke="#fef3c7" stroke-opacity=".18" stroke-width="18"/></svg>`),
  },
  {
    label: "Olive Branch",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" x1="0" x2="1"><stop stop-color="#0c1a13"/><stop offset="1" stop-color="#25351e"/></linearGradient></defs><rect width="320" height="180" fill="url(#bg)"/><path d="M-10 132C58 94 110 96 170 72S258 36 340 46" fill="none" stroke="#bbf7d0" stroke-opacity=".2" stroke-width="4"><animate attributeName="d" values="M-10 132C58 94 110 96 170 72S258 36 340 46;M-10 124C64 84 112 112 176 82S260 44 340 58;M-10 132C58 94 110 96 170 72S258 36 340 46" dur="13s" repeatCount="indefinite"/></path><g fill="#86efac" opacity=".18"><ellipse cx="84" cy="98" rx="22" ry="8" transform="rotate(-22 84 98)"/><ellipse cx="134" cy="84" rx="22" ry="8" transform="rotate(20 134 84)"/><ellipse cx="205" cy="60" rx="24" ry="8" transform="rotate(-24 205 60)"/><ellipse cx="258" cy="48" rx="22" ry="8" transform="rotate(18 258 48)"/></g></svg>`),
  },
  {
    label: "Jordan River",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" y1="0" y2="1"><stop stop-color="#0f172a"/><stop offset=".58" stop-color="#164e63"/><stop offset="1" stop-color="#062a34"/></linearGradient><linearGradient id="water" x1="0" x2="1"><stop stop-color="#67e8f9" stop-opacity="0"/><stop offset=".5" stop-color="#67e8f9" stop-opacity=".3"/><stop offset="1" stop-color="#67e8f9" stop-opacity="0"/></linearGradient></defs><rect width="320" height="180" fill="url(#bg)"/><path d="M-20 132C50 98 86 158 150 124S242 86 340 120" fill="none" stroke="url(#water)" stroke-width="28" stroke-linecap="round"><animate attributeName="d" values="M-20 132C50 98 86 158 150 124S242 86 340 120;M-20 118C62 148 98 98 160 132S244 106 340 108;M-20 132C50 98 86 158 150 124S242 86 340 120" dur="12s" repeatCount="indefinite"/></path><path d="M0 58C70 36 128 60 184 42S268 30 320 42" fill="none" stroke="#f8fafc" stroke-opacity=".08" stroke-width="6"/></svg>`),
  },
  {
    label: "Glass Mosaic",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#0b1020"/><stop offset="1" stop-color="#1f2937"/></linearGradient></defs><rect width="320" height="180" fill="url(#bg)"/><g opacity=".34"><polygon points="0,0 70,18 42,78" fill="#6A34DE"><animate attributeName="opacity" values=".18;.36;.18" dur="7s" repeatCount="indefinite"/></polygon><polygon points="78,20 160,0 142,72 42,78" fill="#14b8a6"><animate attributeName="opacity" values=".12;.32;.12" dur="9s" repeatCount="indefinite"/></polygon><polygon points="160,0 238,30 204,92 142,72" fill="#f59e0b"><animate attributeName="opacity" values=".1;.28;.1" dur="8s" repeatCount="indefinite"/></polygon><polygon points="238,30 320,0 320,92 204,92" fill="#a855f7"><animate attributeName="opacity" values=".12;.3;.12" dur="10s" repeatCount="indefinite"/></polygon><polygon points="0,180 88,122 186,180" fill="#38bdf8" opacity=".28"/><polygon points="186,180 252,112 320,180" fill="#22c55e" opacity=".2"/></g><g stroke="#f8fafc" stroke-opacity=".08"><path d="M0 0 70 18 160 0 238 30 320 0M42 78 142 72 204 92 320 92M0 180 88 122 186 180 252 112 320 180"/></g></svg>`),
  },
  {
    label: "Gentle Rain",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" y1="0" y2="1"><stop stop-color="#111827"/><stop offset="1" stop-color="#0c1a2b"/></linearGradient></defs><rect width="320" height="180" fill="url(#bg)"/><g stroke="#ddd6fe" stroke-opacity=".16" stroke-width="1.4" stroke-linecap="round"><path d="M42 12l-14 32"><animateTransform attributeName="transform" type="translate" values="0 -60;0 190" dur="5s" repeatCount="indefinite"/></path><path d="M112 4 98 36"><animateTransform attributeName="transform" type="translate" values="0 -80;0 190" dur="6s" repeatCount="indefinite"/></path><path d="M184 18l-14 32"><animateTransform attributeName="transform" type="translate" values="0 -70;0 190" dur="5.6s" repeatCount="indefinite"/></path><path d="M260 0l-14 32"><animateTransform attributeName="transform" type="translate" values="0 -90;0 190" dur="6.4s" repeatCount="indefinite"/></path></g><circle cx="246" cy="44" r="82" fill="#6A34DE" opacity=".08"/></svg>`),
  },
  {
    label: "Sacred Geometry",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="bg" cx=".5" cy=".5" r=".8"><stop stop-color="#1e293b"/><stop offset="1" stop-color="#030712"/></radialGradient></defs><rect width="320" height="180" fill="url(#bg)"/><g fill="none" stroke="#f8fafc" stroke-opacity=".12" transform="translate(160 90)"><circle r="54"><animate attributeName="r" values="48;58;48" dur="12s" repeatCount="indefinite"/></circle><circle r="78" stroke-opacity=".06"/><path d="M0-62 54 31 -54 31Z"/><path d="M0 62 54-31 -54-31Z" opacity=".7"/><animateTransform attributeName="transform" type="rotate" from="0 160 90" to="360 160 90" dur="60s" repeatCount="indefinite"/></g></svg>`),
  },
  {
    label: "Lantern Glow",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="glow" cx=".5" cy=".45" r=".55"><stop stop-color="#fed7aa" stop-opacity=".72"/><stop offset=".55" stop-color="#fb923c" stop-opacity=".16"/><stop offset="1" stop-color="#0f1115" stop-opacity="0"/></radialGradient><linearGradient id="bg" y1="0" y2="1"><stop stop-color="#0f1115"/><stop offset="1" stop-color="#24130d"/></linearGradient></defs><rect width="320" height="180" fill="url(#bg)"/><rect width="320" height="180" fill="url(#glow)"><animate attributeName="opacity" values=".58;.9;.58" dur="7s" repeatCount="indefinite"/></rect><g fill="none" stroke="#fdba74" stroke-opacity=".18"><path d="M126 50h68l10 72h-88z"/><path d="M142 50c0-18 36-18 36 0"/></g></svg>`),
  },
  {
    label: "Desert Horizon",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="sky" y1="0" y2="1"><stop stop-color="#431407"/><stop offset=".52" stop-color="#92400e"/><stop offset="1" stop-color="#fcd34d"/></linearGradient></defs><rect width="320" height="180" fill="url(#sky)"/><circle cx="246" cy="58" r="36" fill="#fde68a" opacity=".4"><animate attributeName="cy" values="54;62;54" dur="12s" repeatCount="indefinite"/></circle><path d="M0 136C74 104 116 128 168 112S252 84 320 108V180H0Z" fill="#3b2212" opacity=".82"/><path d="M0 154C82 126 132 152 196 136S274 126 320 138" fill="none" stroke="#fde68a" stroke-opacity=".13" stroke-width="6"/></svg>`),
  },
  {
    label: "Celestial Rings",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="bg" cx=".5" cy=".5" r=".8"><stop stop-color="#1e1b4b"/><stop offset="1" stop-color="#050816"/></radialGradient></defs><rect width="320" height="180" fill="url(#bg)"/><g transform="translate(160 90)" fill="none" stroke="#c4b5fd" stroke-opacity=".18"><ellipse rx="112" ry="28"><animateTransform attributeName="transform" type="rotate" values="0;360" dur="42s" repeatCount="indefinite"/></ellipse><ellipse rx="94" ry="50"><animateTransform attributeName="transform" type="rotate" values="360;0" dur="50s" repeatCount="indefinite"/></ellipse><ellipse rx="54" ry="86"><animateTransform attributeName="transform" type="rotate" values="0;360" dur="58s" repeatCount="indefinite"/></ellipse></g><circle cx="160" cy="90" r="7" fill="#f8fafc" opacity=".28"/></svg>`),
  },
  {
    label: "Vineyard Lines",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" y1="0" y2="1"><stop stop-color="#1c1917"/><stop offset="1" stop-color="#365314"/></linearGradient></defs><rect width="320" height="180" fill="url(#bg)"/><g fill="none" stroke="#bef264" stroke-opacity=".14" stroke-width="2"><path d="M0 150C72 96 110 176 170 116S256 92 320 126"><animate attributeName="d" values="M0 150C72 96 110 176 170 116S256 92 320 126;M0 140C70 116 116 132 170 128S258 84 320 118;M0 150C72 96 110 176 170 116S256 92 320 126" dur="13s" repeatCount="indefinite"/></path><path d="M30 40c22 0 32 18 32 38 0 22-18 34-32 34-16-16-16-56 0-72z" fill="#84cc16" opacity=".13"/><path d="M244 38c24 0 36 20 36 42 0 24-20 36-36 36-18-18-18-60 0-78z" fill="#84cc16" opacity=".1"/></g></svg>`),
  },
  {
    label: "Ocean Praise",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" y1="0" y2="1"><stop stop-color="#082f49"/><stop offset="1" stop-color="#020617"/></linearGradient></defs><rect width="320" height="180" fill="url(#bg)"/><g fill="none" stroke="#bae6fd" stroke-opacity=".18" stroke-width="10" stroke-linecap="round"><path d="M-20 120C34 96 76 144 132 120S218 96 340 126"><animate attributeName="d" values="M-20 120C34 96 76 144 132 120S218 96 340 126;M-20 132C44 108 84 110 140 132S228 98 340 116;M-20 120C34 96 76 144 132 120S218 96 340 126" dur="10s" repeatCount="indefinite"/></path><path d="M-20 146C44 120 82 166 140 144S226 126 340 148" opacity=".52"><animate attributeName="d" values="M-20 146C44 120 82 166 140 144S226 126 340 148;M-20 154C58 136 96 138 148 154S236 128 340 140;M-20 146C44 120 82 166 140 144S226 126 340 148" dur="12s" repeatCount="indefinite"/></path></g></svg>`),
  },
  {
    label: "Mountain Dawn",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="sky" y1="0" y2="1"><stop stop-color="#0c1222"/><stop offset=".65" stop-color="#29344d"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><rect width="320" height="180" fill="url(#sky)"/><circle cx="104" cy="62" r="42" fill="#fde68a" opacity=".2"><animate attributeName="r" values="36;46;36" dur="12s" repeatCount="indefinite"/></circle><path d="M0 180 74 78 138 180Z" fill="#111827" opacity=".88"/><path d="M82 180 178 58 286 180Z" fill="#0f172a" opacity=".94"/><path d="M206 180 282 92 340 180Z" fill="#111827" opacity=".8"/><path d="M160 80 178 58 198 82" fill="#f8fafc" opacity=".22"/></svg>`),
  },
  {
    label: "Linen Texture",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" x1="0" x2="1"><stop stop-color="#e7dec9"/><stop offset="1" stop-color="#b8a990"/></linearGradient><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 5h10M5 0v10" stroke="#78350f" stroke-opacity=".055"/></pattern></defs><rect width="320" height="180" fill="url(#bg)"/><rect width="320" height="180" fill="url(#p)"><animateTransform attributeName="transform" type="translate" values="0 0;10 0;0 0" dur="22s" repeatCount="indefinite"/></rect><circle cx="76" cy="42" r="74" fill="#fff7ed" opacity=".18"/></svg>`),
  },
  {
    label: "Radiant Cross",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="r" cx=".5" cy=".45" r=".75"><stop stop-color="#fde68a" stop-opacity=".38"/><stop offset=".35" stop-color="#6A34DE" stop-opacity=".18"/><stop offset="1" stop-color="#020617" stop-opacity="1"/></radialGradient></defs><rect width="320" height="180" fill="url(#r)"/><g opacity=".2"><rect x="151" y="36" width="18" height="106" rx="9" fill="#f8fafc"><animate attributeName="opacity" values=".14;.28;.14" dur="8s" repeatCount="indefinite"/></rect><rect x="108" y="78" width="104" height="18" rx="9" fill="#f8fafc"><animate attributeName="opacity" values=".1;.24;.1" dur="8s" repeatCount="indefinite"/></rect></g><path d="M0 148C64 124 118 154 178 132S256 112 320 124" fill="none" stroke="#f8fafc" stroke-opacity=".06" stroke-width="16"/></svg>`),
  },
  {
    label: "Marble Smoke",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" x1="0" x2="1"><stop stop-color="#111827"/><stop offset="1" stop-color="#374151"/></linearGradient><filter id="smoke"><feTurbulence type="fractalNoise" baseFrequency=".012 .04" numOctaves="3" seed="7"><animate attributeName="baseFrequency" values=".012 .04;.018 .03;.012 .04" dur="16s" repeatCount="indefinite"/></feTurbulence><feColorMatrix type="matrix" values="1 0 0 0 0.7 0 1 0 0 0.8 0 0 1 0 1 0 0 0 .28 0"/></filter></defs><rect width="320" height="180" fill="url(#bg)"/><rect width="320" height="180" filter="url(#smoke)" opacity=".5"/></svg>`),
  },
  {
    label: "Sapphire Particles",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="bg" cx=".5" cy=".5" r=".8"><stop stop-color="#6A34DE"/><stop offset=".58" stop-color="#0f172a"/><stop offset="1" stop-color="#020617"/></radialGradient></defs><rect width="320" height="180" fill="url(#bg)"/><g fill="#c4b5fd" opacity=".42"><circle cx="56" cy="120" r="2"><animate attributeName="cy" values="130;50;130" dur="11s" repeatCount="indefinite"/></circle><circle cx="116" cy="148" r="1.4"><animate attributeName="cy" values="150;62;150" dur="9s" repeatCount="indefinite"/></circle><circle cx="202" cy="132" r="2.2"><animate attributeName="cy" values="140;46;140" dur="12s" repeatCount="indefinite"/></circle><circle cx="268" cy="118" r="1.6"><animate attributeName="cy" values="126;38;126" dur="10s" repeatCount="indefinite"/></circle></g></svg>`),
  },
  {
    label: "Amber Field",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" y1="0" y2="1"><stop stop-color="#1c1917"/><stop offset=".72" stop-color="#713f12"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs><rect width="320" height="180" fill="url(#bg)"/><g stroke="#fde68a" stroke-opacity=".16" stroke-width="2" stroke-linecap="round"><path d="M40 180C42 130 58 98 74 62"><animate attributeName="d" values="M40 180C42 130 58 98 74 62;M40 180C52 130 50 100 70 62;M40 180C42 130 58 98 74 62" dur="9s" repeatCount="indefinite"/></path><path d="M124 180C126 126 150 96 160 50"><animate attributeName="d" values="M124 180C126 126 150 96 160 50;M124 180C136 126 140 98 154 50;M124 180C126 126 150 96 160 50" dur="10s" repeatCount="indefinite"/></path><path d="M240 180C238 132 264 94 276 58"><animate attributeName="d" values="M240 180C238 132 264 94 276 58;M240 180C252 132 254 96 272 58;M240 180C238 132 264 94 276 58" dur="11s" repeatCount="indefinite"/></path></g></svg>`),
  },
  {
    label: "Rose Window",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="bg" cx=".5" cy=".5" r=".72"><stop stop-color="#3b0764"/><stop offset=".58" stop-color="#111827"/><stop offset="1" stop-color="#020617"/></radialGradient></defs><rect width="320" height="180" fill="url(#bg)"/><g transform="translate(160 90)" opacity=".24"><g fill="none" stroke="#f0abfc" stroke-width="2"><circle r="58"/><path d="M0-58C28-32 28 32 0 58C-28 32-28-32 0-58Z"/><path d="M-58 0C-32-28 32-28 58 0C32 28-32 28-58 0Z"/><path d="M-41-41C-4-52 52-4 41 41C4 52-52 4-41-41Z"/></g><animateTransform attributeName="transform" type="rotate" from="0 160 90" to="360 160 90" dur="80s" repeatCount="indefinite"/></g></svg>`),
  },
  {
    label: "Holy Fire",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="bg" cx=".5" cy=".9" r=".9"><stop stop-color="#ea580c"/><stop offset=".4" stop-color="#7f1d1d"/><stop offset="1" stop-color="#080808"/></radialGradient><linearGradient id="flame" y1="1" y2="0"><stop stop-color="#f97316" stop-opacity=".4"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></linearGradient></defs><rect width="320" height="180" fill="url(#bg)"/><path d="M70 180C82 122 106 120 108 72C136 112 130 130 160 180Z" fill="url(#flame)"><animate attributeName="d" values="M70 180C82 122 106 120 108 72C136 112 130 130 160 180Z;M76 180C92 128 100 108 118 72C126 120 148 132 160 180Z;M70 180C82 122 106 120 108 72C136 112 130 130 160 180Z" dur="6s" repeatCount="indefinite"/></path><path d="M150 180C174 120 202 126 210 58C242 112 246 142 270 180Z" fill="url(#flame)" opacity=".75"><animate attributeName="d" values="M150 180C174 120 202 126 210 58C242 112 246 142 270 180Z;M154 180C184 126 196 110 220 58C234 122 252 136 270 180Z;M150 180C174 120 202 126 210 58C242 112 246 142 270 180Z" dur="7s" repeatCount="indefinite"/></path></svg>`),
  },
  {
    label: "Quiet Clouds",
    src: makeSvgBackground(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" y1="0" y2="1"><stop stop-color="#ede9fe"/><stop offset="1" stop-color="#94a3b8"/></linearGradient><filter id="blur"><feGaussianBlur stdDeviation="10"/></filter></defs><rect width="320" height="180" fill="url(#bg)"/><g filter="url(#blur)" fill="#ffffff" opacity=".42"><ellipse cx="70" cy="70" rx="58" ry="20"><animate attributeName="cx" values="50;92;50" dur="18s" repeatCount="indefinite"/></ellipse><ellipse cx="210" cy="110" rx="82" ry="26"><animate attributeName="cx" values="190;236;190" dur="22s" repeatCount="indefinite"/></ellipse><ellipse cx="280" cy="54" rx="54" ry="18"><animate attributeName="cx" values="260;300;260" dur="20s" repeatCount="indefinite"/></ellipse></g><rect width="320" height="180" fill="#0f172a" opacity=".18"/></svg>`),
  },
];
