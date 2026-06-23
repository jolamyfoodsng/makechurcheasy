/**
 * scriptureParser.ts — Fast Bible reference parser (no LLM, <1ms)
 *
 * Parses spoken references like:
 *   "John 3:16"                    → { book: "John", chapter: 3, verse: 16 }
 *   "Romans chapter 8 verse 28"    → { book: "Romans", chapter: 8, verse: 28 }
 *   "Psalm 23"                     → { book: "Psalms", chapter: 23, verse: null }
 *   "First Corinthians 13"         → { book: "1 Corinthians", chapter: 13, verse: null }
 *   "verse 28"                     → { book: null, chapter: null, verse: 28 }  (relative)
 *   "chapter 3 verse 16"           → { book: null, chapter: 3, verse: 16 }    (relative)
 *
 * Pure TypeScript. No AI. No embeddings.
 */

import { BOOK_CHAPTERS } from "../dock/dockTypes";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ParsedReference {
  book: string | null;
  chapter: number | null;
  verse: number | null;
  endVerse?: number | null;
  /** Was this a relative reference (no book mentioned)? */
  isRelative: boolean;
}

// ---------------------------------------------------------------------------
// Book aliases — spoken forms, misspellings, abbreviations, Nigerian accents
// ---------------------------------------------------------------------------
// Strategy: exact aliases for known forms, then fuzzy Levenshtein fallback.

const BOOK_ALIAS_MAP = new Map<string, string>();

function alias(from: string, to: string): void {
  BOOK_ALIAS_MAP.set(from.toLowerCase(), to);
}

function aliases(canonical: string, spoken: string[]): void {
  for (const s of spoken) alias(s, canonical);
  // Also add the canonical lowercase and no-space form
  alias(canonical, canonical);
  alias(canonical.replace(/\s+/g, ""), canonical);
}

// ---------------------------------------------------------------------------
// Levenshtein distance — for fuzzy fallback when alias lookup fails
// ---------------------------------------------------------------------------
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Fuzzy match a word against all 66 canonical book names.
 * Returns the best match and its confidence score (0-1).
 * Threshold: Levenshtein distance <= 3 for short words, <= floor(len/3) for longer.
 */
const ALL_BOOKS: string[] = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes",
  "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel",
  "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
  "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
  "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians",
  "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy",
  "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
  "1 John", "2 John", "3 John", "Jude", "Revelation",
  // Base forms for numbered books (needed for fuzzy matching accent variants)
  "Samuel", "Kings", "Chronicles", "Corinthians", "Thessalonians",
  "Timothy", "Peter",
];

// Single-word book names for fuzzy matching (strip "1 "/"2 "/"3 " prefixes)
const SINGLE_WORD_BOOKS = ALL_BOOKS.filter((b) => !b.startsWith("1 ") && !b.startsWith("2 ") && !b.startsWith("3 "));

function fuzzyMatchBook(input: string): { book: string; score: number } | null {
  const lower = input.toLowerCase().trim();
  if (lower.length < 3) return null;

  let best: { book: string; score: number } | null = null;

  for (const book of SINGLE_WORD_BOOKS) {
    const bookLower = book.toLowerCase();
    const dist = levenshtein(lower, bookLower);
    const maxLen = Math.max(lower.length, bookLower.length);
    const score = 1 - dist / maxLen;

    // Accept if distance is reasonable (≤3 edits, or ≤30% of word length)
    const threshold = Math.min(3, Math.floor(bookLower.length / 3));
    if (dist <= threshold && score > 0.5) {
      if (!best || score > best.score) {
        best = { book, score };
      }
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Numbered book resolver — handles spoken, ordinal, and accent variants
// ---------------------------------------------------------------------------
// Maps spoken number words to digits (Nigerian accent variants included)
const ORDINAL_MAP: Record<string, string> = {
  first: "1", second: "2", third: "3",
  // Standard digit words
  one: "1", two: "2", three: "3",
  // Nigerian accent / ASR variants
  won: "1",       // "won" ≈ "one" in Nigerian English
  to: "2",        // "to" ≈ "two"
  too: "2",       // "too" ≈ "two"
  tu: "2",        // "tu" ≈ "two" (Yoruba influence)
  tree: "3",      // "tree" ≈ "three" (West African)
  free: "3",      // "free" ≈ "three" (ASR confusion)
  // Abbreviated
  "1st": "1", "2nd": "2", "3rd": "3",
};

/**
 * Try to resolve a leading number-word to a digit string ("1", "2", "3").
 * Handles: "first", "one", "won", "1st", "1", etc.
 */
function resolveOrdinal(token: string): string | null {
  const lower = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ORDINAL_MAP[lower]) return ORDINAL_MAP[lower];
  if (/^[123]$/.test(lower)) return lower;
  return null;
}

// ---------------------------------------------------------------------------
// Numbered book definitions — canonical + abbreviations
// ---------------------------------------------------------------------------
interface NumberedBookDef {
  base: string;          // Plural canonical suffix: "Samuel", "Kings"
  singular: string;      // Singular: "Samuel", "King"
  abbreviations: string[];
}

const NUMBERED_BOOKS: NumberedBookDef[] = [
  { base: "Samuel", singular: "Samuel", abbreviations: ["sam", "sa", "sm", "s"] },
  { base: "Kings", singular: "King", abbreviations: ["kgs", "ki", "k", "kin"] },
  { base: "Chronicles", singular: "Chronicle", abbreviations: ["chr", "ch", "chron", "chroni"] },
  { base: "Corinthians", singular: "Corinthian", abbreviations: ["cor", "co", "corinth", "corinthi"] },
  { base: "Thessalonians", singular: "Thessalonian", abbreviations: ["thes", "th", "thess", "thesal"] },
  { base: "Timothy", singular: "Timothy", abbreviations: ["tim", "ti", "tm"] },
  { base: "Peter", singular: "Peter", abbreviations: ["pet", "pe", "pt"] },
  { base: "John", singular: "John", abbreviations: ["jn", "jo", "joh", "johh"] },
];

/**
 * Try to match "first king", "second samuel", "won corinthians", etc.
 * Returns the canonical book name or null.
 *
 * Pattern: <ordinal-word> <book-suffix>
 */
function resolveNumberedBook(text: string): string | null {
  const result = resolveNumberedBookWithTokens(text);
  return result ? result.book : null;
}

interface NumberedBookResult {
  book: string;
  /** Index after the last matched token (e.g., if book is at indices 4-5, this is 6) */
  afterBookIdx: number;
}

function resolveNumberedBookWithTokens(text: string): NumberedBookResult | null {
  const tokens = text.toLowerCase().trim().split(/\s+/);
  if (tokens.length < 2) return null;

  for (let i = 0; i < tokens.length - 1; i++) {
    const digit = resolveOrdinal(tokens[i]);
    if (!digit) continue;

    for (const def of NUMBERED_BOOKS) {
      const suffix = tokens[i + 1].toLowerCase();
      // Match plural, singular, or abbreviation
      if (
        suffix === def.base.toLowerCase() ||
        suffix === def.singular.toLowerCase() ||
        def.abbreviations.includes(suffix)
      ) {
        return { book: `${digit} ${def.base}`, afterBookIdx: i + 2 };
      }
    }
  }
  return null;
}

interface ChapterVerseResult {
  chapter: number;
  verse: number | null;
  endVerse: number | null;
}

function parseChapterVerseFromTokens(tokens: string[]): ChapterVerseResult | null {
  if (tokens.length === 0) return null;

  // Handle colon notation first (e.g., "2:1", "3:16-17")
  // This is common when the input comes as a single token after a numbered book
  // like "2 kings 2:1" where "2:1" is one token.
  for (const t of tokens) {
    const colonMatch = t.match(/^(\d+):(\d+)(?:-(\d+))?$/);
    if (colonMatch) {
      return {
        chapter: parseInt(colonMatch[1], 10),
        verse: parseInt(colonMatch[2], 10),
        endVerse: colonMatch[3] ? parseInt(colonMatch[3], 10) : null,
      };
    }
  }

  // Filter out ordinal suffixes and filler words like "chapter", "verse", "open"
  const cleaned: string[] = [];
  for (const t of tokens) {
    const low = t.toLowerCase();
    if (/^\d+(st|nd|rd|th)$/.test(low)) continue; // ordinal suffix
    if (/^(chapter|chap|verse|open|turn|read|look)$/i.test(low)) continue;
    cleaned.push(t);
  }

  const numbers: number[] = [];
  for (const t of cleaned) {
    const n = parseNumberWord(t);
    if (n !== null) numbers.push(n);
  }

  if (numbers.length === 0) return null;
  if (numbers.length === 1) return { chapter: numbers[0], verse: null, endVerse: null };
  return { chapter: numbers[0], verse: numbers[1], endVerse: numbers.length > 2 ? numbers[2] : null };
}

// ---------------------------------------------------------------------------
// Pre-register all numbered book aliases (digit-based)
// ---------------------------------------------------------------------------
function numberedBook(base: string, _canonical: string, spoken: string[]): void {
  const spokenLower = base.toLowerCase();
  const singularLower = spokenLower.endsWith("s") ? spokenLower.slice(0, -1) : spokenLower;
  const ordinals: Array<{ digit: string; word: string; ord: string }> = [
    { digit: "1", word: "first", ord: "1st" },
    { digit: "2", word: "second", ord: "2nd" },
    { digit: "3", word: "third", ord: "3rd" },
  ];

  for (const { digit, word, ord } of ordinals) {
    const full = `${digit} ${base}`;
    const entries = [
      `${digit}${spokenLower}`, `${digit} ${spokenLower}`,
      ...spoken.map((s) => `${digit}${s}`), ...spoken.map((s) => `${digit} ${s}`),
      `${word} ${spokenLower}`, `${word}${spokenLower}`,
      `${ord} ${spokenLower}`, `${ord}${spokenLower}`,
      ...spoken.map((s) => `${ord} ${s}`), ...spoken.map((s) => `${ord}${s}`),
      `${digit}${singularLower}`, `${digit} ${singularLower}`,
      `${word} ${singularLower}`, `${word}${singularLower}`,
      `${ord} ${singularLower}`, `${ord}${singularLower}`,
    ];
    aliases(full, entries);
  }
  // Roman numeral variants
  const roman: Record<string, string> = { "1": "i", "2": "ii", "3": "iii" };
  for (const [digit, rom] of Object.entries(roman)) {
    const full = `${digit} ${base}`;
    aliases(full, [
      `${rom}${spokenLower}`, `${rom} ${spokenLower}`,
      ...(singularLower !== spokenLower ? [`${rom}${singularLower}`, `${rom} ${singularLower}`] : []),
    ]);
  }
}

// ── OLD TESTAMENT ──
aliases("Genesis", ["genesis", "gen", "ge", "gn", "gs", "geneis", "genisis", "jenesis", "genny"]);
aliases("Exodus", ["exodus", "exo", "ex", "exod", "exxodus", "exodos", "exadus"]);
aliases("Leviticus", ["leviticus", "lev", "le", "lv", "leveticus", "levitcus", "laviticus"]);
aliases("Numbers", ["numbers", "num", "nu", "nm", "nb", "nombers", "numburs", "number"]);
aliases("Deuteronomy", ["deuteronomy", "deut", "de", "dt", "deuteronmy", "deuternomy", "deuteronomy"]);
aliases("Joshua", ["joshua", "josh", "jos", "jsh", "joshu", "josua", "joshwa"]);
aliases("Judges", ["judges", "judg", "jdg", "jg", "jdgs", "juds", "judgess"]);
aliases("Ruth", ["ruth", "rth", "ru", "ruths"]);
numberedBook("Samuel", "1 Samuel", ["sam", "sa", "sm", "s", "samuel"]);
numberedBook("Kings", "1 Kings", ["kgs", "ki", "k", "kin", "king", "kings"]);
numberedBook("Chronicles", "1 Chronicles", ["chr", "ch", "chron", "chronicles", "chronicle"]);
aliases("Ezra", ["ezra", "ezr", "ez", "ezera"]);
aliases("Nehemiah", ["nehemiah", "neh", "ne", "nehimiah", "nehimya", "nehemiah"]);
aliases("Esther", ["esther", "esth", "est", "es", "ester", "esters"]);
aliases("Job", ["job", "jobs", "jb"]);
aliases("Psalms", ["psalms", "psalm", "psa", "ps", "pss", "salms", "salm", "psums", "psams"]);
aliases("Proverbs", ["proverbs", "prov", "pro", "pr", "prv", "prover", "proberbs", "probrs"]);
aliases("Ecclesiastes", [
  "ecclesiastes", "eccl", "ecc", "ec", "eccles", "ecclesiasties", "ecclesiates",
  "ecclesiats", "ecclesiaste", "eclesiastes", "eklesiastes", "ecclesaisties",
]);
aliases("Song of Solomon", [
  "song of solomon", "song", "sos", "ss", "sol", "sg",
  "songs of solomon", "song of songs", "song of solomn",
  "songs of solomn", "song of solo", "solomon",
]);
aliases("Isaiah", ["isaiah", "isa", "is", "isaih", "isiah", "izaya", "isayiah"]);
aliases("Jeremiah", ["jeremiah", "jer", "je", "jr", "jeramiah", "jerimiah", "jeremiyah"]);
aliases("Lamentations", ["lamentations", "lam", "la", "lamantations", "lamentaion", "lamenations"]);
aliases("Ezekiel", ["ezekiel", "ezek", "eze", "ezk", "ezekial", "ezekel", "ezikiel"]);
aliases("Daniel", ["daniel", "dan", "da", "dn", "danyel", "daniell"]);
aliases("Hosea", ["hosea", "hos", "ho", "hoseiah", "hosiah"]);
aliases("Joel", ["joel", "jl", "joels"]);
aliases("Amos", ["amos", "am", "amos"]);
aliases("Obadiah", ["obadiah", "obad", "ob", "obadia", "obadya", "obedia", "obediah", "obidiah"]);
aliases("Jonah", ["jonah", "jon", "jnh", "jona"]);
aliases("Micah", ["micah", "mic", "mc", "mica", "mycah"]);
aliases("Nahum", ["nahum", "nah", "na", "naha", "nahim"]);
aliases("Habakkuk", ["habakkuk", "hab", "hb", "habbakuk", "habakuk", "habakook"]);
aliases("Zephaniah", ["zephaniah", "zeph", "zep", "zp", "zepheniah", "zefaniah", "zefanias"]);
aliases("Haggai", ["haggai", "hag", "hg", "hagai", "hagee"]);
aliases("Zechariah", ["zechariah", "zech", "zec", "zc", "zekariah", "zechriah", "zachariah", "zaccariah"]);
aliases("Malachi", ["malachi", "mal", "ml", "malakai", "malachai"]);

// ── NEW TESTAMENT ──
aliases("Matthew", ["matthew", "matt", "mat", "mt", "mathew", "mathew", "mathtew", "matthieu"]);
aliases("Mark", ["mark", "mrk", "mk", "marc", "marrk"]);
aliases("Luke", [
  "luke", "luk", "lk", "look", "luck", "luc", "loop", "louk", "louke",
  "loock", "looock",
]);
aliases("John", ["john", "joh", "jhn", "jn", "j", "jon", "johnn", "johnny", "joan", "jone", "jhon", "johnn"]);
aliases("Acts", ["acts", "act", "ac", "arts", "axe", "hacks", "acts"]);
aliases("Romans", [
  "romans", "roman", "romance", "rom", "ro", "rm",
  "roomans", "rumans", "romens", "rohmans", "woman", "womans",
  "romans", "romman", "rhomans",
]);
numberedBook("Corinthians", "1 Corinthians", [
  "cor", "co", "corinthian", "corinthins", "corintians",
  "currentians", "korinthians", "corinti", "corinth",
]);
aliases("Galatians", ["galatians", "gal", "ga", "galatans", "galations", "galatians"]);
aliases("Ephesians", ["ephesians", "eph", "ep", "efficients", "efesians", "effesians", "efezians", "epheseans"]);
aliases("Philippians", [
  "philippians", "phil", "php", "pp", "filippians",
  "phillipians", "philipians", "fillipians", "filipians", "phillipiens",
]);
aliases("Colossians", ["colossians", "col", "coloss", "collossians", "collossans", "colosans"]);
numberedBook("Thessalonians", "1 Thessalonians", [
  "thes", "th", "thess", "thesalonians", "theselonians", "tesalonians",
  "teselonians", "thessalonians", "thesolonians",
]);
numberedBook("Timothy", "1 Timothy", ["tim", "ti", "tm", "timo", "timithy", "timoty"]);
aliases("Titus", ["titus", "tit", "ti", "tytus", "tius"]);
aliases("Philemon", [
  "philemon", "phm", "philem", "pm",
  "filemon", "filimon", "phileman", "fileman", "philamon", "fillimon",
]);
aliases("Hebrews", ["hebrews", "heb", "he", "hebrew", "ebrews", "heebrews", "hebros", "hebrows"]);
aliases("James", ["james", "jas", "ja", "jm", "jims", "jams", "jaymes", "jaims"]);
numberedBook("Peter", "1 Peter", ["pet", "pe", "pt", "peter"]);
numberedBook("John", "1 John", ["jn", "jo", "joh", "john"]);
aliases("Jude", ["jude", "jud", "jd", "judy", "jood", "joode", "judde"]);
aliases("Revelation", [
  "revelation", "rev", "re", "rv", "revelations", "revelating",
  "revelatings", "revelation", "revalation", "revelaion", "revelatons",
]);

// ---------------------------------------------------------------------------
// Spoken number words
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  "twenty one": 21, "twenty-one": 21, "twenty two": 22, "twenty-two": 22,
  "twenty three": 23, "twenty-three": 23, "twenty four": 24, "twenty-four": 24,
  "twenty five": 25, "twenty-five": 25, "twenty six": 26, "twenty-six": 26,
  "twenty seven": 27, "twenty-seven": 27, "twenty eight": 28, "twenty-eight": 28,
  "twenty nine": 29, "twenty-nine": 29, thirty: 30,
  "thirty one": 31, "thirty-one": 31, "thirty two": 32, "thirty-two": 32,
  "thirty three": 33, "thirty-three": 33, "thirty four": 34, "thirty-four": 34,
  "thirty five": 35, "thirty-five": 35, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
};

function parseNumberWord(text: string): number | null {
  const key = text.toLowerCase().trim();
  if (NUMBER_WORDS[key] !== undefined) return NUMBER_WORDS[key];
  // Try plain number
  const n = parseInt(key, 10);
  if (!isNaN(n) && n > 0) return n;
  return null;
}

// ---------------------------------------------------------------------------
// Intent type — structured navigation commands
// ---------------------------------------------------------------------------

export type ScriptureIntent =
  | { type: "open"; book: string; chapter: number; verse?: number; endVerse?: number; navigationOnly?: boolean; candidates?: Array<{ chapter: number; verse?: number; endVerse?: number }> }
  | { type: "set-verse"; verse: number; endVerse?: number }
  | { type: "set-chapter"; chapter: number }
  | { type: "next-verse"; count: number }
  | { type: "prev-verse"; count: number }
  | { type: "next-chapter"; count: number }
  | { type: "prev-chapter"; count: number }
  | { type: "first-chapter" }
  | { type: "last-chapter" }
  | { type: "middle-of-chapter" }
  | { type: "return-to-passage" }
  | { type: "use-translation"; translation: string }
  | null;

// Translation aliases
const TRANSLATION_ALIASES: Record<string, string> = {
  // KJV
  kjv: "KJV", "king james": "KJV", "king james version": "KJV",
  // NKJV
  nkjv: "NKJV", nkj: "NKJV", "new king james": "NKJV", "new king james version": "NKJV",
  // NIV
  niv: "NIV", "new international version": "NIV",
  // ESV
  esv: "ESV", "english standard version": "ESV",
  // NLT
  nlt: "NLT", "new living translation": "NLT",
  // NASB
  nasb: "NASB", nassb: "NASB", "new american standard": "NASB", "new american standard bible": "NASB",
  // MSG
  msg: "MSG", message: "MSG", "the message": "MSG",
  // AMP
  amp: "AMP", amplified: "AMP", "amplified bible": "AMP",
  // CSB
  csb: "CSB", "christian standard bible": "CSB", hcsb: "CSB",
  // NET
  net: "NET", "new english translation": "NET",
  // WEB
  web: "WEB", "world english bible": "WEB",
  // CEB
  ceb: "CEB", "common english bible": "CEB",
  // GNT
  gnt: "GNT", "good news translation": "GNT", "good news bible": "GNT", gnb: "GNT",
  // NRSV
  nrsv: "NRSV", "new revised standard version": "NRSV",
  // RSV
  rsv: "RSV", "revised standard version": "RSV",
  // TLB
  tlb: "TLB", "living bible": "TLB",
  // TPT
  tpt: "TPT", "the passion translation": "TPT",
  // ICB
  icb: "ICB", "international children's bible": "ICB",
  // ERV
  erv: "ERV", "easy-to-read version": "ERV",
  // NIRV
  nirv: "NIRV", "new international readers version": "NIRV",
};

/**
 * Parse a transcript into a structured ScriptureIntent.
 * Fast (<1ms), no LLM. Returns null if no intent recognized.
 *
 * Handles:
 *   "open to john 3:16"           → { type: "open", book: "John", chapter: 3, verse: 16 }
 *   "go to next verse"            → { type: "next-verse", count: 1 }
 *   "go to the next verse"        → { type: "next-verse", count: 1 }
 *   "next two verses"             → { type: "next-verse", count: 2 }
 *   "go forward one verse"        → { type: "next-verse", count: 1 }
 *   "previous verse"              → { type: "prev-verse", count: 1 }
 *   "go to the previous verse"    → { type: "prev-verse", count: 1 }
 *   "go back two verses"          → { type: "prev-verse", count: 2 }
 *   "go back to the previous verse" → { type: "prev-verse", count: 1 }
 *   "last 3 verses"               → { type: "prev-verse", count: 3 }
 *   "next chapter"                → { type: "next-chapter" }
 *   "go to the next chapter"      → { type: "next-chapter" }
 *   "previous chapter"            → { type: "prev-chapter" }
 *   "go to the previous chapter"  → { type: "prev-chapter" }
 *   "go to the first chapter"     → { type: "first-chapter" }
 *   "go to the last chapter"      → { type: "last-chapter" }
 *   "jump to the beginning"       → { type: "first-chapter" }
 *   "jump to the end"             → { type: "last-chapter" }
 *   "skip to verse 10"            → { type: "set-verse", verse: 10 }
 *   "start from verse 1"          → { type: "set-verse", verse: 1 }
 *   "move to middle of chapter"   → { type: "middle-of-chapter" }
 *   "return to last passage"      → { type: "return-to-passage" }
 *   "go to verse 5"               → { type: "set-verse", verse: 5 }
 *   "chapter 3"                   → { type: "set-chapter", chapter: 3 }
 *   "use NIV"                     → { type: "use-translation", translation: "NIV" }
 */
export function parseScriptureIntent(text: string): ScriptureIntent {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  // ── Noise filtering: ignore vague, incomplete, or nonsensical inputs ──
  // Pure numbers, vague thresholds, or misrecognized speech
  if (/^\d+$/.test(lower)) return null; // Just a number: "100", "50"
  if (/^(over|under|above|below|around|about|nearly|almost|more than|less than)\s+\d+$/.test(lower)) return null; // "over 100", "about 50"
  if (/^(um|uh|hmm|ah|er|well|so|okay|ok|right|yes|yeah|no|nah|false|true|thanks|thank you|bye|hello|hi|hey|good|bad|great|fine|sure|maybe|please|sorry|stop|wait|hello|goodbye|alright|alrighty|yep|yup|nah|nope|nah|yep|yup)$/i.test(lower)) return null; // Filler words & ASR hallucinations
  if (lower.length < 2) return null; // Too short to be meaningful

  // ── Translation command ──
  // High priority — must be checked BEFORE reference parsing
  const transPatterns = [
    /\b(?:use|switch to|change to|set|give me|show me|show|give)\s+(.+?)(?:\s+(?:version|translation))?$/i,
    /^(.+?)\s+(?:version|translation)$/i,
    /^(kjv|nkjv|nkj|niv|esv|nlt|nasb|nassb|msg|amp|csb|hcsb|net|web|ceb|gnt|gnb|nrsv|rsv|tlb|tpt|icb|erv|nirv|asv)$/i,
  ];

  for (const pattern of transPatterns) {
    const transMatch = lower.match(pattern);
    if (transMatch) {
      const key = transMatch[1].trim().toLowerCase();
      if (TRANSLATION_ALIASES[key]) {
        return { type: "use-translation", translation: TRANSLATION_ALIASES[key] };
      }
    }
  }

  // ── Open / Go to a specific reference ──
  // "open to john 3:16", "go to genesis 1", "turn to psalm 23", "romans 11"
  const openMatch = lower.match(/\b(?:open|turn|go|read|take|bring|move|switch)\s+(?:to\s+)?(.+)/);
  if (openMatch) {
    const rest = openMatch[1].trim();
    // Try to parse as a full reference — get ALL possible interpretations
    const allRefs = parseScriptureReferenceAll(rest);
    if (allRefs.length > 0) {
      const primary = allRefs[0];
      if (primary.book) {
        const hasVerse = primary.verse != null;
        // If multiple interpretations, include all as candidates
        const candidates = allRefs
          .filter((r) => r.book === primary.book && r.chapter !== null)
          .map((r) => ({ chapter: r.chapter!, verse: r.verse ?? undefined, endVerse: r.endVerse ?? undefined }));

        return {
          type: "open",
          book: primary.book,
          chapter: primary.chapter ?? 1,
          verse: primary.verse ?? undefined,
          endVerse: primary.endVerse ?? undefined,
          navigationOnly: !hasVerse,
          candidates: candidates.length > 1 ? candidates : undefined,
        };
      }
    }
  }

  // ── Direct book + number without "go to" prefix ──
  // "romans 11", "john 3", "genesis 1"
  const directRef = parseScriptureReferenceAll(lower);
  if (directRef.length > 0) {
    const primary = directRef[0];
    if (primary.book) {
      const hasVerse = primary.verse != null;
      const candidates = directRef
        .filter((r) => r.book === primary.book && r.chapter !== null)
        .map((r) => ({ chapter: r.chapter!, verse: r.verse ?? undefined, endVerse: r.endVerse ?? undefined }));

      return {
        type: "open",
        book: primary.book,
        chapter: primary.chapter ?? 1,
        verse: primary.verse ?? undefined,
        endVerse: primary.endVerse ?? undefined,
        navigationOnly: !hasVerse,
        candidates: candidates.length > 1 ? candidates : undefined,
      };
    }
  }

  // ── Return to last passage ──
  if (/\breturn\s+(?:to\s+)?(?:the\s+)?last\s+passage\b/.test(lower) ||
    /\bgo\s+back\s+(?:to\s+)?(?:the\s+)?last\s+passage\b/.test(lower)) {
    return { type: "return-to-passage" };
  }

  // ── Jump to beginning / end ──
  if (/\b(?:jump|skip|go|move)\s+(?:to\s+)?(?:the\s+)?beginning\b/.test(lower)) {
    return { type: "first-chapter" };
  }
  if (/\b(?:jump|skip|go|move)\s+(?:to\s+)?(?:the\s+)?end\b/.test(lower)) {
    return { type: "last-chapter" };
  }

  // ── Move to middle of chapter ──
  if (/\b(?:move|go|jump|skip)\s+(?:to\s+)?(?:the\s+)?middle\s+(?:of\s+)?(?:the\s+)?chapter\b/.test(lower)) {
    return { type: "middle-of-chapter" };
  }

  // ── Next verse / Next N verses ──
  // "next verse", "go to next verse", "go to the next verse", "next two verses", "go forward one verse"
  const nextVerseMatch = lower.match(/\b(?:(?:go|move|jump|skip)\s+(?:to\s+)?(?:the\s+)?|go\s+)?(?:forward\s+)?next\s+(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?verses?\b/) ||
    lower.match(/\bgo\s+forward\s+(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?verses?\b/) ||
    lower.match(/\bgo\s+forward\s+(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten))\b/);
  if (nextVerseMatch) {
    const count = nextVerseMatch[1] ? parseNumberWord(nextVerseMatch[1]) ?? 1 : 1;
    return { type: "next-verse", count };
  }
  // Standalone "next" (without "verse") after a reference context
  if (/^next$/.test(lower) || /^go\s+(?:to\s+the\s+)?next$/.test(lower)) {
    return { type: "next-verse", count: 1 };
  }

  // ── Previous verse / Previous N verses ──
  // "previous verse", "go to the previous verse", "go back two verses", "go back to the previous verse"
  const prevVerseMatch = lower.match(/\b(?:go\s+(?:back\s+)?(?:to\s+)?(?:the\s+)?)?(?:previous|prev|last)\s+(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?verses?\b/) ||
    lower.match(/\bgo\s+back\s+(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?verses?\b/) ||
    lower.match(/\bgo\s+back\s+(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten))\b/);
  if (prevVerseMatch) {
    const count = prevVerseMatch[1] ? parseNumberWord(prevVerseMatch[1]) ?? 1 : 1;
    return { type: "prev-verse", count };
  }
  // Standalone "previous" / "back"
  if (/^(?:previous|prev|back|go\s+(?:back|to\s+the\s+back))$/.test(lower)) {
    return { type: "prev-verse", count: 1 };
  }

  // ── Verse range (relative) ──
  // "verse 7 to 9", "verse 7 through 9", "from verse 7 to verse 9", "read from 8 to 12"
  const rangePatterns = [
    /\b(?:go\s+to\s+|move\s+to\s+|take\s+me\s+to\s+|continue\s+to\s+|read\s+)?(?:from\s+)?verse\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:to|through|thru|and)\s+(?:verse\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/,
    /\bread\s+from\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:to|through|thru)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/,
    /\bread\s+from\s+verse\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:to|through|thru)\s+(?:verse\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/,
  ];
  for (const pattern of rangePatterns) {
    const rangeMatch = lower.match(pattern);
    if (rangeMatch) {
      const startVerse = parseNumberWord(rangeMatch[1]);
      const endVerse = parseNumberWord(rangeMatch[2]);
      if (startVerse !== null && endVerse !== null && endVerse >= startVerse) {
        return { type: "set-verse", verse: startVerse, endVerse };
      }
    }
  }

  // ── Skip to verse / Start from verse ──
  const skipVerseMatch = lower.match(/\b(?:skip|start|jump|move|go)\s+(?:to\s+)?(?:from\s+)?(?:verse\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/);
  if (skipVerseMatch) {
    const verse = parseNumberWord(skipVerseMatch[1]);
    if (verse !== null) return { type: "set-verse", verse };
  }

  // ── Next chapter / Next N chapters ──
  const nextChapterMatch = lower.match(/\b(?:go|move|jump|skip)\s+(?:to\s+)?(?:the\s+)?next\s+(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?chapters?\b/) ||
    lower.match(/\bnext\s+(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?chapters?\b/);
  if (nextChapterMatch) {
    const count = nextChapterMatch[1] ? parseNumberWord(nextChapterMatch[1]) ?? 1 : 1;
    return { type: "next-chapter", count };
  }

  // ── Previous chapter / Previous N chapters ──
  const prevChapterMatch = lower.match(/\b(?:go|move|jump|skip)\s+(?:to\s+)?(?:the\s+)?(?:previous|prev)\s+(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?chapters?\b/) ||
    lower.match(/\b(?:previous|prev)\s+(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?chapters?\b/);
  if (prevChapterMatch) {
    const count = prevChapterMatch[1] ? parseNumberWord(prevChapterMatch[1]) ?? 1 : 1;
    return { type: "prev-chapter", count };
  }

  // ── First chapter ──
  if (/\b(?:go|move|jump|skip)\s+(?:to\s+)?(?:the\s+)?first\s+chapter\b/.test(lower) ||
    /\bfirst\s+chapter\b/.test(lower)) {
    return { type: "first-chapter" };
  }

  // ── Last chapter ──
  if (/\b(?:go|move|jump|skip)\s+(?:to\s+)?(?:the\s+)?last\s+chapter\b/.test(lower) ||
    /\blast\s+chapter\b/.test(lower)) {
    return { type: "last-chapter" };
  }

  // ── Go to chapter X ──
  const goChapterMatch = lower.match(/\b(?:go|move|jump|skip)\s+(?:to\s+)?(?:chapter\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\b/);
  if (goChapterMatch) {
    const chapter = parseNumberWord(goChapterMatch[1]);
    if (chapter !== null) return { type: "set-chapter", chapter };
  }

  // ── Set verse (relative) ──
  // "go to verse 5", "verse 5", "move to verse 10", "continue to verse 15"
  const setVerseMatch = lower.match(/\b(?:go\s+to\s+|move\s+to\s+|take\s+me\s+to\s+|continue\s+to\s+)?verse\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/);
  if (setVerseMatch) {
    const verse = parseNumberWord(setVerseMatch[1]);
    if (verse !== null) return { type: "set-verse", verse };
  }

  // ── Set chapter (relative) ──
  // "go to chapter 3", "chapter 5"
  const setChapterMatch = lower.match(/\b(?:go\s+to\s+)?chapter\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\b/);
  if (setChapterMatch) {
    const chapter = parseNumberWord(setChapterMatch[1]);
    if (chapter !== null) return { type: "set-chapter", chapter };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Strip filler words and normalize whitespace.
 */
function cleanTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/\b(let's|lets|please|can we|could we|would you|now|so|no|and|but|or|the|a|an|to|into|in|on|of|for|our|your|we|i|you|it|he|she|they|is|are|was|were|be|been|has|have|had|do|does|did|will|would|shall|should|may|might|can|could)\b/g, " ")
    .replace(/\b(open|turn|take|bring|move|switch|go|read|see|check|flip|turning|opening|reading)\b/g, " ")
    .replace(/\b(bible|scripture|passage|text|word|page)\b/g, " ")
    .replace(/\b(chapter|chap|ch|chapt|capter|captor|capture)\b/g, " chapter ")
    .replace(/\b(verse|verses|vs|vrs|vas|vass|buzz|by|bi|bah|bus|bas)\b/g, " verse ")
    .replace(/[^\w\s:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a Bible reference from text.
 *
 * Returns a ParsedReference or null if nothing recognizable was found.
 * If the text contains a relative reference (e.g. "verse 28" without a book),
 * isRelative will be true and book/chapter may be null.
 *
 * Smart extraction: finds book name anywhere in text, then grabs nearby numbers.
 */
export function parseScriptureReference(text: string): ParsedReference | null {
  // Priority 0: Try numbered book resolver on raw text BEFORE cleanTranscript.
  // This catches "to king 6 17" → 2 Kings 6:17 and "tree john 1 2" → 3 John 1:2
  // where cleanTranscript would strip "to" or exact alias would match "john" alone.
  const rawNumbered = resolveNumberedBookWithTokens(text);
  if (rawNumbered) {
    const rawTokens = text.trim().split(/\s+/);
    const afterBook = rawTokens.slice(rawNumbered.afterBookIdx);
    const ref = parseChapterVerseFromTokens(afterBook);
    if (ref) {
      return {
        book: rawNumbered.book,
        chapter: ref.chapter,
        verse: ref.verse,
        endVerse: ref.endVerse,
        isRelative: false,
      };
    }
  }

  const cleaned = cleanTranscript(text);
  if (!cleaned) return null;

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // Step 1: Try to find a book name anywhere in the tokens
  let book: string | null = null;
  let bookEndIdx = -1;

  // Try multi-word book names first (longest match)
  for (let len = Math.min(tokens.length, 5); len >= 1; len--) {
    for (let i = 0; i <= tokens.length - len; i++) {
      const candidate = tokens.slice(i, i + len).join(" ");
      const match = BOOK_ALIAS_MAP.get(candidate);
      if (match) {
        book = match;
        bookEndIdx = i + len;
        break;
      }
      // Also try without spaces
      const noSpace = candidate.replace(/\s+/g, "");
      const match2 = BOOK_ALIAS_MAP.get(noSpace);
      if (match2) {
        book = match2;
        bookEndIdx = i + len;
        break;
      }
    }
    if (book) break;
  }

  // Fallback: numbered book resolver (handles "first king", "won corinthians", etc.)
  if (!book) {
    const resolved = resolveNumberedBook(cleaned);
    if (resolved) {
      book = resolved;
      // Find how many tokens the matched phrase consumed
      const resolvedLower = resolved.toLowerCase();
      const tokensToConsume = resolvedLower.startsWith("1 ") || resolvedLower.startsWith("2 ") || resolvedLower.startsWith("3 ") ? 2 : 2;
      bookEndIdx = Math.min(tokensToConsume, tokens.length);
    }
  }

  // Fallback: fuzzy Levenshtein match against all 66 books
  // Only match single tokens — multi-token candidates like "thesalonians 5"
  // would falsely match single-word books via Levenshtein, consuming numbers
  // that should be chapter/verse.
  if (!book) {
    for (let i = 0; i < tokens.length; i++) {
      const fuzzy = fuzzyMatchBook(tokens[i]);
      if (fuzzy) {
        book = fuzzy.book;
        bookEndIdx = i + 1;
        break;
      }
    }
  }

  if (!book) {
    // No book found — try relative reference parsing
    return parseRelativeReference(tokens);
  }

  // Step 2: Find numbers near the book name (after it)
  const afterBook = tokens.slice(bookEndIdx);
  let chapter: number | null = null;
  let verse: number | null = null;
  let endVerse: number | null = null;

  // Look for numbers in the tokens after the book
  const numbers: number[] = [];
  for (let i = 0; i < afterBook.length; i++) {
    const n = parseNumberWord(afterBook[i]);
    if (n !== null) numbers.push(n);
  }

  // Check for "N:N" or "N-N" patterns in remaining tokens
  for (let i = 0; i < afterBook.length; i++) {
    const token = afterBook[i];
    const colonMatch = token.match(/^(\d+):(\d+)(?:-(\d+))?$/);
    if (colonMatch) {
      chapter = parseInt(colonMatch[1], 10);
      verse = parseInt(colonMatch[2], 10);
      if (colonMatch[3]) endVerse = parseInt(colonMatch[3], 10);
      // Also check for "N:N to M" format (e.g., "2:7 to 9")
      if (!endVerse && i + 2 < afterBook.length) {
        const connector = afterBook[i + 1];
        if (connector === "to" || connector === "through" || connector === "thru") {
          const evn = parseNumberWord(afterBook[i + 2]);
          if (evn !== null && evn >= verse) endVerse = evn;
        }
      }
      return { book, chapter, verse, endVerse, isRelative: false };
    }
  }

  // Check for "chapter N" or "verse N" patterns
  const chapterIdx = afterBook.indexOf("chapter");
  if (chapterIdx >= 0 && chapterIdx + 1 < afterBook.length) {
    const n = parseNumberWord(afterBook[chapterIdx + 1]);
    if (n !== null) {
      chapter = n;
      // Look for "verse N" or "verse N to M" after chapter
      const afterChapter = afterBook.slice(chapterIdx + 2);
      const verseIdx = afterChapter.indexOf("verse");
      if (verseIdx >= 0 && verseIdx + 1 < afterChapter.length) {
        const vn = parseNumberWord(afterChapter[verseIdx + 1]);
        if (vn !== null) {
          verse = vn;
          // Check for range: "verse 7 to 9" or "verse 7 through 9"
          if (verseIdx + 3 < afterChapter.length) {
            const connector = afterChapter[verseIdx + 2];
            if (connector === "to" || connector === "through" || connector === "thru") {
              const evn = parseNumberWord(afterChapter[verseIdx + 3]);
              if (evn !== null && evn >= vn) endVerse = evn;
            }
          }
        }
      }
    }
  }

  // Check for standalone "verse N to M" pattern (without "chapter" prefix)
  if (chapter !== null && verse === null) {
    const verseIdx = afterBook.indexOf("verse");
    if (verseIdx >= 0 && verseIdx + 1 < afterBook.length) {
      const vn = parseNumberWord(afterBook[verseIdx + 1]);
      if (vn !== null) {
        verse = vn;
        // Check for range: "verse 7 to 9"
        if (verseIdx + 3 < afterBook.length) {
          const connector = afterBook[verseIdx + 2];
          if (connector === "to" || connector === "through" || connector === "thru") {
            const evn = parseNumberWord(afterBook[verseIdx + 3]);
            if (evn !== null && evn >= vn) endVerse = evn;
          }
        }
      }
    }
  }

  // If no chapter/verse found yet, use the numbers we found
  if (chapter === null && numbers.length > 0) {
    chapter = numbers[0];
    if (numbers.length > 1) {
      verse = numbers[1];
    }
  }

  // If we have a book + verse but no chapter, default to chapter 1
  if (book && chapter === null && verse !== null) {
    chapter = 1;
  }

  // Validate chapter against book
  if (book && chapter !== null) {
    const maxCh = BOOK_CHAPTERS[book];
    if (maxCh !== undefined && chapter > maxCh) {
      // Chapter exceeds max — might be a verse for single-chapter books
      if (maxCh === 1) {
        verse = chapter;
        chapter = 1;
      }
    }
  }

  // Nothing parsed
  if (!book && chapter === null && verse === null) return null;

  return {
    book,
    chapter,
    verse,
    endVerse,
    isRelative: !book,
  };
}

/**
 * Parse a relative reference (no book name found).
 */
function parseRelativeReference(tokens: string[]): ParsedReference | null {
  let chapter: number | null = null;
  let verse: number | null = null;

  // Check for "chapter N" pattern
  const chapterIdx = tokens.indexOf("chapter");
  if (chapterIdx >= 0 && chapterIdx + 1 < tokens.length) {
    const n = parseNumberWord(tokens[chapterIdx + 1]);
    if (n !== null) {
      chapter = n;
      // Check for "verse N" after chapter
      const afterChapter = tokens.slice(chapterIdx + 2);
      const verseIdx = afterChapter.indexOf("verse");
      if (verseIdx >= 0 && verseIdx + 1 < afterChapter.length) {
        const vn = parseNumberWord(afterChapter[verseIdx + 1]);
        if (vn !== null) verse = vn;
      }
    }
  }

  // Check for "verse N" pattern (without chapter)
  if (chapter === null && verse === null) {
    const verseIdx = tokens.indexOf("verse");
    if (verseIdx >= 0 && verseIdx + 1 < tokens.length) {
      const n = parseNumberWord(tokens[verseIdx + 1]);
      if (n !== null) verse = n;
    }
  }

  if (chapter === null && verse === null) return null;

  return {
    book: null,
    chapter,
    verse,
    endVerse: null,
    isRelative: true,
  };
}

/**
 * Parse all possible Bible references from text.
 * Returns multiple candidates for jammed numbers (e.g. "231" → "2:31" and "23:1").
 * Chapter:verse splits are prioritized over chapter-only interpretations.
 */
export function parseScriptureReferenceAll(text: string): ParsedReference[] {
  const result = parseScriptureReference(text);
  if (!result) return [];

  // If we have a book + single number that could be jammed chapter:verse,
  // try all valid splits
  if (result.book && result.chapter !== null && result.verse === null) {
    const maxCh = BOOK_CHAPTERS[result.book];
    if (maxCh !== undefined) {
      const num = result.chapter;
      const numStr = String(num);

      if (numStr.length >= 2) {
        const candidates: ParsedReference[] = [];

        // Try splitting into chapter:verse FIRST (higher priority)
        for (let splitAt = 1; splitAt < numStr.length; splitAt++) {
          const chStr = numStr.slice(0, splitAt);
          const vsStr = numStr.slice(splitAt);
          const ch = parseInt(chStr, 10);
          const vs = parseInt(vsStr, 10);

          if (ch >= 1 && ch <= maxCh && vs >= 1 && vs <= 176) {
            candidates.push({
              book: result.book,
              chapter: ch,
              verse: vs,
              endVerse: null,
              isRelative: false,
            });
          }
        }

        // Include chapter-only interpretation after splits
        if (num <= maxCh) {
          candidates.push(result);
        }

        if (candidates.length > 0) return candidates;
      }
    }
  }

  return [result];
}

/**
 * Parse a relative reference using context from a previous reference.
 * e.g., context = { book: "Romans", chapter: 8 } + "verse 28" → Romans 8:28
 */
export function resolveWithContext(
  parsed: ParsedReference,
  context: ScriptureContext,
): { book: string; chapter: number; verse: number | null } | null {
  // Complete reference: book + chapter (and optionally verse)
  if (parsed.book && parsed.chapter !== null) {
    return {
      book: parsed.book,
      chapter: parsed.chapter,
      verse: parsed.verse,
    };
  }

  // Relative reference: use context stack
  if (parsed.isRelative) {
    return resolveRelativeReference(parsed, context);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Scripture context — stacked for book transitions
// ---------------------------------------------------------------------------

export interface ScriptureContextEntry {
  book: string;
  chapter: number;
  verse: number | null;
  timestamp: number;
}

export interface ScriptureContext {
  stack: ScriptureContextEntry[];
}

export function createScriptureContext(): ScriptureContext {
  return { stack: [] };
}

export function pushScriptureContext(
  ctx: ScriptureContext,
  book: string,
  chapter: number,
  verse: number | null,
  isRelative: boolean,
): ScriptureContext {
  const entry: ScriptureContextEntry = { book, chapter, verse, timestamp: Date.now() };

  if (isRelative) {
    // Relative reference ("verse 28") — append to stack
    return { stack: [entry, ...ctx.stack].slice(0, 10) };
  }

  // Explicit book mention — HARD RESET: clear entire previous context
  // "go back to genesis chapter 1" must not inherit John 3:16
  return { stack: [entry] };
}

/**
 * Resolve a relative reference using the most recent matching context.
 * "verse 28" → uses most recent book + chapter
 * "chapter 5" → uses most recent book
 */
/**
 * Resolve a relative reference using explicit priority rules.
 *
 * Resolution order:
 *   1. Most recent full reference (book + chapter) in the stack
 *   2. Most recent entry with a book (even without chapter)
 *   3. Return null — do not guess
 *
 * This prevents misbinding when the sermon jumps books:
 *   "John 3" → "Genesis 1" → "verse 2" → Genesis 1:2 (most recent full ref)
 *   "John 3" → "Genesis" → "verse 2" → null (no chapter for Genesis)
 */
export function resolveRelativeReference(
  parsed: ParsedReference,
  ctx: ScriptureContext,
): { book: string; chapter: number; verse: number | null } | null {
  if (ctx.stack.length === 0) return null;

  // Priority 1: Most recent entry with both book AND chapter
  const fullRef = ctx.stack.find((e) => e.chapter !== null);
  if (!fullRef) return null; // no chapter context — cannot resolve

  if (parsed.verse !== null && parsed.chapter === null) {
    // "verse 28" — needs book + chapter from context
    return { book: fullRef.book, chapter: fullRef.chapter, verse: parsed.verse };
  }

  if (parsed.chapter !== null) {
    // "chapter 5" — needs book from context, overrides chapter
    return { book: fullRef.book, chapter: parsed.chapter, verse: parsed.verse };
  }

  return null;
}
