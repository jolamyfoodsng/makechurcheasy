import type {
  DockBibleOutputPreferences,
  DockBibleOverlayMode,
  DockBibleReferenceFormat,
} from "./dockBibleThemeResolution";

/**
 * What the Bible tab publishes next to its theme (state:bible-theme-updated),
 * so the LM tab can project a verse exactly the way the Bible tab would.
 * Every field is optional: older snapshots (saved by a previous app version)
 * only carry the themes.
 */
export interface LiveBibleStyleHints {
  overlayMode?: unknown;
  fullscreenLineCount?: unknown;
  lowerThirdLineCount?: unknown;
  referenceFormat?: unknown;
  referenceVersionVisible?: unknown;
  updatedAt?: unknown;
}

function asOverlayMode(value: unknown): DockBibleOverlayMode | null {
  return value === "fullscreen" || value === "lower-third" ? value : null;
}

function asPositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
}

function asReferenceFormat(value: unknown): DockBibleReferenceFormat | null {
  return value === "full" || value === "short" || value === "hidden" ? value : null;
}

/**
 * Which overlay mode LM should project in.
 * - Following the Bible tab (default): use the mode the Bible tab is using
 *   right now (live snapshot first, then the saved Bible preferences), and
 *   only fall back to LM's own Full/LT switch when neither is known.
 * - Not following: LM's own Full/LT switch.
 */
export function resolveLmEffectiveOverlayMode(input: {
  follow: boolean;
  lmMode: DockBibleOverlayMode;
  hints?: LiveBibleStyleHints | null;
  prefs?: DockBibleOutputPreferences | null;
}): DockBibleOverlayMode {
  if (!input.follow) return input.lmMode;
  return asOverlayMode(input.hints?.overlayMode)
    ?? asOverlayMode(input.prefs?.overlayMode)
    ?? input.lmMode;
}

/** The verse line count the Bible tab uses for this mode (undefined if unknown). */
export function resolveLmVerseLineCount(
  mode: DockBibleOverlayMode,
  hints?: LiveBibleStyleHints | null,
  prefs?: DockBibleOutputPreferences | null,
): number | undefined {
  const fromHints = asPositiveInt(
    mode === "fullscreen" ? hints?.fullscreenLineCount : hints?.lowerThirdLineCount,
  );
  if (fromHints !== null) return fromHints;
  const fromModeSpecificPrefs = asPositiveInt(
    mode === "fullscreen" ? prefs?.fullscreenVerseLineCount : prefs?.lowerThirdVerseLineCount,
  );
  if (fromModeSpecificPrefs !== null) return fromModeSpecificPrefs;
  // Older saved prefs only kept one count, for the mode that was active then.
  if (asOverlayMode(prefs?.overlayMode) === mode) {
    return asPositiveInt(prefs?.verseLineCount) ?? undefined;
  }
  return undefined;
}

/** Reference format / version flag as the Bible tab currently shows them. */
export function resolveLmReferencePrefs(
  hints?: LiveBibleStyleHints | null,
  prefs?: DockBibleOutputPreferences | null,
): Pick<DockBibleOutputPreferences, "referenceFormat" | "referenceVersionVisible"> {
  const referenceFormat = asReferenceFormat(hints?.referenceFormat)
    ?? asReferenceFormat(prefs?.referenceFormat)
    ?? undefined;
  const referenceVersionVisible = typeof hints?.referenceVersionVisible === "boolean"
    ? hints.referenceVersionVisible
    : typeof prefs?.referenceVersionVisible === "boolean"
      ? prefs.referenceVersionVisible
      : undefined;
  return { referenceFormat, referenceVersionVisible };
}

/** The newer of two snapshots (a message we received vs. what localStorage holds). */
export function pickNewestLiveBibleSnapshot<T extends { updatedAt?: unknown }>(
  a: T | null | undefined,
  b: T | null | undefined,
): T | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const aTime = Number(a.updatedAt) || 0;
  const bTime = Number(b.updatedAt) || 0;
  return bTime > aTime ? b : a;
}
