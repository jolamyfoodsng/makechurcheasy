export interface TickerTheme {
  id: string;
  name: string;
  description: string;
  accentColor: string;
  badge: string;
  tickerText: string;
  speed: string;
  html: string;
  css: string;
  fontImports: string[];
  /** Colours the theme ships with. Only used to pre-fill the colour picker; never applied to the output. */
  colors?: Partial<Record<"accent" | "accentText" | "barBg" | "barText" | "separator", string>>;
  variables: Array<{
    key: string;
    label: string;
    type: string;
    defaultValue: string;
    placeholder: string;
    required?: boolean;
    group: string;
  }>;
}

export const defaultTickerThemes: TickerTheme[] = [
  {
    id: "ticker-bottom",
    name: "Bottom Ticker",
    description: "Bottom ticker-style footer for website and contact details.",
    accentColor: "#2F4D8A",
    colors: { accent: "#2F4D8A", accentText: "#FFFFFF", barBg: "#FFFFFF", barText: "#1F2A38" },
    badge: "Church News",
    tickerText:
      "Prayer Meeting Tuesday 6:30 PM \u2022 Youth Night Friday 7:00 PM \u2022 New Members Class starts next Sunday \u2022",
    speed: "24s",
    html: `<div class="lt pos-full-bottom in-up" data-state="{{state}}">
  <div class="ticker-shell" style="--bg:#FFFFFF;--fg:#1F2A38;--accent:#2F4D8A;--bd:rgba(47,77,138,.22);--tagFg:#fff;">
    <div class="ticker-badge">{{badge}}</div>
    <div class="ticker-track">
      <div class="ticker-move" style="--speed:{{speed}};">
        <span>{{tickerText}}</span>
        <span>{{tickerText}}</span>
      </div>
    </div>
  </div>
</div>`,
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Montserrat", sans-serif; }

@keyframes tickerMove {
  0% { transform: translateX(0%); }
  100% { transform: translateX(-50%); }
}

.ticker-shell {
  width: min(1880px, calc(100vw - 24px));
  margin: 0 auto 10px;
  height: 56px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg, #111);
  border: 1px solid var(--bd, rgba(255,255,255,.14));
  box-shadow: 0 10px 26px rgba(0,0,0,.35);
  display: flex;
  align-items: stretch;
}

.ticker-badge {
  background: var(--accent, #4a6bcb);
  color: var(--tagFg, #fff);
  min-width: 142px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .09em;
}

.ticker-track {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.ticker-move {
  display: inline-flex;
  white-space: nowrap;
  gap: 48px;
  padding-left: 28px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: .01em;
  animation: tickerMove var(--speed, 20s) linear infinite;
}`,
    fontImports: [
      "/fonts/google/google-fonts.css",
    ],
    variables: [
      {
        key: "badge",
        label: "Badge",
        type: "text",
        defaultValue: "Church News",
        placeholder: "e.g. Updates",
        group: "Header",
      },
      {
        key: "tickerText",
        label: "Ticker Text",
        type: "text",
        defaultValue:
          "Prayer Meeting Tuesday 6:30 PM \u2022 Youth Night Friday 7:00 PM \u2022 New Members Class starts next Sunday \u2022",
        placeholder: "Enter ticker text",
        required: true,
        group: "Content",
      },
    ],
  },
  {
    id: "ticker-social-footer",
    name: "Social Footer Banner",
    description: "Full-width social banner with animated ticker motion for church social media handles.",
    accentColor: "#1D4ED8",
    badge: "Follow Us",
    tickerText: "",
    speed: "20s",
    html: `<div class="s5 s5-pos-full" data-state="{{state}}">
  <div class="s5-panel s5-enter s5-banner" data-state="{{state}}" style="--speed:{{speed}};">
    <span class="s5-label"><i class="fas fa-share-nodes" aria-hidden="true"></i>{{label}}</span>
    <div class="s5-track" data-state="{{state}}">
      <div class="s5-move" data-state="{{state}}">
        <span class="s5-facebook"><i class="fab fa-facebook-f" aria-hidden="true"></i> {{facebook}}</span>
        <span class="s5-twitter"><i class="fab fa-x-twitter" aria-hidden="true"></i> {{xHandle}}</span>
        <span class="s5-instagram"><i class="fab fa-instagram" aria-hidden="true"></i> {{instagram}}</span>
        <span class="s5-youtube"><i class="fab fa-youtube" aria-hidden="true"></i> {{youtube}}</span>
        <span class="s5-facebook"><i class="fab fa-facebook-f" aria-hidden="true"></i> {{facebook}}</span>
        <span class="s5-twitter"><i class="fab fa-x-twitter" aria-hidden="true"></i> {{xHandle}}</span>
        <span class="s5-instagram"><i class="fab fa-instagram" aria-hidden="true"></i> {{instagram}}</span>
        <span class="s5-youtube"><i class="fab fa-youtube" aria-hidden="true"></i> {{youtube}}</span>
      </div>
    </div>
  </div>
</div>`,
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Montserrat", sans-serif; }

@keyframes s5Ticker {
  0% { transform: translateX(0%); }
  100% { transform: translateX(-50%); }
}

.s5 {
  position: fixed;
  z-index: 70;
  pointer-events: none;
  color: #0f172a;
}

.s5-pos-full { left: 0; right: 0; bottom: 0; }

.s5-panel {
  border: 1px solid rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.96);
  border-radius: 14px;
  box-shadow: 0 12px 38px rgba(0,0,0,.24);
}

.s5-banner {
  width: min(1880px, calc(100vw - 10px));
  margin: 0 auto 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 12px;
  padding: 9px 10px;
}

.s5-label {
  border-radius: 999px;
  background: #1d4ed8;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: .11em;
  font-size: 11px;
  font-weight: 800;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.s5-track {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.s5-move {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  gap: 22px;
  padding-left: 18px;
  animation: s5Ticker var(--speed, 20s) linear infinite;
}

.s5-move span {
  font-size: clamp(17px, 1.25vw, 28px);
  font-weight: 700;
  color: #0f172a;
}

.s5-facebook i { color: #1877F2; }
.s5-twitter i { color: #111827; }
.s5-instagram i { color: #E1306C; }
.s5-youtube i { color: #FF0000; }`,
    fontImports: [
      "/fonts/google/google-fonts.css",
      "/fonts/fontawesome/all.min.css",
    ],
    variables: [
      {
        key: "label",
        label: "Label",
        type: "text",
        defaultValue: "Follow Us",
        placeholder: "Label text",
        group: "Header",
      },
      {
        key: "facebook",
        label: "Facebook",
        type: "text",
        defaultValue: "@YourChurchExample",
        placeholder: "Facebook handle",
        group: "Content",
      },
      {
        key: "xHandle",
        label: "X / Twitter",
        type: "text",
        defaultValue: "@YourChurchExample",
        placeholder: "X/Twitter handle",
        group: "Content",
      },
      {
        key: "instagram",
        label: "Instagram",
        type: "text",
        defaultValue: "@YourChurchExample",
        placeholder: "Instagram handle",
        group: "Content",
      },
      {
        key: "youtube",
        label: "YouTube",
        type: "text",
        defaultValue: "@YourChurchExample",
        placeholder: "YouTube handle",
        group: "Content",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Pill tickers — rounded gradient bar + pill heading (the "Sunrise" style).
// Class names match what the Dock understands (.ticker-shell, .ticker-badge,
// .ticker-move, .pos-full-bottom) so colours, speed, spacing and Top/Bottom work.
// ---------------------------------------------------------------------------

interface PillTickerOptions {
  id: string;
  name: string;
  description: string;
  accentColor: string;
  badge: string;
  tickerText: string;
  font: string;
  badgeFont?: string;
  shellBg: string;
  shellText: string;
  shellBorder?: string;
  badgeBg: string;
  badgeText: string;
  glow: string;
  extraCss?: string;
  badgeDot?: boolean;
}

/** First hex colour in a CSS value (so gradients show a representative swatch in the colour picker). */
function firstCssColor(value: string): string | undefined {
  return value.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i)?.[0];
}

function pillTicker(o: PillTickerOptions): TickerTheme {
  const dot = o.badgeDot ? '<span class="pill-dot"></span>' : "";
  return {
    id: o.id,
    name: o.name,
    description: o.description,
    accentColor: o.accentColor,
    colors: {
      accent: firstCssColor(o.badgeBg),
      accentText: firstCssColor(o.badgeText),
      barBg: firstCssColor(o.shellBg),
      barText: firstCssColor(o.shellText),
    },
    badge: o.badge,
    tickerText: o.tickerText,
    speed: "26s",
    html: `<div class="lt pos-full-bottom" data-state="{{state}}">
  <div class="ticker-shell">
    <div class="ticker-badge">${dot}<span>{{badge}}</span></div>
    <div class="ticker-track">
      <div class="ticker-move" style="--speed:{{speed}};">
        <span>{{tickerText}}</span>
        <span>{{tickerText}}</span>
      </div>
    </div>
  </div>
</div>`,
    css: `
body { font-family: ${o.font}; }
@keyframes tickerMove { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes tickerIn { from { transform: translateY(120%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes pillGlow { 0%, 100% { box-shadow: 0 0 0 0 ${o.glow}; } 50% { box-shadow: 0 0 0 8px transparent; } }
@keyframes pillDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.7); } }
@keyframes pillShine { from { transform: translateX(-120%); } to { transform: translateX(320%); } }
.pos-full-bottom { position: fixed; left: 0; right: 0; bottom: 0; padding: 0 24px 18px; }
.pos-full-bottom[data-state="in"] .ticker-shell { animation: tickerIn .6s cubic-bezier(.2,.8,.2,1) both; }
.pos-full-bottom[data-state="out"] .ticker-shell { animation: tickerIn .4s ease-in reverse both; }
.ticker-shell {
  position: relative; height: 64px; display: flex; align-items: center; gap: 18px; padding: 0 10px;
  border-radius: 999px; overflow: hidden; color: ${o.shellText}; background: ${o.shellBg};
  border: ${o.shellBorder ?? "0"}; box-shadow: 0 14px 32px rgba(0,0,0,.35);
}
.ticker-badge {
  flex: none; height: 46px; padding: 0 22px; display: flex; align-items: center; gap: 10px;
  border-radius: 999px; background: ${o.badgeBg}; color: ${o.badgeText};
  font-family: ${o.badgeFont ?? o.font}; font-size: 17px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
  animation: pillGlow 2.4s ease-in-out infinite;
}
.pill-dot { width: 10px; height: 10px; border-radius: 50%; background: currentColor; animation: pillDot 1.4s ease-in-out infinite; }
.ticker-track { flex: 1; min-width: 0; overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); }
.ticker-move { display: inline-flex; gap: 60px; white-space: nowrap; font-size: 24px; font-weight: 600; animation: tickerMove var(--speed, 26s) linear infinite; }
${o.extraCss ?? ""}`,
    fontImports: ["/fonts/google/google-fonts.css"],
    variables: [],
  };
}

const SAMPLE_TEXT =
  "Sunday Service 9:00 AM • Midweek Prayer Wednesday 6:30 PM • Youth Night Friday 7:00 PM • Welcome home";

export const pillTickerThemes: TickerTheme[] = [
  pillTicker({
    id: "ticker-sunrise",
    name: "Sunrise Pill",
    description: "Warm orange gradient bar with a cream pill heading and soft glow.",
    accentColor: "#F97316",
    badge: "This Week",
    tickerText: SAMPLE_TEXT,
    font: '"Montserrat", sans-serif',
    shellBg: "linear-gradient(90deg, #7C2D12 0%, #C2410C 45%, #F97316 100%)",
    shellText: "#FFFFFF",
    badgeBg: "#FFF7ED",
    badgeText: "#9A3412",
    glow: "rgba(249,115,22,.55)",
  }),
  pillTicker({
    id: "ticker-ocean",
    name: "Ocean Pill",
    description: "Deep navy to teal gradient with a light sweep and white pill heading.",
    accentColor: "#0EA5E9",
    badge: "Announcements",
    tickerText: SAMPLE_TEXT,
    font: '"Outfit", "Montserrat", sans-serif',
    shellBg: "linear-gradient(90deg, #0B1E3F 0%, #0E4D7A 50%, #0EA5A4 100%)",
    shellText: "#F0FDFF",
    badgeBg: "#FFFFFF",
    badgeText: "#0B4F6C",
    glow: "rgba(14,165,233,.55)",
    extraCss: `.ticker-shell::after { content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 30%; pointer-events: none;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.18), transparent); animation: pillShine 6s ease-in-out infinite; }`,
  }),
  pillTicker({
    id: "ticker-royal",
    name: "Royal Glow",
    description: "Purple to magenta gradient with a gold pill heading.",
    accentColor: "#A855F7",
    badge: "Upcoming",
    tickerText: SAMPLE_TEXT,
    font: '"Sora", "Montserrat", sans-serif',
    shellBg: "linear-gradient(90deg, #2E1065 0%, #6D28D9 50%, #C026D3 100%)",
    shellText: "#FFFFFF",
    badgeBg: "linear-gradient(135deg, #FDE68A, #F59E0B)",
    badgeText: "#3B0764",
    glow: "rgba(245,158,11,.6)",
  }),
  pillTicker({
    id: "ticker-emerald",
    name: "Emerald Live",
    description: "Fresh green gradient with a pulsing live dot in the heading.",
    accentColor: "#10B981",
    badge: "Live Now",
    tickerText: SAMPLE_TEXT,
    font: '"Work Sans", "Montserrat", sans-serif',
    shellBg: "linear-gradient(90deg, #052E16 0%, #047857 55%, #34D399 100%)",
    shellText: "#ECFDF5",
    badgeBg: "#ECFDF5",
    badgeText: "#065F46",
    glow: "rgba(16,185,129,.55)",
    badgeDot: true,
  }),
  pillTicker({
    id: "ticker-midnight-gold",
    name: "Midnight Gold",
    description: "Elegant dark bar with a thin gold border and classic serif heading.",
    accentColor: "#D4A017",
    badge: "Welcome",
    tickerText: SAMPLE_TEXT,
    font: '"Montserrat", sans-serif',
    badgeFont: '"Cinzel", serif',
    shellBg: "linear-gradient(90deg, #0A0A0F 0%, #1C1917 60%, #292524 100%)",
    shellText: "#FAF5E6",
    shellBorder: "1px solid rgba(212,160,23,.55)",
    badgeBg: "linear-gradient(135deg, #F5D77A, #B8860B)",
    badgeText: "#1C1408",
    glow: "rgba(212,160,23,.5)",
  }),
];

// Show the pill tickers first in every ticker list.
defaultTickerThemes.unshift(...pillTickerThemes);
