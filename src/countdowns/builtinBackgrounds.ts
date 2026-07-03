/**
 * builtinBackgrounds.ts — Built-in background catalog for countdowns
 *
 * Ships with placeholder gradient thumbnails per category.
 * Real stock images can be added later or downloaded from a CDN.
 * The `premium` field allows future gating of premium packs.
 */

import type { BackgroundType } from "./types";

export interface BuiltinBackground {
  id: string;
  category: string;
  label: string;
  /** CSS gradient or color used as a visual placeholder thumbnail */
  thumbnail: string;
  /** The actual background source — CSS gradient value for solid/gradient types */
  source: string;
  type: BackgroundType;
  premium: boolean;
}

export interface BuiltinCategory {
  id: string;
  label: string;
  icon: string;
}

// ── Categories ─────────────────────────────────────────────────────────────

export const BUILTIN_CATEGORIES: BuiltinCategory[] = [
  { id: "nature", label: "Nature", icon: "🌿" },
  { id: "worship", label: "Worship", icon: "🎵" },
  { id: "mountains", label: "Mountains", icon: "⛰️" },
  { id: "clouds", label: "Clouds", icon: "☁️" },
  { id: "abstract", label: "Abstract", icon: "🎨" },
  { id: "light-rays", label: "Light Rays", icon: "✨" },
  { id: "church", label: "Church", icon: "⛪" },
  { id: "conference", label: "Conference", icon: "🎤" },
  { id: "prayer", label: "Prayer", icon: "🙏" },
  { id: "christmas", label: "Christmas", icon: "🎄" },
  { id: "easter", label: "Easter", icon: "🐣" },
  { id: "youth", label: "Youth", icon: "🔥" },
];

// ── Built-in backgrounds ───────────────────────────────────────────────────

export const BUILTIN_BACKGROUNDS: BuiltinBackground[] = [
  // ── Nature ──
  { id: "nature_01", category: "nature", label: "Forest Mist", thumbnail: "linear-gradient(135deg, #134e5e, #71b280)", source: "linear-gradient(135deg, #134e5e, #71b280)", type: "gradient", premium: false },
  { id: "nature_02", category: "nature", label: "Ocean Sunset", thumbnail: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)", source: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)", type: "gradient", premium: false },
  { id: "nature_03", category: "nature", label: "Autumn Path", thumbnail: "linear-gradient(135deg, #3e2723, #795548, #a1887f)", source: "linear-gradient(135deg, #3e2723, #795548, #a1887f)", type: "gradient", premium: false },

  // ── Worship ──
  { id: "worship_01", category: "worship", label: "Deep Praise", thumbnail: "linear-gradient(135deg, #1a0533, #4a148c, #7b1fa2)", source: "linear-gradient(135deg, #1a0533, #4a148c, #7b1fa2)", type: "gradient", premium: false },
  { id: "worship_02", category: "worship", label: "Golden Hour", thumbnail: "linear-gradient(135deg, #1a1200, #b8860b, #daa520)", source: "linear-gradient(135deg, #1a1200, #b8860b, #daa520)", type: "gradient", premium: false },
  { id: "worship_03", category: "worship", label: "Celestial", thumbnail: "linear-gradient(135deg, #0d0221, #0f084b, #26408b)", source: "linear-gradient(135deg, #0d0221, #0f084b, #26408b)", type: "gradient", premium: false },

  // ── Mountains ──
  { id: "mountains_01", category: "mountains", label: "Alpine Dusk", thumbnail: "linear-gradient(180deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)", source: "linear-gradient(180deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)", type: "gradient", premium: false },
  { id: "mountains_02", category: "mountains", label: "Summit Glow", thumbnail: "linear-gradient(180deg, #2d1b69 0%, #11998e 100%)", source: "linear-gradient(180deg, #2d1b69 0%, #11998e 100%)", type: "gradient", premium: false },
  { id: "mountains_03", category: "mountains", label: "Snow Peak", thumbnail: "linear-gradient(180deg, #e8e8e8 0%, #b0bec5 40%, #455a64 100%)", source: "linear-gradient(180deg, #e8e8e8 0%, #b0bec5 40%, #455a64 100%)", type: "gradient", premium: false },

  // ── Clouds ──
  { id: "clouds_01", category: "clouds", label: "Morning Sky", thumbnail: "linear-gradient(180deg, #4fc3f7 0%, #81d4fa 40%, #e1f5fe 100%)", source: "linear-gradient(180deg, #4fc3f7 0%, #81d4fa 40%, #e1f5fe 100%)", type: "gradient", premium: false },
  { id: "clouds_02", category: "clouds", label: "Storm Clouds", thumbnail: "linear-gradient(180deg, #263238 0%, #455a64 50%, #78909c 100%)", source: "linear-gradient(180deg, #263238 0%, #455a64 50%, #78909c 100%)", type: "gradient", premium: false },
  { id: "clouds_03", category: "clouds", label: "Sunset Drift", thumbnail: "linear-gradient(180deg, #ff6f00 0%, #ff8f00 30%, #ffb300 60%, #fff8e1 100%)", source: "linear-gradient(180deg, #ff6f00 0%, #ff8f00 30%, #ffb300 60%, #fff8e1 100%)", type: "gradient", premium: false },

  // ── Abstract ──
  { id: "abstract_01", category: "abstract", label: "Neon Waves", thumbnail: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)", source: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)", type: "gradient", premium: false },
  { id: "abstract_02", category: "abstract", label: "Deep Space", thumbnail: "linear-gradient(135deg, #000428, #004e92)", source: "linear-gradient(135deg, #000428, #004e92)", type: "gradient", premium: false },
  { id: "abstract_03", category: "abstract", label: "Midnight Blue", thumbnail: "linear-gradient(135deg, #0a0a23, #1a1a4e, #2d2d7a)", source: "linear-gradient(135deg, #0a0a23, #1a1a4e, #2d2d7a)", type: "gradient", premium: false },

  // ── Light Rays ──
  { id: "lightrays_01", category: "light-rays", label: "Divine Light", thumbnail: "linear-gradient(135deg, #1a1a00 0%, #4a4a00 30%, #8a8a00 60%, #ffffcc 100%)", source: "linear-gradient(135deg, #1a1a00 0%, #4a4a00 30%, #8a8a00 60%, #ffffcc 100%)", type: "gradient", premium: false },
  { id: "lightrays_02", category: "light-rays", label: "Rays of Hope", thumbnail: "linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 30%, #e94560 100%)", source: "linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 30%, #e94560 100%)", type: "gradient", premium: false },
  { id: "lightrays_03", category: "light-rays", label: "Golden Rays", thumbnail: "linear-gradient(135deg, #1a1200 0%, #b8860b 50%, #ffd700 100%)", source: "linear-gradient(135deg, #1a1200 0%, #b8860b 50%, #ffd700 100%)", type: "gradient", premium: false },

  // ── Church ──
  { id: "church_01", category: "church", label: "Stained Glass", thumbnail: "linear-gradient(135deg, #1a0a2e 0%, #4a148c 25%, #c62828 50%, #1565c0 75%, #2e7d32 100%)", source: "linear-gradient(135deg, #1a0a2e 0%, #4a148c 25%, #c62828 50%, #1565c0 75%, #2e7d32 100%)", type: "gradient", premium: false },
  { id: "church_02", category: "church", label: "Sanctuary", thumbnail: "linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 40%, #424242 100%)", source: "linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 40%, #424242 100%)", type: "gradient", premium: false },
  { id: "church_03", category: "church", label: "Cathedral", thumbnail: "linear-gradient(180deg, #0d0d0d 0%, #1a1a2e 50%, #2d1b69 100%)", source: "linear-gradient(180deg, #0d0d0d 0%, #1a1a2e 50%, #2d1b69 100%)", type: "gradient", premium: false },

  // ── Conference ──
  { id: "conference_01", category: "conference", label: "Stage Blue", thumbnail: "linear-gradient(135deg, #0d1b2a 0%, #1b2838 40%, #1e3a5f 100%)", source: "linear-gradient(135deg, #0d1b2a 0%, #1b2838 40%, #1e3a5f 100%)", type: "gradient", premium: false },
  { id: "conference_02", category: "conference", label: "Professional", thumbnail: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", source: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", type: "gradient", premium: false },
  { id: "conference_03", category: "conference", label: "Bold Stage", thumbnail: "linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 50%, #4a148c 100%)", source: "linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 50%, #4a148c 100%)", type: "gradient", premium: false },

  // ── Prayer ──
  { id: "prayer_01", category: "prayer", label: "Quiet Night", thumbnail: "linear-gradient(180deg, #0a0a1a 0%, #1a1a3e 50%, #2d2d6a 100%)", source: "linear-gradient(180deg, #0a0a1a 0%, #1a1a3e 50%, #2d2d6a 100%)", type: "gradient", premium: false },
  { id: "prayer_02", category: "prayer", label: "Candlelight", thumbnail: "linear-gradient(135deg, #1a0a00 0%, #4a2800 40%, #ff8f00 100%)", source: "linear-gradient(135deg, #1a0a00 0%, #4a2800 40%, #ff8f00 100%)", type: "gradient", premium: false },
  { id: "prayer_03", category: "prayer", label: "Still Waters", thumbnail: "linear-gradient(180deg, #0a1628 0%, #1a3a5c 50%, #2196f3 100%)", source: "linear-gradient(180deg, #0a1628 0%, #1a3a5c 50%, #2196f3 100%)", type: "gradient", premium: false },

  // ── Christmas ──
  { id: "christmas_01", category: "christmas", label: "Holiday Red", thumbnail: "linear-gradient(135deg, #1a0000 0%, #8b0000 50%, #c62828 100%)", source: "linear-gradient(135deg, #1a0000 0%, #8b0000 50%, #c62828 100%)", type: "gradient", premium: false },
  { id: "christmas_02", category: "christmas", label: "Winter Night", thumbnail: "linear-gradient(180deg, #0a0a2e 0%, #1a237e 40%, #e8eaf6 100%)", source: "linear-gradient(180deg, #0a0a2e 0%, #1a237e 40%, #e8eaf6 100%)", type: "gradient", premium: false },
  { id: "christmas_03", category: "christmas", label: "Evergreen", thumbnail: "linear-gradient(135deg, #0a1a0a 0%, #1b5e20 50%, #2e7d32 100%)", source: "linear-gradient(135deg, #0a1a0a 0%, #1b5e20 50%, #2e7d32 100%)", type: "gradient", premium: false },

  // ── Easter ──
  { id: "easter_01", category: "easter", label: "Spring Dawn", thumbnail: "linear-gradient(180deg, #1a0a2e 0%, #7b1fa2 40%, #f48fb1 100%)", source: "linear-gradient(180deg, #1a0a2e 0%, #7b1fa2 40%, #f48fb1 100%)", type: "gradient", premium: false },
  { id: "easter_02", category: "easter", label: "Resurrection", thumbnail: "linear-gradient(135deg, #1a1a00 0%, #f9a825 50%, #fff8e1 100%)", source: "linear-gradient(135deg, #1a1a00 0%, #f9a825 50%, #fff8e1 100%)", type: "gradient", premium: false },
  { id: "easter_03", category: "easter", label: "Lily White", thumbnail: "linear-gradient(180deg, #e8eaf6 0%, #f5f5f5 40%, #ffffff 100%)", source: "linear-gradient(180deg, #e8eaf6 0%, #f5f5f5 40%, #ffffff 100%)", type: "gradient", premium: false },

  // ── Youth ──
  { id: "youth_01", category: "youth", label: "Neon Pulse", thumbnail: "linear-gradient(135deg, #0a0a0a 0%, #e91e63 40%, #9c27b0 70%, #212121 100%)", source: "linear-gradient(135deg, #0a0a0a 0%, #e91e63 40%, #9c27b0 70%, #212121 100%)", type: "gradient", premium: false },
  { id: "youth_02", category: "youth", label: "Electric Blue", thumbnail: "linear-gradient(135deg, #0a0a2e 0%, #00bcd4 50%, #00e5ff 100%)", source: "linear-gradient(135deg, #0a0a2e 0%, #00bcd4 50%, #00e5ff 100%)", type: "gradient", premium: false },
  { id: "youth_03", category: "youth", label: "Fire Night", thumbnail: "linear-gradient(135deg, #0a0a0a 0%, #e65100 40%, #ff6d00 70%, #1a1a1a 100%)", source: "linear-gradient(135deg, #0a0a0a 0%, #e65100 40%, #ff6d00 70%, #1a1a1a 100%)", type: "gradient", premium: false },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function getBuiltinById(id: string): BuiltinBackground | undefined {
  return BUILTIN_BACKGROUNDS.find((b) => b.id === id);
}

export function getBuiltinsByCategory(categoryId: string): BuiltinBackground[] {
  return BUILTIN_BACKGROUNDS.filter((b) => b.category === categoryId);
}
