import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputFile = resolve(scriptDirectory, "../src/templates/googleFontCatalog.ts");
const metadataUrl = "https://fonts.google.com/metadata/fonts";

const response = await fetch(metadataUrl, { headers: { Accept: "application/json" } });
if (!response.ok) throw new Error(`Google Fonts metadata request failed (${response.status}).`);

const metadata = await response.json();
const catalog = Array.isArray(metadata.familyMetadataList)
  ? metadata.familyMetadataList
    .map(({ family, category }) => ({ family: String(family || "").trim(), category: String(category || "Other").trim() }))
    .filter(({ family }) => family)
    .sort((left, right) => left.family.localeCompare(right.family))
  : [];

if (catalog.length < 1000) throw new Error("Google Fonts metadata did not include the full family catalog.");

const generatedAt = new Date().toISOString();
const source = `/**\n * Generated from https://fonts.google.com/metadata/fonts.\n * Run npm run sync:google-fonts to refresh this catalogue.\n * Generated at: ${generatedAt}\n */\n\nexport interface GoogleFontFamily {\n  family: string;\n  category: string;\n}\n\nexport const GOOGLE_FONT_CATALOG: readonly GoogleFontFamily[] = ${JSON.stringify(catalog, null, 2)};\n`;

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, source, "utf8");
console.log(`Wrote ${catalog.length} Google font families to ${outputFile}`);
