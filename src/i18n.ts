/**
 * i18n.ts — react-i18next configuration for the MakeChurchEasy Desktop app.
 *
 * Loaded by main.tsx (main app), dock-main.tsx and lm-dock-main.tsx (dock).
 * Merges dock + app locale files; app locale values win on key conflicts.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import appEn from "./locales/app-en.json";
import appFr from "./locales/app-fr.json";
import appEs from "./locales/app-es.json";
import appPt from "./locales/app-pt.json";
import appYo from "./locales/app-yo.json";
import appIg from "./locales/app-ig.json";
import appHa from "./locales/app-ha.json";
import appGh from "./locales/app-gh.json";
import dockEn from "./locales/dock-en.json";

const SAVED_LANGUAGE = localStorage.getItem("mce_interface_language") || "English";
const LANG_MAP: Record<string, string> = {
  English: "en", French: "fr", Spanish: "es", Portuguese: "pt",
  Yoruba: "yo", Igbo: "ig", Hausa: "ha", Ghanaian: "gh",
};
const resolvedLng = LANG_MAP[SAVED_LANGUAGE] || "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...dockEn, ...appEn } },
    fr: { translation: { ...dockEn, ...appFr } },
    es: { translation: { ...dockEn, ...appEs } },
    pt: { translation: { ...dockEn, ...appPt } },
    yo: { translation: { ...dockEn, ...appYo } },
    ig: { translation: { ...dockEn, ...appIg } },
    ha: { translation: { ...dockEn, ...appHa } },
    gh: { translation: { ...dockEn, ...appGh } },
  },
  lng: resolvedLng,
  fallbackLng: "en",
  keySeparator: false,
  interpolation: {
    escapeValue: false,
  },
});

console.log(
  `%c[MCE-i18n] init OK — lng=${i18n.language}, keys=${Object.keys(i18n.getResourceBundle("en", "translation")).length}, saved="${SAVED_LANGUAGE}", resolved="${resolvedLng}"`,
  "color: #0f0; font-weight: bold"
);

i18n.on("languageChanged", (lng: string) => {
  console.log(`%c[MCE-i18n] languageChanged → ${lng}`, "color: #ff0; font-weight: bold");
});

export default i18n;
