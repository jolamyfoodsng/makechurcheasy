#!/usr/bin/env node

/**
 * extract-release-notes.cjs — Pull the current release's notes out of
 * RELEASE_NOTES.md so they ship inside latest.json (the in-app "What's New"
 * list) and on the GitHub release page.
 *
 * RELEASE_NOTES.md layout:
 *   # MakeChurchEasy Release Highlights (v3.34.0)   ← title, version optional
 *   ## 1. Section
 *   - **Lead:** text
 *   ---                                             ← everything after this
 *   ## Previous Release Highlights (v3.33.0)          is history and ignored
 *
 * Usage:
 *   node scripts/extract-release-notes.cjs [RELEASE_NOTES.md] --out notes.md [--tag v3.34.0]
 *
 * Exits 0 with an empty file when there is nothing to publish, so a release
 * never fails because of notes. A version mismatch prints a GitHub warning.
 */

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
function argValue(name, fallback = "") {
  const idx = args.indexOf(name);
  return idx !== -1 ? String(args[idx + 1] || fallback) : fallback;
}

const positional = args.filter((arg, i) => !arg.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const inputFile = path.resolve(positional[0] || "RELEASE_NOTES.md");
const outFile = argValue("--out") ? path.resolve(argValue("--out")) : "";
const tag = argValue("--tag").replace(/^v/, "");

function write(text) {
  if (outFile) fs.writeFileSync(outFile, text ? `${text}\n` : "");
  else process.stdout.write(text ? `${text}\n` : "");
}

if (!fs.existsSync(inputFile)) {
  console.error(`::warning::${path.basename(inputFile)} not found — release will have no notes.`);
  write("");
  process.exit(0);
}

const lines = fs.readFileSync(inputFile, "utf8").replace(/\r\n/g, "\n").split("\n");
const body = [];
let titleVersion = "";

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  const trimmed = line.trim();

  // Top-level title: remember its version, do not include it.
  if (i === 0 || (body.length === 0 && /^#\s+/.test(trimmed))) {
    const match = trimmed.match(/^#\s+.*?v?(\d+\.\d+\.\d+)/);
    if (/^#\s+/.test(trimmed)) {
      titleVersion = match ? match[1] : "";
      continue;
    }
  }

  if (/^-{3,}$/.test(trimmed)) break;
  if (/^#{1,3}\s+previous release/i.test(trimmed)) break;
  body.push(line);
}

const text = body.join("\n").trim();

if (tag && titleVersion && titleVersion !== tag) {
  console.error(
    `::warning::RELEASE_NOTES.md is titled v${titleVersion} but this release is v${tag}. ` +
      "Update RELEASE_NOTES.md before releasing so users see the right changes.",
  );
}
if (!text) {
  console.error("::warning::RELEASE_NOTES.md has no notes for this release.");
}

write(text);
