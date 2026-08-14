/**
 * Fonts used for scripture and worship text.
 *
 * CMG Sans Black is the shared production default. Charis SIL and Noto Sans
 * remain fallbacks for characters outside the bundled CMG Sans glyph set.
 */
export const SCRIPTURE_FONT_FAMILY = '"CMG Sans Black", "CMG Sans", "Charis SIL", "Noto Sans", Arial, sans-serif';

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
  if (lower.includes("cmg sans")) {
    const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
    const generic = parts.filter((part) => /^(?:serif|sans-serif|cursive|fantasy|monospace|system-ui)$/iu.test(part));
    const concrete = parts.filter((part) => !generic.includes(part));
    const fallbacks = ["\"Charis SIL\"", "\"Noto Sans\""]
      .filter((family) => !concrete.some((part) => part.toLowerCase() === family.toLowerCase()));
    return [...concrete, ...fallbacks, ...generic].join(", ");
  }

  const additions: string[] = [];
  if (!lower.includes("questrial")) additions.push('"Questrial"');
  if (!lower.includes("charis sil")) additions.push('"Charis SIL"');
  if (!lower.includes("noto sans")) additions.push('"Noto Sans"');

  return additions.length > 0 ? `${value}, ${additions.join(", ")}` : value;
}
