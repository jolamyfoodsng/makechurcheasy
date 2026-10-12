/**
 * churchDefaults.ts
 *
 * Fills the church's own details into the boxes of a graphic, using what the
 * church saved on the website (church profile): church name, main pastor and
 * their role, website, phone, email, address and the social icons.
 * Boxes the person has already changed are never touched. When the church
 * profile is empty nothing is filled, and the graphic keeps its generic
 * placeholder text.
 *
 * A box that was filled in from the profile earlier and never edited by hand
 * follows the profile when it changes (see `history` in applyChurchDefaults).
 */

import { displayWebsite, fullWebsiteUrl, SOCIAL_ICON_ORDER } from "../services/churchProfileMapping";
import type { MinistryData } from "../services/ministryStore";
import { isSpeakerTheme } from "./speakerThemeUtils";
import type { LowerThirdTheme } from "./types";

export interface ChurchVariableLike {
  key: string;
  label?: string;
  type?: string;
  defaultValue?: string;
  /** For list boxes (the social icon picker): the values it accepts. */
  options?: ReadonlyArray<{ value: string; label?: string }>;
  separator?: string;
}

/** A design is built for about four social icons; more would crowd it. */
const MAX_SOCIAL_ICONS = 5;

export interface ChurchThemeLike {
  tags?: string[];
  category?: string;
  name?: string;
  variables?: ReadonlyArray<ChurchVariableLike>;
}

const HONORIFIC =
  /^(pastor|pst\.?|pr\.?|bishop|apostle|rev\.?|reverend|dr\.?|prophet|prophetess|evangelist|elder|minister|deacon|deaconess|mr\.?|mrs\.?|ms\.?|sis\.?|bro\.?)$/i;

/** Keep the capital letters style of the placeholder (designs that shout in capitals keep shouting). */
function matchCase(value: string, sample: string | undefined): string {
  const s = String(sample ?? "").trim();
  if (s && /[A-Z]/.test(s) && s === s.toUpperCase()) return value.toUpperCase();
  return value;
}

function splitPastorName(full: string): { first: string; rest: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && HONORIFIC.test(parts[0])) parts.shift();
  if (parts.length === 0) return { first: "", rest: "" };
  return { first: parts[0], rest: parts.slice(1).join(" ") };
}

/** True when a sample link is only a domain (www.mychurch.org), not a page on it (mychurch.org/prayer). */
function isBareDomain(sample: string | undefined): boolean {
  const v = displayWebsite(String(sample ?? ""));
  return v !== "" && !v.includes("/");
}

/** The social icons the church filled in, in the order the graphics list them. */
function socialIconList(variable: ChurchVariableLike, ministry: MinistryData): string | null {
  const links = ministry.socials ?? {};
  const allowed = variable.options?.length ? new Set(variable.options.map((o) => o.value)) : null;
  const icons = SOCIAL_ICON_ORDER
    .filter((icon) => String(links[icon] ?? "").trim() && (!allowed || allowed.has(icon)))
    .slice(0, MAX_SOCIAL_ICONS);
  return icons.length ? icons.join(variable.separator || ",") : null;
}

/** What the church profile says for one box, or null when the box is not about the church or pastor. */
export function churchValueFor(
  variable: ChurchVariableLike,
  theme: ChurchThemeLike,
  ministry: MinistryData,
): string | null {
  const type = String(variable.type || "text").toLowerCase();
  const keyL = String(variable.key || "").trim().toLowerCase();
  const labelL = String(variable.label || "").trim().toLowerCase();

  // The social icon picker: icons for the links the church filled in.
  if (type === "list") {
    return keyL === "socials" || /social/.test(labelL) ? socialIconList(variable, ministry) : null;
  }
  if (type !== "text") return null;

  const pastor = String(ministry.mainPastorName || "").trim();
  const church = String(ministry.churchName || "").trim();
  const role = String(ministry.mainPastorRole || "").trim();
  const website = String(ministry.website || "").trim();
  const phone = String(ministry.phone || "").trim();
  const email = String(ministry.email || "").trim();
  const address = [ministry.address, ministry.city].map((p) => String(p || "").trim()).filter(Boolean).join(", ");
  const tagline = String(ministry.tagline || "").trim();
  const sample = variable.defaultValue;

  if (keyL === "organization" || keyL === "church" || keyL === "churchname" || keyL === "channelname") {
    return church ? matchCase(church, sample) : null;
  }

  // Contact details do not depend on there being a main pastor.
  if (keyL === "web" || keyL === "website" || keyL === "site") {
    return website ? matchCase(displayWebsite(website), sample) : null;
  }
  if (keyL === "url" || keyL === "link" || keyL === "scanlink") {
    // Only when the design shows the home page. A box that points at a page
    // (…/prayer, …/partner) is left for the church to write.
    if (!website || !isBareDomain(sample)) return null;
    const opensLink = keyL !== "link" || /scan|opens/.test(labelL);
    return opensLink ? fullWebsiteUrl(website) : matchCase(displayWebsite(website), sample);
  }
  if (keyL === "phone" || keyL === "tel" || keyL === "telephone") {
    return phone || null;
  }
  if (keyL === "email" || keyL === "mail") {
    return email ? matchCase(email, sample) : null;
  }
  if (keyL === "address") {
    return address ? matchCase(address, sample) : null;
  }
  if (keyL === "churchtagline" || keyL === "slogan" || keyL === "motto") {
    return tagline ? matchCase(tagline, sample) : null;
  }

  if (!pastor) return null;

  if (keyL === "firstname") {
    const hasLast = (theme.variables ?? []).some((v) => String(v.key || "").toLowerCase() === "lastname");
    const { first, rest } = splitPastorName(pastor);
    return matchCase(hasLast ? first : [first, rest].filter(Boolean).join(" "), sample);
  }
  if (keyL === "lastname") {
    return matchCase(splitPastorName(pastor).rest, sample);
  }
  if (["name", "fullname", "speakername", "pastorname", "ministername"].includes(keyL)) {
    return matchCase(pastor, sample);
  }
  if (keyL === "title" || keyL === "role" || keyL === "position") {
    if (!role) return null;
    if (!isSpeakerTheme(theme as unknown as LowerThirdTheme)) return null;
    if (/button|tag|main text|bottom line|top line|heading/.test(labelL)) return null;
    return matchCase(role, sample);
  }
  return null;
}

/**
 * Returns a copy of `values` with the church's details filled in.
 * By default only boxes that are still empty or still show the placeholder text are filled.
 */
export function applyChurchDefaults(
  theme: ChurchThemeLike,
  values: Record<string, string>,
  ministry: MinistryData,
  options: {
    onlyUntouched?: boolean;
    /**
     * Earlier church details. A box that still holds what one of them would have
     * put there was never edited by hand, so it follows the profile.
     */
    history?: ReadonlyArray<MinistryData>;
    /** A box that holds an empty string was cleared on purpose: leave it empty (a box that is missing is still filled). */
    keepCleared?: boolean;
  } = {},
): Record<string, string> {
  const onlyUntouched = options.onlyUntouched !== false;
  const history = options.history ?? [];
  const next: Record<string, string> = { ...values };
  for (const variable of theme.variables ?? []) {
    const fill = churchValueFor(variable, theme, ministry);
    if (fill === null) continue;
    const raw = values[variable.key];
    const current = String(raw ?? "").trim();
    const placeholder = String(variable.defaultValue ?? "").trim();
    const untouched =
      raw === undefined ||
      (current === "" && !options.keepCleared) ||
      current === placeholder ||
      history.some((old) => {
        const earlier = churchValueFor(variable, theme, old);
        return earlier !== null && earlier.trim() === current;
      });
    if (!onlyUntouched || untouched) {
      next[variable.key] = fill;
    }
  }
  return next;
}

/** The "reset to default" value for every box: the church's own details where known, else the design's placeholder. */
export function churchAwareDefaults(theme: ChurchThemeLike, ministry: MinistryData): Record<string, string> {
  const base: Record<string, string> = {};
  for (const variable of theme.variables ?? []) {
    base[variable.key] = String(variable.defaultValue ?? "");
  }
  return applyChurchDefaults(theme, base, ministry, { onlyUntouched: false });
}

export function sameValues(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((k) => a[k] === b[k]);
}
