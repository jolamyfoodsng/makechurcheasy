const COUNTRY_DEFAULT_LOCALES: Record<string, string> = {
  NG: "en-NG",
  GH: "en-GH",
  GB: "en-GB",
  US: "en-US",
  FR: "fr-FR",
  CA: "fr-CA",
  ES: "es-ES",
  MX: "es-MX",
  PT: "pt-PT",
  BR: "pt-BR",
};

const SUPPORTED_LOCALES = new Set([
  "en-US",
  "en-NG",
  "en-GH",
  "en-GB",
  "fr-FR",
  "fr-CA",
  "es-ES",
  "es-MX",
  "pt-PT",
  "pt-BR",
  "yo",
  "ig",
  "ha",
]);

function normalizeCountryHeader(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized) || normalized === "XX" || normalized === "T1") {
    return null;
  }
  return normalized;
}

/**
 * Read country only from edge/provider headers. The browser does not submit
 * this value, so signup cannot rely on a user-editable country field.
 */
export function detectRequestCountry(headers: Headers): string | null {
  for (const header of ["x-mce-geo-country", "cf-ipcountry", "x-vercel-ip-country"]) {
    const country = normalizeCountryHeader(headers.get(header));
    if (country) return country;
  }
  return null;
}

function parseAcceptLanguage(value: string | null): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((entry, index) => {
      const [tagPart, ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
      const quality = Number.parseFloat(qualityParameter?.trim().slice(2) || "1");
      return {
        tag: tagPart?.trim().replace(/_/g, "-"),
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter((entry) => Boolean(entry.tag))
    .sort((left, right) => right.quality - left.quality || left.index - right.index)
    .map((entry) => entry.tag as string);
}

function localeForLanguage(language: string, countryCode: string): string | null {
  if (language === "yo" || language === "ig" || language === "ha") return language;
  if (language === "en") {
    const countryLocale = COUNTRY_DEFAULT_LOCALES[countryCode];
    return countryLocale?.startsWith("en-") ? countryLocale : "en-US";
  }
  if (language === "fr") return countryCode === "CA" ? "fr-CA" : "fr-FR";
  if (language === "es") return countryCode === "MX" ? "es-MX" : "es-ES";
  if (language === "pt") return countryCode === "PT" ? "pt-PT" : "pt-BR";
  return null;
}

/**
 * Store a language without interrupting signup. Prefer the browser's
 * supported language, then use the country default, then English.
 */
export function resolveSignupLanguage(headers: Headers, countryCode: string): string {
  const normalizedCountry = countryCode.trim().toUpperCase();

  for (const requested of parseAcceptLanguage(headers.get("accept-language"))) {
    const canonical = requested.trim();
    if (SUPPORTED_LOCALES.has(canonical)) return canonical;

    const language = canonical.split("-")[0]?.toLowerCase();
    const resolved = localeForLanguage(language, normalizedCountry);
    if (resolved) return resolved;
  }

  return COUNTRY_DEFAULT_LOCALES[normalizedCountry] || "en-US";
}
