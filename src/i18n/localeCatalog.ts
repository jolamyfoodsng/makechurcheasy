export interface Locale {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  region: string;
  popular?: boolean;
}

const REGION_DEFAULTS: Record<string, string> = {
  NG: "en-US",
  GH: "ak",
  US: "en-US",
  GB: "en-US",
  FR: "fr",
  CA: "fr",
  ES: "es",
  MX: "es",
  PT: "pt",
  BR: "pt",
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
  fr: "fr",
  es: "es",
  pt: "pt",
  yo: "yo",
  ig: "ig",
  ha: "ha",
  ak: "ak",
  tw: "ak",
};

export const INTERFACE_LOCALES: Locale[] = [
  { code: "en-US", name: "English (United States)", nativeName: "English (United States)", flag: "🇺🇸", region: "North America", popular: true },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷", region: "Europe", popular: true },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸", region: "Europe", popular: true },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇵🇹", region: "Europe", popular: true },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá", flag: "🇳🇬", region: "Africa" },
  { code: "ig", name: "Igbo", nativeName: "Igbo", flag: "🇳🇬", region: "Africa" },
  { code: "ha", name: "Hausa", nativeName: "Hausa", flag: "🇳🇬", region: "Africa" },
  { code: "ak", name: "Akan (Twi)", nativeName: "Akan/Twi", flag: "🇬🇭", region: "Africa" },
];

const SUPPORTED_LOCALE_MAP = new Map(INTERFACE_LOCALES.map((locale) => [locale.code.toLowerCase(), locale]));
const LANGUAGE_NAME_ALIASES: Record<string, string> = {
  english: "en",
  french: "fr",
  spanish: "es",
  portuguese: "pt",
  yoruba: "yo",
  igbo: "ig",
  hausa: "ha",
  akan: "ak",
  twi: "ak",
};
const LEGACY_ALIAS_MAP: Record<string, string> = {
  "en-ng": "en-US",
  "en-gh": "en-US",
  "en-gb": "en-US",
  "fr-fr": "fr",
  "fr-ca": "fr",
  "es-es": "es",
  "es-mx": "es",
  "pt-pt": "pt",
  "pt-br": "pt",
  gh: "ak",
  ghanaian: "ak",
  tw: "ak",
  twi: "ak",
  akan: "ak",
};

export const DEFAULT_INTERFACE_LOCALE = "en-US";

export function isSupportedInterfaceLocale(code: string | undefined | null): code is string {
  return Boolean(code && SUPPORTED_LOCALE_MAP.has(code.toLowerCase()));
}

export function getInterfaceLocaleByCode(code: string): Locale | undefined {
  return SUPPORTED_LOCALE_MAP.get(code.toLowerCase());
}

function getDefaultLocaleForLanguage(language: string, country?: string | null): string {
  const countryLocale = country ? REGION_DEFAULTS[(COUNTRY_ALIASES[country.trim().toLowerCase()] || country.trim().toUpperCase())] : undefined;

  if (language === "en" || language === "fr" || language === "es" || language === "pt") {
    if (countryLocale && countryLocale.startsWith(`${language}-`)) {
      return countryLocale;
    }
  }

  return LANGUAGE_DEFAULTS[language] || DEFAULT_INTERFACE_LOCALE;
}

function normalizeLocaleToken(value: string, country?: string | null): string {
  const trimmed = value.trim().replace(/_/g, "-");
  const alias = LEGACY_ALIAS_MAP[trimmed.toLowerCase()];
  if (alias) return alias;

  const [languagePart, regionPart] = trimmed.split("-");
  const language = languagePart?.toLowerCase();
  if (!language) return DEFAULT_INTERFACE_LOCALE;

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
  if (!country) return DEFAULT_INTERFACE_LOCALE;
  const normalized = COUNTRY_ALIASES[country.trim().toLowerCase()] || country.trim().toUpperCase();
  return REGION_DEFAULTS[normalized] || DEFAULT_INTERFACE_LOCALE;
}

function parseBrowserLocale(browserLocale?: string | null): string | undefined {
  if (!browserLocale) return undefined;
  const trimmed = browserLocale.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveInterfaceLocale(
  value?: string | null,
  country?: string | null,
  browserLocale?: string | null,
): string {
  if (value && value.trim()) {
    return normalizeLocaleToken(value, country);
  }

  const detected = parseBrowserLocale(browserLocale);
  if (detected) {
    return normalizeLocaleToken(detected, country);
  }

  return getCountryDefaultLocale(country);
}

export function normalizeInterfaceLanguageValue(value: string, country?: string | null): string {
  return resolveInterfaceLocale(value, country);
}

export function getInterfaceLocaleCandidates(locale: string): string[] {
  const canonical = resolveInterfaceLocale(locale);
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
