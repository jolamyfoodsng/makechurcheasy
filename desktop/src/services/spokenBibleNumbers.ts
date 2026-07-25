/**
 * spokenBibleNumbers.ts — Deterministic spoken-number → digit converter
 *
 * Runs AFTER AssemblyAI transcription, BEFORE any LLM or reference parser.
 * Converts spoken Bible numbers ("one hundred and nineteen") into digits ("119")
 * so downstream parsers receive already-normalized references.
 *
 * Pipeline:
 *   AssemblyAI transcript → parseSpokenBibleNumbers() → normalized transcript → LLM / lexical search
 */

// ── Lookup tables ──────────────────────────────────────────────────────────

const ONES: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const HUNDREDS: Record<string, number> = {
  "one hundred": 100, "two hundred": 200, "three hundred": 300,
  "four hundred": 400, "five hundred": 500, "six hundred": 600,
  "seven hundred": 700, "eight hundred": 800, "nine hundred": 900,
};

const ALL_NUMBER_WORDS = new Set([
  ...Object.keys(ONES),
  ...Object.keys(TENS),
  ...Object.keys(HUNDREDS),
  "hundred", "and",
]);

// ── Core: parse a contiguous span of spoken number words into a digit ──────

/**
 * Given an array of lowercase tokens that are all number-related words,
 * returns the numeric value, or null if the span is not a valid number.
 *
 * Handles:
 *   "twenty eight" → 28
 *   "one hundred and five" → 105
 *   "one hundred and nineteen" → 119
 *   "ninety one" → 91
 *   "forty" → 40
 *   "seven" → 7
 */
function parseNumberSpan(tokens: string[]): number | null {
  if (tokens.length === 0) return null;

  // Filter out "and" connectors
  const filtered = tokens.filter((t) => t !== "and");
  if (filtered.length === 0) return null;

  // Single token
  if (filtered.length === 1) {
    if (ONES[filtered[0]] !== undefined) return ONES[filtered[0]];
    if (TENS[filtered[0]] !== undefined) return TENS[filtered[0]];
    return null;
  }

  // Try multi-token patterns
  // "X hundred [and] Y" → X*100 + Y
  // "X hundred" → X*100
  for (const [phrase, hundredVal] of Object.entries(HUNDREDS)) {
    const phraseTokens = phrase.split(" ");
    if (filtered.length >= phraseTokens.length &&
        filtered.slice(0, phraseTokens.length).join(" ") === phrase) {
      const remainder = filtered.slice(phraseTokens.length);
      // Remove leading "and" if present
      const remainingTokens = remainder[0] === "and" ? remainder.slice(1) : remainder;
      if (remainingTokens.length === 0) return hundredVal;
      // "one hundred and nineteen" → 100 + 19
      // "one hundred nineteen" → 100 + 19
      const restVal = parseRemainder(remainingTokens);
      if (restVal !== null) return hundredVal + restVal;
    }
  }

  // "tens ones" → tens + ones (e.g., "twenty eight" → 28)
  if (filtered.length === 2) {
    const tensVal = TENS[filtered[0]];
    const onesVal = ONES[filtered[1]];
    if (tensVal !== undefined && onesVal !== undefined) {
      return tensVal + onesVal;
    }
  }

  return null;
}

/**
 * Parse the remainder after "X hundred" — can be a single number or tens+ones.
 */
function parseRemainder(tokens: string[]): number | null {
  if (tokens.length === 0) return null;
  if (tokens.length === 1) {
    return ONES[tokens[0]] ?? TENS[tokens[0]] ?? null;
  }
  if (tokens.length === 2) {
    const tensVal = TENS[tokens[0]];
    const onesVal = ONES[tokens[1]];
    if (tensVal !== undefined && onesVal !== undefined) return tensVal + onesVal;
  }
  return null;
}

// ── Bible-aware number detection ───────────────────────────────────────────

/**
 * Bible book names (lowercased) — used to avoid converting book name words.
 */
const BIBLE_BOOKS_LOWER = new Set([
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy",
  "joshua", "judges", "ruth", "samuel", "kings", "chronicles",
  "ezra", "nehemiah", "esther", "job", "psalm", "psalms",
  "proverbs", "ecclesiastes", "song", "solomon", "isaiah",
  "jeremiah", "lamentations", "ezekiel", "daniel", "hosea",
  "joel", "amos", "obadiah", "jonah", "micah", "nahum",
  "habakkuk", "zephaniah", "haggai", "zechariah", "malachi",
  "matthew", "mark", "luke", "john", "acts", "romans",
  "corinthians", "galatians", "ephesians", "philippians",
  "colossians", "thessalonians", "timothy", "titus", "philemon",
  "hebrews", "james", "peter", "jude", "revelation",
  // Common prefixed forms
  "first", "second", "third",
]);

/**
 * Words that signal a number is coming next in Bible context.
 */
const NUMBER_SIGNAL_WORDS = new Set([
  "chapter", "verse", "verses", "to", "through", "and",
]);

/**
 * Main entry point. Converts spoken Bible numbers in a transcript to digits.
 *
 * Strategy:
 * 1. Tokenize the transcript (lowercase, preserve word boundaries)
 * 2. Find contiguous spans of spoken number words
 * 3. For each span, check if it's in a Bible-reference context
 *    (preceded by a book name, "chapter", "verse", or another number)
 * 4. If yes, convert the span to digits; otherwise leave it alone
 */
export function parseSpokenBibleNumbers(transcript: string): string {
  // Don't process if already contains digits (likely already normalized)
  if (/\d/.test(transcript)) return transcript;

  const lower = transcript.toLowerCase();
  const words = lower.split(/(\s+|[.,!?;:])/).filter(Boolean);
  const result: string[] = [];
  let i = 0;

  while (i < words.length) {
    const word = words[i].toLowerCase();

    // Check if this word starts a spoken number sequence
    if (ALL_NUMBER_WORDS.has(word)) {
      // Collect the contiguous span of number words
      const spanStart = i;
      const spanTokens: string[] = [];
      let j = i;

      while (j < words.length) {
        const w = words[j].toLowerCase();
        if (ALL_NUMBER_WORDS.has(w)) {
          spanTokens.push(w);
          j++;
        } else if (w === "and" && spanTokens.length > 0) {
          // "and" is only valid inside a number span (e.g., "one hundred and five")
          // Check if next word is also a number word
          const nextWord = j + 1 < words.length ? words[j + 1].toLowerCase() : "";
          if (ALL_NUMBER_WORDS.has(nextWord)) {
            spanTokens.push(w);
            j++;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      // Try to parse the span as a number
      const numValue = parseNumberSpan(spanTokens);

      if (numValue !== null && shouldConvertToNumber(words, spanStart)) {
        // Check if the next token is also a number span (chapter + verse pattern)
        // e.g., "eight twenty eight" → "8 28"
        let nextJ = j;
        // Skip whitespace
        while (nextJ < words.length && /^\s+$/.test(words[nextJ])) nextJ++;

        const nextSpanTokens: string[] = [];
        let k = nextJ;
        while (k < words.length) {
          const w = words[k].toLowerCase();
          if (ALL_NUMBER_WORDS.has(w)) {
            nextSpanTokens.push(w);
            k++;
          } else if (w === "and" && nextSpanTokens.length > 0) {
            const nextWord = k + 1 < words.length ? words[k + 1].toLowerCase() : "";
            if (ALL_NUMBER_WORDS.has(nextWord)) {
              nextSpanTokens.push(w);
              k++;
            } else {
              break;
            }
          } else {
            break;
          }
        }

        const nextNumValue = parseNumberSpan(nextSpanTokens);

        if (nextNumValue !== null && spanTokens.length <= 3 && nextSpanTokens.length <= 3) {
          // Two consecutive numbers → chapter + verse
          result.push(String(numValue));
          result.push(" ");
          result.push(String(nextNumValue));
          i = k;
          continue;
        }
      }

      if (numValue !== null) {
        result.push(String(numValue));
        i = j;
        continue;
      }
    }

    // Not a number span — keep the word as-is
    result.push(words[i]);
    i++;
  }

  return result.join("").replace(/\s+/g, " ").trim();
}

/**
 * Determines whether a span of number words at position `spanStart` should be
 * converted to digits. Returns true if the span is in a Bible-reference context.
 *
 * Context signals:
 * - Preceded by a Bible book name
 * - Preceded by "chapter", "verse", "verses"
 * - Preceded by another number (for chapter+verse patterns)
 * - Preceded by "to" or "through" (range patterns)
 * - The span itself looks like a chapter/verse number (2-3 words max)
 */
function shouldConvertToNumber(words: string[], spanStart: number): boolean {
  // Look at the preceding non-whitespace word
  let prevIdx = spanStart - 1;
  while (prevIdx >= 0 && /^\s*$/.test(words[prevIdx])) prevIdx--;

  if (prevIdx < 0) return false;

  const prevWord = words[prevIdx].toLowerCase();

  // Direct signals
  if (NUMBER_SIGNAL_WORDS.has(prevWord)) return true;

  // Bible book names
  if (BIBLE_BOOKS_LOWER.has(prevWord)) return true;

  // Prefixed book names: "first corinthians", "second timothy"
  if (prevWord === "first" || prevWord === "second" || prevWord === "third") {
    let checkIdx = prevIdx + 1;
    while (checkIdx < spanStart) {
      const w = words[checkIdx].toLowerCase();
      if (BIBLE_BOOKS_LOWER.has(w)) return true;
      checkIdx++;
    }
  }

  // Another number (consecutive numbers → chapter + verse)
  if (ONES[prevWord] !== undefined || TENS[prevWord] !== undefined) return true;

  return false;
}
