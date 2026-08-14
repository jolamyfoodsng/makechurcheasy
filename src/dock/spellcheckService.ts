import type { SpellChecker } from "./spellcheckTypes";

export interface DockSpellcheckError {
  start: number;
  end: number;
  word: string;
  suggestions: string[];
}

const WORD_PATTERN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

// These are common MakeChurchEasy, Bible, and worship terms which are not
// consistently present in an English dictionary. Users can still ignore any
// additional names or language-specific words from the editor.
const APP_WORDS = new Set([
  "acb",
  "amen",
  "asv",
  "bible",
  "church",
  "christ",
  "gospel",
  "hallelujah",
  "jesus",
  "kjv",
  "mce",
  "obs",
  "scripture",
  "worship",
  "yoruba",
  "twi",
]);

let spellCheckerPromise: Promise<SpellChecker> | null = null;

async function loadSpellChecker(): Promise<SpellChecker> {
  if (!spellCheckerPromise) {
    spellCheckerPromise = Promise.all([
      import("nspell"),
      // Import the packaged Hunspell data as raw text. The dictionary package
      // intentionally exposes its Node loader only, so the browser build uses
      // the same bundled data files without loading node:fs.
      import("../../node_modules/dictionary-en/index.aff?raw"),
      import("../../node_modules/dictionary-en/index.dic?raw"),
    ]).then(([nspellModule, affModule, dicModule]) => {
      const createSpellChecker = nspellModule.default;
      return createSpellChecker({
        aff: affModule.default,
        dic: dicModule.default,
      });
    });
  }

  return spellCheckerPromise;
}

function normalizeWord(word: string): string {
  return word.toLocaleLowerCase();
}

function applySuggestionCase(word: string, suggestion: string): string {
  if (word === word.toLocaleUpperCase()) return suggestion.toLocaleUpperCase();
  if (word.length > 0 && word[0] === word[0].toLocaleUpperCase()) {
    return `${suggestion.charAt(0).toLocaleUpperCase()}${suggestion.slice(1).toLocaleLowerCase()}`;
  }
  return suggestion.toLocaleLowerCase();
}

export function getCaseMatchedSuggestion(error: DockSpellcheckError): string | null {
  const suggestion = error.suggestions[0];
  return suggestion ? applySuggestionCase(error.word, suggestion) : null;
}

export async function findDockSpellingErrors(
  text: string,
  ignoredWords: ReadonlySet<string> = new Set(),
): Promise<DockSpellcheckError[]> {
  if (!text.trim()) return [];

  const spellChecker = await loadSpellChecker();
  const errors: DockSpellcheckError[] = [];
  let match: RegExpExecArray | null;

  WORD_PATTERN.lastIndex = 0;
  while ((match = WORD_PATTERN.exec(text))) {
    const word = match[0];
    const normalizedWord = normalizeWord(word);

    if (word.length < 3 || APP_WORDS.has(normalizedWord) || ignoredWords.has(normalizedWord)) continue;
    if (spellChecker.correct(word)) continue;

    errors.push({
      start: match.index,
      end: match.index + word.length,
      word,
      suggestions: spellChecker.suggest(word).slice(0, 4),
    });
  }

  return errors;
}

export function replaceDockSpellingErrors(
  text: string,
  errors: DockSpellcheckError[],
): string {
  return [...errors]
    .sort((left, right) => right.start - left.start)
    .reduce((result, error) => {
      const replacement = getCaseMatchedSuggestion(error);
      if (!replacement) return result;
      return `${result.slice(0, error.start)}${replacement}${result.slice(error.end)}`;
    }, text);
}

export function normalizeIgnoredSpellcheckWords(words: Iterable<string>): Set<string> {
  return new Set([...words].map(normalizeWord));
}
