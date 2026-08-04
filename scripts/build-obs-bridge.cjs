const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const projectRoot = path.resolve(__dirname, "..");
const pluginSourceDir = path.join(projectRoot, "native", "obs-mce-bridge");
const outputRoot = path.join(projectRoot, "src-tauri", "resources", "obs-mce-bridge");
const bridgeVersion = process.env.MCE_OBS_BRIDGE_VERSION || "1.0.0";
const obsSdkVersion = process.env.MCE_OBS_SDK_VERSION || "31.0.0";
const simdeVersion = process.env.MCE_SIMDE_VERSION || "0.8.2";
const downloadTimeoutMs = Number.parseInt(
  process.env.OBS_BUNDLE_DOWNLOAD_TIMEOUT_MS || "1200000",
  10,
);
const downloadAttempts = Number.parseInt(
  process.env.OBS_BUNDLE_DOWNLOAD_ATTEMPTS || "3",
  10,
);

function getBundlePlatform() {
  const target = [
    process.env.MCE_TARGET_OS,
    process.env.TAURI_ENV_TARGET_TRIPLE,
    process.env.TAURI_ENV_PLATFORM,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (target.includes("windows") || target.includes("win32")) return "win32";
  if (target.includes("darwin") || target.includes("macos") || target.includes("apple")) {
    return "darwin";
  }
  return process.platform;
}

function sourceFingerprint() {
  const hash = crypto.createHash("sha256");
  for (const file of ["CMakeLists.txt", "obsconfig.h.in", "mce-obs-bridge.c"]) {
    hash.update(fs.readFileSync(path.join(pluginSourceDir, file)));
  }
  hash.update(fs.readFileSync(__filename));
  return hash.digest("hex").slice(0, 16);
}

async function downloadFile(url, destinationPath) {
  const tempPath = `${destinationPath}.partial`;
  for (let attempt = 1; attempt <= Math.max(1, downloadAttempts); attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.max(30_000, downloadTimeoutMs));
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "MakeChurchEasy-OBSBridgeBuild/1.0" },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Download failed with status ${response.status} ${response.statusText}`);
      }
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tempPath));
      fs.renameSync(tempPath, destinationPath);
      clearTimeout(timeoutId);
      return;
    } catch (error) {
      clearTimeout(timeoutId);
      fs.rmSync(tempPath, { force: true });
      if (attempt === Math.max(1, downloadAttempts)) throw error;
      console.warn(`[build-obs-bridge] Download attempt ${attempt} failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
}

function findObsSourceRoot(root) {
  if (!fs.existsSync(root)) return null;
  if (fs.existsSync(path.join(root, "libobs", "obs.h"))) return root;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const candidate = entries.find((entry) =>
    entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "libobs", "obs.h")),
  );
  return candidate ? path.join(root, candidate.name) : null;
}

function findSimdeIncludeRoot(root) {
  if (!fs.existsSync(root)) return null;
  if (fs.existsSync(path.join(root, "simde", "simde-common.h"))) return root;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const candidate = entries.find((entry) =>
    entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "simde", "simde-common.h")),
  );
  return candidate ? path.join(root, candidate.name) : null;
}

async function ensureObsSource() {
  const configured = process.env.MCE_OBS_SOURCE_DIR || process.env.OBS_SOURCE_DIR;
  if (configured) {
    const resolved = path.resolve(configured);
    if (!findObsSourceRoot(resolved)) {
      throw new Error(`MCE_OBS_SOURCE_DIR does not contain libobs/obs.h: ${resolved}`);
    }
    return resolved;
  }

  const cacheRoot = path.join(os.tmpdir(), `mce-obs-sdk-${obsSdkVersion}`);
  const cached = findObsSourceRoot(cacheRoot);
  if (cached) return cached;

  fs.mkdirSync(cacheRoot, { recursive: true });
  const archivePath = path.join(cacheRoot, `obs-studio-${obsSdkVersion}.tar.gz`);
  if (!fs.existsSync(archivePath)) {
    const url = `https://github.com/obsproject/obs-studio/archive/refs/tags/${obsSdkVersion}.tar.gz`;
    console.log(`[build-obs-bridge] Downloading OBS SDK headers ${obsSdkVersion}.`);
    await downloadFile(url, archivePath);
  }

  execFileSync("tar", ["-xzf", archivePath, "-C", cacheRoot], { stdio: "inherit" });
  const extracted = findObsSourceRoot(cacheRoot);
  if (!extracted) {
    throw new Error(`OBS SDK archive ${obsSdkVersion} did not contain libobs/obs.h`);
  }
  return extracted;
}

async function ensureSimdeIncludeRoot(obsSourceRoot) {
  for (const candidate of [
    path.join(obsSourceRoot, "libobs", "util"),
    path.join(obsSourceRoot, "third-party"),
    path.join(obsSourceRoot, "deps"),
  ]) {
    const local = findSimdeIncludeRoot(candidate);
    if (local) return local;
  }

  const cacheRoot = path.join(os.tmpdir(), `mce-simde-${simdeVersion}`);
  const cached = findSimdeIncludeRoot(cacheRoot);
  if (cached) return cached;

  fs.mkdirSync(cacheRoot, { recursive: true });
  const archivePath = path.join(cacheRoot, `simde-${simdeVersion}.tar.gz`);
  if (!fs.existsSync(archivePath)) {
    const url = `https://github.com/simd-everywhere/simde/archive/refs/tags/v${simdeVersion}.tar.gz`;
    console.log(`[build-obs-bridge] Downloading SIMD headers ${simdeVersion}.`);
    await downloadFile(url, archivePath);
  }

  execFileSync("tar", ["-xzf", archivePath, "-C", cacheRoot], { stdio: "inherit" });
  const extracted = findSimdeIncludeRoot(cacheRoot);
  if (!extracted) {
    throw new Error(`SIMDe archive ${simdeVersion} did not contain simde/simde-common.h`);
  }
  return extracted;
}

function findBuiltLibrary(buildRoot, platform) {
  const extension = platform === "win32" ? ".dll" : platform === "darwin" ? ".dylib" : ".so";
  const expected = path.join(buildRoot, `mce-obs-bridge${extension}`);
  if (fs.existsSync(expected)) return expected;

  const candidates = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name === `mce-obs-bridge${extension}`) candidates.push(fullPath);
    }
  };
  walk(buildRoot);
  if (!candidates[0]) throw new Error(`CMake did not produce mce-obs-bridge${extension}`);
  return candidates[0];
}

function hasNinja() {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", ["ninja"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function stagePlugin(platform, builtLibrary, fingerprint) {
  const platformDir = path.join(outputRoot, platform);
  fs.rmSync(platformDir, { recursive: true, force: true });

  if (platform === "darwin") {
    const bundleDir = path.join(platformDir, "mce-obs-bridge.plugin");
    const binaryDir = path.join(bundleDir, "Contents", "MacOS");
    fs.mkdirSync(binaryDir, { recursive: true });
    fs.copyFileSync(builtLibrary, path.join(binaryDir, "mce-obs-bridge"));
    fs.writeFileSync(
      path.join(bundleDir, "Contents", "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
        `<plist version="1.0"><dict>\n` +
        `<key>CFBundleDisplayName</key><string>MakeChurchEasy OBS Bridge</string>\n` +
        `<key>CFBundleExecutable</key><string>mce-obs-bridge</string>\n` +
        `<key>CFBundleIdentifier</key><string>com.makechurcheasy.obs.bridge</string>\n` +
        `<key>CFBundleName</key><string>mce-obs-bridge</string>\n` +
        `<key>CFBundlePackageType</key><string>BNDL</string>\n` +
        `<key>CFBundleShortVersionString</key><string>${bridgeVersion}</string>\n` +
        `<key>CFBundleVersion</key><string>${bridgeVersion}</string>\n` +
        `</dict></plist>\n`,
    );
    if (process.platform === "darwin") {
      execFileSync("codesign", ["--force", "--deep", "--sign", "-", bundleDir], {
        stdio: "inherit",
      });
    }
  } else {
    const binaryDir = path.join(platformDir, "mce-obs-bridge", "bin", "64bit");
    fs.mkdirSync(binaryDir, { recursive: true });
    fs.copyFileSync(builtLibrary, path.join(binaryDir, "mce-obs-bridge.dll"));
  }

  fs.writeFileSync(path.join(platformDir, ".version"), `${bridgeVersion}:${fingerprint}\n`);
  console.log(`[build-obs-bridge] Staged MCE OBS Bridge ${bridgeVersion} for ${platform}.`);
}

async function main() {
  const platform = getBundlePlatform();
  if (platform !== "darwin" && platform !== "win32") {
    console.log(`[build-obs-bridge] Skipping unsupported platform ${platform}.`);
    return;
  }

  const fingerprint = sourceFingerprint();
  const platformDir = path.join(outputRoot, platform);
  const markerPath = path.join(platformDir, ".version");
  const expectedMarker = `${bridgeVersion}:${fingerprint}`;
  if (fs.existsSync(markerPath) && fs.readFileSync(markerPath, "utf8").trim() === expectedMarker) {
    console.log(`[build-obs-bridge] MCE OBS Bridge ${bridgeVersion} already staged for ${platform}.`);
    return;
  }

  const obsSourceRoot = await ensureObsSource();
  const simdeIncludeRoot = await ensureSimdeIncludeRoot(obsSourceRoot);
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mce-obs-bridge-build-"));
  try {
    const generatorArgs = hasNinja() ? ["-G", "Ninja"] : ["-G", "Unix Makefiles"];
    execFileSync(
      "cmake",
      [
        "-S",
        pluginSourceDir,
        "-B",
        buildRoot,
        ...generatorArgs,
        "-DCMAKE_BUILD_TYPE=Release",
        `-DOBS_SOURCE_DIR=${obsSourceRoot}`,
        `-DMCE_SIMDE_INCLUDE_DIR=${simdeIncludeRoot}`,
      ],
      { stdio: "inherit" },
    );
    execFileSync("cmake", ["--build", buildRoot, "--config", "Release", "--parallel"], {
      stdio: "inherit",
    });
    stagePlugin(platform, findBuiltLibrary(buildRoot, platform), fingerprint);
  } finally {
    fs.rmSync(buildRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[build-obs-bridge] ${error.message}`);
  process.exit(1);
});
