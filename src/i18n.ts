/**
 * i18n.ts — react-i18next configuration for the MakeChurchEasy Desktop dock.
 *
 * Loaded by dock-main.tsx and lm-dock-main.tsx entry points.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/dock-en.json";

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en,
    },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
