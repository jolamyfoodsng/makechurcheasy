/**
 * i18n.ts — react-i18next configuration for the MakeChurchEasy Desktop app.
 *
 * Loaded by main.tsx (main app), dock-main.tsx and lm-dock-main.tsx (dock).
 * Merges dock + app locale files; app locale values win on key conflicts.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getInterfaceLocaleCandidates, resolveInterfaceLocale } from "./i18n/localeCatalog";
import appEn from "./locales/app-en.json";
import appFr from "./locales/app-fr.json";
import appEs from "./locales/app-es.json";
import appPt from "./locales/app-pt.json";
import appYo from "./locales/app-yo.json";
import appIg from "./locales/app-ig.json";
import appHa from "./locales/app-ha.json";
import appEnUS from "./locales/app-en-US.json";
import appEnNG from "./locales/app-en-NG.json";
import appEnGH from "./locales/app-en-GH.json";
import appEnGB from "./locales/app-en-GB.json";
import appFrFR from "./locales/app-fr-FR.json";
import appFrCA from "./locales/app-fr-CA.json";
import appEsES from "./locales/app-es-ES.json";
import appEsMX from "./locales/app-es-MX.json";
import appPtPT from "./locales/app-pt-PT.json";
import appPtBR from "./locales/app-pt-BR.json";
import dockEnUS from "./locales/dock-en-US.json";
import dockEnNG from "./locales/dock-en-NG.json";
import dockEnGH from "./locales/dock-en-GH.json";
import dockEnGB from "./locales/dock-en-GB.json";
import dockFrFR from "./locales/dock-fr-FR.json";
import dockFrCA from "./locales/dock-fr-CA.json";
import dockEsES from "./locales/dock-es-ES.json";
import dockEsMX from "./locales/dock-es-MX.json";
import dockPtPT from "./locales/dock-pt-PT.json";
import dockPtBR from "./locales/dock-pt-BR.json";
import dockYo from "./locales/dock-yo.json";
import dockIg from "./locales/dock-ig.json";
import dockHa from "./locales/dock-ha.json";
import dockEn from "./locales/dock-en.json";

const SAVED_LANGUAGE = localStorage.getItem("mce_interface_language") || "";
const BROWSER_LANGUAGE = typeof navigator !== "undefined" ? navigator.language : "";
const RESOLVED_LANGUAGE = resolveInterfaceLocale(SAVED_LANGUAGE, undefined, BROWSER_LANGUAGE);

function mergeLocale(appLocale: Record<string, unknown>, dockLocale: Record<string, unknown>) {
  return { ...dockLocale, ...appLocale };
}

const resources = {
  en: { translation: mergeLocale(appEn, dockEn) },
  fr: { translation: mergeLocale(appFr, dockEn) },
  es: { translation: mergeLocale(appEs, dockEn) },
  pt: { translation: mergeLocale(appPt, dockEn) },
  yo: { translation: mergeLocale(appYo, dockYo) },
  ig: { translation: mergeLocale(appIg, dockIg) },
  ha: { translation: mergeLocale(appHa, dockHa) },
  "en-US": { translation: mergeLocale(appEnUS, dockEnUS) },
  "en-NG": { translation: mergeLocale(appEnNG, dockEnNG) },
  "en-GH": { translation: mergeLocale(appEnGH, dockEnGH) },
  "en-GB": { translation: mergeLocale(appEnGB, dockEnGB) },
  "fr-FR": { translation: mergeLocale(appFrFR, dockFrFR) },
  "fr-CA": { translation: mergeLocale(appFrCA, dockFrCA) },
  "es-ES": { translation: mergeLocale(appEsES, dockEsES) },
  "es-MX": { translation: mergeLocale(appEsMX, dockEsMX) },
  "pt-PT": { translation: mergeLocale(appPtPT, dockPtPT) },
  "pt-BR": { translation: mergeLocale(appPtBR, dockPtBR) },
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
