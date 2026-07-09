/**
 * layoutParser.ts — Layout-aware PDF song parser.
 *
 * Takes positioned text elements from the Rust lopdf backend and:
 *   1. Detects columns via x-coordinate clustering
 *   2. Detects bilingual (two-column) layout and interleaves elements by Y position
 *   3. Scores each element as a potential song header (using per-column gap detection)
 *   4. Splits into songs with metadata extraction
 *   5. Assigns import confidence scores
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** Raw element from the Rust backend. */
export interface TextElement {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  isBold: boolean;
  page: number;
}

/** A column cluster detected by x-coordinate grouping. */
interface Column {
  xMin: number;
  xMax: number;
  centerX: number;
  elements: TextElement[];
}

/** A candidate song header line. */
interface SongHeader {
  element: TextElement;
  score: number;
  index: number;
}

/** A parsed song with metadata. */
export interface ParsedSong {
  title: string;
  author?: string;
  hymnRef?: string;
  lyrics: string;
  confidence: number;
  warnings: string[];
  /** Index of the first element belonging to this song */
  elementRange: [number, number];
}

/** Result of layout parsing. */
export interface LayoutParseResult {
  songs: ParsedSong[];
  overallConfidence: number;
  columnsDetected: number;
  totalElements: number;
  warnings: string[];
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Score thresholds for song header detection. */
const SCORE_LARGE_FONT = 40;
const SCORE_BOLD = 20;
const SCORE_STANDALONE_NUMBER = 30;
const SCORE_LEFT_ALIGNED = 10;
const SCORE_WHITESPACE_BEFORE = 10;
const HEADER_SCORE_THRESHOLD = 70;

/** Hymn reference patterns: MHB 578, PH 35, CH 12, CBW 5, etc. */
const HYMN_REF_RE = /\b(MHB|PH|CH|CBW|SF|HH|AM|TM|SS|LP|CW|OW|HB|JB|YM)\s+\d{1,4}\b/i;

/** Recognized song header patterns — "Orin N", "Hymn N", "Orin N:", etc.
 *  Capture group 1 = the hymn number (used for deduplication). */
const HEADER_PATTERN_RE = /^\s*(?:Orin|Hymn|Orini|Song|Canto|Himno)\s*(\d{1,4})\s*[:\.]?\s*$/i;

/** Author/metadata patterns — names after hymn refs or on standalone lines. */
const AUTHOR_LINE_RE = /^(?:Words[:\s]|Music[:\s]|Trans(?:lated|lation)[:\s]|Text[:\s]|Melody[:\s])\s*.+/i;

// ── Column Detection ───────────────────────────────────────────────────────

/**
 * Cluster text elements into columns based on x-coordinate grouping.
 * Uses a simple merge approach: sort by x, merge elements whose x-ranges overlap.
 */
export function detectColumns(elements: TextElement[]): Column[] {
  if (elements.length === 0) return [];

  // ── Pass 1: Find dominant x-position peaks via histogram ──
  // Use 50pt bins to find where elements cluster. The two biggest bins
  // are the column centers (for a bilingual PDF).
  const BIN_SIZE = 50;
  const xBuckets = new Map<number, number>();
  for (const el of elements) {
    const bucket = Math.floor(el.x / BIN_SIZE) * BIN_SIZE;
    xBuckets.set(bucket, (xBuckets.get(bucket) || 0) + 1);
  }

  // Sort buckets by element count (descending)
  const sortedBuckets = [...xBuckets.entries()].sort((a, b) => b[1] - a[1]);

  if (sortedBuckets.length === 0) return [];

  // Use the top 2 buckets as column centers
  const centers: number[] = [sortedBuckets[0][0] + BIN_SIZE / 2];
  if (sortedBuckets.length > 1) {
    // Only add second center if it's far enough from the first (> 100pt apart)
    const secondCenter = sortedBuckets[1][0] + BIN_SIZE / 2;
    if (Math.abs(secondCenter - centers[0]) > 100) {
      centers.push(secondCenter);
    }
  }

  // Sort centers left-to-right
  centers.sort((a, b) => a - b);

  // ── Pass 2: Assign each element to the nearest center ──
  const tolerance = 80; // pt — absorbs x-position variation within a column
  const columnElements: TextElement[][] = centers.map(() => []);

  for (const el of elements) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let ci = 0; ci < centers.length; ci++) {
      const dist = Math.abs(el.x - centers[ci]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = ci;
      }
    }
    // Assign to nearest center (always — no elements left unassigned)
    columnElements[bestIdx].push(el);
  }

  // ── Build result columns (only non-empty) ──
  const columns: Column[] = [];
  for (let ci = 0; ci < centers.length; ci++) {
    const els = columnElements[ci];
    if (els.length === 0) continue;
    const xMin = Math.min(...els.map((e) => e.x));
    const xMax = Math.max(...els.map((e) => e.x));
    columns.push({
      xMin,
      xMax,
      centerX: centers[ci],
      elements: els,
    });
  }

  // Sort left-to-right
  columns.sort((a, b) => a.xMin - b.xMin);
  return columns;
}

// ── Reading Order Reorder ──────────────────────────────────────────────────

/**
 * Detect whether columns represent a bilingual layout (two side-by-side languages).
 * Heuristic: exactly 2 columns with comparable element counts (within 3x).
 */
function isBilingualLayout(columns: Column[]): boolean {
  if (columns.length !== 2) return false;
  const [a, b] = columns;
  const ratio = Math.max(a.elements.length, b.elements.length) /
    Math.max(1, Math.min(a.elements.length, b.elements.length));
  return ratio < 3;
}

/**
 * Reorder elements for reading.
 * For bilingual (2-column) layouts: interleave by Y position so left+right
 * elements on the same row are adjacent. For other layouts: column-first.
 */
export function reorderToReadingOrder(elements: TextElement[], columns: Column[]): TextElement[] {
  if (columns.length <= 1) {
    return [...elements].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return b.y - a.y; // top to bottom (PDF coords: y increases upward)
    });
  }

  // Bilingual: interleave elements by Y position so paired rows stay together
  if (isBilingualLayout(columns)) {
    return [...elements].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      const dy = b.y - a.y;
      if (Math.abs(dy) > 2) return dy; // different rows
      return a.x - b.x; // same row: left first
    });
  }

  // Non-bilingual: column-first, top-down within each column
  const result: TextElement[] = [];
  for (const col of columns) {
    const colElements = col.elements.sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return b.y - a.y;
    });
    result.push(...colElements);
  }
  return result;
}

// ── Song Header Scoring ────────────────────────────────────────────────────

/**
 * Score an element as a potential song header.
 * Returns a score from 0-110 (higher = more likely a header).
 */
function scoreHeaderElement(
  el: TextElement,
  prevInColumn: TextElement | null,
  medianFontSize: number,
  elements: TextElement[],
  _index: number,
): number {
  let score = 0;

  // 1. Large font: significantly larger than median → likely header
  if (el.fontSize > medianFontSize * 1.3) {
    score += SCORE_LARGE_FONT;
  } else if (el.fontSize > medianFontSize * 1.1) {
    score += SCORE_LARGE_FONT * 0.6; // partial credit
  }

  // 2. Bold text
  if (el.isBold) {
    score += SCORE_BOLD;
  }

  // 3. Standalone number (verse number or hymn number)
  const trimmed = el.text.trim();
  if (/^\d{1,4}\.?$/.test(trimmed)) {
    // This is just a number — could be a hymn number (header) or verse number (not header)
    // Heuristic: large font + number = hymn number → header
    if (el.fontSize > medianFontSize * 1.2) {
      score += SCORE_STANDALONE_NUMBER;
    } else {
      // Small number = verse number inside lyrics, penalize
      score -= 15;
    }
  }

  // 4. Recognized header pattern ("Orin N", "Hymn N", etc.) → strong signal
  if (HEADER_PATTERN_RE.test(trimmed)) {
    score += 30;
  }

  // 5. Left-aligned (x near the left margin of its column)
  const colElements = elements.filter(
    (e) => Math.abs(e.x - el.x) < 30 && e.page === el.page,
  );
  const minX = Math.min(...colElements.map((e) => e.x));
  if (el.x <= minX + 5) {
    score += SCORE_LEFT_ALIGNED;
  }

  // 6. Whitespace before this element (use per-column previous element)
  //    This is critical: in column-by-column ordering, the previous element in the
  //    flattened stream may be from a different column, giving a wrong gap reading.
  if (prevInColumn && prevInColumn.page === el.page) {
    const gap = prevInColumn.y - el.y; // positive = el is below prev (since y is top-down)
    if (gap > el.fontSize * 2.5) {
      score += SCORE_WHITESPACE_BEFORE;
    } else if (gap > el.fontSize * 1.5) {
      score += SCORE_WHITESPACE_BEFORE * 0.6;
    }
  } else if (prevInColumn === null) {
    // First element in column — always has whitespace before
    score += SCORE_WHITESPACE_BEFORE;
  }

  return score;
}

// ── Metadata Detection ─────────────────────────────────────────────────────

/**
 * Extract author and hymn reference from elements near a song header.
 * Checks the header element itself and 1-2 elements after it.
 */
function extractMetadata(
  elements: TextElement[],
  headerIndex: number,
): { author?: string; hymnRef?: string } {
  let author: string | undefined;
  let hymnRef: string | undefined;

  // Check header and next 2 elements
  const searchRange = elements.slice(headerIndex, headerIndex + 3);

  for (const el of searchRange) {
    const text = el.text.trim();

    // Hymn reference
    const refMatch = text.match(HYMN_REF_RE);
    if (refMatch && !hymnRef) {
      hymnRef = refMatch[0];
    }

    // Author/metadata line
    if (AUTHOR_LINE_RE.test(text)) {
      author = text.replace(/^(?:Words|Music|Translation|Text|Melody)[:\s]*/i, "").trim();
    }

    // Short bold text that's not the title itself and not a number — likely author
    if (
      el.isBold &&
      el.fontSize < elements[headerIndex].fontSize &&
      text.length > 2 &&
      text.length < 60 &&
      !HYMN_REF_RE.test(text) &&
      !/^\d+\.?$/.test(text)
    ) {
      // Could be author name if it's small and under the title
      if (!author && el.y > elements[headerIndex].y) {
        author = text;
      }
    }
  }

  return { author, hymnRef };
}

// ── Main Parse Function ────────────────────────────────────────────────────

/**
 * Parse positioned text elements into songs with headers, metadata, and confidence.
 */
export function parseLayoutSongs(elements: TextElement[]): LayoutParseResult {
  const warnings: string[] = [];

  if (elements.length === 0) {
    return {
      songs: [],
      overallConfidence: 0,
      columnsDetected: 0,
      totalElements: 0,
      warnings: ["No text elements found in the PDF."],
    };
  }

  // Step 1: Detect columns
  const columns = detectColumns(elements);

  // Step 2: Reorder to reading order
  const ordered = reorderToReadingOrder(elements, columns);

  // Step 3: Compute median font size (only from non-empty text)
  const fontSizes = ordered.filter((e) => e.text.trim().length > 0).map((e) => e.fontSize);
  const medianFontSize = fontSizes.length > 0
    ? [...fontSizes].sort((a, b) => a - b)[Math.floor(fontSizes.length / 2)]
    : 12;

  // Step 4: Score each element as a potential header
  // Build a column lookup for per-column gap detection
  const elementToColumn = new Map<TextElement, number>();
  for (let ci = 0; ci < columns.length; ci++) {
    for (const el of columns[ci].elements) {
      elementToColumn.set(el, ci);
    }
  }
  // Track previous element per column for gap scoring
  const prevInColumn: (TextElement | null)[] = new Array(columns.length).fill(null);

  const headers: SongHeader[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const el = ordered[i];
    if (el.text.trim().length === 0) continue;

    const colIdx = elementToColumn.get(el);
    const prev = colIdx !== undefined ? prevInColumn[colIdx] : null;
    const score = scoreHeaderElement(el, prev, medianFontSize, ordered, i);
    headers.push({ element: el, score, index: i });

    // Update per-column tracker
    if (colIdx !== undefined) {
      prevInColumn[colIdx] = el;
    }
  }

  // Step 5: Identify song boundaries
  // Two-pronged approach:
  //   A) Score-based detection (catches non-pattern headers via font/gap heuristics)
  //   B) Pattern-based detection (catches "Orin N" / "Hymn N" regardless of score)
  const scoreBasedStarts = headers.filter((h) => h.score >= HEADER_SCORE_THRESHOLD);

  // Direct pattern scan — any element matching the header pattern is a song start.
  // Deduplicate by hymn number: in bilingual hymnals, "Orin N" and "Hymn N" both
  // match the pattern for the same hymn — we only want one song per number.
  const seenHymnNumbers = new Set<number>();
  // Pre-populate with numbers already claimed by score-based starts
  for (const h of scoreBasedStarts) {
    const m = h.element.text.trim().match(HEADER_PATTERN_RE);
    if (m) seenHymnNumbers.add(parseInt(m[1], 10));
  }
  const patternBasedStarts: SongHeader[] = [];
  for (const h of headers) {
    const match = h.element.text.trim().match(HEADER_PATTERN_RE);
    if (match) {
      if (!scoreBasedStarts.some((s) => s.index === h.index)) {
        const num = parseInt(match[1], 10);
        if (!seenHymnNumbers.has(num)) {
          seenHymnNumbers.add(num);
          patternBasedStarts.push(h);
        }
      }
    }
  }

  // Merge and sort by document order
  const songStarts = [...scoreBasedStarts, ...patternBasedStarts]
    .sort((a, b) => a.index - b.index);

  if (songStarts.length === 0) {
    // No clear headers found — treat entire text as one song
    const allText = ordered
      .map((e) => e.text.trim())
      .filter((t) => t.length > 0)
      .join("\n");

    return {
      songs: [
        {
          title: extractBestTitle(ordered, medianFontSize),
          lyrics: allText,
          confidence: 40,
          warnings: ["No clear song headers detected. Treating entire document as one song."],
          elementRange: [0, ordered.length - 1],
        },
      ],
      overallConfidence: 40,
      columnsDetected: columns.length,
      totalElements: ordered.length,
      warnings: ["No clear song headers detected. Please review carefully."],
    };
  }

  // Step 6: Split into songs
  const songs: ParsedSong[] = [];

  for (let si = 0; si < songStarts.length; si++) {
    const start = songStarts[si];
    const end = si + 1 < songStarts.length ? songStarts[si + 1].index : ordered.length;

    // Extract title from the header element
    let title = start.element.text.trim();
    // Remove trailing numbers like "1." from title if present
    title = title.replace(/^\d+\.?\s*/, "").trim();
    if (!title) {
      title = start.element.text.trim(); // fall back to raw text
    }

    // Extract metadata from elements near the header
    const meta = extractMetadata(ordered, start.index);

    // Build lyrics from all elements in the range (skip the header and metadata lines)
    const rangeElements = ordered.slice(start.index, end);
    const lyricsLines: string[] = [];

    for (let i = 0; i < rangeElements.length; i++) {
      const el = rangeElements[i];
      const text = el.text.trim();
      if (text.length === 0) continue;

      // Skip the header line itself (highest-scored element)
      if (i === 0) continue;

      // Skip metadata lines that match known patterns
      if (HYMN_REF_RE.test(text) && text.length < 20) continue;
      if (AUTHOR_LINE_RE.test(text)) continue;
      // Skip small bold lines that are likely author (if we already have an author)
      if (meta.author && el.isBold && el.fontSize < medianFontSize && text.length < 40) continue;

      lyricsLines.push(text);
    }

    // Compute per-song confidence
    const songConfidence = computeSongConfidence(
      start.element,
      start.score,
      medianFontSize,
      lyricsLines.length,
      columns.length,
    );

    const songWarnings: string[] = [];
    if (songConfidence < 60) {
      songWarnings.push("Low confidence — please review this song carefully.");
    }

    songs.push({
      title,
      author: meta.author,
      hymnRef: meta.hymnRef,
      lyrics: lyricsLines.join("\n"),
      confidence: songConfidence,
      warnings: songWarnings,
      elementRange: [start.index, end - 1],
    });
  }

  // Step 7: Compute overall confidence
  const overallConfidence =
    songs.length > 0
      ? Math.round(songs.reduce((sum, s) => sum + s.confidence, 0) / songs.length)
      : 0;

  if (columns.length > 1) {
    warnings.push(`Detected ${columns.length}-column layout. Text has been reordered for reading.`);
  }
  if (songStarts.length < 2) {
    warnings.push("Only one song detected. The PDF may contain more songs that weren't split.");
  }

  return {
    songs,
    overallConfidence,
    columnsDetected: columns.length,
    totalElements: ordered.length,
    warnings,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pick the best title from the first few elements (largest font, first page).
 */
function extractBestTitle(elements: TextElement[], medianFontSize: number): string {
  // Look at elements on the first page, sorted by y descending (top first)
  const firstPage = elements
    .filter((e) => e.page === elements[0]?.page && e.text.trim().length > 0)
    .sort((a, b) => b.y - a.y);

  // Find the first element with larger-than-median font
  const titleCandidate = firstPage.find((e) => e.fontSize >= medianFontSize * 1.1);
  if (titleCandidate) return titleCandidate.text.trim();

  // Fallback: first non-empty text
  return firstPage[0]?.text.trim() || "Untitled Song";
}

/**
 * Compute confidence score for an individual song (0-100).
 */
function computeSongConfidence(
  header: TextElement,
  headerScore: number,
  medianFontSize: number,
  lineCount: number,
  columnCount: number,
): number {
  let confidence = 0;

  // Header quality (0-50 points)
  confidence += Math.min(50, (headerScore / HEADER_SCORE_THRESHOLD) * 50);

  // Content length (0-25 points)
  if (lineCount >= 8) confidence += 25;
  else if (lineCount >= 4) confidence += 15;
  else if (lineCount >= 2) confidence += 8;
  else confidence += 3;

  // Layout clues (0-15 points)
  if (header.isBold) confidence += 5;
  if (header.fontSize > medianFontSize * 1.2) confidence += 10;

  // Multi-column bonus (0-10 points) — multi-column PDFs are usually structured
  if (columnCount >= 2) confidence += 10;

  // Clamp
  return Math.min(100, Math.max(0, Math.round(confidence)));
}

/**
 * Get a human-readable confidence label.
 */
export function confidenceLabel(score: number): string {
  if (score >= 95) return "Very Likely";
  if (score >= 80) return "Good";
  if (score >= 60) return "Review";
  return "Manual Review";
}

/**
 * Get a CSS class name for a confidence score.
 */
export function confidenceClass(score: number): string {
  if (score >= 95) return "confidence--very-high";
  if (score >= 80) return "confidence--high";
  if (score >= 60) return "confidence--medium";
  return "confidence--low";
}
