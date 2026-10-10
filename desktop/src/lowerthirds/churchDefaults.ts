/**
 * churchDefaults.ts
 *
 * Fills the church's own details (church name, main pastor and their role) into
 * the text boxes of a graphic, using what the church saved on the website
 * (church profile). Boxes the person has already changed are never touched.
 * When the church profile is empty nothing is filled, and the graphic keeps its
 * generic placeholder text.
 */

import type { MinistryData } from "../services/ministryStore";
import { isSpeakerTheme } from "./speakerThemeUtils";
import type { LowerThirdTheme } from "./types";

export interface ChurchVariableLike {
  key: string;
  label?: string;
  type?: string;
  defaultValue?: string;
}

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

/** What the church profile says for one box, or null when the box is not about the church or pastor. */
export function churchValueFor(
  variable: ChurchVariableLike,
  theme: ChurchThemeLike,
  ministry: MinistryData,
): string | null {
  const type = String(variable.type || "text").toLowerCase();
  if (type !== "text") return null;

  const keyL = String(variable.key || "").trim().toLowerCase();
  const labelL = String(variable.label || "").trim().toLowerCase();
  const pastor = String(ministry.mainPastorName || "").trim();
  const church = String(ministry.churchName || "").trim();
  const role = String(ministry.mainPastorRole || "").trim();
  const sample = variable.defaultValue;

  if (keyL === "organization" || keyL === "church" || keyL === "churchname") {
    return church ? matchCase(church, sample) : null;
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
  options: { onlyUntouched?: boolean } = {},
): Record<string, string> {
  const onlyUntouched = options.onlyUntouched !== false;
  const next: Record<string, string> = { ...values };
  for (const variable of theme.variables ?? []) {
    const fill = churchValueFor(variable, theme, ministry);
    if (fill === null) continue;
    const current = String(values[variable.key] ?? "").trim();
    const placeholder = String(variable.defaultValue ?? "").trim();
    if (!onlyUntouched || current === "" || current === placeholder) {
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
