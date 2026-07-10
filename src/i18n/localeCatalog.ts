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

export const INTERFACE_LOCALES: Locale[] = [
  { code: "en-US", name: "English (United States)", nativeName: "English (United States)", flag: "🇺🇸", region: "North America", popular: true },
  { code: "en-NG", name: "English (Nigeria)", nativeName: "English (Nigeria)", flag: "🇳🇬", region: "Africa", popular: true },
  { code: "en-GH", name: "English (Ghana)", nativeName: "English (Ghana)", flag: "🇬🇭", region: "Africa", popular: true },
  { code: "en-GB", name: "English (United Kingdom)", nativeName: "English (United Kingdom)", flag: "🇬🇧", region: "Europe", popular: true },
  { code: "fr-FR", name: "French (France)", nativeName: "Français (France)", flag: "🇫🇷", region: "Europe", popular: true },
  { code: "fr-CA", name: "French (Canada)", nativeName: "Français (Canada)", flag: "🇨🇦", region: "North America", popular: true },
  { code: "es-ES", name: "Spanish (Spain)", nativeName: "Español (España)", flag: "🇪🇸", region: "Europe", popular: true },
  { code: "es-MX", name: "Spanish (Mexico)", nativeName: "Español (México)", flag: "🇲🇽", region: "North America", popular: true },
  { code: "pt-PT", name: "Portuguese (Portugal)", nativeName: "Português (Portugal)", flag: "🇵🇹", region: "Europe", popular: true },
  { code: "pt-BR", name: "Portuguese (Brazil)", nativeName: "Português (Brasil)", flag: "🇧🇷", region: "South America", popular: true },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá", flag: "🇳🇬", region: "Africa" },
  { code: "ig", name: "Igbo", nativeName: "Igbo", flag: "🇳🇬", region: "Africa" },
  { code: "ha", name: "Hausa", nativeName: "Hausa", flag: "🇳🇬", region: "Africa" },
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
};
const LEGACY_ALIAS_MAP: Record<string, string> = {
  gh: "en-GH",
  ghanaian: "en-GH",
  twi: "en-GH",
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
