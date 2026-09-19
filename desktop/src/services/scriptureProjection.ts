import { getVerse } from "../bible/bibleData";
import type { VoiceBibleCandidate } from "./voiceBibleTypes";

/** Weak closest-match suggestions must never become automatic projections. */
export function isConfidentScriptureSuggestion(candidate: VoiceBibleCandidate): boolean {
  return candidate.source !== "fuzzy" && Number.isFinite(candidate.confidence) && candidate.confidence >= 0.9;
}

/** Read the actual selected translation before labelling or projecting it. */
export async function resolveScriptureProjection(
  candidate: VoiceBibleCandidate,
  translation = candidate.translation,
): Promise<VoiceBibleCandidate> {
  const targetTranslation = translation.trim().toUpperCase();
  const endVerse = candidate.endVerse ?? candidate.verse;
  if (!Number.isInteger(candidate.verse) || candidate.verse < 1 || !Number.isInteger(endVerse) ||
      endVerse < candidate.verse || endVerse - candidate.verse > 175) {
    throw new Error("This scripture reference is invalid. Select the verse again.");
  }
  const verses = await Promise.all(Array.from({ length: endVerse - candidate.verse + 1 }, (_, offset) =>
    getVerse(candidate.book, candidate.chapter, candidate.verse + offset, targetTranslation),
  ));
  if (verses.some((verse) => !verse?.text)) {
    throw new Error(`This verse is unavailable in ${targetTranslation}. Choose an installed translation.`);
  }
  return { ...candidate, translation: targetTranslation,
    label: `${candidate.book} ${candidate.chapter}:${candidate.verse}${endVerse > candidate.verse ? `-${endVerse}` : ""}`,
    snippet: verses.map((verse) => verse!.text).join(" ") };
}
