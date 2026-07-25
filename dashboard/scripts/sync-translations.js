#!/usr/bin/env node

/**
 * Translation Management Script
 *
 * Syncs translation keys across all locale files using en.json as source of truth.
 *
 * Usage:
 *   node scripts/sync-translations.js          # Sync all locales + report
 *   node scripts/sync-translations.js --check   # Report only (no file writes)
 */

const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(__dirname, "..", "src", "locales");
const SOURCE_LOCALE = "en";
const ALL_LOCALES = ["en", "fr", "es", "pt", "yo", "ig", "ha"];
const CHECK_MODE = process.argv.includes("--check");

function flattenKeys(obj, prefix = "") {
  const keys = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(keys, flattenKeys(value, fullKey));
    } else {
      keys[fullKey] = value;
    }
  }
  return keys;
}

function setNestedKey(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

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

const sourcePath = path.join(LOCALES_DIR, `${SOURCE_LOCALE}.json`);
const sourceData = readJson(sourcePath);
if (!sourceData) {
  console.error(`Source file not found: ${sourcePath}`);
  process.exit(1);
}

const sourceKeys = flattenKeys(sourceData);
const totalKeys = Object.keys(sourceKeys).length;

console.log(`\n📖 Source: ${SOURCE_LOCALE}.json (${totalKeys} keys)\n`);

if (CHECK_MODE) {
  console.log("🔍 Check mode — no files will be written\n");
}

const results = [];

for (const locale of ALL_LOCALES) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const localeData = readJson(localePath);

  if (!localeData) {
    if (locale === SOURCE_LOCALE) continue;
    if (!CHECK_MODE) {
      console.log(`  ⚠️  ${locale}.json not found — creating with English placeholders`);
      writeJson(localePath, sourceData);
      results.push({ locale, total: totalKeys, translated: 0, missing: totalKeys, pct: 0 });
    } else {
      results.push({ locale, total: totalKeys, translated: 0, missing: totalKeys, pct: 0 });
    }
    continue;
  }

  const localeKeys = flattenKeys(localeData);
  const missingKeys = [];
  const extraKeys = [];

  // Keys in source but not in locale
  for (const key of Object.keys(sourceKeys)) {
    if (!(key in localeKeys)) {
      missingKeys.push(key);
    }
  }

  // Keys in locale but not in source (orphans)
  for (const key of Object.keys(localeKeys)) {
    if (!(key in sourceKeys)) {
      extraKeys.push(key);
    }
  }

  const translatedCount = Object.keys(sourceKeys).length - missingKeys.length;
  const pct = totalKeys > 0 ? Math.round((translatedCount / totalKeys) * 100) : 0;

  if (!CHECK_MODE && (missingKeys.length > 0 || extraKeys.length > 0)) {
    // Add missing keys with English values
    const updated = JSON.parse(JSON.stringify(localeData));
    for (const key of missingKeys) {
      setNestedKey(updated, key, sourceKeys[key]);
    }
    // Remove orphan keys
    for (const key of extraKeys) {
      const parts = key.split(".");
      let current = updated;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) break;
        current = current[parts[i]];
      }
      if (current) delete current[parts[parts.length - 1]];
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
