/**
 * fuzzySearch.ts — Universal typo-tolerant fuzzy search engine
 *
 * Provides sub-millisecond, robust fuzzy matching across search inputs:
 * - Exact, prefix, and substring matches
 * - Typo tolerance (insertions, deletions, substitutions, transpositions via Damerau-Levenshtein)
 *   e.g. "folow" → "follow", "hery" → "henry", "amasing" → "amazing"
 * - Multi-word / tokenized query matching
 * - Acronym / abbreviation matching (e.g. "awm" → "Abide With Me")
 */

export interface FuzzyMatchOptions {
  /** Minimum score threshold for match (default: 200) */
  minScore?: number;
  /** Allow single/double character typos for words >= 3 chars (default: true) */
  allowTypos?: boolean;
}

/**
 * Remove diacritics / accents and normalize spaces.
 */
export function normalizeSearchString(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bounded Damerau-Levenshtein edit distance.
 * Supports insertions, deletions, substitutions, and adjacent transpositions (e.g., "teh" ↔ "the").
 * Returns maxDistance + 1 if the true distance exceeds maxDistance.
 */
export function damerauLevenshteinDistance(
  a: string,
  b: string,
  maxDistance = 2,
): number {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;

  if (Math.abs(aLen - bLen) > maxDistance) {
    return maxDistance + 1;
  }

  // d[i][j] matrix
  // Optimize storage with array of arrays or flat array
  const d: number[][] = [];
  for (let i = 0; i <= aLen; i++) {
    d[i] = new Array<number>(bLen + 1).fill(0);
    d[i][0] = i;
  }
  for (let j = 0; j <= bLen; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= aLen; i++) {
    let rowMin = Number.POSITIVE_INFINITY;
    const aChar = a[i - 1];

    for (let j = 1; j <= bLen; j++) {
      const bChar = b[j - 1];
      const cost = aChar === bChar ? 0 : 1;

      let minVal = Math.min(
        d[i - 1][j] + 1,        // deletion
        d[i][j - 1] + 1,        // insertion
        d[i - 1][j - 1] + cost, // substitution
      );

      // Transposition
      if (
        i > 1 &&
        j > 1 &&
        aChar === b[j - 2] &&
        a[i - 2] === bChar
      ) {
        minVal = Math.min(minVal, d[i - 2][j - 2] + 1);
      }

      d[i][j] = minVal;
      if (minVal < rowMin) rowMin = minVal;
    }

    if (bLen > 0 && rowMin > maxDistance) {
      return Number.POSITIVE_INFINITY;
    }
  }

  const finalDist = d[aLen][bLen];
  return finalDist <= maxDistance ? finalDist : Number.POSITIVE_INFINITY;
}

/**
 * Maximum allowed edit distance for a token based on length.
 */
export function getMaxAllowedDistance(tokenLength: number): number {
  if (tokenLength < 3) return 0;
  if (tokenLength <= 5) return 1; // e.g. "folow" (len 5) -> dist 1 to "follow"
  return 2;                       // e.g. "revelatn" (len 8) -> dist 2 to "revelation"
}

/**
 * Check if a query token fuzzy-matches a candidate target token.
 * Returns score (0 = no match, higher is better).
 */
export function scoreTokenMatch(queryToken: string, targetToken: string): number {
  if (!queryToken || !targetToken) return 0;
  if (queryToken === targetToken) return 100;

  // Prefix match
  if (targetToken.startsWith(queryToken)) {
    return 85 - Math.min(15, targetToken.length - queryToken.length);
  }

  // Substring match for longer tokens
  if (queryToken.length >= 4 && targetToken.includes(queryToken)) {
    return 70;
  }

  const maxDist = getMaxAllowedDistance(queryToken.length);
  if (maxDist > 0) {
    const dist = damerauLevenshteinDistance(queryToken, targetToken, maxDist);
    if (dist <= maxDist) {
      return Math.max(30, 60 - dist * 20);
    }
  }

  return 0;
}

/**
 * Checks if query is a subsequence of target (e.g. "awm" in "abide with me" or "jdg" in "judges").
 */
export function isSubsequence(query: string, target: string): boolean {
  if (!query || !target) return false;
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

/**
 * Compute fuzzy relevance score between query and target text.
 * 0 = no match.
 * Higher score = closer match.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = normalizeSearchString(query);
  const t = normalizeSearchString(target);
  if (!q || !t) return 0;

  // 1. Exact match
  if (q === t) return 1000;

  // 2. Target starts with query
  if (t.startsWith(q)) {
    return 850 - Math.min(150, t.length - q.length);
  }

  // 3. Substring match
  const idx = t.indexOf(q);
  if (idx >= 0) {
    return 700 - Math.min(150, idx);
  }

  // 4. Token-level matching
  const qTokens = q.split(" ").filter(Boolean);
  const tTokens = t.split(" ").filter(Boolean);

  if (qTokens.length > 0 && tTokens.length > 0) {
    let totalTokenScore = 0;
    let matchedTokensCount = 0;

    for (const qTok of qTokens) {
      let bestTokScore = 0;
      for (const tTok of tTokens) {
        const s = scoreTokenMatch(qTok, tTok);
        if (s > bestTokScore) {
          bestTokScore = s;
        }
      }
      if (bestTokScore > 0) {
        matchedTokensCount++;
        totalTokenScore += bestTokScore;
      }
    }

    // All query words must have a match
    if (matchedTokensCount === qTokens.length) {
      const avgScore = totalTokenScore / qTokens.length;
      return 450 + Math.round(avgScore * 2);
    }
  }

  // 5. Full string edit distance (for single-word queries with typos against target)
  if (!q.includes(" ") && !t.includes(" ")) {
    const maxDist = getMaxAllowedDistance(q.length);
    if (maxDist > 0) {
      const dist = damerauLevenshteinDistance(q, t, maxDist);
      if (dist <= maxDist) {
        return Math.max(300, 550 - dist * 100);
      }
    }
  }

  // 6. Subsequence matching (abbreviations, initials)
  if (q.length >= 2 && isSubsequence(q, t)) {
    return 250;
  }

  return 0;
}

/**
 * Fast boolean check if query matches target with fuzzy typo tolerance.
 */
export function fuzzyMatch(
  query: string,
  target: string,
  options?: FuzzyMatchOptions,
): boolean {
  if (!query) return true;
  if (!target) return false;
  const threshold = options?.minScore ?? 200;
  return fuzzyScore(query, target) >= threshold;
}

/**
 * Filter an array of items by fuzzy query and return sorted by relevance.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  extractText: (item: T) => string | string[],
  options?: FuzzyMatchOptions,
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return items;

  const threshold = options?.minScore ?? 200;
  const scored: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const target = extractText(item);
    let bestScore = 0;

    if (Array.isArray(target)) {
      for (const str of target) {
        if (!str) continue;
        const score = fuzzyScore(trimmed, str);
        if (score > bestScore) bestScore = score;
      }
    } else if (target) {
      bestScore = fuzzyScore(trimmed, target);
    }

    if (bestScore >= threshold) {
      scored.push({ item, score: bestScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
