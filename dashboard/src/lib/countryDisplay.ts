import { countries } from "./countries";

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  AE: "United Arab Emirates",
  ARE: "United Arab Emirates",
  UAE: "United Arab Emirates",
  UK: "United Kingdom",
  USA: "United States",
};

const countryNameByCode = new Map(countries.map((country) => [country.code.toUpperCase(), country.name]));
const countryCodeByName = new Map(countries.map((country) => [country.name.trim().toLowerCase(), country.code]));

export function getCountryDisplayName(value?: string | null, fallback = "Unknown"): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;

  const upper = trimmed.toUpperCase();
  const alias = COUNTRY_NAME_ALIASES[upper];
  if (alias) return alias;

  const byCode = countryNameByCode.get(upper);
  if (byCode) return byCode;

  const byNameCode = countryCodeByName.get(trimmed.toLowerCase());
  if (byNameCode) return countryNameByCode.get(byNameCode) || trimmed;

  return trimmed;
}
