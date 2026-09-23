/**
 * bibleSearchParser.ts — Smart Bible reference parser for the dock
 *
 * Parses fuzzy queries like:
 *   "gen1vs1"     → Genesis 1:1
 *   "g11"         → Genesis 1:1
 *   "gn11"        → Genesis 1:1
 *   "gs11"        → Genesis 1:1
 *   "genesis 1:1" → Genesis 1:1
 *   "jn3:16"      → John 3:16
 *   "1cor13"      → 1 Corinthians 13
 *   "ps23"        → Psalms 23
 *   "rev22:21"    → Revelation 22:21
 *
 * Returns a list of match candidates ranked by confidence.
 */

import {
  OT_BOOKS,
  NT_BOOKS,
  BOOK_CHAPTERS,
  getCanonicalVerseCount,
} from "./dockTypes";
import { normalizeRomanNumberedBookPrefix } from "../bible/bookAliasGenerator";
import { damerauLevenshteinDistance } from "../services/fuzzySearch";

const ALL_BOOKS = [...OT_BOOKS, ...NT_BOOKS];

// Psalm 119 is the longest chapter in the Bible at 176 verses. Keeping this
// parser-level guard prevents compact input such as "j1633" from becoming the
// impossible reference "John 1:633" while preserving every canonical verse.
const MAX_BIBLE_VERSE_NUMBER = 176;

const ROMAN_NUMERAL_PREFIX: Record<"1" | "2" | "3", string> = {
  "1": "i",
  "2": "ii",
  "3": "iii",
};

// ---------------------------------------------------------------------------
// Abbreviation map — multiple short forms per book
// ---------------------------------------------------------------------------

interface BookAlias {
  book: string;
  aliases: string[];
}

const BOOK_ALIASES: BookAlias[] = [
  { book: "Genesis", aliases: ["gen", "ge", "gn", "gs"] },
  { book: "Exodus", aliases: ["exo", "ex", "exod"] },
  { book: "Leviticus", aliases: ["lev", "le", "lv"] },
  { book: "Numbers", aliases: ["num", "nu", "nm", "nb"] },
  { book: "Deuteronomy", aliases: ["deut", "de", "dt"] },
  { book: "Joshua", aliases: ["josh", "jos", "jsh"] },
  { book: "Judges", aliases: ["judg", "jdg", "jg", "jdgs"] },
  { book: "Ruth", aliases: ["ruth", "rth", "ru"] },
  { book: "1 Samuel", aliases: ["1sam", "1sa", "1sm", "1s"] },
  { book: "2 Samuel", aliases: ["2sam", "2sa", "2sm", "2s"] },
  { book: "1 Kings", aliases: ["1kgs", "1ki", "1k", "1kin"] },
  { book: "2 Kings", aliases: ["2kgs", "2ki", "2k", "2kin"] },
  { book: "1 Chronicles", aliases: ["1chr", "1ch", "1chron"] },
  { book: "2 Chronicles", aliases: ["2chr", "2ch", "2chron"] },
  { book: "Ezra", aliases: ["ezr", "ez"] },
  { book: "Nehemiah", aliases: ["neh", "ne"] },
  { book: "Esther", aliases: ["esth", "est", "es"] },
  { book: "Job", aliases: ["job", "jb"] },
  { book: "Psalms", aliases: ["psa", "ps", "pss", "psalm"] },
  { book: "Proverbs", aliases: ["prov", "pro", "pr", "prv"] },
  { book: "Ecclesiastes", aliases: ["eccl", "ecc", "ec", "eccles"] },
  { book: "Song of Solomon", aliases: ["song", "sos", "ss", "sol", "sg"] },
  { book: "Isaiah", aliases: ["isa", "is"] },
  { book: "Jeremiah", aliases: ["jer", "je", "jr"] },
  { book: "Lamentations", aliases: ["lam", "la"] },
  { book: "Ezekiel", aliases: ["ezek", "eze", "ezk"] },
  { book: "Daniel", aliases: ["dan", "da", "dn"] },
  { book: "Hosea", aliases: ["hos", "ho"] },
  { book: "Joel", aliases: ["joel", "jl"] },
  { book: "Amos", aliases: ["amos", "am"] },
  { book: "Obadiah", aliases: ["obad", "ob", "obadia", "obadya", "obedia", "obediah"] },
  { book: "Jonah", aliases: ["jonah", "jon", "jnh"] },
  { book: "Micah", aliases: ["mic", "mc"] },
  { book: "Nahum", aliases: ["nah", "na"] },
  { book: "Habakkuk", aliases: ["hab", "hb"] },
  { book: "Zephaniah", aliases: ["zeph", "zep", "zp"] },
  { book: "Haggai", aliases: ["hag", "hg"] },
  { book: "Zechariah", aliases: ["zech", "zec", "zc"] },
  { book: "Malachi", aliases: ["mal", "ml"] },
  { book: "Matthew", aliases: ["matt", "mat", "mt"] },
  { book: "Mark", aliases: ["mark", "mrk", "mk"] },
  { book: "Luke", aliases: ["luke", "luk", "lk"] },
  { book: "John", aliases: ["john", "joh", "jhn", "jn", "j"] },
  { book: "Acts", aliases: ["acts", "act", "ac"] },
  { book: "Romans", aliases: ["rom", "ro", "rm"] },
  { book: "1 Corinthians", aliases: ["1cor", "1co"] },
  { book: "2 Corinthians", aliases: ["2cor", "2co"] },
  { book: "Galatians", aliases: ["gal", "ga"] },
  { book: "Ephesians", aliases: ["eph", "ep"] },
  { book: "Philippians", aliases: ["phil", "php", "pp"] },
  { book: "Colossians", aliases: ["col", "co", "coloss", "collossians"] },
  { book: "1 Thessalonians", aliases: ["1thes", "1th", "1thess"] },
  { book: "2 Thessalonians", aliases: ["2thes", "2th", "2thess"] },
  { book: "1 Timothy", aliases: ["1tim", "1ti", "1tm"] },
  { book: "2 Timothy", aliases: ["2tim", "2ti", "2tm"] },
  { book: "Titus", aliases: ["titus", "tit", "ti"] },
  { book: "Philemon", aliases: ["phm", "philem", "pm"] },
  { book: "Hebrews", aliases: ["heb", "he"] },
  { book: "James", aliases: ["jas", "ja", "jm"] },
  { book: "1 Peter", aliases: ["1pet", "1pe", "1pt", "1p"] },
  { book: "2 Peter", aliases: ["2pet", "2pe", "2pt", "2p"] },
  { book: "1 John", aliases: ["1jn", "1jo", "1joh", "1jhn", "1john"] },
  { book: "2 John", aliases: ["2jn", "2jo", "2joh", "2jhn", "2john"] },
  { book: "3 John", aliases: ["3jn", "3jo", "3joh", "3jhn", "3john"] },
  { book: "Jude", aliases: ["jude", "jud", "jd"] },
  { book: "Revelation", aliases: ["rev", "re", "rv"] },
];

function getExtendedAliases(entry: BookAlias): string[] {
  const aliases = new Set(entry.aliases);
  const numberedMatch = entry.book.match(/^([123])\s+(.+)$/);

  if (numberedMatch) {
    const digit = numberedMatch[1] as "1" | "2" | "3";
    const romanPrefix = ROMAN_NUMERAL_PREFIX[digit];

    for (const alias of entry.aliases) {
      if (alias.startsWith(digit)) {
        aliases.add(`${romanPrefix}${alias.slice(1)}`);
      }
    }

    aliases.add(`${romanPrefix}${numberedMatch[2].toLowerCase().replace(/\s+/g, "")}`);
  }

  return [...aliases];
}

// Build a flat lookup: alias → book name
const ALIAS_MAP = new Map<string, string>();
for (const entry of BOOK_ALIASES) {
  // Add all aliases
  for (const alias of getExtendedAliases(entry)) {
    ALIAS_MAP.set(alias, entry.book);
  }
  // Also add the full lowercase name
  ALIAS_MAP.set(entry.book.toLowerCase().replace(/\s+/g, ""), entry.book);
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface BibleSearchResult {
  /** Full book name */
  book: string;
  /** Chapter number (or null if only book matched) */
  chapter: number | null;
  /** Verse number (or null if only book+chapter matched) */
  verse: number | null;
  /** Optional verse range end, e.g. John 3:3-4 */
  endVerse?: number | null;
  /** Display label, e.g. "Genesis 1:1" */
  label: string;
  /** Confidence 0-100 */
  score: number;
}

export interface BibleComparisonSearchResult {
  leftQuery: string;
  rightQuery: string;
  left: BibleSearchResult | null;
  right: BibleSearchResult | null;
}

export function parseBibleComparisonSearchOptions(query: string): BibleComparisonSearchResult[] {
  const raw = query.trim();
  if (!raw) return [];

  const delimiterIndexes: number[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === "-" || char === "–" || char === "—" || char === "|") {
      delimiterIndexes.push(index);
    }
  }

  for (const delimiterIndex of delimiterIndexes) {
    const leftQuery = raw.slice(0, delimiterIndex).trim();
    const rightQuery = raw.slice(delimiterIndex + 1).trim();
    if (!leftQuery || !rightQuery) continue;
    if (!/[a-z]/i.test(leftQuery) || !/[a-z]/i.test(rightQuery)) continue;

    const leftMatches = parseBibleSearch(leftQuery).filter((result) => result.chapter !== null).slice(0, 3);
    const rightMatches = parseBibleSearch(rightQuery).filter((result) => result.chapter !== null).slice(0, 3);

    if (leftMatches.length === 0 && rightMatches.length === 0) {
      continue;
    }

    const options: BibleComparisonSearchResult[] = [];
    const seen = new Set<string>();
    const leftOptions = leftMatches.length > 0 ? leftMatches : [null];
    const rightOptions = rightMatches.length > 0 ? rightMatches : [null];

    for (const left of leftOptions) {
      for (const right of rightOptions) {
        const key = `${left?.label ?? ""}|${right?.label ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({
          leftQuery,
          rightQuery,
          left,
          right,
        });
      }
    }

    if (options.length > 0) {
      return options;
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a fuzzy Bible reference query into search results.
 *
 * Handles formats like:
 *   "gen 1:1", "gen1vs1", "gen1.1", "gen11", "g11",
 *   "genesis 1 1", "1cor13:4", "ps23", "jn3:16",
 *   "j316" → John 3:16 AND John 31:6
 *   "jn316" → John 3:16 AND John 31:6
 */
export function parseBibleSearch(query: string): BibleSearchResult[] {
  const raw = query.trim();
  if (!raw) return [];

  // Normalize: lowercase, collapse whitespace
  const q = normalizeRomanNumberedBookPrefix(raw.toLowerCase().replace(/\s+/g, " "));

  // ── Strategy 1: Split into book-part and numbers ──
  // Try to extract a leading book identifier and trailing numbers
  // Patterns:
  //   "genesis 1:1"  → book="genesis", nums="1:1"
  //   "gen1vs1"      → book="gen", nums="1vs1"
  //   "g11"          → book="g", nums="11"
  //   "1cor13:4"     → book="1cor", nums="13:4"
  //   "1 john 3:16"  → book="1john", nums="3:16"

  // Handle numbered books: "1 samuel" → "1samuel", "2 kings" → "2kings"
  const normalized = q.replace(/^((?:\d|iii|ii|i))\s+/, "$1");

  // Split into book text and number portion
  // Match: optional leading digit, then letters (book name), then numbers/separators
  const splitMatch = normalized.match(
    /^(\d?[a-z]+)\s*(\d.*)?$/
  );

  if (!splitMatch) {
    // Try plain text match against book names
    return matchBooksByName(q);
  }

  const bookPart = splitMatch[1]; // e.g. "gen", "1cor", "g", "j", "jn"
  const numPart = splitMatch[2] ?? ""; // e.g. "1:1", "1vs1", "11", "316"

  // Find matching books
  const matchedBooks = findBooks(bookPart);

  if (matchedBooks.length === 0) return [];

  // Parse chapter:verse candidates from number part
  const hasWhitespace = /\s/.test(raw);
  const candidates = parseChapterVerseCandidates(numPart, hasWhitespace);

  // Build results
  const results: BibleSearchResult[] = [];

  for (const { book, score: bookScore } of matchedBooks) {
    const maxCh = BOOK_CHAPTERS[book] ?? 1;

    if (maxCh === 1 && numPart) {
      const singleChapterCandidates = parseSingleChapterVerseCandidates(numPart);
      if (singleChapterCandidates.length > 0) {
        const maxV = getCanonicalVerseCount(book, 1);
        for (const candidate of singleChapterCandidates) {
          const isVsValid = maxV === null || (candidate.verse !== null && candidate.verse <= maxV);
          results.push({
            book,
            chapter: 1,
            verse: candidate.verse,
            endVerse: candidate.endVerse,
            label:
              candidate.endVerse && candidate.endVerse !== candidate.verse
                ? `${book} 1:${candidate.verse}-${candidate.endVerse}`
                : `${book} 1:${candidate.verse}`,
            score: bookScore + candidate.confidence,
          });

          if (!isVsValid && candidate.verse !== null) {
            const repairedList = recoverInvalidReference(
              book,
              1,
              candidate.verse,
              candidate.endVerse,
              candidate.confidence - 5,
            );
            for (const rep of repairedList) {
              results.push({
                book,
                chapter: rep.chapter,
                verse: rep.verse,
                endVerse: rep.endVerse,
                label:
                  rep.verse !== null
                    ? `${book} ${rep.chapter}:${rep.verse}`
                    : `${book} ${rep.chapter}`,
                score: bookScore + rep.confidence,
              });
            }
          }
        }
        continue;
      }
    }

    if (candidates.length === 0) {
      // Book-only match
      results.push({
        book,
        chapter: null,
        verse: null,
        endVerse: null,
        label: book,
        score: bookScore,
      });
    } else {
      const canonicalMatches: BibleSearchResult[] = [];
      const invalidCandidates: ChapterVerseCandidate[] = [];

      for (const candidate of candidates) {
        const { chapter, verse, endVerse, confidence } = candidate;
        if (chapter !== null && chapter >= 1 && chapter <= maxCh) {
          const maxVerse = getCanonicalVerseCount(book, chapter);
          const isVerseValid =
            verse === null || (maxVerse !== null && verse >= 1 && verse <= maxVerse);
          const isEndVerseValid =
            endVerse === null ||
            endVerse === undefined ||
            (maxVerse !== null &&
              verse !== null &&
              endVerse >= verse &&
              endVerse <= maxVerse);

          if (isVerseValid && isEndVerseValid) {
            if (verse !== null) {
              canonicalMatches.push({
                book,
                chapter,
                verse,
                endVerse,
                label:
                  endVerse && endVerse !== verse
                    ? `${book} ${chapter}:${verse}-${endVerse}`
                    : `${book} ${chapter}:${verse}`,
                score: bookScore + confidence,
              });
            } else {
              canonicalMatches.push({
                book,
                chapter,
                verse: null,
                endVerse: null,
                label: `${book} ${chapter}`,
                score: bookScore + confidence,
              });
            }
          } else {
            invalidCandidates.push(candidate);
          }
        } else if (chapter !== null) {
          invalidCandidates.push(candidate);
        }
      }

      if (canonicalMatches.length > 0) {
        results.push(...canonicalMatches);
      } else if (invalidCandidates.length > 0) {
        for (const inv of invalidCandidates) {
          if (inv.chapter !== null) {
            const repairedList = recoverInvalidReference(
              book,
              inv.chapter,
              inv.verse,
              inv.endVerse,
              inv.confidence,
            );
            for (const rep of repairedList) {
              results.push({
                book,
                chapter: rep.chapter,
                verse: rep.verse,
                endVerse: rep.endVerse,
                label:
                  rep.verse !== null
                    ? `${book} ${rep.chapter}:${rep.verse}`
                    : `${book} ${rep.chapter}`,
                score: bookScore + rep.confidence,
              });
            }
          }
        }
      }

      // If no candidates matched the book's chapter range, still show the book
      const hasValidResult = results.some((r) => r.book === book && r.chapter !== null);
      if (!hasValidResult) {
        results.push({
          book,
          chapter: null,
          verse: null,
          endVerse: null,
          label: book,
          score: bookScore - 10,
        });
      }
    }
  }

  // Deduplicate by label
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    if (seen.has(r.label)) return false;
    seen.add(r.label);
    return true;
  });

  // Sort by score descending
  deduped.sort((a, b) => b.score - a.score);

  return deduped.slice(0, 10);
}

export function parseBibleComparisonSearch(query: string): BibleComparisonSearchResult | null {
  return parseBibleComparisonSearchOptions(query)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findBooks(bookPart: string): Array<{ book: string; score: number }> {
  const results: Array<{ book: string; score: number }> = [];

  // 1. Exact alias match (highest priority)
  const exact = ALIAS_MAP.get(bookPart);
  if (exact) {
    results.push({ book: exact, score: 100 });
    return results; // Exact match — don't add fuzzy results
  }

  // 2. Prefix match on aliases
  for (const entry of BOOK_ALIASES) {
    for (const alias of getExtendedAliases(entry)) {
      if (alias.startsWith(bookPart)) {
        results.push({ book: entry.book, score: 80 });
        break; // One match per book is enough
      }
    }
  }

  // 3. Prefix match on full book names
  if (results.length === 0) {
    for (const book of ALL_BOOKS) {
      const bookLower = book.toLowerCase().replace(/\s+/g, "");
      if (bookLower.startsWith(bookPart)) {
        results.push({ book, score: 70 });
      }
    }
  }

  // 4. Substring match (lowest priority)
  if (results.length === 0) {
    for (const book of ALL_BOOKS) {
      const bookLower = book.toLowerCase().replace(/\s+/g, "");
      if (bookLower.includes(bookPart)) {
        results.push({ book, score: 50 });
      }
    }
  }

  // 5. Fuzzy match on book names and extended aliases (typo tolerance)
  if (results.length === 0 && bookPart.length >= 3) {
    const numPrefix = bookPart.match(/^([123])/)?.[1];
    const maxDist = bookPart.length <= 4 ? 1 : 2;

    const fuzzyCandidates: Array<{
      book: string;
      dist: number;
      isFullBookMatch: boolean;
      score: number;
    }> = [];

    for (const book of ALL_BOOKS) {
      const bookLower = book.toLowerCase().replace(/\s+/g, "");
      const bookNumPrefix = book.match(/^([123])/)?.[1];
      if (numPrefix && bookNumPrefix !== numPrefix) continue;

      let bestDist = Number.POSITIVE_INFINITY;
      let isFullMatch = false;

      // Full book name check
      if (Math.abs(bookPart.length - bookLower.length) <= maxDist) {
        const bookDist = damerauLevenshteinDistance(bookPart, bookLower, maxDist);
        if (bookDist <= maxDist) {
          bestDist = bookDist;
          isFullMatch = true;
        }
      }

      // Alias check (only compare if alias length is close to query)
      const aliases = BOOK_ALIASES.find((a) => a.book === book);
      if (aliases) {
        for (const alias of getExtendedAliases(aliases)) {
          if (alias.length >= 3 && Math.abs(bookPart.length - alias.length) <= maxDist) {
            const aliasDist = damerauLevenshteinDistance(bookPart, alias, maxDist);
            if (aliasDist <= maxDist && aliasDist < bestDist) {
              bestDist = aliasDist;
              isFullMatch = false;
            }
          }
        }
      }

      if (Number.isFinite(bestDist) && bestDist <= maxDist) {
        let score = Math.max(35, 65 - bestDist * 15);
        if (isFullMatch) score += 6;
        if (Math.abs(bookPart.length - bookLower.length) === 0) score += 4;

        fuzzyCandidates.push({
          book,
          dist: bestDist,
          isFullBookMatch: isFullMatch,
          score,
        });
      }
    }

    fuzzyCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.dist !== b.dist) return a.dist - b.dist;
      return 0;
    });

    for (const cand of fuzzyCandidates) {
      results.push({ book: cand.book, score: cand.score });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.book)) return false;
    seen.add(r.book);
    return true;
  });
}

interface ChapterVerseCandidate {
  chapter: number | null;
  verse: number | null;
  endVerse?: number | null;
  /** Higher = more likely the intended interpretation */
  confidence: number;
}

function recoverInvalidReference(
  book: string,
  chapter: number,
  verse: number | null,
  endVerse: number | null = null,
  baseConfidence: number = 20,
): ChapterVerseCandidate[] {
  const maxCh = BOOK_CHAPTERS[book] ?? 1;
  const recovered: ChapterVerseCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (c: number, v: number | null, eV: number | null, conf: number) => {
    if (!Number.isFinite(c) || c < 1 || c > maxCh) return;
    const maxV = getCanonicalVerseCount(book, c);
    if (v !== null) {
      if (!Number.isFinite(v) || v < 1 || (maxV !== null && v > maxV)) return;
      if (eV !== null && (!Number.isFinite(eV) || eV < v || (maxV !== null && eV > maxV))) return;
    }
    const key = `${c}:${v ?? ""}-${eV ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    recovered.push({
      chapter: c,
      verse: v,
      endVerse: eV,
      confidence: Math.max(8, conf),
    });
  };

  const chDigits = String(chapter);
  const vsDigits = verse !== null ? String(verse) : "";
  const combinedDigits = `${chDigits}${vsDigits}`;

  // 1. Repartition raw combined digits (e.g. 3:31 -> digits 331 -> 33:1)
  if (combinedDigits.length >= 2) {
    for (let i = 1; i < combinedDigits.length; i++) {
      const cPart = combinedDigits.slice(0, i);
      const vPart = combinedDigits.slice(i);
      if (vPart.length > 1 && vPart[0] === "0") continue;
      const c = parseInt(cPart, 10);
      const v = parseInt(vPart, 10);
      if (c === chapter && v === verse) continue;
      if (c >= 1 && c <= maxCh) {
        const maxV = getCanonicalVerseCount(book, c);
        if (maxV !== null && v >= 1 && v <= maxV) {
          pushCandidate(c, v, null, baseConfidence + 6);
        }
      }
    }
  }

  // 2. Transpose adjacent digits (e.g. 331 -> 313 -> 31:3)
  if (combinedDigits.length >= 3) {
    for (let i = 0; i < combinedDigits.length - 1; i++) {
      const arr = combinedDigits.split("");
      const tmp = arr[i];
      arr[i] = arr[i + 1];
      arr[i + 1] = tmp;
      const swapped = arr.join("");
      if (swapped === combinedDigits) continue;
      for (let j = 1; j < swapped.length; j++) {
        const cPart = swapped.slice(0, j);
        const vPart = swapped.slice(j);
        if (vPart.length > 1 && vPart[0] === "0") continue;
        const c = parseInt(cPart, 10);
        const v = parseInt(vPart, 10);
        if (c >= 1 && c <= maxCh) {
          const maxV = getCanonicalVerseCount(book, c);
          if (maxV !== null && v >= 1 && v <= maxV) {
            pushCandidate(c, v, null, baseConfidence + 2);
          }
        }
      }
    }
  }

  // 3. Swap chapter and verse if verse is a valid chapter (e.g. 3:31 -> 31:3)
  if (verse !== null && verse >= 1 && verse <= maxCh && chapter >= 1) {
    const maxV = getCanonicalVerseCount(book, verse);
    if (maxV !== null && chapter <= maxV) {
      pushCandidate(verse, chapter, null, baseConfidence + 3);
    }
  }

  // 4. If chapter is valid but verse exceeds max verse in that chapter:
  if (chapter >= 1 && chapter <= maxCh) {
    const maxV = getCanonicalVerseCount(book, chapter);
    if (maxV !== null) {
      if (endVerse !== null && verse !== null && endVerse > maxV) {
        pushCandidate(chapter, Math.min(verse, maxV), maxV, baseConfidence + 4);
      }
      // Suggest last verse of chapter
      pushCandidate(chapter, maxV, null, baseConfidence);
      // Suggest whole chapter
      pushCandidate(chapter, null, null, baseConfidence - 2);
      // Suggest first verse of chapter
      pushCandidate(chapter, 1, null, baseConfidence - 4);
    }
  }

  // 5. If chapter is invalid (chapter > maxCh):
  if (chapter > maxCh) {
    if (chDigits.endsWith("0")) {
      const stripped = parseInt(chDigits.slice(0, -1), 10);
      if (stripped >= 1 && stripped <= maxCh) {
        const maxV = getCanonicalVerseCount(book, stripped);
        const safeV = verse !== null && maxV !== null ? Math.min(verse, maxV) : verse;
        pushCandidate(stripped, safeV, null, baseConfidence);
      }
    }
    if (chDigits.length >= 2) {
      const mergedChapter = Number.parseInt(chDigits[0], 10);
      const mergedVerseDigits = `${chDigits.slice(1)}${verse ?? ""}`;
      const mergedVerse = Number.parseInt(mergedVerseDigits.replace(/^0+/, "") || "0", 10);
      if (mergedChapter >= 1 && mergedChapter <= maxCh) {
        const maxV = getCanonicalVerseCount(book, mergedChapter);
        if (maxV !== null && mergedVerse >= 1 && mergedVerse <= maxV) {
          pushCandidate(mergedChapter, mergedVerse, null, baseConfidence - 2);
        }
      }
    }
    const maxChMaxV = getCanonicalVerseCount(book, maxCh);
    pushCandidate(maxCh, verse !== null && maxChMaxV !== null ? Math.min(verse, maxChMaxV) : null, null, baseConfidence - 4);
    pushCandidate(maxCh, null, null, baseConfidence - 6);
  }

  // 6. If verse was specified, find closest chapter in the same book that has this verse
  if (verse !== null && verse >= 1) {
    let closestChapter: number | null = null;
    let closestDist = Number.POSITIVE_INFINITY;
    for (let c = 1; c <= maxCh; c++) {
      if (c === chapter) continue;
      const maxV = getCanonicalVerseCount(book, c);
      if (maxV !== null && maxV >= verse) {
        const dist = Math.abs(c - chapter);
        if (dist < closestDist) {
          closestDist = dist;
          closestChapter = c;
        }
      }
    }
    if (closestChapter !== null) {
      pushCandidate(closestChapter, verse, null, baseConfidence - 5);
    }
  }

  return recovered;
}

function parseSingleChapterVerseCandidates(numPart: string): ChapterVerseCandidate[] {
  if (!numPart) return [];

  const cleaned = numPart
    .replace(/vs/gi, ":")
    .replace(/v/gi, ":")
    .replace(/\./g, ":")
    .replace(/[-–—]/g, ":")
    .replace(/\s+/g, ":");

  const parts = cleaned.split(":").filter(Boolean);
  if (parts.length === 0) return [];

  if (parts.length >= 2) {
    const chapter = parseInt(parts[0], 10);
    const verse = parseInt(parts[1], 10);
    if (
      chapter === 1 &&
      Number.isFinite(verse) &&
      verse >= 1 &&
      verse <= MAX_BIBLE_VERSE_NUMBER
    ) {
      return [{ chapter: 1, verse, endVerse: null, confidence: 32 }];
    }
  }

  if (parts.length === 1) {
    const verse = parseInt(parts[0], 10);
    if (
      Number.isFinite(verse) &&
      verse >= 1 &&
      verse <= MAX_BIBLE_VERSE_NUMBER
    ) {
      return [{ chapter: 1, verse, endVerse: null, confidence: parts[0].length === 1 ? 26 : 23 }];
    }
  }

  return [];
}

/**
 * Parse a number portion into one or more chapter:verse candidates.
 *
 * For explicit separators ("3:16", "3vs16", "3.16") → single result.
 * For jammed numbers ("316") → try all split points:
 *   "316" → 3:16 (conf 25), 31:6 (conf 20)
 *   "11"  → 1:1 (conf 15), chapter 11 (conf 10)
 */
function parseChapterVerseCandidates(numPart: string, hasWhitespace = false): ChapterVerseCandidate[] {
  if (!numPart) return [];

  // Clean separators: "vs", "v", ".", ":"  all become ":"
  const cleaned = numPart
    .replace(/vs/gi, ":")
    .replace(/v/gi, ":")
    .replace(/\./g, ":")
    .replace(/[-–—]/g, ":")
    .replace(/\s+/g, ":");

  // Split by ":"
  const parts = cleaned.split(":").filter(Boolean);

  if (parts.length === 0) return [];

  // Two or more explicit parts → unambiguous chapter:verse
  if (parts.length >= 2) {
    const ch = parseInt(parts[0], 10);
    const vs = parseInt(parts[1], 10);
    const endVs = parts.length >= 3 ? parseInt(parts[2], 10) : null;
    if (isNaN(ch)) return [];
    if (!isNaN(vs) && (vs < 1 || vs > MAX_BIBLE_VERSE_NUMBER)) return [];
    if (
      endVs !== null &&
      (!Number.isFinite(endVs) || endVs < vs || endVs > MAX_BIBLE_VERSE_NUMBER)
    ) return [];
    return [{
      chapter: ch,
      verse: isNaN(vs) ? null : vs,
      endVerse: endVs !== null && !isNaN(endVs) && endVs >= vs ? endVs : null,
      confidence: 30,
    }];
  }

  // Single jammed number like "316", "11", "2316" etc.
  const digits = parts[0];
  const num = parseInt(digits, 10);
  if (isNaN(num)) return [];

  const candidates: ChapterVerseCandidate[] = [];

  // Try all possible split positions: digits[0..i] : digits[i..]
  // e.g. "316" → "3":"16", "31":"6"
  for (let i = 1; i < digits.length; i++) {
    const chStr = digits.substring(0, i);
    const vsStr = digits.substring(i);
    // Skip if verse part has a leading zero (e.g. "30:06" is odd)
    if (vsStr.length > 1 && vsStr[0] === "0") continue;

    const ch = parseInt(chStr, 10);
    const vs = parseInt(vsStr, 10);
    if (ch < 1 || vs < 1 || vs > MAX_BIBLE_VERSE_NUMBER) continue;

    // For 3+ digit numbers (like "316"), the ch:vs split is almost certainly
    // intended → give high confidence to early splits.
    // For 2-digit numbers (like "23"), chapter-only is usually intended,
    // so give splits lower confidence.
    let conf: number;
    if (digits.length >= 3) {
      // "316" → 3:16 (conf 25), 31:6 (conf 18)
      conf = 25 - (i - 1) * 7;
    } else {
      // "23" → 2:3 (conf 12)  — lower than chapter-only (16 or 20)
      conf = 12 - (i - 1) * 3;
    }
    candidates.push({ chapter: ch, verse: vs, endVerse: null, confidence: Math.max(conf, 8) });
  }

  // Also add the whole number as chapter-only (if reasonable)
  if (num >= 1 && num <= 150) {
    // For 2-digit numbers, chapter-only gets higher confidence, especially with whitespace
    const chapterConf = digits.length <= 2 ? (hasWhitespace ? 20 : 16) : 5;
    candidates.push({ chapter: num, verse: null, endVerse: null, confidence: chapterConf });
  }

  // Smart ambiguous shorthand:
  // "334" -> 3:34 OR 3:3-4
  // "316" -> 3:16 OR 3:1-6
  if (digits.length >= 3) {
    const chapterDigits = digits.slice(0, -2);
    const startDigit = digits.charAt(digits.length - 2);
    const endDigit = digits.charAt(digits.length - 1);
    if (chapterDigits && startDigit && endDigit) {
      const chapter = parseInt(chapterDigits, 10);
      const verse = parseInt(startDigit, 10);
      const endVerse = parseInt(endDigit, 10);
      if (
        Number.isFinite(chapter) &&
        chapter >= 1 &&
        verse >= 1 &&
        endVerse >= 1 &&
        endVerse > verse
      ) {
        candidates.push({
          chapter,
          verse,
          endVerse,
          confidence: 22,
        });
      }
    }
  }

  return candidates;
}

function matchBooksByName(query: string): BibleSearchResult[] {
  const results: BibleSearchResult[] = [];
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return [];

  for (const book of ALL_BOOKS) {
    const bookLower = book.toLowerCase().replace(/\s+/g, "");
    if (bookLower.includes(q) || q.includes(bookLower)) {
      results.push({
        book,
        chapter: null,
        verse: null,
        endVerse: null,
        label: book,
        score: bookLower.startsWith(q) ? 90 : 60,
      });
    }
  }

  // If no direct matches, check fuzzy distance
  if (results.length === 0 && q.length >= 3) {
    const numPrefix = q.match(/^([123])/)?.[1];
    const maxDist = q.length <= 4 ? 1 : 2;

    for (const book of ALL_BOOKS) {
      const bookLower = book.toLowerCase().replace(/\s+/g, "");
      const bookNumPrefix = book.match(/^([123])/)?.[1];
      if (numPrefix && bookNumPrefix !== numPrefix) continue;

      let bestDist = Number.POSITIVE_INFINITY;
      let isFullMatch = false;

      if (Math.abs(q.length - bookLower.length) <= maxDist) {
        const bookDist = damerauLevenshteinDistance(q, bookLower, maxDist);
        if (bookDist <= maxDist) {
          bestDist = bookDist;
          isFullMatch = true;
        }
      }

      const aliases = BOOK_ALIASES.find((a) => a.book === book);
      if (aliases) {
        for (const alias of getExtendedAliases(aliases)) {
          if (alias.length >= 3 && Math.abs(q.length - alias.length) <= maxDist) {
            const aliasDist = damerauLevenshteinDistance(q, alias, maxDist);
            if (aliasDist <= maxDist && aliasDist < bestDist) {
              bestDist = aliasDist;
              isFullMatch = false;
            }
          }
        }
      }

      if (Number.isFinite(bestDist) && bestDist <= maxDist) {
        let score = Math.max(30, 55 - bestDist * 15);
        if (isFullMatch) score += 5;
        results.push({
          book,
          chapter: null,
          verse: null,
          endVerse: null,
          label: book,
          score,
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 8);
}
