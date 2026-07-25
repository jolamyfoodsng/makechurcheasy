/**
 * textCleanup.ts — Cleanup utilities for imported lyrics.
 */

const ATTRIBUTION_RE: RegExp[] = [
  /^\s*[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\s*$/,
  /^\s*(?:MHB|PH|CH|TH|THC|CB|GBP|CWS|PPP|CP|TPH|TCH|SGT|SOS|HCB|BB|KB)\s*\.?\s*\d+\s*$/i,
];

function isAttributionLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return ATTRIBUTION_RE.some((re) => re.test(trimmed));
}

export function cleanText(text: string): string {
  return text
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function removeEmptyLines(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let lastEmpty = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (!lastEmpty) result.push("");
      lastEmpty = true;
    } else {
      result.push(line);
      lastEmpty = false;
    }
  }

  return result.join("\n").trim();
}

export function removeVerseNumbers(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\.\s*/, ""))
    .join("\n");
}

export function removeMetadata(text: string): string {
  return text
    .split("\n")
    .filter((line) => !isAttributionLine(line))
    .join("\n");
}

export function autoSplit(text: string, linesPerSlide: number = 3): string {
  const lines = text.split("\n").filter((l) => l.trim());
  const chunks: string[] = [];

  for (let i = 0; i < lines.length; i += linesPerSlide) {
    chunks.push(lines.slice(i, i + linesPerSlide).join("\n"));
  }

  return chunks.join("\n\n");
}
