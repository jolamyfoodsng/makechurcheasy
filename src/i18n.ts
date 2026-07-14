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
import appFr from "./locales/app-fr.json";
import appEs from "./locales/app-es.json";
import appPt from "./locales/app-pt.json";
import appYo from "./locales/app-yo.json";
import appIg from "./locales/app-ig.json";
import appHa from "./locales/app-ha.json";
import appAk from "./locales/app-ak.json";
import dockEnUS from "./locales/dock-en-US.json";
import dockFr from "./locales/dock-fr.json";
import dockEs from "./locales/dock-es.json";
import dockPt from "./locales/dock-pt.json";
import dockYo from "./locales/dock-yo.json";
import dockIg from "./locales/dock-ig.json";
import dockHa from "./locales/dock-ha.json";
import dockAk from "./locales/dock-ak.json";

const SAVED_LANGUAGE = localStorage.getItem("mce_interface_language") || "";
const BROWSER_LANGUAGE = typeof navigator !== "undefined" ? navigator.language : "";
const RESOLVED_LANGUAGE = resolveInterfaceLocale(SAVED_LANGUAGE, undefined, BROWSER_LANGUAGE);

function mergeLocale(appLocale: Record<string, unknown>, dockLocale: Record<string, unknown>) {
  return { ...dockLocale, ...appLocale };
}

const resources = {
  en: { translation: mergeLocale(appEnUS, dockEnUS) },
  fr: { translation: mergeLocale(appFr, dockFr) },
  es: { translation: mergeLocale(appEs, dockEs) },
  pt: { translation: mergeLocale(appPt, dockPt) },
  yo: { translation: mergeLocale(appYo, dockYo) },
  ig: { translation: mergeLocale(appIg, dockIg) },
  ha: { translation: mergeLocale(appHa, dockHa) },
  ak: { translation: mergeLocale(appAk, dockAk) },
  "en-US": { translation: mergeLocale(appEnUS, dockEnUS) },
};

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
});

console.log(
  `%c[MCE-i18n] init OK — lng=${i18n.language}, keys=${Object.keys(i18n.getResourceBundle("en-US", "translation")).length}, saved="${SAVED_LANGUAGE || "(empty)"}, resolved="${RESOLVED_LANGUAGE}"`,
  "color: #0f0; font-weight: bold"
);

i18n.on("languageChanged", (lng: string) => {
  console.log(`%c[MCE-i18n] languageChanged → ${lng}`, "color: #ff0; font-weight: bold");
});

export default i18n;
