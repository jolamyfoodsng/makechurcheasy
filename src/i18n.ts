/**
 * i18n.ts — react-i18next configuration for the MakeChurchEasy Desktop app.
 *
 * Loaded by main.tsx (main app), dock-main.tsx and lm-dock-main.tsx (dock).
 * Merges dock + app locale files; dock values win on key conflicts.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import appEn from "./locales/app-en.json";
import dockEn from "./locales/dock-en.json";

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: { ...appEn, ...dockEn },
    },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
