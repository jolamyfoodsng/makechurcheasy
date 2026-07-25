#!/usr/bin/env node

/**
 * Desktop Translation Sync Script
 *
 * Syncs flat dot-notation translation keys across all desktop locale files
 * using app-en.json as source of truth.
 *
 * Usage:
 *   node scripts/sync-desktop-translations.js          # Sync all locales + report
 *   node scripts/sync-desktop-translations.js --check   # Report only (no file writes)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOCALES_DIR = path.join(__dirname, "..", "src", "locales");
const SOURCE_LOCALE = "en";
const ALL_LOCALES = ["en", "fr", "es", "pt", "yo", "ig", "ha"];
const CHECK_MODE = process.argv.includes("--check");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// --- Main ---

const sourcePath = path.join(LOCALES_DIR, `app-${SOURCE_LOCALE}.json`);
const sourceData = readJson(sourcePath);
if (!sourceData) {
  console.error(`Source file not found: ${sourcePath}`);
  process.exit(1);
}

const sourceKeys = Object.keys(sourceData).filter((k) => !k.startsWith("_"));
const totalKeys = sourceKeys.length;

console.log(`\n📖 Source: app-${SOURCE_LOCALE}.json (${totalKeys} keys)\n`);

if (CHECK_MODE) {
  console.log("🔍 Check mode — no files will be written\n");
}

const results = [];

for (const locale of ALL_LOCALES) {
  const localePath = path.join(LOCALES_DIR, `app-${locale}.json`);
  const localeData = readJson(localePath);

  if (!localeData) {
    if (locale === SOURCE_LOCALE) continue;
    if (!CHECK_MODE) {
      console.log(`  ⚠️  app-${locale}.json not found — creating with English placeholders`);
      writeJson(localePath, sourceData);
      results.push({ locale, total: totalKeys, translated: 0, missing: totalKeys, pct: 0 });
    } else {
      results.push({ locale, total: totalKeys, translated: 0, missing: totalKeys, pct: 0 });
    }
    continue;
  }

  const localeKeys = Object.keys(localeData).filter((k) => !k.startsWith("_"));
  const missingKeys = [];
  const extraKeys = [];

  for (const key of sourceKeys) {
    if (!localeKeys.includes(key)) {
      missingKeys.push(key);
    }
  }

  for (const key of localeKeys) {
    if (!sourceKeys.includes(key)) {
      extraKeys.push(key);
    }
  }

  const translatedCount = totalKeys - missingKeys.length;
  const pct = totalKeys > 0 ? Math.round((translatedCount / totalKeys) * 100) : 0;

  if (!CHECK_MODE && (missingKeys.length > 0 || extraKeys.length > 0)) {
    const updated = {};
    if (localeData._comment) updated._comment = localeData._comment;

    for (const key of sourceKeys) {
      updated[key] = localeData[key] ?? sourceData[key];
    }

    for (const key of extraKeys) {
      updated[key] = localeData[key];
    }

    writeJson(localePath, updated);
  }

  results.push({
    locale,
    total: totalKeys,
    translated: translatedCount,
    missing: missingKeys.length,
    extra: extraKeys.length,
    pct,
  });
}

// Print summary table
console.log("┌──────────┬────────┬────────────┬─────────┬──────────┬───────┐");
console.log("│ Locale   │ Total  │ Translated │ Missing │ Orphans  │   %   │");
console.log("├──────────┼────────┼────────────┼─────────┼──────────┼───────┤");

for (const r of results) {
  const locale = r.locale.padEnd(8);
  const total = String(r.total).padStart(6);
  const translated = String(r.translated).padStart(10);
  const missing = String(r.missing).padStart(7);
  const extra = String(r.extra || 0).padStart(8);
  const pct = `${r.pct}%`.padStart(5);
  const flag = r.locale === SOURCE_LOCALE ? "✅" : r.missing === 0 ? "✅" : "🔄";
  console.log(`│ ${flag} ${locale} │ ${total} │ ${translated} │ ${missing} │ ${extra} │ ${pct} │`);
}

console.log("└──────────┴────────┴────────────┴─────────┴──────────┴───────┘");

const untranslated = results.filter((r) => r.locale !== SOURCE_LOCALE && r.missing > 0);
if (untranslated.length > 0) {
  console.log(`\n🔄 ${untranslated.length} locale(s) need translation work.`);
  if (!CHECK_MODE) {
    console.log("   Missing keys have been filled with English placeholders.\n");
  }
} else {
  console.log("\n✅ All locales are fully translated!\n");
}
