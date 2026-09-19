import clientPromise from "./mongodb";
import { COLLECTIONS } from "@/lib/db";

type CountryLookup = {
  byCode: Map<string, string>;
  byName: Map<string, string>;
};

let lookupCache: { value: CountryLookup; loadedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

const FALLBACK_COUNTRY_CODES: Record<string, string> = {
  australia: "AU",
  "american samoa": "AS",
  bangladesh: "BD",
  brazil: "BR",
  canada: "CA",
  "côte d'ivoire": "CI",
  "democratic republic of the congo": "CD",
  ghana: "GH",
  india: "IN",
  kenya: "KE",
  nigeria: "NG",
  pakistan: "PK",
  philippines: "PH",
  "south africa": "ZA",
  tanzania: "TZ",
  uganda: "UG",
  "united kingdom": "GB",
  uk: "GB",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeTwoLetterCode(value: string): string | null {
  const trimmed = value.trim();
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

async function loadCountryLookup(): Promise<CountryLookup> {
  if (lookupCache && Date.now() - lookupCache.loadedAt < CACHE_TTL_MS) {
    return lookupCache.value;
  }

  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();

  for (const [name, code] of Object.entries(FALLBACK_COUNTRY_CODES)) {
    byCode.set(code, code);
    byName.set(name, code);
  }

  try {
    const client = await clientPromise;
    const db = client.db();
    const countries = await db
      .collection(COLLECTIONS.COUNTRIES)
      .find({}, { projection: { iso2: 1, iso3: 1, name: 1 } })
      .toArray();

    for (const country of countries) {
      const iso2 = typeof country.iso2 === "string" ? country.iso2.trim().toUpperCase() : "";
      if (!/^[A-Z]{2}$/.test(iso2)) continue;
      byCode.set(iso2, iso2);

      const iso3 = typeof country.iso3 === "string" ? country.iso3.trim().toUpperCase() : "";
      if (/^[A-Z]{3}$/.test(iso3)) byCode.set(iso3, iso2);

      const name = typeof country.name === "string" ? normalizeKey(country.name) : "";
      if (name) byName.set(name, iso2);
    }
  } catch (err) {
    console.warn("[countryNormalization] Country lookup unavailable; using fallback map.", err);
  }

  const value = { byCode, byName };
  lookupCache = { value, loadedAt: Date.now() };
  return value;
}

export async function normalizeCountryCode(value: unknown): Promise<string> {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  const directCode = normalizeTwoLetterCode(trimmed);
  if (directCode) return directCode;

  const lookup = await loadCountryLookup();
  const upper = trimmed.toUpperCase();
  const fromCode = lookup.byCode.get(upper);
  if (fromCode) return fromCode;

  return lookup.byName.get(normalizeKey(trimmed)) || trimmed;
}

/**
 * Return whether a normalized country value is present in the canonical
 * countries collection (or the built-in fallback list when the collection is
 * temporarily unavailable). This keeps arbitrary two-letter values from
 * being treated as real countries in payment resolution.
 */
export async function isKnownCountryCode(value: unknown): Promise<boolean> {
  const normalized = await normalizeCountryCode(value);
  if (!/^[A-Z]{2}$/.test(normalized)) return false;

  const lookup = await loadCountryLookup();
  return lookup.byCode.has(normalized);
}
