const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const desktopRoot = path.resolve(__dirname, "..");
const mobileRoot = path.resolve(desktopRoot, "..", "makechurcheasy_mobile", "mce_mobile");
const mobileBuildDir = path.join(mobileRoot, "build", "web");
const mobilePublicDir = path.join(desktopRoot, "public", "mobile");
const flutterCommand = process.env.FLUTTER_BIN || "flutter";

console.log("[prepare-mobile-web] Building the local iPhone/iPad PWA...");
execFileSync(
  flutterCommand,
  ["build", "web", "--release", "--base-href", "/mobile/"],
  { cwd: mobileRoot, stdio: "inherit" },
);

if (!fs.existsSync(path.join(mobileBuildDir, "index.html"))) {
  throw new Error(`[prepare-mobile-web] Flutter web build did not produce ${mobileBuildDir}`);
}

fs.rmSync(mobilePublicDir, { recursive: true, force: true });
fs.cpSync(mobileBuildDir, mobilePublicDir, { recursive: true });
console.log(`[prepare-mobile-web] Local PWA staged at ${path.relative(desktopRoot, mobilePublicDir)}`);
