export type DockTranslationOrder = "original-first" | "translation-first";

export type DockTranslationPart = {
  kind: "original" | "translation";
  text: string;
};

export function normalizeDockTranslationOrder(value: unknown): DockTranslationOrder {
  return value === "translation-first" ? "translation-first" : "original-first";
}

export function getOrderedTranslationParts(
  originalText: string,
  translatedText: string | null | undefined,
  showBoth: boolean,
  order: unknown = "original-first",
): DockTranslationPart[] {
  const translated = translatedText?.trim() ?? "";
  if (!translated) return [{ kind: "original", text: originalText }];
  if (!showBoth) return [{ kind: "translation", text: translated }];

  const original = { kind: "original" as const, text: originalText };
  const translation = { kind: "translation" as const, text: translated };
  return normalizeDockTranslationOrder(order) === "translation-first"
    ? [translation, original]
    : [original, translation];
}
