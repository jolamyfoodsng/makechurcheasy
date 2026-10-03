import { detectRequestCountry } from "./signupDefaults";
import { isKnownCountryCode, normalizeCountryCode } from "./countryNormalization";

export interface UserLocationRecord {
  country: string;
  city?: string;
  timezone?: string;
  ip?: string;
  timestamp: string;
}

export interface ExtractedRequestLocation {
  country: string;
  city: string;
  timezone: string;
  ip: string;
}

/**
 * Extract edge location details from incoming request headers
 * (Cloudflare, dashboard proxy, and standard edge proxies).
 */
export async function extractRequestLocation(headers: Headers): Promise<ExtractedRequestLocation> {
  const detectedCountry = detectRequestCountry(headers);
  const country =
    detectedCountry && (await isKnownCountryCode(detectedCountry))
      ? await normalizeCountryCode(detectedCountry)
      : "";

  const city = headers.get("x-mce-geo-city")?.trim() || "";
  const timezone = headers.get("x-mce-geo-timezone")?.trim() || "";
  const ip =
    headers.get("x-mce-client-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";

  return { country, city, timezone, ip };
}

/**
 * Build MongoDB update operator for updating login location without mutating permanent signup country.
 * - Locks in `signupCountry` if it was not previously set.
 * - Never overwrites `signupCountry`.
 * - Only sets `country` if `country` was empty.
 * - Updates `lastLoginCountry`, `lastLoginCity`, `lastLoginIp`, `lastLoginTimezone`.
 * - Pushes to `locationHistory` (capped at 20 most recent entries).
 */
export function buildLoginLocationUpdates(
  user: Record<string, any>,
  location: ExtractedRequestLocation,
  timestamp: string = new Date().toISOString()
): { set: Record<string, any>; push?: Record<string, any> } {
  const set: Record<string, any> = {
    lastLogin: timestamp,
  };

  // Determine what the user's permanent signup country should be
  const permanentCountry =
    user.signupCountry ||
    user.country ||
    location.country ||
    "";

  if (!user.signupCountry && permanentCountry) {
    set.signupCountry = permanentCountry;
  }
  if (!user.country && permanentCountry) {
    set.country = permanentCountry;
  }

  if (location.country) {
    set.lastLoginCountry = location.country;
  }
  if (location.city) {
    set.lastLoginCity = location.city;
  }
  if (location.ip) {
    set.lastLoginIp = location.ip;
  }
  if (location.timezone) {
    set.lastLoginTimezone = location.timezone;
    if (!user.timezone) {
      set.timezone = location.timezone;
    }
  }

  // Record into locationHistory if we have at least country or IP
  let push: Record<string, any> | undefined;
  if (location.country || location.ip) {
    const historyEntry: UserLocationRecord = {
      country: location.country || "UNKNOWN",
      ...(location.city ? { city: location.city } : {}),
      ...(location.timezone ? { timezone: location.timezone } : {}),
      ...(location.ip ? { ip: location.ip } : {}),
      timestamp,
    };

    push = {
      locationHistory: {
        $each: [historyEntry],
        $slice: -20, // keep the 20 most recent locations
      },
    };
  }

  return { set, push };
}
