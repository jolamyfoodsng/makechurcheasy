/**
 * pairingUtils.ts — Shared pairing code normalization
 *
 * Pairing codes are 8 alphanumeric characters (e.g. "ABCD1234").
 * They are displayed to humans as "ABCD-1234" for readability.
 *
 * Rules:
 *   - Strip all non-alphanumeric characters (hyphens, spaces, etc.)
 *   - Convert to uppercase
 *   - The canonical form for storage and comparison is 8 uppercase alphanumeric chars
 *   - The display form inserts a "-" after the 4th character
 */

const CODE_REGEX = /[^A-Z0-9]/g;

/**
 * Normalize a pairing code for DB lookup/comparison.
 * Strips hyphens, spaces, and other non-alphanumeric chars; uppercases.
 *
 * "ABCD-1234" → "ABCD1234"
 * "abcd1234"  → "ABCD1234"
 * "ABCD 1234" → "ABCD1234"
 */
export function normalizePairingCode(raw: string): string {
  return raw.normalize("NFKC").toUpperCase().replace(CODE_REGEX, "");
}

/**
 * Format a normalized code for display: "ABCD1234" → "ABCD-1234".
 * If the code is fewer than 4 chars, returns it as-is.
 */
export function formatPairingCodeForDisplay(normalized: string): string {
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;
}

/**
 * Check whether a normalized code is structurally complete (8 alphanumeric chars).
 */
export function isCompletePairingCode(normalized: string): boolean {
  return /^[A-Z0-9]{8}$/.test(normalized);
}
