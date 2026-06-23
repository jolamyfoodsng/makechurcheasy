/**
 * sync-version.cjs — Keep package.json, tauri.conf.json, and landing page versions in sync.
 *
 * Usage (called automatically by npm version hooks):
 *   node scripts/sync-version.cjs
 *
 * Reads the version from package.json and writes it to:
 *   - src-tauri/tauri.conf.json
 *   - beta-landing/index.html (meta display, DOWNLOAD_VERSION, and download URLs)
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const tauriPath = path.join(root, "src-tauri", "tauri.conf.json");
const landingPath = path.join(root, "beta-landing", "index.html");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version;

// ── tauri.conf.json ──────────────────────────────────────────────────────────
const tauri = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
if (tauri.version !== version) {
  tauri.version = version;
  fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + "\n");
  console.log(`✅ Synced tauri.conf.json → v${version}`);
} else {
  console.log(`✅ tauri.conf.json already at v${version}`);
}

// ── beta-landing/index.html ──────────────────────────────────────────────────
if (fs.existsSync(landingPath)) {
  let html = fs.readFileSync(landingPath, "utf8");

  // 1. Meta display: v{version}
  html = html.replace(
    /(<p class="meta-value" id="meta-version">)v[\d.]+(<\/p>)/,
    `$1v${version}$2`
  );

  // 2. DOWNLOAD_VERSION constant
  html = html.replace(
    /const DOWNLOAD_VERSION = '[\d.]+';/,
    `const DOWNLOAD_VERSION = '${version}';`
  );

  // 3. Download URLs (tag + filename pattern)
  html = html.replace(
    /https:\/\/github\.com\/jolamyfoodsng\/makechurcheasy-releases\/releases\/download\/v[\d.]+\/MakeChurchEasy_[\d.]+/g,
    (match) =>
      match.replace(
        /v[\d.]+\/MakeChurchEasy_[\d.]+/,
        `v${version}/MakeChurchEasy_${version}`
      )
  );

  fs.writeFileSync(landingPath, html, "utf8");
  console.log(`✅ Synced beta-landing/index.html → v${version}`);
} else {
  console.log(`⚠️  beta-landing/index.html not found — skipping`);
}
