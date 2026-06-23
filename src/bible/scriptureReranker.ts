/**
 * scriptureReranker.ts — Domain-intelligent Bible retrieval reranker
 *
 * 7-layer scoring system that beats generic LLM retrieval using
 * Bible-specific knowledge:
 *
 *   Layer 1: Scripture Popularity — sermon-frequency weighting
 *   Layer 2: Sermon Concept Engine — concept→reference mapping
 *   Layer 3: Bible Story Engine — story alias→passage boosting
 *   Layer 4: Verse Alias Engine — famous quote→instant lookup (<1ms)
 *   Layer 5: Context Boosting — current book/chapter amplification
 *   Layer 6: Multi-Signal Reranker — weighted combination of all signals
 *
 * Architecture:
 *   HNSW Top-20 → Reranker (6 signals) → Final Ranked Results
 *
 * Performance optimizations:
 *   - All databases precompiled into Maps/Sets at module load time
 *   - Query normalization + keyword extraction computed once per call
 *   - Candidate keyword sets and references precomputed once per call
 *   - O(1) concept/story/alias lookups via prebuilt index maps
 */

import Fuse from "fuse.js";
import { POPULARITY_DB } from "./data/popularityDb";
import { CONCEPT_INDEX } from "./data/conceptIndex";
import { STORY_ENGINE } from "./data/storyEngine";
import { VERSE_ALIASES } from "./data/verseAliases";
import { generateBookAliases, type BookAliasEntry } from "./bookAliasGenerator";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RerankCandidate {
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  text: string;
  semanticScore: number; // 0-1 from embedding similarity
}

export interface RerankContext {
  /** Current book the pastor is preaching from */
  currentBook?: string | null;
  /** Current chapter */
  currentChapter?: number | null;
}

export interface RerankResult extends RerankCandidate {
  keywordScore: number;
  phraseScore: number;
  popularityScore: number;
  conceptScore: number;
  storyScore: number;
  contextScore: number;
  finalScore: number;
  debug: {
    semanticWeighted: number;
    keywordWeighted: number;
    phraseWeighted: number;
    popularityWeighted: number;
    conceptWeighted: number;
    storyWeighted: number;
    contextWeighted: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring weights (Layer 6)
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  semantic: 0.40,
  keyword: 0.12,
  phrase: 0.08,
  popularity: 0.08,
  concept: 0.12,
  story: 0.10,
  context: 0.10,
};

// ─────────────────────────────────────────────────────────────────────────────
// Precompiled Lookup Structures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CONCEPT_LOOKUP: keyword → concept entries containing that keyword.
 * Each entry has a precomputed verseSet for O(1) membership checks.
 * Replaces the O(concepts × keywords) linear scan per candidate.
 */
interface IndexedConcept {
  keywords: string[];
  verseSet: Set<string>;
}

const CONCEPT_LOOKUP = new Map<string, IndexedConcept[]>();
for (const concept of CONCEPT_INDEX) {
  const indexed: IndexedConcept = {
    keywords: concept.keywords,
    verseSet: new Set(concept.verses),
  };
  for (const keyword of concept.keywords) {
    const existing = CONCEPT_LOOKUP.get(keyword);
    if (existing) {
      existing.push(indexed);
    } else {
      CONCEPT_LOOKUP.set(keyword, [indexed]);
    }
  }
}

/**
 * STORY_LOOKUP: word → story entries whose aliases contain that word.
 * Multi-word aliases are decomposed into individual words (≥3 chars).
 * Replaces the O(stories × aliases) substring scan per query.
 */
interface IndexedStory {
  story: string;
  references: string[];
  aliases: string[];
  referenceBooks: Set<string>;
}

const STORY_LOOKUP = new Map<string, IndexedStory[]>();

for (const story of STORY_ENGINE) {
  const indexed: IndexedStory = {
    story: story.story,
    references: story.references,
    aliases: story.aliases,
    referenceBooks: new Set(
      story.references.map((ref) => ref.split(/\s+\d/)[0]),
    ),
  };

  for (const alias of story.aliases) {
    const existing = STORY_LOOKUP.get(alias);
    if (existing) {
      existing.push(indexed);
    } else {
      STORY_LOOKUP.set(alias, [indexed]);
    }
    const words = alias.split(/\s+/);
    if (words.length > 1) {
      for (const word of words) {
        if (word.length >= 3) {
          const existingWord = STORY_LOOKUP.get(word);
          if (existingWord) {
            if (!existingWord.includes(indexed)) existingWord.push(indexed);
          } else {
            STORY_LOOKUP.set(word, [indexed]);
          }
        }
      }
    }
  }
}

/**
 * VERSE_ALIASES lookup maps — O(1) exact and compressed phrase matching.
 */
const ALIAS_EXACT = new Map<string, string>();
const ALIAS_COMPRESSED = new Map<string, string>();

for (const entry of VERSE_ALIASES) {
  for (const phrase of entry.phrases) {
    const normalized = normalizeText(phrase);
    ALIAS_EXACT.set(normalized, entry.reference);
    const compressed = normalized.replace(/\s+/g, "");
    ALIAS_COMPRESSED.set(compressed, entry.reference);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scripture Reference Normalization (Fuse.js-powered)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate the Fuse.js index for Bible book matching.
 * Each entry has `reference` (canonical) and `aliases` (all spoken forms).
 * Fuse.js fuzzy matching handles accent variants, typos, and misrecognitions.
 */
const BOOK_INDEX: BookAliasEntry[] = generateBookAliases();

const BOOK_FUSE = new Fuse(BOOK_INDEX, {
  keys: ["reference", "aliases"],
  includeScore: true,
  includeMatches: true,
  threshold: 0.35,
  ignoreLocation: true,
});

/** Noise words that speech-to-text sometimes inserts before a book name */
const FILLER_WORDS_RE = /\b(the|and|in|from|book of|books of|chapter|verse)\b/gi;

/** Ordinal words → digits (for "first samuel" → "1 samuel") */
const ORDINAL_TO_DIGIT: Record<string, string> = {
  first: "1",
  second: "2",
  third: "3",
  i: "1",
  ii: "2",
  iii: "3",
};

const ORDINAL_SUFFIX_RE = /\b(1st|2nd|3rd)\b/i;

/** Word numbers → digits (for "one peter" → "1 peter") */
const WORD_NUMBER_TO_DIGIT: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
};

/** Common abbreviations that STT produces before numeric conversion */
const ABBREVIATION_MAP: Record<string, string> = {
  cor: "corinthians",
  chron: "chronicles",
  thess: "thessalonians",
  tim: "timothy",
  pet: "peter",
  kgs: "kings",
  sam: "samuel",
  jn: "john",
  king: "kings",
  chronicle: "chronicles",
  corinthian: "corinthians",
  thessalonian: "thessalonians",
};

/**
 * Find the best matching Bible book for a query string using Fuse.js.
 *
 * Returns { reference, chapter, verse } or null if no match found.
 * Only generates aliases for books and chapters — NOT verses.
 *
 * Strategy: strip chapter/verse numbers first, then fuzzy-match only
 * the book portion against the alias index.
 */
function findBook(query: string): { reference: string; chapter: number | null; verse: number | null } | null {
  let s = query.trim().toLowerCase();
  if (!s) return null;

  // Strip filler words
  s = s.replace(FILLER_WORDS_RE, " ");

  // Resolve abbreviations (e.g., "cor" → "corinthians")
  for (const [abbr, full] of Object.entries(ABBREVIATION_MAP)) {
    const re = new RegExp(`\\b${abbr}\\b`, "i");
    s = s.replace(re, full);
  }

  // Strip "chapter" and "verse" keywords
  s = s.replace(/\bchapter\b/g, " ");
  s = s.replace(/\bverse\b/g, " ");

  // Convert ordinal words to digits
  for (const [word, digit] of Object.entries(ORDINAL_TO_DIGIT)) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    s = s.replace(re, digit);
  }

  // Convert ordinal suffixes (1st, 2nd, 3rd) to digits
  s = s.replace(ORDINAL_SUFFIX_RE, (_, suffix: string) => suffix.charAt(0));

  // Convert word numbers to digits
  for (const [word, digit] of Object.entries(WORD_NUMBER_TO_DIGIT)) {
    const re = new RegExp(`\\b${word}\\b`, "gi");
    s = s.replace(re, digit);
  }

  // Clean whitespace
  s = s.replace(/\s+/g, " ").trim();

  // Extract trailing chapter:verse or chapter verse BEFORE book matching
  // This prevents numbers from polluting the Fuse.js score
  let chapter: number | null = null;
  let verse: number | null = null;
  let bookQuery = s;

  // Try "chapter:verse" at end (e.g., "genesis 1:1" → book="genesis", ch=1, v=1)
  const colonMatch = s.match(/^(.+?)\s+(\d+)\s*:\s*(\d+)\s*$/);
  if (colonMatch) {
    bookQuery = colonMatch[1].trim();
    chapter = parseInt(colonMatch[2], 10);
    verse = parseInt(colonMatch[3], 10);
  } else {
    // Try "chapter verse" at end (e.g., "1 samuel 17 45" → book="1 samuel", ch=17, v=45)
    const spaceMatch = s.match(/^(.+?)\s+(\d+)\s+(\d+)\s*$/);
    if (spaceMatch) {
      bookQuery = spaceMatch[1].trim();
      chapter = parseInt(spaceMatch[2], 10);
      verse = parseInt(spaceMatch[3], 10);
    } else {
      // Try chapter only at end (e.g., "genesis 1" → book="genesis", ch=1)
      const chapterMatch = s.match(/^(.+?)\s+(\d+)\s*$/);
      if (chapterMatch) {
        bookQuery = chapterMatch[1].trim();
        chapter = parseInt(chapterMatch[2], 10);
      }
    }
  }

  // Now search Fuse.js with ONLY the book portion
  const fuseResults = BOOK_FUSE.search(bookQuery);
  if (fuseResults.length === 0) return null;

  // When the query starts with a digit (e.g., "1 corintians"), prefer
  // results whose reference also starts with that digit. This prevents
  // fuzzy matching from returning "2 Corinthians" for "1 corintians".
  const queryPrefix = bookQuery.match(/^(\d)/)?.[1];
  let bestMatch = fuseResults[0];
  if (queryPrefix) {
    const preferred = fuseResults.find(
      (r) => r.item.reference.startsWith(queryPrefix + " ")
    );
    if (preferred) bestMatch = preferred;
  }

  return {
    reference: bestMatch.item.reference,
    chapter,
    verse,
  };
}

/**
 * Normalizes spoken or written scripture references into canonical form.
 *
 * Uses Fuse.js fuzzy matching against all 66 Bible books, handling:
 *   - Accent variants (Nigerian: "won", "to", "tu", "tree", "free")
 *   - Ordinal words (first, second, third)
 *   - Ordinal suffixes (1st, 2nd, 3rd)
 *   - Word numbers (one, two, three)
 *   - Common abbreviations (cor, kgs, sam, etc.)
 *   - Speech-to-text misrecognitions (romance → Romans, etc.)
 *
 * Returns null if no valid scripture reference can be parsed.
 */
export function normalizeScriptureReference(input: string): string | null {
  const result = findBook(input);
  if (!result) return null;

  if (result.chapter != null && result.verse != null) {
    return `${result.reference} ${result.chapter}:${result.verse}`;
  }
  if (result.chapter != null) {
    return `${result.reference} ${result.chapter}`;
  }
  return result.reference;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "that", "this", "was", "are",
  "be", "has", "had", "have", "will", "would", "could", "should", "may",
  "might", "can", "do", "does", "did", "not", "no", "so", "if", "then",
  "than", "them", "their", "there", "they", "these", "those", "what",
  "when", "where", "who", "whom", "which", "how", "all", "each", "every",
  "some", "any", "most", "much", "many", "very", "just", "also", "about",
  "up", "out", "into", "over", "after", "before", "between", "through",
  "during", "let", "us", "we", "our", "my", "your", "his", "her", "its",
  "im", "ive", "dont", "doesnt", "didnt", "cant", "wont", "hes", "shes",
  "thats", "youre", "theyre", "were", "youll", "hell", "shell", "ill",
]);

function extractKeywords(text: string): Set<string> {
  const words = normalizeText(text).split(" ");
  return new Set(words.filter((w) => w.length >= 2 && !STOP_WORDS.has(w)));
}

function stem(word: string): string {
  return word
    .replace(/(ing|tion|sion|ment|ness|able|ible|ful|less|ous|ive|ly|ed|er|es|s)$/, "")
    .replace(/i$/, "y")
    .replace(/ck$/, "c");
}

function keywordMatches(queryKeyword: string, conceptKeyword: string): boolean {
  if (queryKeyword === conceptKeyword) return true;
  if (queryKeyword.includes(conceptKeyword) || conceptKeyword.includes(queryKeyword)) return true;
  if (stem(queryKeyword) === stem(conceptKeyword)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-parsed Reference
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedRef {
  book: string;
  chapter: number | null;
  verse: number | null;
}

function parseReference(reference: string): ParsedRef {
  const match = reference.match(/^(.+?)\s+(\d+)(?::(\d+))?$/);
  if (!match) return { book: reference, chapter: null, verse: null };
  return {
    book: match[1],
    chapter: parseInt(match[2], 10),
    verse: match[3] ? parseInt(match[3], 10) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring Functions
// ─────────────────────────────────────────────────────────────────────────────

function popularityScore(reference: string): number {
  return POPULARITY_DB[reference] ?? 0.3;
}

/** Layer 2 — uses CONCEPT_LOOKUP map for O(1) keyword→concept resolution */
function conceptScore(queryKeywords: Set<string>, reference: string): number {
  if (queryKeywords.size === 0) return 0;

  let score = 0;
  for (const qk of queryKeywords) {
    const concepts = CONCEPT_LOOKUP.get(qk);
    if (!concepts) continue;
    for (const concept of concepts) {
      if (concept.verseSet.has(reference)) {
        score += 1 / concept.keywords.length;
      }
    }
  }

  return Math.min(1, score);
}

/** Layer 3 — uses STORY_LOOKUP map for O(words×matches) instead of O(stories×aliases) */
function storyScore(queryWords: string[], referenceBook: string): number {
  let bestScore = 0;
  const matchCounts = new Map<IndexedStory, number>();

  for (const word of queryWords) {
    const stories = STORY_LOOKUP.get(word);
    if (!stories) continue;
    for (const story of stories) {
      matchCounts.set(story, (matchCounts.get(story) ?? 0) + 1);
    }
  }

  for (const [story, matchCount] of matchCounts) {
    const aliasScore = matchCount / story.aliases.length;
    const referenceMatch = story.referenceBooks.has(referenceBook);

    if (referenceMatch) {
      bestScore = Math.max(bestScore, aliasScore);
    } else {
      bestScore = Math.max(bestScore, aliasScore * 0.3);
    }
  }

  return Math.min(1, bestScore);
}

/** Layer 5 — direct string comparison, no regex creation in hot path */
function contextScore(
  candidateBook: string,
  candidateChapter: number | null,
  context?: RerankContext | null,
): number {
  if (!context?.currentBook) return 0;

  if (candidateBook.toLowerCase() !== context.currentBook.toLowerCase()) return 0;

  if (context.currentChapter != null && candidateChapter != null) {
    if (candidateChapter === context.currentChapter) return 1.0;
  }

  return 0.5;
}

function keywordOverlapScore(
  queryKeywords: Set<string>,
  verseKeywords: Set<string>,
): number {
  if (queryKeywords.size === 0 || verseKeywords.size === 0) return 0;

  let matches = 0;
  for (const qk of queryKeywords) {
    for (const vk of verseKeywords) {
      if (keywordMatches(qk, vk)) {
        matches++;
        break;
      }
    }
  }

  return matches / queryKeywords.size;
}

function phraseOverlapScore(normalizedQuery: string, normalizedVerse: string): number {
  if (normalizedQuery.length < 3 || normalizedVerse.length < 3) return 0;

  const queryWords = normalizedQuery.split(" ").filter((w) => w.length >= 3);
  if (queryWords.length < 2) return 0;

  let phraseMatches = 0;
  let totalPhrases = 0;

  for (let i = 0; i < queryWords.length - 1; i++) {
    const phrase = queryWords.slice(i, i + 2).join(" ");
    totalPhrases++;
    if (normalizedVerse.includes(phrase)) {
      phraseMatches++;
    }
  }

  for (let i = 0; i < queryWords.length - 2; i++) {
    const phrase = queryWords.slice(i, i + 3).join(" ");
    totalPhrases++;
    if (normalizedVerse.includes(phrase)) {
      phraseMatches++;
    }
  }

  return totalPhrases > 0 ? phraseMatches / totalPhrases : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verse Alias Matching (uses ALIAS_EXACT / ALIAS_COMPRESSED maps)
// ─────────────────────────────────────────────────────────────────────────────

export function matchVerseAlias(query: string): string | null {
  const q = normalizeText(query);
  if (q.length < 5) return null;

  // O(1) exact match
  const exact = ALIAS_EXACT.get(q);
  if (exact) return exact;

  // O(1) compressed match
  const qCompressed = q.replace(/\s+/g, "");
  const compressed = ALIAS_COMPRESSED.get(qCompressed);
  if (compressed) return compressed;

  // Substring containment
  for (const [normalizedPhrase, reference] of ALIAS_EXACT) {
    if (q.includes(normalizedPhrase) || normalizedPhrase.includes(q)) {
      return reference;
    }
  }

  // Compressed substring containment
  for (const [compressedPhrase, reference] of ALIAS_COMPRESSED) {
    if (qCompressed.includes(compressedPhrase) || compressedPhrase.includes(qCompressed)) {
      return reference;
    }
  }

  // Word overlap > 80%
  const qWords = new Set(q.split(" ").filter((w) => w.length >= 3));
  if (qWords.size < 2) return null;

  for (const entry of VERSE_ALIASES) {
    for (const phrase of entry.phrases) {
      const pWords = new Set(phrase.split(" ").filter((w) => w.length >= 3));
      if (pWords.size === 0) continue;

      let overlap = 0;
      for (const w of qWords) {
        if (pWords.has(w)) overlap++;
      }

      if (overlap / Math.max(qWords.size, pWords.size) >= 0.8) {
        return entry.reference;
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Reranker (Layer 6) — single pass with precomputed values
// ─────────────────────────────────────────────────────────────────────────────

export function rerankCandidates(
  query: string,
  candidates: RerankCandidate[],
  context?: RerankContext | null,
): RerankResult[] {
  // Precompute query data ONCE
  const normalizedQuery = normalizeText(query);
  const queryKeywords = extractKeywords(query);
  const queryWords = normalizedQuery.split(" ").filter((w) => w.length >= 2);

  // Precompute candidate data ONCE
  const parsed = candidates.map((c) => ({
    candidate: c,
    ref: parseReference(c.reference),
    keywordSet: extractKeywords(c.text),
    normalizedText: normalizeText(c.text),
  }));

  const results: RerankResult[] = [];

  for (const { candidate, ref, keywordSet, normalizedText } of parsed) {
    const kwScore = keywordOverlapScore(queryKeywords, keywordSet);
    const phScore = phraseOverlapScore(normalizedQuery, normalizedText);
    const popScore = popularityScore(candidate.reference);
    const conScore = conceptScore(queryKeywords, candidate.reference);
    const stoScore = storyScore(queryWords, ref.book);
    const ctxScore = contextScore(ref.book, ref.chapter, context);

    const semanticWeighted = WEIGHTS.semantic * candidate.semanticScore;
    const keywordWeighted = WEIGHTS.keyword * kwScore;
    const phraseWeighted = WEIGHTS.phrase * phScore;
    const popularityWeighted = WEIGHTS.popularity * popScore;
    const conceptWeighted = WEIGHTS.concept * conScore;
    const storyWeighted = WEIGHTS.story * stoScore;
    const contextWeighted = WEIGHTS.context * ctxScore;

    const finalScore =
      semanticWeighted +
      keywordWeighted +
      phraseWeighted +
      popularityWeighted +
      conceptWeighted +
      storyWeighted +
      contextWeighted;

    results.push({
      ...candidate,
      keywordScore: kwScore,
      phraseScore: phScore,
      popularityScore: popScore,
      conceptScore: conScore,
      storyScore: stoScore,
      contextScore: ctxScore,
      finalScore,
      debug: {
        semanticWeighted,
        keywordWeighted,
        phraseWeighted,
        popularityWeighted,
        conceptWeighted,
        storyWeighted,
        contextWeighted,
      },
    });
  }

  results.sort((a, b) => b.finalScore - a.finalScore);

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concept Verse Injection (uses CONCEPT_LOOKUP map)
// ─────────────────────────────────────────────────────────────────────────────
export function getConceptVerses(query: string): string[] {
  const queryKeywords = extractKeywords(query);
  if (queryKeywords.size === 0) return [];

  const verses = new Set<string>();

  for (const qk of queryKeywords) {
    const concepts = CONCEPT_LOOKUP.get(qk);
    if (!concepts) continue;
    for (const concept of concepts) {
      for (const verse of concept.verseSet) {
        verses.add(verse);
      }
    }
  }

  return Array.from(verses);
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug Output
// ─────────────────────────────────────────────────────────────────────────────

export function debugRerank(query: string, candidates: RerankCandidate[]): void {
  rerankCandidates(query, candidates);
}
