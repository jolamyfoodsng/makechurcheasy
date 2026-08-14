export interface SpellChecker {
  correct(word: string): boolean;
  suggest(word: string): string[];
}
