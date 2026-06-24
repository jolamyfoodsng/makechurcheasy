#!/usr/bin/env node

/**
 * generate-update-json.cjs — Generate latest.json for Tauri auto-updater.
 *
 * Scans a directory of release assets (.exe, .dmg, .app.tar.gz + .sig files),
 * reads their signatures, and outputs a latest.json ready to upload alongside
 * the release on GitHub.
 *
 * Usage:
 *   node scripts/generate-update-json.cjs <version> <assets-directory> [--out latest.json]
 *
 * Examples:
 *   node scripts/generate-update-json.cjs 4.31.0 ./release-assets
 *   node scripts/generate-update-json.cjs 4.31.0 ./release-assets --out latest.json
 *
 * The assets directory should contain your built installers and their .sig files:
 *   release-assets/
 *     MakeChurchEasy_4.31.0_x64-setup.exe
 *     MakeChurchEasy_4.31.0_x64-setup.exe.sig
 *     MakeChurchEasy_4.31.0_aarch64.dmg
 *     MakeChurchEasy_4.31.0_x64.dmg
 *     MakeChurchEasy_aarch64.app.tar.gz
 *     MakeChurchEasy_aarch64.app.tar.gz.sig
 *     MakeChurchEasy_x64.app.tar.gz
 *     MakeChurchEasy_x64.app.tar.gz.sig
 */

const fs = require("fs");
const path = require("path");

// ── Args ──

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node scripts/generate-update-json.cjs <version> <assets-directory> [--out latest.json] [--min-version <version>]");
  process.exit(1);
}

const version = args[0].replace(/^v/, "");
const assetsDir = path.resolve(args[1]);
const outIdx = args.indexOf("--out");
const outFile = outIdx !== -1 ? path.resolve(args[outIdx + 1]) : null;
const minVersionIdx = args.indexOf("--min-version");
const minVersion = minVersionIdx !== -1 ? args[minVersionIdx + 1] || "" : "";

if (!fs.existsSync(assetsDir)) {
  console.error(`Assets directory not found: ${assetsDir}`);
  process.exit(1);
}

// ── GitHub repo for download URLs ──

const PUBLIC_REPO = "jolamyfoodsng/makechurcheasy-releases";
const RELEASE_TAG = `v${version}`;

function downloadUrl(filename) {
  return `https://github.com/${PUBLIC_REPO}/releases/download/${RELEASE_TAG}/${filename}`;
}

// ── Platform detection ──
// Maps filename patterns to Tauri updater platform keys.

const PLATFORMS = [
  {
    key: "windows-x86_64-nsis",
    match: (f) => f.endsWith("-setup.exe") && !f.endsWith(".sig"),
    sig: (f) => f.replace(/-setup\.exe$/, "-setup.exe.sig"),
  },
  {
    key: "windows-x86_64",
    match: (f) => f.endsWith("_x64_en-US.msi") && !f.endsWith(".sig"),
    sig: (f) => f + ".sig",
  },
  {
    key: "darwin-aarch64",
    match: (f) => f.includes("aarch64") && f.endsWith(".app.tar.gz") && !f.endsWith(".sig"),
    sig: (f) => f + ".sig",
  },
  {
    key: "darwin-x86_64",
    match: (f) => f.includes("x64") && f.endsWith(".app.tar.gz") && !f.endsWith(".sig"),
    sig: (f) => f + ".sig",
  },
];

// ── Read assets ──

const files = fs.readdirSync(assetsDir);
const platforms = {};
let found = 0;

for (const platform of PLATFORMS) {
  const assetFile = files.find(platform.match);
  if (!assetFile) continue;

  const sigFile = platform.sig(assetFile);
  const sigPath = path.join(assetsDir, sigFile);
  let signature = "";

  if (fs.existsSync(sigPath)) {
    signature = fs.readFileSync(sigPath, "utf8").trim();
  } else {
    console.warn(`⚠️  No signature file found: ${sigFile} (update will fail signature verification)`);
  }

  platforms[platform.key] = {
    signature,
    url: downloadUrl(assetFile),
  };
  found++;
}

if (found === 0) {
  console.error(`No matching assets found in ${assetsDir}`);
  console.error("Expected files like: *_x64-setup.exe, *_aarch64.dmg, *.app.tar.gz");
  process.exit(1);
}

// ── Build latest.json ──

// Minimum version the app will function at.
// Desktop versions below this are blocked server-side (pairing, Bible API)
// and client-side (startup check). Provided via --min-version CLI flag.

const manifest = {
  version,
  notes: `MakeChurchEasy Studio v${version}`,
  pub_date: new Date().toISOString(),
  ...(minVersion ? { minVersion } : {}),
  platforms,
};

const json = JSON.stringify(manifest, null, 2) + "\n";

if (outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, json);
  console.log(`✅ Written to ${outFile}`);
} else {
  process.stdout.write(json);
}

console.log(`📦 Generated latest.json for v${version} (${found} platform${found === 1 ? "" : "s"})`);
