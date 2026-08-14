/**
 * Fonts used for scripture and worship text.
 *
 * Questrial is bundled with the app for Pan-African Latin support. Charis SIL
 * and Noto Sans remain fallbacks for any characters outside Questrial.
 */
export const SCRIPTURE_FONT_FAMILY = '"Questrial", "Charis SIL", "Noto Sans", "CMG Sans", Arial, sans-serif';

/**
 * Keep a user's selected typeface while guaranteeing a Unicode-safe fallback
 * for characters that the selected display font does not contain.
 */
export function withScriptureFontFallback(fontFamily?: string | null): string {
  let value = typeof fontFamily === "string" ? fontFamily.trim() : "";
  if (!value) return SCRIPTURE_FONT_FAMILY;

  // Admin font settings may store a bare family name instead of CSS syntax.
  // Quote names with spaces so the generated font-family remains valid CSS.
  if (!value.includes(",") && !/["']/u.test(value) && !/^(?:serif|sans-serif|cursive|fantasy|monospace|system-ui)$/iu.test(value)) {
    value = `"${value}"`;
  }

  const lower = value.toLowerCase();
  if (lower.includes("cmg sans") && !lower.includes("questrial")) {
    return `"Questrial", "Charis SIL", "Noto Sans", ${value}`;
  }

  const additions: string[] = [];
  if (!lower.includes("questrial")) additions.push('"Questrial"');
  if (!lower.includes("charis sil")) additions.push('"Charis SIL"');
  if (!lower.includes("noto sans")) additions.push('"Noto Sans"');

  return additions.length > 0 ? `${value}, ${additions.join(", ")}` : value;
}
