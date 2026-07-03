/**
 * textThemes.ts — Pre-built text theme packs for Countdown overlays
 *
 * Like Canva / ProPresenter: users pick a style name, not a font.
 * Each theme defines the complete typographic look for timer + title + subtitle.
 *
 * Categories: Modern, Elegant, Handwritten, Cinematic, Minimal, Youth
 */

// ── Type ───────────────────────────────────────────────────────────────────

export interface CountdownTextTheme {
  id: string;
  name: string;
  category: TextThemeCategory;
  /** CSS font-family value */
  fontFamily: string;
  /** Google Fonts import URL (empty if system font) */
  fontUrl?: string;
  fontWeight: number;
  /** Timer (digits) sizing */
  timerSize: number;
  timerLetterSpacing: number;
  timerColor: string;
  timerTransform: string;
  timerShadow: string;
  timerGlow?: string;
  timerStroke?: string;
  /** Title sizing */
  titleSize: number;
  titleLetterSpacing: number;
  titleTransform: string;
  titleColor: string;
  titleShadow: string;
  titleFontWeight?: number;
  titleFontFamily?: string;
  /** Subtitle sizing */
  subtitleSize: number;
  subtitleColor: string;
  subtitleLetterSpacing: number;
  subtitleTransform: string;
  subtitleFontWeight?: number;
  subtitleFontFamily?: string;
  /** Extra CSS (e.g. text-stroke, backdrop, decorative elements) */
  extraCSS?: string;
}

export type TextThemeCategory =
  | "modern"
  | "elegant"
  | "handwritten"
  | "cinematic"
  | "minimal"
  | "youth";

export const TEXT_THEME_CATEGORIES: { id: TextThemeCategory; label: string; description: string }[] = [
  { id: "modern", label: "Modern", description: "Clean, broadcast-ready typography" },
  { id: "elegant", label: "Elegant", description: "Serif and luxury styles" },
  { id: "handwritten", label: "Handwritten", description: "Script and brush styles" },
  { id: "cinematic", label: "Cinematic", description: "Movie trailer and production" },
  { id: "minimal", label: "Minimal", description: "Thin, clean, understated" },
  { id: "youth", label: "Youth", description: "Bold, energetic, neon" },
];

// ── Theme Library ──────────────────────────────────────────────────────────

export const COUNTDOWN_TEXT_THEMES: CountdownTextTheme[] = [
  // ════════════════════════════════════════════════════════════════════════════
  // MODERN
  // ════════════════════════════════════════════════════════════════════════════
  {
    id: "modern-bold",
    name: "Modern Bold",
    category: "modern",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800;900&display=swap",
    fontWeight: 800,
    timerSize: 96,
    timerLetterSpacing: -2,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 4px 20px rgba(0,0,0,0.4)",
    titleSize: 28,
    titleLetterSpacing: 2,
    titleTransform: "uppercase",
    titleColor: "#ffffff",
    titleShadow: "0 2px 10px rgba(0,0,0,0.3)",
    titleFontWeight: 700,
    subtitleSize: 16,
    subtitleColor: "rgba(255,255,255,0.6)",
    subtitleLetterSpacing: 4,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 400,
  },
  {
    id: "modern-condensed",
    name: "Modern Condensed",
    category: "modern",
    fontFamily: "'Barlow Condensed', -apple-system, sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@300;400;600;700;800&display=swap",
    fontWeight: 700,
    timerSize: 110,
    timerLetterSpacing: 4,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 4px 24px rgba(0,0,0,0.5)",
    titleSize: 32,
    titleLetterSpacing: 6,
    titleTransform: "uppercase",
    titleColor: "#ffffff",
    titleShadow: "0 2px 12px rgba(0,0,0,0.4)",
    titleFontWeight: 600,
    subtitleSize: 18,
    subtitleColor: "rgba(255,255,255,0.5)",
    subtitleLetterSpacing: 8,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 300,
  },
  {
    id: "modern-ultra",
    name: "Modern Ultra",
    category: "modern",
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800;900&display=swap",
    fontWeight: 900,
    timerSize: 120,
    timerLetterSpacing: -4,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 6px 30px rgba(0,0,0,0.6)",
    titleSize: 24,
    titleLetterSpacing: 8,
    titleTransform: "uppercase",
    titleColor: "rgba(255,255,255,0.8)",
    titleShadow: "none",
    titleFontWeight: 400,
    subtitleSize: 14,
    subtitleColor: "rgba(255,255,255,0.4)",
    subtitleLetterSpacing: 10,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 300,
  },
  {
    id: "modern-light",
    name: "Modern Light",
    category: "modern",
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800;900&display=swap",
    fontWeight: 300,
    timerSize: 88,
    timerLetterSpacing: 6,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 2px 16px rgba(0,0,0,0.3)",
    titleSize: 22,
    titleLetterSpacing: 10,
    titleTransform: "uppercase",
    titleColor: "rgba(255,255,255,0.7)",
    titleShadow: "none",
    titleFontWeight: 300,
    subtitleSize: 14,
    subtitleColor: "rgba(255,255,255,0.4)",
    subtitleLetterSpacing: 6,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 300,
  },
  {
    id: "broadcast",
    name: "Broadcast",
    category: "modern",
    fontFamily: "'Roboto Condensed', 'Arial Narrow', sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@300;400;700&display=swap",
    fontWeight: 700,
    timerSize: 80,
    timerLetterSpacing: 2,
    timerColor: "#ffffff",
    timerTransform: "uppercase",
    timerShadow: "0 2px 8px rgba(0,0,0,0.6)",
    titleSize: 24,
    titleLetterSpacing: 4,
    titleTransform: "uppercase",
    titleColor: "#ffffff",
    titleShadow: "0 2px 8px rgba(0,0,0,0.6)",
    titleFontWeight: 700,
    subtitleSize: 16,
    subtitleColor: "rgba(255,255,255,0.7)",
    subtitleLetterSpacing: 2,
    subtitleTransform: "none",
    subtitleFontWeight: 300,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // ELEGANT
  // ════════════════════════════════════════════════════════════════════════════
  {
    id: "elegant-gold",
    name: "Elegant Gold",
    category: "elegant",
    fontFamily: "'Playfair Display', 'Georgia', serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800;900&display=swap",
    fontWeight: 700,
    timerSize: 88,
    timerLetterSpacing: 4,
    timerColor: "#f5c542",
    timerTransform: "none",
    timerShadow: "0 4px 20px rgba(0,0,0,0.5)",
    titleSize: 28,
    titleLetterSpacing: 6,
    titleTransform: "uppercase",
    titleColor: "#f5c542",
    titleShadow: "0 2px 10px rgba(0,0,0,0.4)",
    titleFontWeight: 600,
    subtitleSize: 16,
    subtitleColor: "rgba(245,197,66,0.6)",
    subtitleLetterSpacing: 4,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 400,
  },
  {
    id: "luxury-serif",
    name: "Luxury Serif",
    category: "elegant",
    fontFamily: "'Cormorant Garamond', 'Georgia', serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600;700&display=swap",
    fontWeight: 300,
    timerSize: 96,
    timerLetterSpacing: 8,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 4px 24px rgba(0,0,0,0.4)",
    titleSize: 24,
    titleLetterSpacing: 12,
    titleTransform: "uppercase",
    titleColor: "rgba(255,255,255,0.8)",
    titleShadow: "none",
    titleFontWeight: 400,
    subtitleSize: 14,
    subtitleColor: "rgba(255,255,255,0.5)",
    subtitleLetterSpacing: 6,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 300,
  },
  {
    id: "classic-worship",
    name: "Classic Worship",
    category: "elegant",
    fontFamily: "'Libre Baskerville', 'Georgia', serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap",
    fontWeight: 400,
    timerSize: 80,
    timerLetterSpacing: 2,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 3px 16px rgba(0,0,0,0.4)",
    titleSize: 26,
    titleLetterSpacing: 4,
    titleTransform: "none",
    titleColor: "#ffffff",
    titleShadow: "0 2px 10px rgba(0,0,0,0.3)",
    titleFontWeight: 700,
    subtitleSize: 16,
    subtitleColor: "rgba(255,255,255,0.55)",
    subtitleLetterSpacing: 2,
    subtitleTransform: "none",
    subtitleFontWeight: 400,
  },
  {
    id: "conference-premium",
    name: "Conference Premium",
    category: "elegant",
    fontFamily: "'Cinzel', 'Georgia', serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&display=swap",
    fontWeight: 600,
    timerSize: 84,
    timerLetterSpacing: 6,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 4px 20px rgba(0,0,0,0.5)",
    titleSize: 26,
    titleLetterSpacing: 10,
    titleTransform: "uppercase",
    titleColor: "#ffffff",
    titleShadow: "0 2px 12px rgba(0,0,0,0.4)",
    titleFontWeight: 600,
    subtitleSize: 14,
    subtitleColor: "rgba(255,255,255,0.5)",
    subtitleLetterSpacing: 6,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 400,
  },
  {
    id: "royal",
    name: "Royal",
    category: "elegant",
    fontFamily: "'EB Garamond', 'Georgia', serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700;800&display=swap",
    fontWeight: 500,
    timerSize: 92,
    timerLetterSpacing: 4,
    timerColor: "#e8d5a3",
    timerTransform: "none",
    timerShadow: "0 4px 24px rgba(0,0,0,0.5)",
    titleSize: 28,
    titleLetterSpacing: 8,
    titleTransform: "uppercase",
    titleColor: "#e8d5a3",
    titleShadow: "0 2px 12px rgba(0,0,0,0.4)",
    titleFontWeight: 400,
    subtitleSize: 16,
    subtitleColor: "rgba(232,213,163,0.5)",
    subtitleLetterSpacing: 6,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 400,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // HANDWRITTEN
  // ════════════════════════════════════════════════════════════════════════════
  {
    id: "handwritten-light",
    name: "Handwritten Light",
    category: "handwritten",
    fontFamily: "'Caveat', cursive",
    fontUrl: "https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=swap",
    fontWeight: 400,
    timerSize: 80,
    timerLetterSpacing: 2,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 2px 12px rgba(0,0,0,0.3)",
    titleSize: 32,
    titleLetterSpacing: 0,
    titleTransform: "none",
    titleColor: "#ffffff",
    titleShadow: "0 2px 10px rgba(0,0,0,0.3)",
    titleFontWeight: 400,
    subtitleSize: 20,
    subtitleColor: "rgba(255,255,255,0.6)",
    subtitleLetterSpacing: 0,
    subtitleTransform: "none",
    subtitleFontWeight: 400,
  },
  {
    id: "worship-script",
    name: "Worship Script",
    category: "handwritten",
    fontFamily: "'Dancing Script', cursive",
    fontUrl: "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap",
    fontWeight: 700,
    timerSize: 72,
    timerLetterSpacing: 2,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 3px 16px rgba(0,0,0,0.4)",
    titleSize: 36,
    titleLetterSpacing: 0,
    titleTransform: "none",
    titleColor: "#ffffff",
    titleShadow: "0 2px 12px rgba(0,0,0,0.3)",
    titleFontWeight: 700,
    subtitleSize: 22,
    subtitleColor: "rgba(255,255,255,0.55)",
    subtitleLetterSpacing: 0,
    subtitleTransform: "none",
    subtitleFontWeight: 400,
  },
  {
    id: "brush-script",
    name: "Brush Script",
    category: "handwritten",
    fontFamily: "'Satisfy', cursive",
    fontUrl: "https://fonts.googleapis.com/css2?family=Satisfy&display=swap",
    fontWeight: 400,
    timerSize: 76,
    timerLetterSpacing: 2,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 3px 18px rgba(0,0,0,0.4)",
    titleSize: 34,
    titleLetterSpacing: 0,
    titleTransform: "none",
    titleColor: "#ffffff",
    titleShadow: "0 2px 10px rgba(0,0,0,0.3)",
    titleFontWeight: 400,
    subtitleSize: 20,
    subtitleColor: "rgba(255,255,255,0.5)",
    subtitleLetterSpacing: 0,
    subtitleTransform: "none",
    subtitleFontWeight: 400,
  },
  {
    id: "signature",
    name: "Signature",
    category: "handwritten",
    fontFamily: "'Great Vibes', cursive",
    fontUrl: "https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap",
    fontWeight: 400,
    timerSize: 80,
    timerLetterSpacing: 2,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 4px 20px rgba(0,0,0,0.4)",
    titleSize: 40,
    titleLetterSpacing: 0,
    titleTransform: "none",
    titleColor: "#ffffff",
    titleShadow: "0 2px 12px rgba(0,0,0,0.3)",
    titleFontWeight: 400,
    subtitleSize: 22,
    subtitleColor: "rgba(255,255,255,0.5)",
    subtitleLetterSpacing: 0,
    subtitleTransform: "none",
    subtitleFontWeight: 400,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // CINEMATIC
  // ════════════════════════════════════════════════════════════════════════════
  {
    id: "movie-title",
    name: "Movie Title",
    category: "cinematic",
    fontFamily: "'Oswald', 'Impact', sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap",
    fontWeight: 600,
    timerSize: 100,
    timerLetterSpacing: 8,
    timerColor: "#ffffff",
    timerTransform: "uppercase",
    timerShadow: "0 4px 24px rgba(0,0,0,0.6)",
    titleSize: 28,
    titleLetterSpacing: 14,
    titleTransform: "uppercase",
    titleColor: "#ffffff",
    titleShadow: "0 2px 12px rgba(0,0,0,0.5)",
    titleFontWeight: 500,
    subtitleSize: 16,
    subtitleColor: "rgba(255,255,255,0.5)",
    subtitleLetterSpacing: 8,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 300,
  },
  {
    id: "documentary",
    name: "Documentary",
    category: "cinematic",
    fontFamily: "'Source Sans 3', 'Helvetica Neue', sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;600;700&display=swap",
    fontWeight: 300,
    timerSize: 84,
    timerLetterSpacing: 4,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 3px 18px rgba(0,0,0,0.5)",
    titleSize: 22,
    titleLetterSpacing: 6,
    titleTransform: "uppercase",
    titleColor: "rgba(255,255,255,0.8)",
    titleShadow: "none",
    titleFontWeight: 400,
    subtitleSize: 14,
    subtitleColor: "rgba(255,255,255,0.4)",
    subtitleLetterSpacing: 4,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 300,
  },
  {
    id: "epic-countdown",
    name: "Epic Countdown",
    category: "cinematic",
    fontFamily: "'Bebas Neue', 'Impact', sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap",
    fontWeight: 400,
    timerSize: 130,
    timerLetterSpacing: 6,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 6px 30px rgba(0,0,0,0.6)",
    titleSize: 32,
    titleLetterSpacing: 10,
    titleTransform: "uppercase",
    titleColor: "#ffffff",
    titleShadow: "0 3px 16px rgba(0,0,0,0.5)",
    titleFontWeight: 400,
    subtitleSize: 18,
    subtitleColor: "rgba(255,255,255,0.5)",
    subtitleLetterSpacing: 6,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 400,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // MINIMAL
  // ════════════════════════════════════════════════════════════════════════════
  {
    id: "minimal-thin",
    name: "Minimal Thin",
    category: "minimal",
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400&display=swap",
    fontWeight: 100,
    timerSize: 72,
    timerLetterSpacing: 12,
    timerColor: "rgba(255,255,255,0.9)",
    timerTransform: "none",
    timerShadow: "none",
    titleSize: 18,
    titleLetterSpacing: 10,
    titleTransform: "uppercase",
    titleColor: "rgba(255,255,255,0.5)",
    titleShadow: "none",
    titleFontWeight: 200,
    subtitleSize: 12,
    subtitleColor: "rgba(255,255,255,0.3)",
    subtitleLetterSpacing: 6,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 200,
  },
  {
    id: "minimal-clean",
    name: "Minimal Clean",
    category: "minimal",
    fontFamily: "'Work Sans', -apple-system, sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Work+Sans:wght@200;300;400;500&display=swap",
    fontWeight: 200,
    timerSize: 80,
    timerLetterSpacing: 6,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "none",
    titleSize: 20,
    titleLetterSpacing: 8,
    titleTransform: "uppercase",
    titleColor: "rgba(255,255,255,0.6)",
    titleShadow: "none",
    titleFontWeight: 300,
    subtitleSize: 13,
    subtitleColor: "rgba(255,255,255,0.35)",
    subtitleLetterSpacing: 4,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 300,
  },
  {
    id: "scandinavian",
    name: "Scandinavian",
    category: "minimal",
    fontFamily: "'Karla', -apple-system, sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Karla:wght@200;300;400;500&display=swap",
    fontWeight: 300,
    timerSize: 76,
    timerLetterSpacing: 4,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "none",
    titleSize: 18,
    titleLetterSpacing: 6,
    titleTransform: "uppercase",
    titleColor: "rgba(255,255,255,0.55)",
    titleShadow: "none",
    titleFontWeight: 400,
    subtitleSize: 12,
    subtitleColor: "rgba(255,255,255,0.3)",
    subtitleLetterSpacing: 4,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 300,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // YOUTH
  // ════════════════════════════════════════════════════════════════════════════
  {
    id: "neon",
    name: "Neon",
    category: "youth",
    fontFamily: "'Orbitron', 'Share Tech Mono', monospace",
    fontUrl: "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&display=swap",
    fontWeight: 700,
    timerSize: 88,
    timerLetterSpacing: 4,
    timerColor: "#00ff88",
    timerTransform: "none",
    timerShadow: "0 0 20px rgba(0,255,136,0.5), 0 0 40px rgba(0,255,136,0.2)",
    titleSize: 24,
    titleLetterSpacing: 8,
    titleTransform: "uppercase",
    titleColor: "#00ff88",
    titleShadow: "0 0 15px rgba(0,255,136,0.4)",
    titleFontWeight: 600,
    subtitleSize: 14,
    subtitleColor: "rgba(0,255,136,0.5)",
    subtitleLetterSpacing: 6,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 400,
  },
  {
    id: "youth-dynamic",
    name: "Youth Dynamic",
    category: "youth",
    fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&display=swap",
    fontWeight: 700,
    timerSize: 96,
    timerLetterSpacing: 2,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 4px 20px rgba(0,0,0,0.5)",
    titleSize: 28,
    titleLetterSpacing: 6,
    titleTransform: "uppercase",
    titleColor: "#ffffff",
    titleShadow: "0 2px 12px rgba(0,0,0,0.4)",
    titleFontWeight: 600,
    subtitleSize: 16,
    subtitleColor: "rgba(255,255,255,0.5)",
    subtitleLetterSpacing: 4,
    subtitleTransform: "uppercase",
    subtitleFontWeight: 500,
  },
  {
    id: "creator",
    name: "Creator",
    category: "youth",
    fontFamily: "'Space Grotesk', -apple-system, sans-serif",
    fontUrl: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap",
    fontWeight: 500,
    timerSize: 84,
    timerLetterSpacing: 0,
    timerColor: "#ffffff",
    timerTransform: "none",
    timerShadow: "0 3px 16px rgba(0,0,0,0.4)",
    titleSize: 22,
    titleLetterSpacing: 2,
    titleTransform: "none",
    titleColor: "#ffffff",
    titleShadow: "0 2px 8px rgba(0,0,0,0.3)",
    titleFontWeight: 500,
    subtitleSize: 14,
    subtitleColor: "rgba(255,255,255,0.5)",
    subtitleLetterSpacing: 2,
    subtitleTransform: "none",
    subtitleFontWeight: 400,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

const _loadedFonts = new Set<string>();

/** Inject Google Fonts for a theme (idempotent — only loads once per font URL) */
export function loadTextThemeFont(theme: CountdownTextTheme): void {
  if (!theme.fontUrl) return;
  if (_loadedFonts.has(theme.fontUrl)) return;
  _loadedFonts.add(theme.fontUrl);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = theme.fontUrl;
  document.head.appendChild(link);
}

/** Preload fonts for multiple themes (called when picker opens) */
export function preloadTextThemeFonts(themes: CountdownTextTheme[]): void {
  themes.forEach(loadTextThemeFont);
}

/** Get a theme by ID */
export function getTextTheme(id: string): CountdownTextTheme | undefined {
  return COUNTDOWN_TEXT_THEMES.find((t) => t.id === id);
}

/** Get all themes in a category */
export function getTextThemesByCategory(category: TextThemeCategory): CountdownTextTheme[] {
  return COUNTDOWN_TEXT_THEMES.filter((t) => t.category === category);
}

/** Apply a text theme to a CountdownConfig's text settings (returns new text object) */
export function applyTextTheme(
  theme: CountdownTextTheme,
  currentText: { fontFamily: string; fontWeight: number; fontSize: number; letterSpacing: number; lineHeight: number; color: string; shadowEnabled: boolean; shadowColor: string; shadowBlur: number; shadowOffsetX: number; shadowOffsetY: number; title: string; subtitle: string },
): {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  color: string;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  title: string;
  subtitle: string;
} {
  // Parse shadow from theme
  const shadowMatch = theme.timerShadow.match(/rgba?\([^)]+\)/);
  const shadowColor = shadowMatch ? shadowMatch[0] : "rgba(0,0,0,0.4)";
  const hasShadow = theme.timerShadow !== "none" && theme.timerShadow !== "";

  return {
    ...currentText,
    fontFamily: theme.fontFamily,
    fontWeight: theme.fontWeight,
    fontSize: theme.timerSize,
    letterSpacing: theme.timerLetterSpacing,
    color: theme.timerColor,
    shadowEnabled: hasShadow,
    shadowColor,
    shadowBlur: hasShadow ? 16 : 0,
    shadowOffsetX: 0,
    shadowOffsetY: 4,
  };
}
