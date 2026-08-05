/**
 * bibleData.ts — Bible data service
 *
 * Provides:
 * - Bible data loaded from IndexedDB (downloaded translations) with
 *   fallback to the bundled KJV JSON in public/ for offline use.
 * - Fast search (book/chapter/verse lookup + keyword search)
 * - Book metadata (chapter counts, verse counts)
 * - Reference resolution (abbreviation → canonical name)
 *
 * Translation flow:
 * 1. Check in-memory cache
 * 2. Check IndexedDB "translations" store
 * 3. Fall back to /bible-kjv.json (bundled) if translation is "KJV"
 */

import type {
  BibleBookName,
  BiblePassage,
  BibleTranslation,
  BibleVerse,
  RawBibleData,
} from "./types";
import { BIBLE_BOOKS, BOOK_ABBREVS } from "./types";
import { getTranslationData } from "./bibleDb";

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const translationCache = new Map<string, RawBibleData>();
const corpusCache = new Map<string, BibleCorpusEntry[]>();
const searchVocabularyCache = new Map<string, Map<string, number>>();
const normalizedSearchVocabularyCache = new Map<string, Map<string, number>>();

export interface BibleCorpusEntry {
  book: string;
  chapter: number;
  verse: number;
  endVerse: number;
  translation: string;
  reference: string;
  text: string;
  normalizedText?: string;
  searchTokens?: string[];
  normalizedSearchTokens?: string[];
  searchTokenSet?: Set<string>;
  searchContentTokens?: string[];
}

// ---------------------------------------------------------------------------
// Load Bible data
// ---------------------------------------------------------------------------

/**
 * Load a translation into memory.
 * Priority: in-memory cache → IndexedDB → bundled JSON (KJV only).
 */
async function loadTranslation(t: BibleTranslation): Promise<RawBibleData> {
  const key = t.toUpperCase();
  const cached = translationCache.get(key);
  if (cached) return cached;

  // Try IndexedDB (downloaded translations)
  // Wrapped in try-catch because IndexedDB may be unavailable in some
  // environments (e.g. OBS CEF browser dock).
  try {
    const idbData = await getTranslationData(key);
    if (idbData) {
      translationCache.set(key, idbData);
      return idbData;
    }
  } catch {
    // IndexedDB unavailable — fall through to bundled fallback
  }

  try {
    const remoteUrl = `${import.meta.env.BASE_URL}uploads/dock-bible-translation-${key.toLowerCase()}.json`;
    const remoteRes = await fetch(remoteUrl);
    if (remoteRes.ok) {
      const remoteData: RawBibleData = await remoteRes.json();
      translationCache.set(key, remoteData);
      return remoteData;
    }
  } catch {
    // Ignore remote fallback failure — continue to bundled KJV fallback.
  }

  // Fallback: bundled KJV JSON in public/
  if (key === "KJV") {
    try {
      const url = `${import.meta.env.BASE_URL}bible-kjv.json`;
      const res = await fetch(url);
      if (res.ok) {
        const data: RawBibleData = await res.json();
        translationCache.set(key, data);
        return data;
      }
    } catch {
      // Ignore fetch failure and try the bundled module fallback below.
    }

    try {
      const bundled = await import("../../public/bible-kjv.json");
      const data = bundled.default as RawBibleData;
      translationCache.set(key, data);
      return data;
    } catch (err) {
      throw new Error(`Failed to load bundled KJV: ${(err as Error).message}`);
    }
  }

  throw new Error(
    `Translation "${t}" is not installed. Download it from the Bible Library.`
  );
}

/**
 * Evict a translation from the in-memory cache
 * (e.g. after deleting from IndexedDB).
 */
export function evictTranslationCache(t: string): void {
  const key = t.toUpperCase();
  translationCache.delete(key);
  for (const cacheKey of [...corpusCache.keys()]) {
    if (cacheKey.startsWith(`${key}:`)) {
      corpusCache.delete(cacheKey);
    }
  }
}

// ---------------------------------------------------------------------------
// Book name resolution
// ---------------------------------------------------------------------------

/** Build a lookup map: lowercase abbreviation/name → canonical book name */
const bookLookup = new Map<string, string>();
for (const book of BIBLE_BOOKS) {
  bookLookup.set(book.toLowerCase(), book);
  const abbrevs = BOOK_ABBREVS[book];
  if (abbrevs) {
    for (const a of abbrevs) {
      bookLookup.set(a.toLowerCase(), book);
      // Also without spaces for things like "1cor"
      bookLookup.set(a.toLowerCase().replace(/\s/g, ""), book);
    }
  }
}

/**
 * Resolve a user-typed book name or abbreviation to the canonical name.
 * Returns null if no match found.
 */
export function resolveBookName(input: string): BibleBookName | null {
  const key = input.trim().toLowerCase();

  // Exact match
  if (bookLookup.has(key)) {
    return bookLookup.get(key) as BibleBookName;
  }

  // No-space match (e.g. "1samuel" → "1 Samuel")
  const noSpace = key.replace(/\s/g, "");
  if (bookLookup.has(noSpace)) {
    return bookLookup.get(noSpace) as BibleBookName;
  }

  // Prefix match — find first book that starts with the input
  for (const book of BIBLE_BOOKS) {
    if (book.toLowerCase().startsWith(key)) {
      return book;
    }
  }

  // Try abbreviation prefix match
  for (const [abbr, canonical] of bookLookup.entries()) {
    if (abbr.startsWith(key)) {
      return canonical as BibleBookName;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Data queries
// ---------------------------------------------------------------------------

/**
 * Get the list of chapters for a book.
 */
export async function getChapterCount(
  book: string,
  translation: BibleTranslation = "KJV"
): Promise<number> {
  const data = await loadTranslation(translation);
  const bookData = data[book];
  if (!bookData) return 0;
  return Object.keys(bookData).length;
}

/**
 * Get the verse count for a specific chapter.
 */
export async function getVerseCount(
  book: string,
  chapter: number,
  translation: BibleTranslation = "KJV"
): Promise<number> {
  const data = await loadTranslation(translation);
  const chapterData = data[book]?.[String(chapter)];
  if (!chapterData) return 0;
  return Object.keys(chapterData).length;
}

/**
 * Get a specific verse.
 */
export async function getVerse(
  book: string,
  chapter: number,
  verse: number,
  translation: BibleTranslation = "KJV"
): Promise<BibleVerse | null> {
  const data = await loadTranslation(translation);
  const text = data[book]?.[String(chapter)]?.[String(verse)];
  if (!text) return null;

  const abbrevList = BOOK_ABBREVS[book];
  const abbrev = abbrevList?.[0] ?? book.slice(0, 3);

  return { book, chapter, verse, text, abbrev };
}

/**
 * Get a passage (range of verses).
 */
export async function getPassage(
  book: string,
  chapter: number,
  startVerse: number,
  endVerse: number,
  translation: BibleTranslation = "KJV"
): Promise<BiblePassage> {
  const data = await loadTranslation(translation);
  const chapterData = data[book]?.[String(chapter)];
  const verses: BibleVerse[] = [];
  const abbrevList = BOOK_ABBREVS[book];
  const abbrev = abbrevList?.[0] ?? book.slice(0, 3);

  if (chapterData) {
    for (let v = startVerse; v <= endVerse; v++) {
      const text = chapterData[String(v)];
      if (text) {
        verses.push({ book, chapter, verse: v, text, abbrev });
      }
    }
  }

  const reference =
    startVerse === endVerse
      ? `${book} ${chapter}:${startVerse}`
      : `${book} ${chapter}:${startVerse}-${endVerse}`;

  return {
    reference,
    book,
    chapter,
    startVerse,
    endVerse,
    verses,
    translation,
  };
}

/**
 * Get an entire chapter.
 */
export async function getChapter(
  book: string,
  chapter: number,
  translation: BibleTranslation = "KJV"
): Promise<BiblePassage> {
  const verseCount = await getVerseCount(book, chapter, translation);
  return getPassage(book, chapter, 1, verseCount, translation);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  book: string;
  chapter: number;
  verse: number;
  endVerse?: number;
  text: string;
  /** Highlighted snippet around the match */
  snippet: string;
}

export interface RankedSearchResult extends SearchResult {
  score: number;
}

/**
 * Optional passage boundary for live sermon matching.
 * When present, quote search must stay inside this book/chapter.
 */
export interface BibleSearchScope {
  book?: string;
  chapter?: number;
}

function normalizeSearchScopeBook(book: string): string {
  const normalized = book.toLowerCase().replace(/\s+/g, " ").trim();
  return normalized === "psalm" ? "psalms" : normalized;
}

const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "but",
  "by",
  "did",
  "do",
  "does",
  "for",
  "from",
  "he",
  "her",
  "his",
  "i",
  "in",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "she",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "us",
  "was",
  "we",
  "were",
  "with",
  "you",
  "your",
]);
const COMMON_SEARCH_TOKEN_ALIASES = new Map<string, string>([
  ["captity", "captivity"],
  ["captivty", "captivity"],
  ["captiviti", "captivity"],
  ["captivite", "captivity"],
  ["bonus", "bones"],
  ["word", "world"],
  ["load", "lord"],
  ["ion", "zion"],
  ["vally", "valley"],
  ["rejoyce", "rejoice"],
  ["must", "should"],
]);

const SEARCH_TOKEN_NORMALIZATIONS = new Map<string, string>([
  ["hath", "has"],
  ["hast", "has"],
  ["hadst", "had"],
  ["doth", "does"],
  ["doeth", "does"],
  ["didst", "did"],
  ["saith", "says"],
  ["sayest", "says"],
  ["spake", "spoke"],
  ["shew", "show"],
  ["shewed", "show"],
  ["sheweth", "show"],
  ["ye", "you"],
  ["thee", "you"],
  ["thou", "you"],
  ["thy", "your"],
  ["thine", "your"],
  ["unto", "to"],
  ["wherefore", "why"],
  ["whosoever", "whoever"],
  ["whatsoever", "whatever"],
]);

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearch(value: string): string[] {
  const normalized = normalizeSearchText(value);
  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

  const filtered = tokens.filter(
    (token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token),
  );

  return filtered.length > 0 ? filtered : tokens.filter((token) => token.length > 1);
}

function normalizeSearchToken(token: string): string {
  const direct = SEARCH_TOKEN_NORMALIZATIONS.get(token);
  if (direct) return direct;

  if (token.length <= 4) return token;

  if (token.endsWith("eth") && token.length > 5) {
    const normalized = token.slice(0, -3);
    return SEARCH_TOKEN_NORMALIZATIONS.get(normalized) ?? normalized;
  }
  if (token.endsWith("est") && token.length > 5) {
    const normalized = token.slice(0, -3);
    return SEARCH_TOKEN_NORMALIZATIONS.get(normalized) ?? normalized;
  }
  if (token.endsWith("ing") && token.length > 6) {
    return token.slice(0, -3);
  }
  if (token.endsWith("ed") && token.length > 5) {
    return token.slice(0, -2);
  }
  if (token.endsWith("es") && token.length > 5) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && token.length > 4) {
    return token.slice(0, -1);
  }
  if (token.endsWith("e") && token.length > 6) {
    return token.slice(0, -1);
  }

  return token;
}

function buildNormalizedSearchVocabulary(
  translation: BibleTranslation,
  data: RawBibleData,
): Map<string, number> {
  const key = translation.toUpperCase();
  const cached = normalizedSearchVocabularyCache.get(key);
  if (cached) return cached;

  const vocabulary = buildSearchVocabulary(translation, data);
  const normalized = new Map<string, number>();

  for (const [token, count] of vocabulary) {
    const keyToken = normalizeSearchToken(token);
    normalized.set(keyToken, (normalized.get(keyToken) ?? 0) + count);
  }

  normalizedSearchVocabularyCache.set(key, normalized);
  return normalized;
}

function buildSearchVocabulary(
  translation: BibleTranslation,
  data: RawBibleData,
): Map<string, number> {
  const key = translation.toUpperCase();
  const cached = searchVocabularyCache.get(key);
  if (cached) return cached;

  const vocabulary = new Map<string, number>();

  for (const book of BIBLE_BOOKS) {
    const bookData = data[book];
    if (!bookData) continue;

    for (const chapterData of Object.values(bookData)) {
      for (const text of Object.values(chapterData)) {
        for (const token of normalizeSearchText(text).split(" ").filter(Boolean)) {
          if (token.length < 2) continue;
          vocabulary.set(token, (vocabulary.get(token) ?? 0) + 1);
        }
      }
    }
  }

  searchVocabularyCache.set(key, vocabulary);
  return vocabulary;
}

function boundedEditDistance(a: string, b: string, maxDistance: number): number {
  const aLength = a.length;
  const bLength = b.length;

  if (Math.abs(aLength - bLength) > maxDistance) {
    return maxDistance + 1;
  }

  const previous = new Array<number>(bLength + 1);
  const current = new Array<number>(bLength + 1);

  for (let column = 0; column <= bLength; column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= aLength; row += 1) {
    current[0] = row;
    let rowMin = current[0];

    for (let column = 1; column <= bLength; column += 1) {
      const substitutionCost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + substitutionCost,
      );
      rowMin = Math.min(rowMin, current[column]);
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    for (let column = 0; column <= bLength; column += 1) {
      previous[column] = current[column];
    }
  }

  return previous[bLength];
}

function repairSearchQuery(
  query: string,
  translation: BibleTranslation,
  data: RawBibleData,
): string {
  const normalized = normalizeSearchText(query);
  if (!normalized) return normalized;

  const vocabulary = buildSearchVocabulary(translation, data);
  const corrected = normalized.split(" ").filter(Boolean).map((token) => {
    const alias = COMMON_SEARCH_TOKEN_ALIASES.get(token);
    if (alias) return alias;

    if (
      token.length < 4 ||
      SEARCH_STOP_WORDS.has(token) ||
      /^\d+$/.test(token) ||
      vocabulary.has(token)
    ) {
      return token;
    }

    let bestCandidate: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestFrequency = -1;

    for (const [candidate, frequency] of vocabulary) {
      if (
        candidate.length < 4 ||
        Math.abs(candidate.length - token.length) > 2 ||
        candidate[0] !== token[0]
      ) {
        continue;
      }

      const distance = boundedEditDistance(token, candidate, 2);
      if (distance > 2) continue;

      if (
        distance < bestDistance ||
        (distance === bestDistance && frequency > bestFrequency)
      ) {
        bestCandidate = candidate;
        bestDistance = distance;
        bestFrequency = frequency;
      }
    }

    return bestCandidate && bestDistance <= 2 ? bestCandidate : token;
  });

  return corrected.join(" ")
    .replace(/\breverse\b(?=.*\bcaptivity\b)/g, "turn")
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchTokenWeight(
  token: string,
  normalizedVocabulary: Map<string, number>,
): number {
  const frequency = normalizedVocabulary.get(normalizeSearchToken(token)) ?? 1;
  return Math.min(3, Math.max(0.35, 6 / Math.sqrt(frequency + 1)));
}

function weightedTokenCoverage(
  queryTokens: string[],
  textTokenSet: Set<string>,
  queryTokenWeights: number[],
): number {
  const totalWeight = queryTokenWeights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return 0;

  const matchedWeight = queryTokens.reduce((sum, token, index) => {
    const matched = textTokenSet.has(token);
    return matched ? sum + queryTokenWeights[index] : sum;
  }, 0);

  return matchedWeight / totalWeight;
}

function weightedOrderedTokenCoverage(
  queryTokens: string[],
  textTokens: string[],
  queryTokenWeights: number[],
): number {
  const totalWeight = queryTokenWeights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0 || textTokens.length === 0) return 0;

  let matchedWeight = 0;
  let startIndex = 0;

  for (let index = 0; index < queryTokens.length; index += 1) {
    const queryToken = queryTokens[index];
    const foundIndex = textTokens.findIndex(
      (textToken, textIndex) => textIndex >= startIndex && queryToken === textToken,
    );
    if (foundIndex === -1) continue;
    matchedWeight += queryTokenWeights[index];
    startIndex = foundIndex + 1;
  }

  return matchedWeight / totalWeight;
}

function nearbyPairCoverage(queryTokens: string[], textTokens: string[]): number {
  if (queryTokens.length < 2 || textTokens.length === 0) return 0;

  let matchedPairs = 0;

  for (let index = 0; index < queryTokens.length - 1; index += 1) {
    const first = queryTokens[index];
    const second = queryTokens[index + 1];
    const firstIndex = textTokens.findIndex((textToken) => first === textToken);
    if (firstIndex === -1) continue;

    const window = textTokens.slice(firstIndex + 1, firstIndex + 4);
    if (window.some((textToken) => second === textToken)) {
      matchedPairs += 1;
    }
  }

  return matchedPairs / (queryTokens.length - 1);
}

function contentTokens(tokens: string[]): string[] {
  return tokens
    .map((token) => normalizeSearchToken(token))
    .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token));
}

function contentPhraseCoverage(queryContent: string[], textContent: string[]): number {
  if (queryContent.length < 2) return 0;
  if (textContent.length === 0) return 0;

  const queryPhrase = queryContent.join(" ");
  const textPhrase = textContent.join(" ");
  if (textPhrase.includes(queryPhrase)) return 1;

  let bestRun = 0;

  for (let start = 0; start < queryContent.length; start += 1) {
    let run = 0;
    let textIndex = 0;

    for (let queryIndex = start; queryIndex < queryContent.length; queryIndex += 1) {
      const token = queryContent[queryIndex];
      const foundIndex = textContent.findIndex(
        (textToken, index) => index >= textIndex && token === textToken,
      );
      if (foundIndex === -1) break;

      if (run > 0 && foundIndex - textIndex > 3) break;

      run += 1;
      textIndex = foundIndex + 1;
    }

    bestRun = Math.max(bestRun, run);
  }

  return bestRun / queryContent.length;
}

function firstStrongTokenBonus(queryContent: string[], textContent: string[]): number {
  const firstStrongToken = queryContent.find((token) => token.length >= 5);
  if (!firstStrongToken) return 0;

  const index = textContent.findIndex((token) => firstStrongToken === token);
  if (index === -1) return 0;

  return Math.max(0, 0.06 - index * 0.01);
}

function prepareCorpusSearchText(text: string): Pick<
  BibleCorpusEntry,
  "normalizedText" | "searchTokens" | "normalizedSearchTokens" | "searchTokenSet" | "searchContentTokens"
> {
  const normalizedText = normalizeSearchText(text);
  const searchTokens = normalizedText.split(" ").filter(Boolean);
  const normalizedSearchTokens = searchTokens.map((token) => normalizeSearchToken(token));

  return {
    normalizedText,
    searchTokens,
    normalizedSearchTokens,
    searchTokenSet: new Set(normalizedSearchTokens),
    searchContentTokens: contentTokens(searchTokens),
  };
}

function buildSearchSnippet(text: string, _queryTokens: string[]): string {
  // Always return the full verse text — Bible content should never be truncated
  return text;
}

function scoreVerseMatch(
  entry: BibleCorpusEntry,
  normalizedQuery: string,
  queryTokens: string[],
  normalizedQueryTokens: string[],
  queryTokenWeights: number[],
  queryContent: string[],
): number {
  if (!normalizedQuery) return 0;

  const normalizedText = entry.normalizedText ?? normalizeSearchText(entry.text);
  if (!normalizedText) return 0;

  if (normalizedText.includes(normalizedQuery)) {
    return 1;
  }

  const textTokens =
    entry.normalizedSearchTokens ??
    normalizedText.split(" ").filter(Boolean).map((token) => normalizeSearchToken(token));
  if (textTokens.length === 0 || queryTokens.length === 0) return 0;

  const textTokenSet = entry.searchTokenSet ?? new Set(textTokens);
  const tokenMatches = normalizedQueryTokens.filter((token) => textTokenSet.has(token)).length;
  if (tokenMatches === 0) return 0;

  const tokenCoverage = weightedTokenCoverage(normalizedQueryTokens, textTokenSet, queryTokenWeights);
  const orderedCoverage = weightedOrderedTokenCoverage(normalizedQueryTokens, textTokens, queryTokenWeights);
  const pairCoverage = nearbyPairCoverage(normalizedQueryTokens, textTokens);
  const textContent = entry.searchContentTokens ?? contentTokens(textTokens);
  const contentCoverage = contentPhraseCoverage(queryContent, textContent);
  const prefixBonus =
    queryTokens.length > 0 && normalizedText.startsWith(queryTokens[0]) ? 0.06 : 0;
  const strongStartBonus = firstStrongTokenBonus(queryContent, textContent);

  return Math.min(
    1,
    tokenCoverage * 0.42 +
    orderedCoverage * 0.22 +
    pairCoverage * 0.12 +
    contentCoverage * 0.20 +
    prefixBonus +
    strongStartBonus,
  );
}

async function searchBibleInTranslation(
  query: string,
  translation: BibleTranslation,
  limit: number,
  scope?: BibleSearchScope,
  minScore = 0.42,
): Promise<RankedSearchResult[]> {
  const data = await loadTranslation(translation);
  const corpus = await getBibleCorpus(translation, 3);
  const results: RankedSearchResult[] = [];
  const repairedQuery = repairSearchQuery(query, translation, data);
  const normalizedVocabulary = buildNormalizedSearchVocabulary(translation, data);
  const queryVariants = Array.from(
    new Set([normalizeSearchText(query), normalizeSearchText(repairedQuery)].filter(Boolean)),
  ).map((variant) => ({
    normalizedQuery: variant,
    queryTokens: tokenizeSearch(variant),
  })).map((variant) => ({
    ...variant,
    normalizedQueryTokens: variant.queryTokens.map((token) => normalizeSearchToken(token)),
    queryContent: contentTokens(variant.queryTokens),
    queryTokenWeights: variant.queryTokens.map((token) =>
      getSearchTokenWeight(token, normalizedVocabulary),
    ),
  }));

  const scopedBook = scope?.book ? normalizeSearchScopeBook(scope.book) : undefined;

  for (const entry of corpus) {
    if (
      (scopedBook && normalizeSearchScopeBook(entry.book) !== scopedBook) ||
      (scope?.chapter !== undefined && entry.chapter !== scope.chapter)
    ) {
      continue;
    }

    let bestScore = 0;
    let bestTokens: string[] = [];

    for (const variant of queryVariants) {
      const score = scoreVerseMatch(
        entry,
        variant.normalizedQuery,
        variant.queryTokens,
        variant.normalizedQueryTokens,
        variant.queryTokenWeights,
        variant.queryContent,
      );
      if (score > bestScore) {
        bestScore = score;
        bestTokens = variant.queryTokens;
      }
    }

    const windowSize = Math.max(1, entry.endVerse - entry.verse + 1);
    const score = Math.max(0, bestScore - (windowSize - 1) * 0.02);
    if (score < minScore) continue;

    results.push({
      book: entry.book,
      chapter: entry.chapter,
      verse: entry.verse,
      endVerse: entry.endVerse > entry.verse ? entry.endVerse : undefined,
      text: entry.text,
      snippet: buildSearchSnippet(entry.text, bestTokens),
      score,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Keyword search across the Bible, or inside an optional book/chapter scope.
 * Returns up to `limit` results.
 */
export async function searchBibleRanked(
  query: string,
  translation: BibleTranslation = "KJV",
  limit = 50,
  scope?: BibleSearchScope,
  minScore = 0.42,
): Promise<RankedSearchResult[]> {
  if (!query.trim()) return [];

  const selectedTranslation = translation.toUpperCase() as BibleTranslation;
  const primaryResults = await searchBibleInTranslation(query, selectedTranslation, limit, scope, minScore);
  const shouldSearchKjv =
    selectedTranslation !== "KJV" &&
    (primaryResults.length === 0 || primaryResults[0].score < 0.78);

  const fallbackResults = shouldSearchKjv
    ? await searchBibleInTranslation(query, "KJV", limit, scope, minScore)
    : [];

  const merged = [...primaryResults, ...fallbackResults]
    .reduce<RankedSearchResult[]>((accumulator, candidate) => {
      if (
        accumulator.some(
          (existing) =>
            existing.book === candidate.book &&
            existing.chapter === candidate.chapter &&
            existing.verse === candidate.verse,
        )
      ) {
        return accumulator;
      }
      accumulator.push(candidate);
      return accumulator;
    }, [])
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return merged;
}

export async function searchBible(
  query: string,
  translation: BibleTranslation = "KJV",
  limit = 50,
  scope?: BibleSearchScope,
): Promise<SearchResult[]> {
  const merged = await searchBibleRanked(query, translation, limit, scope);
  return merged.map(({ score: _score, ...result }) => result);
}

/**
 * Get all books with their chapter counts (for the book picker UI).
 */
export async function getBookIndex(
  translation: BibleTranslation = "KJV"
): Promise<{ book: string; chapters: number }[]> {
  const data = await loadTranslation(translation);
  return BIBLE_BOOKS.map((book) => ({
    book,
    chapters: data[book] ? Object.keys(data[book]).length : 0,
  })).filter((b) => b.chapters > 0);
}

/**
 * Pre-load a translation into memory (call on app start).
 */
export async function preloadTranslation(
  t: BibleTranslation = "KJV"
): Promise<void> {
  await loadTranslation(t);
}

/**
 * Build a cached verse/window corpus for fuzzy and semantic search.
 */
export async function getBibleCorpus(
  translation: BibleTranslation = "KJV",
  maxWindowSize = 3,
): Promise<BibleCorpusEntry[]> {
  const key = `${translation.toUpperCase()}:${maxWindowSize}`;
  const cached = corpusCache.get(key);
  if (cached) return cached;

  const data = await loadTranslation(translation);
  const entries: BibleCorpusEntry[] = [];

  for (const book of BIBLE_BOOKS) {
    const bookData = data[book];
    if (!bookData) continue;

    for (const [chapterStr, chapterData] of Object.entries(bookData)) {
      const chapter = parseInt(chapterStr, 10);
      const verses = Object.entries(chapterData)
        .map(([verseStr, text]) => ({
          verse: parseInt(verseStr, 10),
          text,
        }))
        .sort((a, b) => a.verse - b.verse);

      for (let index = 0; index < verses.length; index += 1) {
        let combinedText = "";

        for (
          let windowSize = 1;
          windowSize <= maxWindowSize && index + windowSize - 1 < verses.length;
          windowSize += 1
        ) {
          const item = verses[index + windowSize - 1];
          combinedText = combinedText ? `${combinedText} ${item.text}` : item.text;

          const startVerse = verses[index].verse;
          const endVerse = item.verse;
          const searchText = prepareCorpusSearchText(combinedText);
          entries.push({
            book,
            chapter,
            verse: startVerse,
            endVerse,
            translation: translation.toUpperCase(),
            reference:
              startVerse === endVerse
                ? `${book} ${chapter}:${startVerse}`
                : `${book} ${chapter}:${startVerse}-${endVerse}`,
            text: combinedText,
            ...searchText,
          });
        }
      }
    }
  }

  corpusCache.set(key, entries);
  return entries;
}
