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
  { graphicId: "ticker-fresh", name: "Fresh", accentColor: "#6366F1", description: "Clean modern ticker with rounded badge heading and smooth scroll", sortOrder: 0 },
  { graphicId: "ticker-fitness", name: "Fitness", accentColor: "#EF4444", description: "High-energy ticker with bold gradient bar", sortOrder: 1 },
  { graphicId: "ticker-daily-burn", name: "Daily Burn", accentColor: "#F59E0B", description: "Sleek dark ticker with amber accent and sharp edges", sortOrder: 2 },
  { graphicId: "ticker-minimal", name: "Minimal", accentColor: "#10B981", description: "Ultra-clean white ticker with subtle accent line", sortOrder: 3 },
  { graphicId: "ticker-glass", name: "Glass", accentColor: "#8B5CF6", description: "Frosted glass translucent bar with blur backdrop effect", sortOrder: 4 },
  { graphicId: "ticker-rotating-logo", name: "Rotating Logo", accentColor: "#1D4ED8", description: "Church logo rotates in, the line opens, then text scrolls", sortOrder: 5 },
  { graphicId: "ticker-bottom", name: "Bottom Ticker", accentColor: "#2F4D8A", description: "Bottom ticker-style footer for website and contact details.", sortOrder: 6 },
  { graphicId: "ticker-newsline", name: "Stylish Newsline", accentColor: "#DC2626", description: "Broadcast-inspired but church-safe update ticker.", sortOrder: 7 },
  { graphicId: "ticker-social-footer", name: "Social Footer Banner", accentColor: "#1D4ED8", description: "Full-width social banner with animated ticker motion for social handles.", sortOrder: 8 },
];
