/**
 * dockBibleCatalog.ts — Curated catalog, translation directive autocomplete & in-dock Bible downloader
 *
 * Provides:
 * 1. Instant detection and autocomplete suggestions when operator types `@`, `~`, `/`, or `//`
 * 2. In-dock Bible download for Basic & Growth users directly from the version dropdown
 * 3. Curated popular translations + live catalog search
 */

import { searchCatalog } from "../bible/bibleApi";
import { installBibleFromCatalog, deriveBibleAbbr } from "../bible/bibleInstallService";
import type { CatalogBible, InstalledBible } from "../bible/types";
import { parseBibleSearch, type BibleSearchContext, type BibleSearchResult } from "./bibleSearchParser";
import type { BibleTranslationOption } from "./bibleTranslationAvailability";
import { getDockPlan, showUpgradeModal } from "./dockEntitlement";
import { checkEntitlementSync } from "../services/entitlementClient";

export interface CatalogBibleItem {
  id: string;
  abbr: string;
  name: string;
  language: string;
  filesize?: number;
  isInstalled?: boolean;
  isLocked?: boolean;
}

/**
 * Top popular and widely referenced translations in church production.
 * Verified with the remote Bible catalog service.
 */
export const POPULAR_CATALOG_BIBLES: readonly CatalogBibleItem[] = [
  { id: "837ae1f9-fc5c-8398-88f9-6a14476aff0f", abbr: "KJV", name: "King James Version", language: "English" },
  { id: "6a3d46ba-f05a-8a56-ced9-f71e3abd6683", abbr: "NKJV", name: "New King James Version", language: "English" },
  { id: "9a8968c4-3702-7bfd-4149-3c9a7ba63d82", abbr: "NIV", name: "New International Version", language: "English" },
  { id: "0a66cb3e-69be-8f5f-5a96-641b7699006d", abbr: "NLT", name: "New Living Translation", language: "English" },
  { id: "6fd21321-4bd1-f655-ccc0-475936d8fc99", abbr: "AMP", name: "Amplified Bible", language: "English" },
  { id: "c5726424-1cad-61e7-30c6-6f5deff11790", abbr: "AMPC", name: "Amplified Bible, Classic Edition", language: "English" },
  { id: "0d8d948b-2570-3998-66ad-4cef885b9b3c", abbr: "ESV", name: "English Standard Version", language: "English" },
  { id: "c3883ca5-ce63-a6c2-185c-e9fddb6e6257", abbr: "MSG", name: "The Message", language: "English" },
  { id: "2824e81a-64f2-5cb7-d095-da69082bb75d", abbr: "ASV", name: "American Standard Version", language: "English" },
  { id: "db71260d-d438-0a7d-d546-f7b07d45a98e", abbr: "ERV", name: "English Revised Version", language: "English" },
  { id: "53a1fe73-671c-300e-362c-fa94d8bc0734", abbr: "CSB", name: "Christian Standard Bible", language: "English" },
  { id: "d31317ae-8547-5e92-3c87-897ea4f9c522", abbr: "NASB", name: "New American Standard Bible", language: "English" },
  { id: "a68f6bf2-628a-7c9c-2fe1-24891b29a286", abbr: "CEV", name: "Contemporary English Version", language: "English" },
  { id: "1b0337b5-22d7-b7d6-7c0b-33c94d03e945", abbr: "YOR", name: "Bibeli Mimo (Yoruba)", language: "Yoruba" },
  { id: "1cb0616b-ebcc-d88e-61c0-eb26c483d3e3", abbr: "LSG", name: "Louis Segond (French)", language: "French" },
  { id: "3d9f3794-2790-2508-3cfc-5b6531393630", abbr: "RVR", name: "Reina-Valera (Spanish)", language: "Spanish" },
  { id: "8f7bfa69-1c9f-3a05-a827-84bc46313b5e", abbr: "HAU", name: "Littafi Mai Tsarki (Hausa)", language: "Hausa" },
  { id: "9b36d0bc-5221-508b-aa58-54c34a2e5d7a", abbr: "IBO", name: "Baibul Nsọ (Igbo)", language: "Igbo" },
  { id: "211832bc-2234-582d-a2f0-f942ba6017b2", abbr: "TWI", name: "Twerɛ Kronkron (Twi)", language: "Twi" },
];

export interface ActiveTranslationDirectivePrompt {
  trigger: "@" | "~" | "/" | "//" | "||";
  partial: string;
  baseQuery: string;
  parsedBase: BibleSearchResult | null;
}

/**
 * Detects whether the query currently has an active translation directive trigger
 * (e.g. "jn 3:16 @", "jn3:16 ~m", "j3.16@amp", "ps23/kjv", "ps 23 // msg")
 */
export function detectActiveTranslationPrompt(
  rawQuery: string,
  options?: { context?: BibleSearchContext },
): ActiveTranslationDirectivePrompt | null {
  const trimmed = rawQuery.trimEnd();
  if (!trimmed) return null;

  // 1. Quick compare trigger: e.g. "jn 3:16 //" or "jn 3:16 // msg" or "ps 23 || "
  const compareMatch = trimmed.match(/^(.*?)(?:\/\/|\|\|)\s*([a-zA-Z0-9]*)$/);
  if (compareMatch) {
    const baseQuery = compareMatch[1].trim();
    const partial = (compareMatch[2] || "").trim().toUpperCase();
    const parsedBase = baseQuery ? (parseBibleSearch(baseQuery, options)[0] ?? null) : null;
    return {
      trigger: "//",
      partial,
      baseQuery,
      parsedBase,
    };
  }

  // 2. Hot-swap trigger (@, ~, /): e.g. "jn 3:16 @", "j3.16@amp", "ps23/kjv", "rom 8:28 ~nlt", "@amp"
  const directiveMatch = trimmed.match(/^(.*?)(?:(?<=[\s\d:.-])|^)([@~/])([a-zA-Z0-9]*)$/);
  if (directiveMatch) {
    const baseQuery = directiveMatch[1].trim();
    const trigger = directiveMatch[2] as "@" | "~" | "/";
    const partial = (directiveMatch[3] || "").trim().toUpperCase();
    const parsedBase = baseQuery ? (parseBibleSearch(baseQuery, options)[0] ?? null) : null;
    return {
      trigger,
      partial,
      baseQuery,
      parsedBase,
    };
  }

  return null;
}

export interface TranslationDirectiveSuggestion {
  kind: "translation-directive";
  label: string;
  fullTitle: string;
  abbr: string;
  name: string;
  language: string;
  isInstalled: boolean;
  isDownloadable: boolean;
  catalogId?: string;
  baseReference: BibleSearchResult | null;
  trigger: "@" | "~" | "/" | "//" | "||";
}

/**
 * Builds suggestions for the active translation prompt.
 * Installed translations appear first (ready to project instantly),
 * followed by downloadable catalog translations.
 */
export function getTranslationDirectiveSuggestions(
  prompt: ActiveTranslationDirectivePrompt,
  installed: readonly BibleTranslationOption[],
  limit = 8,
): TranslationDirectiveSuggestion[] {
  const partial = prompt.partial.trim().toUpperCase();
  const installedMap = new Map<string, BibleTranslationOption>();
  for (const opt of installed) {
    installedMap.set(opt.value.toUpperCase(), opt);
  }

  const results: TranslationDirectiveSuggestion[] = [];
  const seenAbbrs = new Set<string>();

  const baseLabel = prompt.parsedBase
    ? prompt.parsedBase.label
    : prompt.baseQuery
      ? prompt.baseQuery
      : "";

  const matchesPartial = (abbr: string, name: string) => {
    if (!partial) return true;
    if (abbr.startsWith(partial)) return true;
    if (partial.length >= 3 && name.toUpperCase().includes(partial)) return true;
    const words = name.toUpperCase().split(/[\s,.-]+/);
    return words.some((w) => w.startsWith(partial));
  };

  // 1. Installed translations matching partial
  for (const opt of installed) {
    const abbr = opt.value.toUpperCase();
    if (!matchesPartial(abbr, opt.label)) {
      continue;
    }
    seenAbbrs.add(abbr);

    const fullLabel = baseLabel
      ? `${baseLabel} ${prompt.trigger}${abbr.toLowerCase()}`
      : `${prompt.trigger}${abbr.toLowerCase()}`;

    results.push({
      kind: "translation-directive",
      label: fullLabel,
      fullTitle: `${abbr} — ${opt.label}`,
      abbr,
      name: opt.label,
      language: opt.language || "English",
      isInstalled: true,
      isDownloadable: false,
      baseReference: prompt.parsedBase,
      trigger: prompt.trigger,
    });
    if (results.length >= limit) return results;
  }

  // 2. Popular catalog translations matching partial (downloadable)
  for (const cat of POPULAR_CATALOG_BIBLES) {
    const abbr = cat.abbr.toUpperCase();
    if (seenAbbrs.has(abbr)) continue;
    if (!matchesPartial(abbr, cat.name)) {
      continue;
    }
    seenAbbrs.add(abbr);

    const fullLabel = baseLabel
      ? `${baseLabel} ${prompt.trigger}${abbr.toLowerCase()}`
      : `${prompt.trigger}${abbr.toLowerCase()}`;

    results.push({
      kind: "translation-directive",
      label: fullLabel,
      fullTitle: `${abbr} — ${cat.name}`,
      abbr,
      name: cat.name,
      language: cat.language,
      isInstalled: false,
      isDownloadable: true,
      catalogId: cat.id,
      baseReference: prompt.parsedBase,
      trigger: prompt.trigger,
    });
    if (results.length >= limit) return results;
  }

  return results;
}

/**
 * Searches and merges installed + catalog translations for the dock dropdown.
 */
export async function searchDockBibleCatalog(
  query: string,
  installed: readonly BibleTranslationOption[],
  plan = "free",
): Promise<{ installed: CatalogBibleItem[]; downloadable: CatalogBibleItem[] }> {
  const needle = query.trim().toLowerCase();
  const installedAbbrs = new Set(installed.map((t) => t.value.toUpperCase()));

  const { limit: bibleVersionLimit } = checkEntitlementSync("bibleVersions", plan);
  const isUnlimited = bibleVersionLimit === -1;
  const installedCount = installed.length;
  const hasExceededLimit = !isUnlimited && installedCount >= bibleVersionLimit;

  // 1. Filter installed
  const installedItems: CatalogBibleItem[] = installed
    .map((tr, index) => ({
      id: `installed-${tr.value}`,
      abbr: tr.value.toUpperCase(),
      name: tr.label,
      language: tr.language || "English",
      isInstalled: true,
      isLocked: hasExceededLimit && !isUnlimited && index >= bibleVersionLimit,
    }))
    .filter((item) => {
      if (!needle) return true;
      return (
        item.abbr.toLowerCase().includes(needle) ||
        item.name.toLowerCase().includes(needle) ||
        item.language.toLowerCase().includes(needle)
      );
    });

  // 2. Downloadable items from POPULAR_CATALOG_BIBLES
  const downloadableMap = new Map<string, CatalogBibleItem>();
  for (const cat of POPULAR_CATALOG_BIBLES) {
    if (installedAbbrs.has(cat.abbr.toUpperCase())) continue;
    if (
      !needle ||
      cat.abbr.toLowerCase().includes(needle) ||
      cat.name.toLowerCase().includes(needle) ||
      cat.language.toLowerCase().includes(needle)
    ) {
      downloadableMap.set(cat.id, {
        ...cat,
        isInstalled: false,
        isLocked: false,
      });
    }
  }

  // 3. If operator searched with 2+ characters, also fetch live remote catalog
  if (needle.length >= 2) {
    try {
      const res = await searchCatalog({ query: needle, limit: 15 });
      for (const item of res.items) {
        const abbr = deriveBibleAbbr(item);
        if (installedAbbrs.has(abbr) || downloadableMap.has(item.id)) continue;
        downloadableMap.set(item.id, {
          id: item.id,
          abbr,
          name: item.name,
          language: item.language || "Unknown",
          filesize: item.filesize,
          isInstalled: false,
          isLocked: false,
        });
      }
    } catch {
      // Remote search error gracefully falls back to local catalog
    }
  }

  return {
    installed: installedItems,
    downloadable: Array.from(downloadableMap.values()),
  };
}

/**
 * Downloads and installs a Bible directly from the dock.
 * Enforces plan limits for free users while permitting Basic & Growth users.
 */
export async function downloadBibleInDock(
  bible: { id: string; abbr: string; name: string; language?: string; filesize?: number },
  currentInstalledCount: number,
  onProgress?: (progress: number, status: "downloading" | "parsing" | "done") => void,
): Promise<InstalledBible> {
  const plan = getDockPlan();
  const { limit: bibleVersionLimit } = checkEntitlementSync("bibleVersions", plan);
  const isUnlimited = bibleVersionLimit === -1;
  const isAllowed = isUnlimited || currentInstalledCount < bibleVersionLimit;

  if (!isAllowed) {
    showUpgradeModal(
      `You've reached your Bible version limit (${bibleVersionLimit}). Upgrade to Basic or Growth to download more versions.`,
    );
    throw new Error("Plan limit reached. Upgrade required.");
  }

  const catalogEntry: CatalogBible = {
    id: bible.id,
    name: bible.name,
    language: bible.language || "English",
    version: bible.abbr,
    filesize: bible.filesize || 0,
    country: "",
    filename: "",
    sha256: "",
  };

  const installed = await installBibleFromCatalog(catalogEntry, (state) => {
    onProgress?.(state.progress, state.status);
  });

  return installed;
}
