import { downloadAndParseBible } from "./bibleApi";
import type { CatalogBible, InstalledBible } from "./types";
import {
  getInstalledTranslations,
  saveInstalledTranslation,
} from "./bibleDb";
import { assertCompleteBibleData } from "./bibleValidation";

export interface BibleDownloadProgress {
  catalogId: string;
  abbr: string;
  progress: number;
  status: "downloading" | "parsing" | "done";
}

export function normalizeBibleAbbr(abbr: string): string {
  return abbr.trim().toUpperCase();
}

export function deriveBibleAbbr(bible: CatalogBible): string {
  const version = normalizeBibleAbbr(bible.version ?? "");
  if (version && version.length <= 8 && /^[A-Z]/.test(version)) return version;
  return normalizeBibleAbbr((bible.name ?? "Unknown")
    .split(/\s+/)
    .map((word) => word?.[0] ?? "")
    .join("")
    .slice(0, 6));
}

export function isCatalogBibleInstalled(
  installed: Array<Pick<InstalledBible, "id" | "abbr">>,
  catalogId: string,
  abbr: string,
): boolean {
  const normalizedAbbr = normalizeBibleAbbr(abbr);
  return installed.some(
    (entry) =>
      entry.id === catalogId ||
      normalizeBibleAbbr(entry.abbr) === normalizedAbbr,
  );
}

export function formatBibleFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function isBibleCatalogItemInstalled(
  catalogId: string,
  abbr: string,
): Promise<boolean> {
  const installed = await getInstalledTranslations();
  return isCatalogBibleInstalled(installed, catalogId, abbr);
}

export async function installBibleFromCatalog(
  bible: CatalogBible,
  onProgress?: (state: BibleDownloadProgress) => void,
): Promise<InstalledBible> {
  const abbr = deriveBibleAbbr(bible);
  const normalizedAbbr = normalizeBibleAbbr(abbr);

  if (await isBibleCatalogItemInstalled(bible.id, normalizedAbbr)) {
    throw new Error(`${normalizedAbbr} is already installed.`);
  }

  onProgress?.({
    catalogId: bible.id,
    abbr: normalizedAbbr,
    progress: 0,
    status: "downloading",
  });

  const data = await downloadAndParseBible(bible.id, (progress) => {
    onProgress?.({
      catalogId: bible.id,
      abbr: normalizedAbbr,
      progress,
      status: "downloading",
    });
  });

  assertCompleteBibleData(data, normalizedAbbr);

  onProgress?.({
    catalogId: bible.id,
    abbr: normalizedAbbr,
    progress: 1,
    status: "parsing",
  });

  const record: InstalledBible = {
    id: bible.id,
    abbr: normalizedAbbr,
    name: bible.name,
    language: bible.language,
    data,
    downloadedAt: new Date().toISOString(),
    filesize: bible.filesize,
  };

  await saveInstalledTranslation(record);

  onProgress?.({
    catalogId: bible.id,
    abbr: normalizedAbbr,
    progress: 1,
    status: "done",
  });

  return record;
}
