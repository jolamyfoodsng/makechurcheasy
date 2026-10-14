/**
 * studioBooks.ts — the 66 books grouped and coloured like Holyrics, with the short
 * names the Dock's book picker uses (Gen, Exo, Lev…).
 */
import { BIBLE_BOOKS } from "../bible/types";

export type BookGroup = "law" | "history" | "poetry" | "prophets" | "gospels" | "acts" | "epistles" | "revelation";

export interface BookColors {
  base: string;
  dark: string;
  light: string;
}

export const BOOK_GROUP_COLORS: Record<BookGroup, BookColors> = {
  law: { base: "#6f4a26", dark: "#26170a", light: "#a47c52" },
  history: { base: "#c9822c", dark: "#5a3510", light: "#dfa55a" },
  poetry: { base: "#c2342f", dark: "#5c1311", light: "#d9625c" },
  prophets: { base: "#8a3a8f", dark: "#3b1440", light: "#ad66b2" },
  gospels: { base: "#3f4a9a", dark: "#15183f", light: "#6670bb" },
  acts: { base: "#3b86a6", dark: "#12384a", light: "#66a9c4" },
  epistles: { base: "#2f8a55", dark: "#0f3a22", light: "#5bae80" },
  revelation: { base: "#8aa83a", dark: "#34440f", light: "#adc566" },
};

const SHORT_NAMES = [
  "Gen", "Exo", "Lev", "Num", "Deu", "Jos", "Jdg", "Rut", "1Sa", "2Sa", "1Ki", "2Ki", "1Ch", "2Ch", "Ezr", "Neh", "Est",
  "Job", "Psa", "Pro", "Ecc", "Sng", "Isa", "Jer", "Lam", "Ezk", "Dan", "Hos", "Jol", "Amo", "Oba", "Jon", "Mic", "Nah",
  "Hab", "Zep", "Hag", "Zec", "Mal", "Mat", "Mar", "Luk", "Joh", "Act", "Rom", "1Co", "2Co", "Gal", "Eph", "Php", "Col",
  "1Th", "2Th", "1Ti", "2Ti", "Tit", "Phm", "Heb", "Jas", "1Pe", "2Pe", "1Jn", "2Jn", "3Jn", "Jud", "Rev",
] as const;

/** Group of the book at this position in the Bible (0 = Genesis). */
export function bookGroupAt(index: number): BookGroup {
  if (index < 5) return "law";
  if (index < 17) return "history";
  if (index < 22) return "poetry";
  if (index < 39) return "prophets";
  if (index < 43) return "gospels";
  if (index === 43) return "acts";
  if (index < 65) return "epistles";
  return "revelation";
}

export function bookIndex(book: string): number {
  return (BIBLE_BOOKS as readonly string[]).indexOf(book);
}

export function bookColors(book: string): BookColors {
  const index = bookIndex(book);
  return BOOK_GROUP_COLORS[bookGroupAt(index < 0 ? 0 : index)];
}

export function bookShortName(book: string): string {
  const index = bookIndex(book);
  return index >= 0 ? SHORT_NAMES[index] : book.slice(0, 3);
}

export function isOldTestament(book: string): boolean {
  const index = bookIndex(book);
  return index >= 0 && index < 39;
}
