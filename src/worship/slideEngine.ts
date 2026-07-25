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
 *
 * Blank lines between lyric blocks act as stanza/slide boundaries.
 * Single newlines inside a block are preserved as line breaks within
 * the same slide.
 */
export function parseWorshipLyricSections(rawLyrics: string, linesPerSlide: number): LyricSection[] {
  const normalizedLyrics = rawLyrics.replace(/\r\n?/g, "\n").trim();
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
 */
export function generateSlides(
  rawLyrics: string,
  linesPerSlide: number,
  identifyChorus: boolean
): Slide[] {
  const normalized = rawLyrics.replace(/\r\n?/g, "\n").trim();
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
