/**
 * bibleMacros.ts — Operator Custom Shortcodes & Scripture Macros for OBS Dock
 *
 * Allows media operators to map shortcuts (e.g. "benediction", "welcome", "communion")
 * directly to canonical scripture passages for ultra-fast Sunday service operation.
 */

import { BOOK_ALIASES } from "./bibleSearchParser";

export interface BibleMacro {
  keyword: string;
  reference: string;
  label?: string;
  translation?: string;
}

export const DOCK_BIBLE_MACROS_STORAGE_KEY = "__mce_dock_bible_macros_v2";

export const DEFAULT_BIBLE_MACROS: BibleMacro[] = [
  { keyword: "grace", reference: "2 Corinthians 13:14", label: "The Grace" },
  { keyword: "offering", reference: "2 Corinthians 9:7", label: "Offering & Tithes" },
  { keyword: "benediction", reference: "Numbers 6:24-26", label: "Benediction & Blessing" },
];

/**
 * Check whether a keyword collides with any canonical Bible book name or standard abbreviation.
 * e.g. "job", "acts", "mark", "song", "jud", "tit"
 */
export function isCanonicalBookCollision(keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized) return false;

  for (const entry of BOOK_ALIASES) {
    if (entry.book.toLowerCase().replace(/\s+/g, "") === normalized) return true;
    for (const alias of entry.aliases) {
      if (alias.toLowerCase() === normalized) return true;
    }
  }
  return false;
}

/**
 * Load macros from localStorage merged with built-in defaults.
 */
export function loadBibleMacros(): BibleMacro[] {
  if (typeof localStorage === "undefined") return [...DEFAULT_BIBLE_MACROS];
  try {
    const raw = localStorage.getItem(DOCK_BIBLE_MACROS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_BIBLE_MACROS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_BIBLE_MACROS];

    const macroMap = new Map<string, BibleMacro>();
    // First load defaults
    for (const def of DEFAULT_BIBLE_MACROS) {
      macroMap.set(def.keyword.toLowerCase(), def);
    }
    // Overlay user macros
    for (const item of parsed) {
      if (item && typeof item.keyword === "string" && typeof item.reference === "string") {
        const kw = item.keyword.trim().toLowerCase();
        if (kw) {
          macroMap.set(kw, {
            keyword: kw,
            reference: item.reference.trim(),
            label: item.label?.trim() || undefined,
            translation: item.translation?.trim().toUpperCase() || undefined,
          });
        }
      }
    }
    return Array.from(macroMap.values());
  } catch {
    return [...DEFAULT_BIBLE_MACROS];
  }
}

/**
 * Save user custom macros to localStorage.
 */
export function saveBibleMacros(macros: BibleMacro[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DOCK_BIBLE_MACROS_STORAGE_KEY, JSON.stringify(macros));
  } catch {
    // Ignore storage quota errors
  }
}

export interface MacroMatchResult {
  macro: BibleMacro;
  isExplicitMacroPrefix: boolean;
  hasCanonicalCollision: boolean;
}

/**
 * Find matching macros for a query string.
 * Supports:
 *   - Explicit macro prefix: "#welcome", "#job", "*benediction"
 *   - Plain keyword: "welcome", "benediction"
 */
export function findMatchingBibleMacros(
  query: string,
  macros: BibleMacro[] = loadBibleMacros(),
): MacroMatchResult[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const isExplicit = trimmed.startsWith("#") || trimmed.startsWith("*");
  const searchKeyword = isExplicit ? trimmed.slice(1).trim() : trimmed;
  if (!searchKeyword) return [];

  const results: MacroMatchResult[] = [];

  for (const macro of macros) {
    const kw = macro.keyword.toLowerCase();
    const hasCollision = isCanonicalBookCollision(kw);

    if (kw === searchKeyword) {
      // Exact match gets highest ranking
      results.unshift({
        macro,
        isExplicitMacroPrefix: isExplicit,
        hasCanonicalCollision: hasCollision,
      });
    } else if (searchKeyword.length >= 3 && kw.startsWith(searchKeyword)) {
      results.push({
        macro,
        isExplicitMacroPrefix: isExplicit,
        hasCanonicalCollision: hasCollision,
      });
    }
  }

  return results;
}
