export interface BibleTranslationOption {
  value: string;
  label: string;
  language?: string;
}

export interface BibleTranslationMetadata {
  abbr?: string;
  name?: string;
  language?: string;
}

export const DEFAULT_INSTALLED_TRANSLATION_OPTION: BibleTranslationOption = {
  value: "KJV",
  label: "King James Version",
  language: "English",
};

/**
 * Build the selector from the translations that are actually installed.
 * Saved UI preferences must never be treated as proof that a translation exists.
 */
export function buildInstalledTranslationOptions(
  entries: readonly BibleTranslationMetadata[],
): BibleTranslationOption[] {
  const options: BibleTranslationOption[] = [DEFAULT_INSTALLED_TRANSLATION_OPTION];
  const seen = new Set([DEFAULT_INSTALLED_TRANSLATION_OPTION.value]);

  for (const entry of entries) {
    const value = entry.abbr?.trim().toUpperCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({
      value,
      label: entry.name?.trim() || value,
      language: entry.language?.trim() || undefined,
    });
  }

  return options;
}

export function resolveInstalledTranslation(
  value: string | null | undefined,
  options: readonly BibleTranslationOption[],
  fallback = DEFAULT_INSTALLED_TRANSLATION_OPTION.value,
): string {
  const allowed = new Set(options.map((option) => option.value.trim().toUpperCase()).filter(Boolean));
  const normalized = value?.trim().toUpperCase() || "";
  if (normalized && allowed.has(normalized)) return normalized;
  if (allowed.has(fallback)) return fallback;
  return options[0]?.value?.trim().toUpperCase() || DEFAULT_INSTALLED_TRANSLATION_OPTION.value;
}
