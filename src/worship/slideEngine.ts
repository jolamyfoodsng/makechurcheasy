/**
 * slideEngine.ts — Worship slide generation utilities
 */

import type { LyricSection, Slide } from "./types";

type SectionLabel = {
  label: string;
  shortLabel: string;
  type: Slide["type"];
};

function normalizeLabelText(rawLabel: string): string {
  return rawLabel
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(label: string): string {
  return label
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bV(\d+)\b/i, "Verse $1");
}

function classifySectionLabel(rawLabel: string): SectionLabel | null {
  const label = normalizeLabelText(rawLabel.replace(/^\[|\]$/g, ""));
  if (!label) return null;

  const verseMatch = label.match(/^(?:v|verse)\s*(\d+|[ivx]+)?$/i);
  if (verseMatch) {
    const suffix = verseMatch[1] ? ` ${verseMatch[1].toUpperCase()}` : "";
    const displaySuffix = verseMatch[1] && /^\d+$/.test(verseMatch[1]) ? ` ${verseMatch[1]}` : suffix;
    return { label: `Verse${displaySuffix}`, shortLabel: `V${displaySuffix.trim() || ""}`.trim(), type: "verse" };
  }

  const chorusMatch = label.match(/^(?:c|ch|chorus|refrain)(?:\s*(\d+))?$/i);
  if (chorusMatch) {
    const suffix = chorusMatch[1] ? ` ${chorusMatch[1]}` : "";
    return { label: `Chorus${suffix}`, shortLabel: `C${chorusMatch[1] ?? ""}`, type: "chorus" };
  }

  const preChorusMatch = label.match(/^(?:pre\s*chorus|prechorus|pc)(?:\s*(\d+))?$/i);
  if (preChorusMatch) {
    const suffix = preChorusMatch[1] ? ` ${preChorusMatch[1]}` : "";
    return { label: `Pre-Chorus${suffix}`, shortLabel: `PC${preChorusMatch[1] ?? ""}`, type: "pre-chorus" };
  }

  const bridgeMatch = label.match(/^(?:b|br|bridge)(?:\s*(\d+))?$/i);
  if (bridgeMatch) {
    const suffix = bridgeMatch[1] ? ` ${bridgeMatch[1]}` : "";
    return { label: `Bridge${suffix}`, shortLabel: `B${bridgeMatch[1] ?? ""}`, type: "bridge" };
  }

  const tagMatch = label.match(/^(?:tag|vamp|hook)(?:\s*(\d+))?$/i);
  if (tagMatch) {
    const suffix = tagMatch[1] ? ` ${tagMatch[1]}` : "";
    return { label: `Tag${suffix}`, shortLabel: `T${tagMatch[1] ?? ""}`, type: "tag" };
  }

  const introMatch = label.match(/^(?:intro|instrumental)(?:\s*(\d+))?$/i);
  if (introMatch) {
    const suffix = introMatch[1] ? ` ${introMatch[1]}` : "";
    return { label: `Intro${suffix}`, shortLabel: `I${introMatch[1] ?? ""}`, type: "intro" };
  }

  const outroMatch = label.match(/^(?:outro|ending|end)(?:\s*(\d+))?$/i);
  if (outroMatch) {
    const suffix = outroMatch[1] ? ` ${outroMatch[1]}` : "";
    return { label: `Outro${suffix}`, shortLabel: `O${outroMatch[1] ?? ""}`, type: "outro" };
  }

  return null;
}

function parseSectionLabelLine(line: string): { section: SectionLabel; rest: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (bracketMatch) {
    const section = classifySectionLabel(bracketMatch[1]);
    if (section) return { section, rest: bracketMatch[2]?.trim() ?? "" };
  }

  const colonMatch = trimmed.match(/^([A-Za-z][A-Za-z\s-]*\d*)\s*:\s*(.*)$/);
  if (colonMatch) {
    const section = classifySectionLabel(colonMatch[1]);
    if (section) return { section, rest: colonMatch[2]?.trim() ?? "" };
  }

  const section = classifySectionLabel(trimmed);
  return section ? { section, rest: "" } : null;
}

export function getSectionTypeTone(type: Slide["type"]): string {
  switch (type) {
    case "chorus":
      return "chorus";
    case "bridge":
      return "bridge";
    case "tag":
      return "tag";
    case "pre-chorus":
      return "pre-chorus";
    default:
      return "verse";
  }
}

/**
 * Parse raw lyrics into structured worship sections: Verse, Chorus, Bridge,
 * Tag, etc. If a stanza is unlabeled, it becomes the next Verse.
 */
export function parseWorshipLyricSections(rawLyrics: string, linesPerSlide: number): LyricSection[] {
  const normalizedLyrics = rawLyrics.replace(/\r\n?/g, "\n").trim();
  if (!normalizedLyrics) return [];

  const sections: LyricSection[] = [];
  let verseCount = 0;
  let slideCursor = 0;

  const pushSection = (baseSection: SectionLabel, lines: string[]) => {
    const cleanLines = lines.map((line) => line.trim()).filter(Boolean);
    if (cleanLines.length === 0) return;
    const slideCount = Math.max(1, Math.ceil(cleanLines.length / Math.max(1, linesPerSlide)));
    const idBase = `${baseSection.shortLabel || baseSection.label}-${sections.length}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    sections.push({
      id: `section-${idBase}`,
      label: baseSection.label,
      shortLabel: baseSection.shortLabel || baseSection.label,
      type: baseSection.type,
      lines: cleanLines,
      startSlideIndex: slideCursor,
      slideCount,
    });
    slideCursor += slideCount;
  };

  normalizedLyrics.split(/\n\s*\n/).forEach((stanza) => {
    const stanzaLines = stanza.split("\n").map((line) => line.trim()).filter(Boolean);
    if (stanzaLines.length === 0) return;

    let label = parseSectionLabelLine(stanzaLines[0]);
    let lines = stanzaLines;

    if (label) {
      lines = [
        ...(label.rest ? [label.rest] : []),
        ...stanzaLines.slice(1),
      ];
    } else {
      verseCount += 1;
      label = {
        section: { label: `Verse ${verseCount}`, shortLabel: `V${verseCount}`, type: "verse" },
        rest: "",
      };
    }

    const inlineSections: Array<{ section: SectionLabel; lines: string[] }> = [];
    let current = { section: label.section, lines: [] as string[] };

    for (const line of lines) {
      const nextLabel = parseSectionLabelLine(line);
      if (nextLabel && current.lines.length > 0) {
        inlineSections.push(current);
        current = { section: nextLabel.section, lines: nextLabel.rest ? [nextLabel.rest] : [] };
      } else if (nextLabel) {
        current = { section: nextLabel.section, lines: nextLabel.rest ? [nextLabel.rest] : [] };
      } else {
        current.lines.push(line);
      }
    }

    inlineSections.push(current);
    inlineSections.forEach((section) => pushSection(section.section, section.lines));
  });

  return sections;
}

export function formatLyricsFromSections(sections: Array<Pick<LyricSection, "label" | "lines">>): string {
  return sections
    .map((section) => {
      const label = toTitleCase(section.label.trim());
      const lines = section.lines.map((line) => line.trim()).filter(Boolean);
      return [label ? `${label}:` : "", ...lines].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Worship lyric line labels that appear inline in user text.
 * e.g. "Verse:", "Chorus:", "Bridge 2:"
 */
const LYRIC_LABEL_RE =
  /^(Verse|Chorus|Bridge|Pre[-\s]?Chorus|Refrain|Tag|Intro|Outro)\s*\d*:?\s*[:\-]?\s*(.*)/i;

/**
 * Expand a single lyric line into shorter display lines:
 *  1. Extract section labels (Verse:, Chorus:) to their own line
 *  2. Split remaining text at comma / semicolon boundaries
 *
 * Rules satisfied:
 *  • Labels stay with at least the next line
 *  • Splits at sentence boundaries (after , or ;)
 *  • Never breaks mid-thought — each piece is a coherent phrase
 */
function expandLine(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // 1. Check for a section label at the start of the line
  const labelMatch = trimmed.match(LYRIC_LABEL_RE);
  if (labelMatch) {
    const num = trimmed.match(/\d+/)?.[0] ?? "";
    const label = labelMatch[1] + (num ? ` ${num}` : "") + ":";
    const rest = labelMatch[2]?.trim() ?? "";
    if (rest) {
      // Label + remaining content — expand the rest recursively
      return [label, ...expandLine(rest)];
    }
    return [label];
  }

  // 2. Split at commas / semicolons followed by whitespace
  const parts = trimmed.split(/([,;])\s+/);
  if (parts.length <= 1) return [trimmed];

  const result: string[] = [];
  let current = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^[,;]$/.test(part)) {
      // Punctuation — attach to the piece before it
      current += part;
    } else if (i === 0) {
      current = part;
    } else {
      // New text segment after punctuation
      if (current.trim()) result.push(current.trim());
      current = part;
    }
  }
  if (current.trim()) result.push(current.trim());

  return result;
}

/**
 * Flatten an array of lyric lines by expanding each one at natural
 * boundaries (labels, commas, semicolons).
 */
function expandLines(lines: string[]): string[] {
  return lines.flatMap(expandLine);
}

/**
 * Detect the dominant section type from a group of display lines.
 */
function detectGroupType(lines: string[]): Slide["type"] {
  const joined = lines.join(" ").toLowerCase();
  if (joined.includes("chorus")) return "chorus";
  if (joined.includes("bridge")) return "bridge";
  if (joined.includes("pre-chorus") || joined.includes("prechorus")) return "pre-chorus";
  if (joined.includes("tag")) return "tag";
  if (joined.includes("intro")) return "intro";
  if (joined.includes("outro")) return "outro";
  return "verse";
}

/**
 * Detect a section label (Verse, Chorus, etc.) from a group of display lines
 * to use as the slide card heading.
 */
function detectGroupLabel(lines: string[]): string {
  for (const line of lines) {
    const m = line.match(LYRIC_LABEL_RE);
    if (m) {
      const num = lines.join(" ").match(new RegExp(m[1] + "\\s*(\\d+)", "i"))?.[1] ?? "";
      return m[1] + (num ? " " + num : "");
    }
  }
  return "";
}

/**
 * Split display lines into balanced slide groups.
 *
 * Rules:
 *  • Fill each slide up to maxLines
 *  • Prefer breaking at sentence boundaries (lines ending with .!?)
 *  • Never leave a tiny last slide — merge into the previous if it fits
 *  • If a sentence exceeds maxLines it gets its own slide(s)
 */
function splitIntoBalancedSlides(lines: string[], maxLines: number): string[][] {
  if (lines.length === 0) return [];
  if (lines.length <= maxLines) return [lines];

  // Group lines into "sentences" — consecutive lines ending with terminal
  // punctuation form one sentence block that should stay together.
  const sentences: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    current.push(line);
    if (/[.!?]\s*$/.test(line)) {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length > 0) sentences.push(current);

  // Greedy fill: add sentences to the current slide until full, then start a new one
  const slides: string[][] = [];
  let slide: string[] = [];

  for (const sentence of sentences) {
    if (slide.length + sentence.length <= maxLines) {
      slide.push(...sentence);
    } else {
      // Current slide can't fit this sentence — flush it
      if (slide.length > 0) {
        slides.push(slide);
        slide = [];
      }
      if (sentence.length > maxLines) {
        // Sentence itself exceeds maxLines — hard-split it
        for (let i = 0; i < sentence.length; i += maxLines) {
          slides.push(sentence.slice(i, i + maxLines));
        }
      } else {
        slide = [...sentence];
      }
    }
  }
  if (slide.length > 0) slides.push(slide);

  // Balance: if the last slide is very small (≤2 lines), merge it into the
  // previous slide when it fits — avoids lopsided presentations.
  if (slides.length >= 2) {
    const last = slides[slides.length - 1];
    const prev = slides[slides.length - 2];
    if (last.length <= 2 && prev.length + last.length <= maxLines) {
      prev.push(...last);
      slides.pop();
    }
  }

  return slides;
}

/**
 * Split raw lyrics into slides based on stanza breaks and lines-per-slide.
 *
 * When identifyChorus (auto-split) is ON, the engine:
 *  1. Expands each line at natural boundaries (labels, commas, semicolons)
 *  2. Respects sentence boundaries — no mid-thought breaks
 *  3. Balances slide sizes — no tiny last slides
 *  4. Keeps section labels (Verse:, Chorus:) with their content
 *
 * When auto-split is OFF, each parsed section becomes one slide.
 */
export function generateSlides(
  rawLyrics: string,
  linesPerSlide: number,
  identifyChorus: boolean
): Slide[] {
  if (!rawLyrics.trim()) return [];

  const sections = parseWorshipLyricSections(rawLyrics, linesPerSlide);

  if (!identifyChorus) {
    // Auto-split OFF: each section is a single slide (no line chunking)
    return sections.map((section) => ({
      id: `slide-${section.id}-0`,
      label: section.label,
      content: section.lines.join("\n"),
      isContinuation: false,
      type: section.type,
    }));
  }

  // ── Auto-split ON ──────────────────────────────────────────────────────
  // Flatten all sections into one continuous list of display lines,
  // expand at natural boundaries, then balance into slides.
  const displayLines: string[] = [];
  for (const section of sections) {
    displayLines.push(...expandLines(section.lines));
  }

  const groups = splitIntoBalancedSlides(displayLines, linesPerSlide);

  return groups.map((group, i) => {
    const label = detectGroupLabel(group) || (i === 0 ? sections[0]?.label ?? "Lyrics" : `${sections[0]?.label ?? "Lyrics"} (cont)`);
    const type = detectGroupType(group);
    return {
      id: `slide-auto-${i}`,
      label,
      content: group.join("\n"),
      isContinuation: i > 0,
      type,
    };
  });
}
