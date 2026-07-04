#!/usr/bin/env node
/**
 * Apply mvSettings translations to a locale file.
 * Usage: node apply-translations.js <locale> <translations-json-file>
 * Example: node apply-translations.js es /tmp/es-translations.json
 * 
 * The translations JSON should be an object like: { "mvSettings.page.title": "Título", ... }
 * Keys not present in the translations file will be left unchanged (English fallback).
 */

const fs = require('fs');
const path = require('path');

const locale = process.argv[2];
const translationsFile = process.argv[3];

if (!locale || !translationsFile) {
  console.error('Usage: node apply-translations.js <locale> <translations-json-file>');
  process.exit(1);
}

const localeFilePath = path.join(__dirname, `app-${locale}.json`);
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
console.log(`✅ Applied ${applied} translations to app-${locale}.json (${missing} missing keys)`);
