/**
 * i18n.ts — react-i18next configuration for the MakeChurchEasy Desktop app.
 *
 * Loaded by main.tsx (main app), dock-main.tsx and lm-dock-main.tsx (dock).
 * Merges dock + app locale files; app locale values win on key conflicts.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getInterfaceLocaleCandidates, resolveInterfaceLocale } from "./i18n/localeCatalog";
import appEnUS from "./locales/app-en-US.json";
import dockEnUS from "./locales/dock-en-US.json";

type LocaleBundle = Record<string, unknown>;

const SAVED_LANGUAGE = typeof localStorage !== "undefined" ? (localStorage.getItem("mce_interface_language") || "") : "";
const BROWSER_LANGUAGE = typeof navigator !== "undefined" ? navigator.language : "";
const RESOLVED_LANGUAGE = resolveInterfaceLocale(SAVED_LANGUAGE, undefined, BROWSER_LANGUAGE);

function mergeLocale(appLocale: LocaleBundle, dockLocale: LocaleBundle) {
  return { ...dockLocale, ...appLocale };
}

/*
 * Only English (the fallback) is bundled up front. Each other language is its
 * own chunk, loaded when it is chosen. All eight languages used to be parsed
 * on every start of the app and the OBS Dock (~2.9 MB of JSON) and kept in
 * memory twice; on 6 GB laptops that was a large part of the Dock's start-up.
 */
const LOCALE_LOADERS: Record<string, () => Promise<[{ default: LocaleBundle }, { default: LocaleBundle }]>> = {
  fr: () => Promise.all([import("./locales/app-fr.json"), import("./locales/dock-fr.json")]),
  es: () => Promise.all([import("./locales/app-es.json"), import("./locales/dock-es.json")]),
  pt: () => Promise.all([import("./locales/app-pt.json"), import("./locales/dock-pt.json")]),
  yo: () => Promise.all([import("./locales/app-yo.json"), import("./locales/dock-yo.json")]),
  ig: () => Promise.all([import("./locales/app-ig.json"), import("./locales/dock-ig.json")]),
  ha: () => Promise.all([import("./locales/app-ha.json"), import("./locales/dock-ha.json")]),
  ak: () => Promise.all([import("./locales/app-ak.json"), import("./locales/dock-ak.json")]),
};

const englishBundle = mergeLocale(appEnUS as LocaleBundle, dockEnUS as LocaleBundle);
const resources: Record<string, { translation: LocaleBundle }> = {
  en: { translation: englishBundle },
  "en-US": { translation: englishBundle },
};

const loadingLocales = new Map<string, Promise<void>>();

function localeBundleKey(code: string | undefined | null): string | null {
  if (!code) return null;
  const canonical = resolveInterfaceLocale(code);
  const language = canonical.split("-")[0];
  if (LOCALE_LOADERS[canonical]) return canonical;
  if (LOCALE_LOADERS[language]) return language;
  return null;
}

/** Load a language's strings (no-op for English or a language already loaded). */
export function ensureInterfaceLocaleLoaded(code: string | undefined | null): Promise<void> {
  const key = localeBundleKey(code);
  if (!key || i18n.hasResourceBundle(key, "translation")) return Promise.resolve();
  let pending = loadingLocales.get(key);
  if (!pending) {
    pending = LOCALE_LOADERS[key]()
      .then(([app, dock]) => {
        i18n.addResourceBundle(key, "translation", mergeLocale(app.default, dock.default), true, true);
      })
      .catch((error) => {
        console.warn(`[MCE-i18n] Could not load "${key}" strings; using English.`, error);
      })
      .finally(() => {
        loadingLocales.delete(key);
      });
    loadingLocales.set(key, pending);
  }
  return pending;
}

i18n.use(initReactI18next).init({
  resources,
  lng: RESOLVED_LANGUAGE,
  fallbackLng: (code) => {
    const locale = typeof code === "string" && code ? code : RESOLVED_LANGUAGE;
    return getInterfaceLocaleCandidates(locale);
  },
  keySeparator: false,
  interpolation: {
    escapeValue: false,
  },
  // A language chosen before its chunk has loaded falls back to English for
  // that moment instead of showing raw keys.
  partialBundledLanguages: true,
});

// Every language switch (settings, Dock sync from the app) loads that
// language's strings first, so callers keep using i18n.changeLanguage().
const changeLanguageWithStrings = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = ((lng?: string, callback?: Parameters<typeof i18n.changeLanguage>[1]) => (
  ensureInterfaceLocaleLoaded(lng).then(() => changeLanguageWithStrings(lng, callback))
)) as typeof i18n.changeLanguage;

// The saved language loads before the first screen renders (a small local
// chunk), so non-English users don't see English flash first.
await ensureInterfaceLocaleLoaded(RESOLVED_LANGUAGE);
if (localeBundleKey(RESOLVED_LANGUAGE)) {
  // Re-render with the language now that its strings are present.
  await changeLanguageWithStrings(RESOLVED_LANGUAGE);
}

console.log(
  `%c[MCE-i18n] init OK — lng=${i18n.language}, keys=${Object.keys(i18n.getResourceBundle("en-US", "translation")).length}, saved="${SAVED_LANGUAGE || "(empty)"}, resolved="${RESOLVED_LANGUAGE}"`,
  "color: #0f0; font-weight: bold"
);

i18n.on("languageChanged", (lng: string) => {
  console.log(`%c[MCE-i18n] languageChanged → ${lng}`, "color: #ff0; font-weight: bold");
});

export default i18n;
