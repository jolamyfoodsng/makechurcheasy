/**
 * builtinBroadcastTickers.ts — the tickers bundled with the desktop app.
 *
 * Mirrors desktop/src/components/modules/tickerThemes.ts (TICKER_THEMES) and
 * desktop/src/data/tickerThemes.ts (defaultTickerThemes). The admin portal lists these
 * next to uploaded ticker packages so each one can be paused, hidden or limited to a plan.
 * Add a line here when a ticker is added to the app.
 */
export interface BuiltinBroadcastTicker {
  graphicId: string;
  name: string;
  accentColor: string;
  description: string;
  sortOrder: number;
}

export const BUILTIN_BROADCAST_TICKERS: BuiltinBroadcastTicker[] = [
  { graphicId: "ticker-sunrise", name: "Sunrise Pill", accentColor: "#F97316", description: "Warm orange gradient bar with a cream pill heading and soft glow.", sortOrder: 0 },
  { graphicId: "ticker-ocean", name: "Ocean Pill", accentColor: "#0EA5E9", description: "Deep navy to teal gradient with a light sweep and white pill heading.", sortOrder: 1 },
  { graphicId: "ticker-royal", name: "Royal Glow", accentColor: "#A855F7", description: "Purple to magenta gradient with a gold pill heading.", sortOrder: 2 },
  { graphicId: "ticker-emerald", name: "Emerald Live", accentColor: "#10B981", description: "Fresh green gradient with a pulsing live dot in the heading.", sortOrder: 3 },
  { graphicId: "ticker-midnight-gold", name: "Midnight Gold", accentColor: "#D4A017", description: "Elegant dark bar with a thin gold border and classic serif heading.", sortOrder: 4 },
  { graphicId: "ticker-fresh", name: "Fresh", accentColor: "#6366F1", description: "Clean modern ticker with rounded badge heading and smooth scroll", sortOrder: 5 },
  { graphicId: "ticker-minimal", name: "Minimal", accentColor: "#10B981", description: "Ultra-clean white ticker with subtle accent line", sortOrder: 6 },
  { graphicId: "ticker-glass", name: "Glass", accentColor: "#8B5CF6", description: "Frosted glass translucent bar with blur backdrop effect", sortOrder: 7 },
  { graphicId: "ticker-rotating-logo", name: "Rotating Logo", accentColor: "#1D4ED8", description: "Church logo rotates in, the line opens, then text scrolls", sortOrder: 8 },
  { graphicId: "ticker-bottom", name: "Bottom Ticker", accentColor: "#2F4D8A", description: "Bottom ticker-style footer for website and contact details.", sortOrder: 9 },
  { graphicId: "ticker-social-footer", name: "Social Footer Banner", accentColor: "#1D4ED8", description: "Full-width social banner with animated ticker motion for social handles.", sortOrder: 10 },
];
