/**
 * unicodeUtils.ts — Shared Unicode-safe text utilities for the worship module.
 *
 * All text processing in the lyrics pipeline must go through these helpers
 * to ensure correct handling of accented characters, diacritics, and
 * non-Latin scripts (Twi/Akan ɛ/ɔ, Yoruba ẹ/ọ, French é/è/ê/ç,
 * Arabic, CJK, etc.).
 */

// ── NFC Normalization ──────────────────────────────────────────────────────

/**
 * Normalize text to Unicode NFC (Canonical Decomposition + Canonical
 * Composition). This ensures characters like "é" (single codepoint)
 * and "é" (e + combining acute) are stored in the same canonical form.
 *
 * Always call this on imported or user-edited text before saving.
 */
export function normalizeNfc(text: string): string {
  if (!text) return text;
  // NFC is supported in all modern JS runtimes (ES2015+).
  return text.normalize("NFC");
}

// ── Unicode-aware search normalization ─────────────────────────────────────

/**
 * Map of African-language base characters that are NOT decomposed by NFD
 * but should match their ASCII equivalents during search.
 *
 * Characters like ọ (U+1ECD) DO decompose via NFD → o + U+0323 (combining
 * dot below), so the combining-mark strip handles them automatically.
 * But ɛ (U+025B) and ɔ (U+0254) are base characters with no NFD
 * decomposition — they need explicit mapping here.
 *
 * This map is ONLY used for search index normalization, never for
 * stored or rendered text.
 */
const SEARCH_CHAR_MAP: Record<string, string> = {
  "ɛ": "e", "Ɛ": "e",
  "ɔ": "o", "Ɔ": "o",
};

/**
 * Normalize a string for search comparison:
 *  1. Map non-decomposable African-language characters (ɛ→e, ɔ→o)
 *  2. Strip diacritical marks via NFD decomposition + removal
 *  3. Lowercase (Unicode-aware — handles İ→i, Ɛ→ɛ, etc.)
 *  4. Replace non-letter/number runs with a single space
 *  5. Trim
 *
 * Use this instead of the old `normalizeSongLookupPart` which used
 * `/[^a-z0-9]+/g` and silently dropped all non-ASCII characters.
 */
export function unicodeSearchNormalize(text: string): string {
  if (!text) return "";
  // Step 1: map base characters before NFD (they won't decompose)
  let mapped = "";
  for (const ch of text) {
    mapped += SEARCH_CHAR_MAP[ch] ?? ch;
  }
  return mapped
    .normalize("NFD")                                           // decompose (é → e + ´)
    .replace(/[\u0300-\u036f]/g, "")                           // strip combining marks
    .toLowerCase()                                              // Unicode-aware lowercase
    .replace(/[^\p{L}\p{N}]+/gu, " ")                         // keep only letters & numbers
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lightweight diacritic-strip for fuzzy matching — same char map +
 * NFD decomposition, but preserves punctuation for partial matching.
 */
export function unicodeStripDiacritics(text: string): string {
  if (!text) return "";
  let mapped = "";
  for (const ch of text) {
    mapped += SEARCH_CHAR_MAP[ch] ?? ch;
  }
  return mapped
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Simple Unicode-safe lowercasing. Use when you just need case-folding
 * without stripping diacritics (e.g. fuzzy search where accents matter).
 */
export function unicodeLowercase(text: string): string {
  return text.toLowerCase();
}

// ── Unicode-aware tokenization ─────────────────────────────────────────────

/**
 * Split text into word tokens for search indexing / relevance scoring.
 *
 * Unlike the old `tokenize` which used `/[^a-z0-9]+/g` and dropped all
 * non-ASCII tokens, this version preserves Unicode word characters.
 */
export function unicodeTokenize(text: string): string[] {
  if (!text) return [];
  // Apply same character map as unicodeSearchNormalize for consistency
  let mapped = "";
  for (const ch of text) {
    mapped += SEARCH_CHAR_MAP[ch] ?? ch;
  }
  return mapped
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

// ── Language detection helpers ─────────────────────────────────────────────

interface LanguagePattern {
  id: string;
  /** Character ranges or combining-mark patterns that identify this language */
  patterns: RegExp[];
  /** Bonus weight when language-specific patterns are found */
  weight: number;
}

const LANGUAGE_PATTERNS: LanguagePattern[] = [
  {
    id: "yoruba",
    patterns: [
      /[ẹọṣ]/i,
      /[\u0301\u0300\u0304\u030C]/, // Yoruba tone marks (acute, grave, macron, caron)
    ],
    weight: 3,
  },
  {
    id: "twi",
    patterns: [
      /[ɛɔ]/i,
    ],
    weight: 3,
  },
  {
    id: "igbo",
    patterns: [
      /[ịọụ]/i,
    ],
    weight: 3,
  },
  {
    id: "arabic",
    patterns: [
      /[\u0600-\u06FF]/,
    ],
    weight: 5,
  },
  {
    id: "chinese",
    patterns: [
      /[\u4E00-\u9FFF]/,
    ],
    weight: 5,
  },
  {
    id: "japanese",
    patterns: [
      /[\u3040-\u309F]/,  // Hiragana
      /[\u30A0-\u30FF]/,  // Katakana
    ],
    weight: 5,
  },
  {
    id: "korean",
    patterns: [
      /[\uAC00-\uD7AF]/,
    ],
    weight: 5,
  },
];

const ASCII_THRESHOLD = 0.85;

/**
 * Detect the dominant language of a lyric block.
 *
 * Returns a language identifier string or undefined if detection is
 * uncertain. This replaces the old `detectLanguage` in songDetector.ts
 * which only handled Yoruba and English.
 */
export function detectUnicodeLanguage(text: string): string | undefined {
  if (!text.trim()) return undefined;

  const asciiLetters = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  const isMostlyAscii = totalChars > 0 && asciiLetters / totalChars > ASCII_THRESHOLD;

  // Check non-Latin scripts first (high-confidence signals)
  for (const lang of LANGUAGE_PATTERNS) {
    for (const pattern of lang.patterns) {
      if (pattern.test(text)) {
        if (isMostlyAscii && ["yoruba", "twi", "igbo"].includes(lang.id)) {
          // Latin-script African language mixed with English
          return isBilingualMix(text) ? "bilingual" : lang.id;
        }
        if (!isMostlyAscii || lang.id === "yoruba" || lang.id === "twi" || lang.id === "igbo") {
          return lang.id;
        }
      }
    }
  }

  if (isMostlyAscii) return "english";
  return undefined;
}

function isBilingualMix(text: string): boolean {
  const asciiLetters = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  return totalChars > 0 && asciiLetters / totalChars > 0.4 && asciiLetters / totalChars < 0.85;
}
