const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const desktopRoot = path.resolve(__dirname, "..");
const mobilePublicDir = path.join(desktopRoot, "public", "mobile");
const mobileRoot = process.env.MOBILE_SOURCE_DIR
  ? path.resolve(desktopRoot, process.env.MOBILE_SOURCE_DIR)
  : path.resolve(desktopRoot, "..", "makechurcheasy_mobile", "mce_mobile");
const mobileBuildDir = path.join(mobileRoot, "build", "web");
const flutterCommand = process.env.FLUTTER_BIN || "flutter";
const shouldBuild = process.argv.includes("--build") || process.env.MOBILE_WEB_BUILD === "1";

const requiredBundleFiles = [
  "index.html",
  "flutter_bootstrap.js",
  "main.dart.js",
  "manifest.json",
];

function assertBundle(directory, label) {
  const missingFiles = requiredBundleFiles.filter(
    (fileName) => !fs.existsSync(path.join(directory, fileName)),
  );

  if (missingFiles.length > 0) {
    throw new Error(
      `[prepare-mobile-web] ${label} is incomplete. Missing: ${missingFiles.join(", ")}. ` +
        "Run npm run mobile:web:build on a machine with Flutter, then commit public/mobile.",
    );
  }

  const indexHtml = fs.readFileSync(path.join(directory, "index.html"), "utf8");
  if (!indexHtml.includes('<base href="/mobile/">')) {
    throw new Error(
      `[prepare-mobile-web] ${label} has the wrong base href. Expected /mobile/ so the desktop local web client can resolve its assets.`,
    );
  }
}

function buildAndStageBundle() {
  if (!fs.existsSync(mobileRoot)) {
    throw new Error(
      `[prepare-mobile-web] Flutter source was not found at ${mobileRoot}. ` +
        "Set MOBILE_SOURCE_DIR or run with the versioned public/mobile bundle.",
    );
  }

  console.log("[prepare-mobile-web] Building the mobile web bundle for an explicit refresh...");
  execFileSync(flutterCommand, ["pub", "get"], {
    cwd: mobileRoot,
    stdio: "inherit",
  });
  execFileSync(
    flutterCommand,
    ["build", "web", "--release", "--base-href", "/mobile/"],
    { cwd: mobileRoot, stdio: "inherit" },
  );

  assertBundle(mobileBuildDir, `Flutter build at ${mobileBuildDir}`);
  fs.rmSync(mobilePublicDir, { recursive: true, force: true });
  fs.cpSync(mobileBuildDir, mobilePublicDir, { recursive: true });
  assertBundle(mobilePublicDir, `staged bundle at ${mobilePublicDir}`);
  console.log(
    `[prepare-mobile-web] Refreshed versioned bundle at ${path.relative(desktopRoot, mobilePublicDir)}`,
  );
}

function checkVersionedBundle() {
  assertBundle(mobilePublicDir, `versioned bundle at ${mobilePublicDir}`);
  console.log(
    `[prepare-mobile-web] Using versioned mobile web bundle at ${path.relative(desktopRoot, mobilePublicDir)}`,
  );
}

if (shouldBuild) {
  buildAndStageBundle();
} else {
  checkVersionedBundle();
}
