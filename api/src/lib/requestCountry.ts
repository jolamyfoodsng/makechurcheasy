import { isKnownCountryCode, normalizeCountryCode } from "./countryNormalization";

export type CountryResolutionSource = "profile" | "cloudflare" | "vercel" | "dashboard" | "fallback";

export interface RequestCountryResolution {
  countryCode: string;
  source: CountryResolutionSource;
  hasStoredCountry: boolean;
}

type CountryAwareRequest = {
  headers: Headers;
};

async function validCountry(value: unknown): Promise<string | null> {
  const normalized = await normalizeCountryCode(value).catch(() => "");
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return (await isKnownCountryCode(normalized).catch(() => false)) ? normalized : null;
}

/**
 * Resolve the country used for pricing and payment initialization.
 *
 * A saved profile country is authoritative. Geo headers are only a fallback
 * for users whose profile has no country yet. This prevents a Ghanaian proxy
 * header, for example, from silently changing an existing US user's price.
 */
export async function resolveRequestCountry(
  req: CountryAwareRequest,
  storedCountry?: unknown,
): Promise<RequestCountryResolution> {
  const profileCountry = await validCountry(storedCountry);
  if (profileCountry) {
    return { countryCode: profileCountry, source: "profile", hasStoredCountry: true };
  }

  const headerCandidates: Array<[string, CountryResolutionSource]> = [
    // The dashboard proxy carries the end user's country. It must win over
    // the hosting platform's country, which may describe the proxy server.
    ["x-mce-geo-country", "dashboard"],
    ["cf-ipcountry", "cloudflare"],
    ["x-vercel-ip-country", "vercel"],
  ];

  for (const [header, source] of headerCandidates) {
    const country = await validCountry(req.headers.get(header));
    if (country) return { countryCode: country, source, hasStoredCountry: false };
  }

  return { countryCode: "US", source: "fallback", hasStoredCountry: false };
}
