export type NoteTextToolAction = "autosplit" | "clean" | "remove-verse-numbers" | "uppercase" | "lowercase" | "capitalize";

export const NOTE_TEXT_TOOL_BUTTONS: Array<{ action: NoteTextToolAction; title: string; icon?: string; label?: string }> = [
  { action: "autosplit", title: "Auto Split", icon: "format_align_left" },
  { action: "clean", title: "Clean Text", icon: "auto_fix_high" },
  { action: "remove-verse-numbers", title: "Verse Numbers", icon: "tag" },
  { action: "uppercase", title: "Uppercase", label: "AA" },
  { action: "lowercase", title: "Lowercase", label: "aa" },
  { action: "capitalize", title: "Capitalize", label: "Aa" },
];

export function cleanNoteText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function removeVerseNumbers(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\[\d+\]|\d+[\).:\-]?)\s+/, ""))
    .join("\n")
    .trim();
}

export function capitalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

export function splitTextUnits(text: string): string[] {
  const cleaned = cleanNoteText(text);
  if (!cleaned) return [];

  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) return lines;

  const sentenceUnits = cleaned
    .match(/[^.!?;:]+[.!?;:]?/g)
    ?.map((unit) => unit.trim())
    .filter(Boolean) ?? [];

  return sentenceUnits.length > 1 ? sentenceUnits : [cleaned];
}

export function autoSplitNoteText(text: string, linesPerSlide = 3): string {
  const safeLinesPerSlide = Math.max(1, Math.min(12, Math.floor(linesPerSlide) || 3));
  const sections = cleanNoteText(text)
    .split(/\n\n+/)
    .flatMap((section) => {
      const units = splitTextUnits(section);
      const chunks: string[] = [];
      for (let i = 0; i < units.length; i += safeLinesPerSlide) {
        chunks.push(units.slice(i, i + safeLinesPerSlide).join("\n"));
      }
      return chunks;
    })
    .filter(Boolean);

  return sections.join("\n\n");
}

export function formatNoteText(text: string, action: NoteTextToolAction, linesPerSlide?: number): string {
  switch (action) {
    case "autosplit":
      return autoSplitNoteText(text, linesPerSlide);
    case "clean":
      return cleanNoteText(text);
    case "remove-verse-numbers":
      return removeVerseNumbers(text);
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "capitalize":
      return capitalizeText(text);
    default:
      return text;
  }
}

export function getNoteContentSections(content: string, fallbackTitle = ""): string[] {
  const sections = content.split(/\n\n+/).map((section) => section.trim()).filter(Boolean);
  if (sections.length > 0) return sections;
  return fallbackTitle ? [fallbackTitle] : [];
}
