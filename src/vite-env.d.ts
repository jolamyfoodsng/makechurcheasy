/// <reference types="vite/client" />

/** Build-time app version injected by vite.config.ts from package.json */
declare const __APP_VERSION__: string;

/** Build-time fingerprint used to invalidate stale OBS browser-source HTML. */
declare const __MCE_OVERLAY_HTML_VERSION__: string;

declare module "nspell" {
  interface NSpellDictionary {
    aff: string;
    dic: string;
  }

  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
  }

  const createSpellChecker: (dictionary: NSpellDictionary) => NSpell;
  export default createSpellChecker;
}
