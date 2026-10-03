#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const desktopDir = path.resolve(__dirname, "..");
const repoDir = path.resolve(desktopDir, "..");
const bump = process.argv[2];

if (!["patch", "minor", "major"].includes(bump)) {
  throw new Error("Choose a release bump: patch, minor, or major.");
}

function git(...args) {
  return execFileSync("git", args, { cwd: repoDir, encoding: "utf8" }).trim();
}

const branch = git("branch", "--show-current");
if (branch !== "main") {
  throw new Error(`Releases must start from main; current branch is ${branch || "detached HEAD"}.`);
}

if (git("status", "--porcelain")) {
  throw new Error("Working tree has uncommitted changes. Commit or set them aside before releasing.");
}

execFileSync("npm", ["version", bump, "--no-git-tag-version"], {
  cwd: desktopDir,
  stdio: "inherit",
});
execFileSync("node", [path.join(__dirname, "sync-version.cjs")], {
  cwd: desktopDir,
  stdio: "inherit",
});

const version = JSON.parse(fs.readFileSync(path.join(desktopDir, "package.json"), "utf8")).version;
const tag = `v${version}`;
if (git("tag", "--list", tag)) {
  throw new Error(`Tag ${tag} already exists locally.`);
}

const files = [
  "desktop/package.json",
  "desktop/package-lock.json",
  "desktop/src-tauri/tauri.conf.json",
];
git("add", "--", ...files);
git("commit", "-m", `Release ${tag}`);
git("tag", "-a", tag, "-m", `MakeChurchEasy ${tag}`);
git("push", "origin", "HEAD:main");
git("push", "origin", tag);
console.log(`Pushed ${tag}. The release workflow will build Windows and macOS packages.`);
