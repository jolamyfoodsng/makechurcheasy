import {
  readNativeDockSetting,
  writeNativeDockSetting,
} from "../services/localDockSettings";

export const DOCK_SPELLCHECK_DICTIONARY_KEY = "ocs-dock-spellcheck-dictionary";
export const DOCK_SPELLCHECK_DICTIONARY_UPDATED_EVENT = "mce:dock-spellcheck-dictionary-updated";

function normalizeWord(word: string): string {
  return word.trim().toLocaleLowerCase();
}

export function loadDockSpellcheckDictionary(): Set<string> {
  const raw = readNativeDockSetting<unknown>(DOCK_SPELLCHECK_DICTIONARY_KEY);
  if (!raw) return new Set();

  try {
    const parsed = typeof raw === "string"
      ? JSON.parse(raw) as { words?: unknown } | unknown[]
      : raw as { words?: unknown } | unknown[];
    const words = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? parsed.words : null;
    if (!Array.isArray(words)) return new Set();
    return new Set(
      words
        .filter((word): word is string => typeof word === "string")
        .map(normalizeWord)
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

export function saveDockSpellcheckDictionary(words: Iterable<string>): Set<string> {
  const normalized = new Set(
    [...words]
      .map(normalizeWord)
      .filter(Boolean),
  );

  writeNativeDockSetting(DOCK_SPELLCHECK_DICTIONARY_KEY, {
    words: [...normalized].sort((left, right) => left.localeCompare(right)),
    updatedAt: new Date().toISOString(),
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DOCK_SPELLCHECK_DICTIONARY_UPDATED_EVENT));
  }

  return normalized;
}
