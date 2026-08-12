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

  const numberedVerseMatch = trimmed.match(/^(\d+)\s*:\s*(.*)$/);
  if (numberedVerseMatch) {
    const number = numberedVerseMatch[1];
    return {
      section: { label: `Verse ${number}`, shortLabel: `V${number}`, type: "verse" },
      rest: numberedVerseMatch[2]?.trim() ?? "",
    };
  }

  const colonMatch = trimmed.match(/^([A-Za-z][A-Za-z\s-]*\d*)\s*:\s*(.*)$/);
  if (colonMatch) {
    const section = classifySectionLabel(colonMatch[1]);
    if (section) return { section, rest: colonMatch[2]?.trim() ?? "" };
  }

  const section = classifySectionLabel(trimmed);
  return section ? { section, rest: "" } : null;
}

export interface ParsedWorshipSectionLabel {
  label: string;
  shortLabel: string;
  type: Slide["type"];
  rest: string;
}

/** Parse a visible worship heading such as "Verse 2:" or "2:". */
export function parseWorshipSectionLabelLine(line: string): ParsedWorshipSectionLabel | null {
  const parsed = parseSectionLabelLine(line);
  if (!parsed) return null;
  return {
    label: parsed.section.label,
    shortLabel: parsed.section.shortLabel,
    type: parsed.section.type,
    rest: parsed.rest,
  };
}

export interface StructuredTextDocument {
  /** A standalone bracketed heading such as [Orin 969], when present. */
  title: string | null;
  /** Lyric/note content with the heading markers removed. */
  body: string;
}

/**
 * Extract the title convention used by imported hymns and notes.
 *
 * A marker is only treated as a title when it is the first non-empty line,
 * so normal bracketed lyric text remains untouched.
 */
export function extractStructuredTextTitle(rawText: string): StructuredTextDocument {
  const normalized = rawText.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex < 0) return { title: null, body: "" };

  const titleMatch = lines[firstContentIndex].trim().match(/^\[([^\]\r\n]+)\]\s*\.?$/);
  if (!titleMatch) return { title: null, body: normalized };

  const title = titleMatch[1].trim();
  const bodyLines = lines.filter((line, index) => {
    if (index === firstContentIndex) return false;
    const repeatedMarker = line.trim().match(/^\[([^\]\r\n]+)\]\s*\.?$/);
    return repeatedMarker?.[1].trim().toLocaleLowerCase() !== title.toLocaleLowerCase();
  });

  return {
    title,
    body: bodyLines.join("\n").replace(/^\n+|\n+$/g, "").trim(),
  };
}

function wrapLyricLine(line: string, maxLineLength: number): string[] {
  const compact = line.replace(/\s+/g, " ").trim();
  if (!compact) return [];

  const words = compact.split(" ");
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && Array.from(candidate).length > maxLineLength) {
      wrapped.push(current);
      current = word;
      continue;
    }
    current = candidate;
  }

  if (current) wrapped.push(current);
  return wrapped;
}

type AutoSplitTextSection = {
  label: SectionLabel | null;
  lines: string[];
};

function parseAutoSplitTextSections(rawLyrics: string): AutoSplitTextSection[] {
  const stanzas = rawLyrics
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n[ \t]*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const sections: AutoSplitTextSection[] = [];

  const pushSection = (section: AutoSplitTextSection) => {
    const lines = section.lines.map((line) => line.trimEnd()).filter(Boolean);
    if (lines.length === 0) return;
    sections.push({ label: section.label, lines });
  };

  for (const stanza of stanzas) {
    const stanzaLines = stanza.split("\n").map((line) => line.trimEnd()).filter(Boolean);
    let current: AutoSplitTextSection = { label: null, lines: [] };

    for (const line of stanzaLines) {
      const detected = parseSectionLabelLine(line);
      if (detected) {
        pushSection(current);
        current = {
          label: detected.section,
          lines: detected.rest ? [detected.rest] : [],
        };
        continue;
      }

      current.lines.push(line);
    }

    pushSection(current);
  }

  return sections;
}

export function autoSplitLyricsText(
  rawLyrics: string,
  linesPerSlide: number = 2,
  options: { maxLineLength?: number } = {},
): string {
  const structured = extractStructuredTextTitle(rawLyrics);
  const normalized = structured.body.trim();
  if (!normalized) return rawLyrics;

  const safeLinesPerSlide = Math.max(1, Math.min(12, Math.floor(linesPerSlide) || 2));
  const maxLineLength = Math.max(24, Math.min(80, Math.floor(options.maxLineLength ?? 46)));
  const sections = parseAutoSplitTextSections(normalized);
  if (sections.length === 0) return rawLyrics;

  const blocks: string[] = [];

  for (const section of sections) {
    const wrappedLines = section.lines.flatMap((line) => wrapLyricLine(line, maxLineLength));
    for (let start = 0; start < wrappedLines.length; start += safeLinesPerSlide) {
      const chunk = wrappedLines.slice(start, start + safeLinesPerSlide);
      if (chunk.length === 0) continue;

      const label = section.label?.label ? `${section.label.label}:` : "";
      blocks.push([label, ...chunk].filter(Boolean).join("\n"));
    }
  }

  const result = blocks.join("\n\n") || structured.body;
  return structured.title ? `[${structured.title}]\n\n${result}` : result;
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
 *
 * Blank lines between lyric blocks act as stanza/slide boundaries.
 * Single newlines inside a block are preserved as line breaks within
 * the same slide.
 */
export function parseWorshipLyricSections(rawLyrics: string, linesPerSlide: number): LyricSection[] {
  const normalizedLyrics = extractStructuredTextTitle(rawLyrics).body.trim();
  if (!normalizedLyrics) return [];

  // Split on one or more blank lines (spaces/tabs allowed between newlines).
  // \n+ covers single blank line, double blank line, etc. — all count as
  // one stanza boundary so extra blank lines don't create empty stanzas.
  const stanzas = normalizedLyrics
    .split(/\n[ \t]*\n+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .trim(),
    )
    .filter((block) => block.length > 0);

  const sections: LyricSection[] = [];
  let verseCount = 0;
  let slideCursor = 0;

  const pushSection = (baseSection: SectionLabel, content: string) => {
    const cleanLines = content.split("\n").map((l) => l.trimEnd()).filter((l) => l.length > 0);
    if (cleanLines.length === 0) return;
    const slideCount = Math.max(1, Math.ceil(cleanLines.length / Math.max(1, linesPerSlide)));
    const idBase = `${baseSection.shortLabel || baseSection.label}-${sections.length}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
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

  for (const stanza of stanzas) {
    const stanzaLines = stanza.split("\n").map((l) => l.trimEnd());
    if (stanzaLines.length === 0 || stanzaLines.every((l) => l.length === 0)) continue;

    let label = parseSectionLabelLine(stanzaLines[0]);
    let lines = stanzaLines;

    if (label) {
      lines = [
        ...(label.rest ? [label.rest] : []),
        ...stanzaLines.slice(1).filter((l) => l.length > 0),
      ];
    } else {
      verseCount += 1;
      label = {
        section: { label: `Verse ${verseCount}`, shortLabel: `V${verseCount}`, type: "verse" },
        rest: "",
      };
      lines = stanzaLines.filter((l) => l.length > 0);
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
    for (const s of inlineSections) {
      pushSection(s.section, s.lines.join("\n"));
    }
  }

  return sections;
}

export function formatLyricsFromSections(sections: Array<Pick<LyricSection, "label" | "lines">>): string {
  return sections
    .map((section) => {
      const label = toTitleCase(section.label.trim());
      const lines = section.lines.map((line) => line.trimEnd()).filter((l) => l.length > 0);
      return [label ? `${label}:` : "", ...lines].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}



/**
 * Split raw lyrics into slides based on stanza breaks and lines-per-slide.
 *
 * ── Stanza-first parsing ──
 *  • Blank lines are the primary slide boundaries.
 *  • A single newline keeps two lyric lines inside the same slide.
 *  • Multiple blank lines count as one boundary (no empty slides).
 *  • Visual textarea wrapping is not a newline — only real \n matters.
 *
 * ── Auto-split OFF (identifyChorus = false) ──
 *  • Each stanza becomes exactly one slide.
 *  • linesPerSlide is ignored — the user's stanza breaks are authoritative.
 *
 * ── Auto-split ON (identifyChorus = true) ──
 *  • Each stanza is chunked into slides of at most linesPerSlide lines.
 *  • A stanza is never merged with another stanza, even if both are short.
 *  • Continuation labels (cont) only appear when a single stanza is
 *    genuinely split because it exceeds linesPerSlide.
 *  • The explicit continuousLineCount option lets the dock carry unlabelled
 *    blocks forward when the operator chooses a line count manually.
 */
export interface GenerateSlidesOptions {
  /**
   * When the operator explicitly chooses a line count, carry unlabelled
   * lyric blocks into the same line-count stream instead of treating every
   * blank line as a hard slide boundary.
   */
  continuousLineCount?: boolean;
}

export function generateSlides(
  rawLyrics: string,
  linesPerSlide: number,
  identifyChorus: boolean,
  options: GenerateSlidesOptions = {},
): Slide[] {
  const normalized = extractStructuredTextTitle(rawLyrics).body.trim();
  if (!normalized) return [];

  // 1. Split into stanzas using blank lines as boundaries
  const stanzas = normalized
    .split(/\n[ \t]*\n+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .trim(),
    )
    .filter((block) => block.length > 0);

  if (identifyChorus && options.continuousLineCount) {
    const sections: Array<{
      label: SectionLabel;
      lines: string[];
      explicit: boolean;
    }> = [];
    let verseCount = 0;

    for (const stanza of stanzas) {
      const stanzaLines = stanza
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
      if (stanzaLines.length === 0) continue;

      const detectedLabel = parseSectionLabelLine(stanzaLines[0]);
      if (detectedLabel) {
        const contentLines = [
          ...(detectedLabel.rest ? [detectedLabel.rest] : []),
          ...stanzaLines.slice(1),
        ];
        if (contentLines.length > 0) {
          sections.push({
            label: detectedLabel.section,
            lines: contentLines,
            explicit: true,
          });
        }
        continue;
      }

      const previous = sections[sections.length - 1];
      if (!previous || previous.explicit) {
        verseCount += 1;
        sections.push({
          label: { label: `Verse ${verseCount}`, shortLabel: `V${verseCount}`, type: "verse" },
          lines: [],
          explicit: false,
        });
      }
      sections[sections.length - 1].lines.push(...stanzaLines);
    }

    const safeLinesPerSlide = Math.max(1, linesPerSlide || 2);
    const continuousSlides: Slide[] = [];
    let continuousIndex = 0;
    for (const section of sections) {
      for (let start = 0; start < section.lines.length; start += safeLinesPerSlide) {
        const partIndex = Math.floor(start / safeLinesPerSlide);
        continuousSlides.push({
          id: `slide-continuous-${continuousIndex}`,
          label: partIndex === 0 ? section.label.label : `${section.label.label} (cont)`,
          content: section.lines.slice(start, start + safeLinesPerSlide).join("\n"),
          isContinuation: partIndex > 0,
          type: section.label.type,
        });
        continuousIndex += 1;
      }
    }
    return continuousSlides;
  }

  // 2. For each stanza: detect section label, extract lines, build slides
  let verseCount = 0;
  const resultSlides: Slide[] = [];
  let slideIndex = 0;

  for (const stanza of stanzas) {
    const stanzaLines = stanza
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    if (stanzaLines.length === 0) continue;

    // Detect section label from the first line
    let label: SectionLabel;
    let contentLines: string[];

    const detectedLabel = parseSectionLabelLine(stanzaLines[0]);
    if (detectedLabel) {
      label = detectedLabel.section;
      contentLines = [
        ...(detectedLabel.rest ? [detectedLabel.rest] : []),
        ...stanzaLines.slice(1),
      ];
    } else {
      verseCount += 1;
      label = { label: `Verse ${verseCount}`, shortLabel: `V${verseCount}`, type: "verse" };
      contentLines = stanzaLines;
    }

    if (contentLines.length === 0) continue;

    // 3. Build slide(s) from this stanza
    if (!identifyChorus) {
      // Auto-split OFF: one stanza = one slide
      resultSlides.push({
        id: `slide-${slideIndex}`,
        label: label.label,
        content: contentLines.join("\n"),
        isContinuation: false,
        type: label.type,
      });
      slideIndex++;
    } else {
      // Auto-split ON: chunk by linesPerSlide, never merge stanzas
      const safeLinesPerSlide = Math.max(1, linesPerSlide || 2);
      for (let start = 0; start < contentLines.length; start += safeLinesPerSlide) {
        const partIndex = Math.floor(start / safeLinesPerSlide);
        resultSlides.push({
          id: `slide-auto-${slideIndex}`,
          label: partIndex === 0 ? label.label : `${label.label} (cont)`,
          content: contentLines.slice(start, start + safeLinesPerSlide).join("\n"),
          isContinuation: partIndex > 0,
          type: label.type,
        });
        slideIndex++;
      }
    }
  }

  return resultSlides;
}
