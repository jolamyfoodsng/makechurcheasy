#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const INCLUDE_LEGACY = process.argv.includes("--all");

const CHECKS = [
  {
    name: "dashboard",
    base: path.join(__dirname, "../dashboard/src/locales/en-US.json"),
    dir: path.join(__dirname, "../dashboard/src/locales"),
    prefix: "",
  },
  {
    name: "desktop-app",
    base: path.join(__dirname, "../desktop/src/locales/app-en-US.json"),
    dir: path.join(__dirname, "../desktop/src/locales"),
    prefix: "app-",
  },
  {
    name: "desktop-dock",
    base: path.join(__dirname, "../desktop/src/locales/dock-en-US.json"),
    dir: path.join(__dirname, "../desktop/src/locales"),
    prefix: "dock-",
  },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function flatten(value, prefix = "", out = {}) {
  if (value === null || value === undefined) {
    out[prefix] = value;
    return out;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    out[prefix] = value;
    return out;
  }

  for (const [key, child] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    flatten(child, nextKey, out);
  }

  return out;
}

function placeholderSet(text) {
  if (typeof text !== "string") return new Set();
  const found = new Set();
  let match;
  while ((match = PLACEHOLDER_RE.exec(text))) {
    found.add(match[1]);
  }
  return found;
}

function compareLocales(baseFlat, targetFlat) {
  const baseKeys = Object.keys(baseFlat);
  const targetKeys = Object.keys(targetFlat);

  const missingKeys = baseKeys.filter((key) => !(key in targetFlat));
  const extraKeys = targetKeys.filter((key) => !(key in baseFlat));
  const placeholderIssues = [];

  for (const key of baseKeys) {
    const baseValue = baseFlat[key];
    const targetValue = targetFlat[key];
    if (typeof baseValue !== "string" || typeof targetValue !== "string") continue;

    const basePlaceholders = placeholderSet(baseValue);
    const targetPlaceholders = placeholderSet(targetValue);
    if (basePlaceholders.size === 0 && targetPlaceholders.size === 0) continue;

    const baseMissing = [...basePlaceholders].filter((token) => !targetPlaceholders.has(token));
    const targetExtra = [...targetPlaceholders].filter((token) => !basePlaceholders.has(token));
    if (baseMissing.length || targetExtra.length) {
      placeholderIssues.push({
        key,
        missing: baseMissing,
        extra: targetExtra,
      });
    }
  }

  return { missingKeys, extraKeys, placeholderIssues };
}

function getReferenceFile(check, file) {
  return path.basename(check.base);
}

let hasErrors = false;

for (const check of CHECKS) {
  const files = fs
    .readdirSync(check.dir)
    .filter((file) => file.endsWith(".json"))
    .filter((file) => file !== path.basename(check.base))
    .filter((file) => file.startsWith(check.prefix))
    .sort();

  for (const file of files) {
    const filePath = path.join(check.dir, file);
    const referenceFile = getReferenceFile(check, file);
    if (!referenceFile) continue;
    const referencePath = path.join(check.dir, referenceFile);
    if (!fs.existsSync(referencePath)) continue;
    const baseFlat = flatten(readJson(referencePath));
    const targetFlat = flatten(readJson(filePath));
    const { missingKeys, extraKeys, placeholderIssues } = compareLocales(baseFlat, targetFlat);

    if (missingKeys.length || extraKeys.length || placeholderIssues.length) {
      hasErrors = true;
      console.log(`\n[${check.name}] ${file}`);
      if (missingKeys.length) {
        console.log(`  missing keys: ${missingKeys.length}`);
        console.log(`  e.g. ${missingKeys.slice(0, 8).join(", ")}`);
      }
      if (extraKeys.length) {
        console.log(`  extra keys: ${extraKeys.length}`);
        console.log(`  e.g. ${extraKeys.slice(0, 8).join(", ")}`);
      }
      if (placeholderIssues.length) {
        console.log(`  placeholder mismatches: ${placeholderIssues.length}`);
        for (const issue of placeholderIssues.slice(0, 5)) {
          console.log(`    ${issue.key} missing=[${issue.missing.join(", ")}] extra=[${issue.extra.join(", ")}]`);
        }
      }
    }
  }
}

if (hasErrors) {
  console.error("\nLocale coverage check failed.");
  process.exit(1);
}

console.log("Locale coverage check passed.");
