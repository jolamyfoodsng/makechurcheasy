#!/usr/bin/env node
/**
 * Apply mvSettings translations to a locale file.
 * Usage:
 *   node apply-translations.cjs <locale> <translations-json-file>
 *   node apply-translations.cjs <scope> <locale> <translations-json-file>
 *
 * Examples:
 *   node apply-translations.cjs es-ES /tmp/es-translations.json
 *   node apply-translations.cjs dock fr-FR /tmp/fr-dock-translations.json
 * 
 * The translations JSON should be an object like: { "mvSettings.page.title": "Título", ... }
 * Keys not present in the translations file will be left unchanged (English fallback).
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let scope = "app";
let locale;
let translationsFile;

if (args.length === 2) {
  [locale, translationsFile] = args;
} else if (args.length >= 3) {
  [scope, locale, translationsFile] = args;
} else {
  locale = undefined;
  translationsFile = undefined;
}

if (!locale || !translationsFile) {
  console.error('Usage: node apply-translations.cjs <locale> <translations-json-file>');
  console.error('   or: node apply-translations.cjs <scope> <locale> <translations-json-file>');
  process.exit(1);
}

const localeFilePath = path.join(__dirname, `${scope}-${locale}.json`);
const translations = JSON.parse(fs.readFileSync(translationsFile, 'utf8'));
const localeData = JSON.parse(fs.readFileSync(localeFilePath, 'utf8'));

let applied = 0;
let missing = 0;

for (const [key, value] of Object.entries(translations)) {
  if (key in localeData) {
    localeData[key] = value;
    applied++;
  } else {
    console.warn(`Key not found in ${locale}: ${key}`);
    missing++;
  }
}

fs.writeFileSync(localeFilePath, JSON.stringify(localeData, null, 2) + '\n');
console.log(`✅ Applied ${applied} translations to ${scope}-${locale}.json (${missing} missing keys)`);
