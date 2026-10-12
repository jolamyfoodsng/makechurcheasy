/**
 * churchProfileMapping.ts
 *
 * Pure helpers that turn the church profile saved on the website into the
 * plain values the desktop app and the OBS dock use (settings, lower-third
 * boxes). No network, storage or Tauri calls, so it is safe everywhere and easy
 * to test.
 */

/**
 * Social icons the lower-third graphics can draw, in the order they are listed
 * (these are the `BRAND` keys in public/kinetic/sunday-lower-thirds.js).
 */
export const SOCIAL_ICON_ORDER = [
  "facebook",
  "instagram",
  "youtube",
  "x",
  "tiktok",
  "whatsapp",
  "telegram",
  "threads",
] as const;

export type SocialIconKey = (typeof SOCIAL_ICON_ORDER)[number];

/** Which profile field feeds which icon. The profile calls X "twitter". */
const PROFILE_FIELD_FOR_ICON: Record<SocialIconKey, string[]> = {
  facebook: ["facebook"],
  instagram: ["instagram"],
  youtube: ["youtube"],
  x: ["twitter", "x"],
  tiktok: ["tiktok"],
  whatsapp: ["whatsapp"],
  telegram: ["telegram"],
  threads: ["threads"],
};

export interface ChurchProfileFields {
  churchName?: string;
  tagline?: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  socialMedia?: Record<string, unknown> | null;
}

export interface ChurchContactInfo {
  website: string;
  phone: string;
  email: string;
  tagline: string;
  address: string;
  city: string;
  country: string;
  /** Social links by icon key; only the ones the church filled in. */
  socials: Record<string, string>;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Social links by lower-third icon key. Empty links are left out. */
export function socialsFromProfile(socialMedia: ChurchProfileFields["socialMedia"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!socialMedia || typeof socialMedia !== "object") return out;
  for (const icon of SOCIAL_ICON_ORDER) {
    for (const field of PROFILE_FIELD_FOR_ICON[icon]) {
      const value = clean((socialMedia as Record<string, unknown>)[field]);
      if (value) {
        out[icon] = value;
        break;
      }
    }
  }
  return out;
}

/** The contact details of a profile, with every missing value as an empty string. */
export function contactFromProfile(profile: ChurchProfileFields | null | undefined): ChurchContactInfo {
  const p = profile ?? {};
  return {
    website: clean(p.website),
    phone: clean(p.phone),
    email: clean(p.email),
    tagline: clean(p.tagline),
    address: clean(p.address),
    city: clean(p.city),
    country: clean(p.country),
    socials: socialsFromProfile(p.socialMedia),
  };
}

/** `https://www.mychurch.org/` → `www.mychurch.org` (what a graphic shows as the website). */
export function displayWebsite(raw: string): string {
  return clean(raw)
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/[/?#]+$/, "");
}

/** `mychurch.org` → `https://mychurch.org` (what a QR code or link should open). */
export function fullWebsiteUrl(raw: string): string {
  const v = clean(raw);
  if (!v) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}
