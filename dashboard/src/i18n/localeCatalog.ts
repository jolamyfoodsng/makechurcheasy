export interface Locale {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  region: string;
  popular?: boolean;
}

const REGION_DEFAULTS: Record<string, string> = {
  NG: "en-NG",
  GH: "en-GH",
  US: "en-US",
  GB: "en-GB",
  FR: "fr-FR",
  CA: "fr-CA",
  ES: "es-ES",
  MX: "es-MX",
  PT: "pt-PT",
  BR: "pt-BR",
};

const COUNTRY_ALIASES: Record<string, string> = {
  nigeria: "NG",
  ghana: "GH",
  "united states": "US",
  usa: "US",
  "u.s.a.": "US",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  france: "FR",
  canada: "CA",
  spain: "ES",
  mexico: "MX",
  portugal: "PT",
  brazil: "BR",
};

const LANGUAGE_DEFAULTS: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  pt: "pt-BR",
  yo: "yo",
  ig: "ig",
  ha: "ha",
};

const SUPPORTED_LOCALES: Locale[] = [
  { code: "en-US", name: "English (United States)", nativeName: "English (United States)", flag: "🇺🇸", region: "North America", popular: true },
  { code: "fr-FR", name: "French (France)", nativeName: "Français (France)", flag: "🇫🇷", region: "Europe", popular: true },

  { code: "es-ES", name: "Spanish (Spain)", nativeName: "Español (España)", flag: "🇪🇸", region: "Europe", popular: true },
  { code: "pt-PT", name: "Portuguese (Portugal)", nativeName: "Português (Portugal)", flag: "🇵🇹", region: "Europe", popular: true },

  { code: "yo", name: "Yoruba", nativeName: "Yorùbá", flag: "🇳🇬", region: "Africa" },
  { code: "ig", name: "Igbo", nativeName: "Igbo", flag: "🇳🇬", region: "Africa" },
  { code: "ha", name: "Hausa", nativeName: "Hausa", flag: "🇳🇬", region: "Africa" },
];

const SUPPORTED_LOCALE_MAP = new Map(SUPPORTED_LOCALES.map((locale) => [locale.code.toLowerCase(), locale]));
const LANGUAGE_NAME_ALIASES: Record<string, string> = {
  english: "en",
  french: "fr",
  spanish: "es",
  portuguese: "pt",
  yoruba: "yo",
  igbo: "ig",
  hausa: "ha",
};
const LEGACY_ALIAS_MAP: Record<string, string> = {
  gh: "en-GH",
  ghanaian: "en-GH",
  twi: "en-GH",
};

export const LOCALES = SUPPORTED_LOCALES;
export const DEFAULT_LOCALE = "en-US";

export function isValidLocale(code: string | undefined | null): code is string {
  return Boolean(code && SUPPORTED_LOCALE_MAP.has(code.toLowerCase()));
}

export function getLocaleByCode(code: string): Locale | undefined {
  return SUPPORTED_LOCALE_MAP.get(code.toLowerCase());
}

function getDefaultLocaleForLanguage(language: string, country?: string | null): string {
  const countryLocale = country ? REGION_DEFAULTS[country.trim().toUpperCase()] : undefined;

  if (language === "en" || language === "fr" || language === "es" || language === "pt") {
    if (countryLocale && countryLocale.startsWith(`${language}-`)) {
      return countryLocale;
    }
  }

  return LANGUAGE_DEFAULTS[language] || DEFAULT_LOCALE;
}

function normalizeLanguageCode(value: string, country?: string | null): string {
  const trimmed = value.trim().replace(/_/g, "-");
  const alias = LEGACY_ALIAS_MAP[trimmed.toLowerCase()];
  if (alias) return alias;

  const [languagePart, regionPart] = trimmed.split("-");
  const language = languagePart?.toLowerCase();
  if (!language) return DEFAULT_LOCALE;

  const region = regionPart?.toUpperCase();
  if (region) {
    const exact = `${language}-${region}`;
    const matched = SUPPORTED_LOCALE_MAP.get(exact.toLowerCase());
    if (matched) return matched.code;
  }

  const nameAlias = LANGUAGE_NAME_ALIASES[trimmed.toLowerCase()];
  if (nameAlias) {
    return getDefaultLocaleForLanguage(nameAlias, country);
  }

  return getDefaultLocaleForLanguage(language, country);
}

function getCountryDefaultLocale(country?: string | null): string {
  if (!country) return DEFAULT_LOCALE;
  const normalizedCountry = country.trim();
  const normalized = COUNTRY_ALIASES[normalizedCountry.toLowerCase()] || normalizedCountry.toUpperCase();
  return REGION_DEFAULTS[normalized] || DEFAULT_LOCALE;
}

function parseAcceptLanguage(value?: string | null): string | undefined {
  if (!value) return undefined;

  return value
    .split(",")
    .map((entry) => {
      const [tag, qValue] = entry.trim().split(";q=");
      return { tag: tag?.trim(), q: Number.parseFloat(qValue || "1") || 1 };
    })
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag)
    .find(Boolean);
}

export function resolveLocalePreference(
  value?: string | null,
  country?: string | null,
  acceptLanguage?: string | null,
): string {
  if (value && value.trim()) {
    return normalizeLanguageCode(value, country);
  }

  const browserLocale = parseAcceptLanguage(acceptLanguage);
  if (browserLocale) {
    return normalizeLanguageCode(browserLocale, country);
  }

  return getCountryDefaultLocale(country);
}

export function normalizeLanguageValue(value: string, country?: string | null): string {
  return resolveLocalePreference(value, country);
}

export function getLocaleCandidates(locale: string): string[] {
  const canonical = resolveLocalePreference(locale);
  const candidates = [canonical];
  const language = canonical.split("-")[0];

  if (canonical.includes("-")) {
    candidates.push(language);
  }

  if (language !== "en") {
    candidates.push("en");
  }

  return Array.from(new Set(candidates));
}
