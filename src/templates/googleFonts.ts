import { GOOGLE_FONT_CATALOG, type GoogleFontFamily } from "./googleFontCatalog";

const GOOGLE_FONTS_CSS_API = "https://fonts.googleapis.com/css2";
const googleFontCatalogByName = new Map(
  GOOGLE_FONT_CATALOG.map((font) => [font.family.toLocaleLowerCase(), font]),
);
const pendingFontLoads = new Map<string, Promise<boolean>>();

function familyFallback(category?: string): string {
  const normalized = category?.toLocaleLowerCase() ?? "";
  if (normalized.includes("sans")) return "sans-serif";
  if (normalized.includes("serif")) return "serif";
  if (normalized.includes("handwriting")) return "cursive";
  if (normalized.includes("mono")) return "monospace";
  return "sans-serif";
}

function quoteFontFamily(family: string): string {
  return `'${family.replace(/'/g, "\\'")}'`;
}

/** A CSS family stack suitable for Konva, browser text, and exported SVG. */
export function googleFontStack(family: string, category?: string): string {
  return `${quoteFontFamily(family)}, ${familyFallback(category)}`;
}

/** The first usable family in a stored CSS font stack. */
export function primaryFontFamily(fontFamily: string): string {
  return fontFamily.split(",")[0]?.trim().replace(/^['\"]|['\"]$/g, "") || "Inter";
}

export function findGoogleFont(familyOrStack: string): GoogleFontFamily | undefined {
  return googleFontCatalogByName.get(primaryFontFamily(familyOrStack).toLocaleLowerCase());
}

export function googleFontCssUrl(family: string): string {
  return `${GOOGLE_FONTS_CSS_API}?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`;
}

/**
 * Font files are added only after a user chooses a family. The full catalogue
 * is just names and categories, so opening the editor stays lightweight.
 */
export function ensureGoogleFontLoaded(familyOrStack: string): Promise<boolean> {
  const font = findGoogleFont(familyOrStack);
  if (!font || typeof document === "undefined") return Promise.resolve(false);

  const key = font.family.toLocaleLowerCase();
  const pending = pendingFontLoads.get(key);
  if (pending) return pending;

  const loader = new Promise<boolean>((resolve) => {
    const existing = [...document.querySelectorAll<HTMLLinkElement>("link[data-mce-google-font]")]
      .find((link) => link.dataset.mceGoogleFont === font.family);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve(true);
        return;
      }
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = googleFontCssUrl(font.family);
    link.dataset.mceGoogleFont = font.family;
    link.onload = () => {
      link.dataset.loaded = "true";
      resolve(true);
    };
    link.onerror = () => resolve(false);
    document.head.append(link);
  }).then(async (loaded) => {
    if (loaded && "fonts" in document) {
      try {
        await document.fonts.load(`400 16px ${quoteFontFamily(font.family)}`, "MCE");
      } catch {
        // The stylesheet still provides the browser fallback if FontFaceSet is unavailable.
      }
    }
    return loaded;
  });

  pendingFontLoads.set(key, loader);
  return loader;
}

export async function ensureGoogleFontsLoaded(fontFamilies: Iterable<string>): Promise<void> {
  await Promise.all([...new Set([...fontFamilies].map(primaryFontFamily))].map((family) => ensureGoogleFontLoaded(family)));
}
