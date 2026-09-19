import { execFileSync } from "node:child_process";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_SOURCE_REPO = "jolamyfoodsng/makechurcheasy";
const DEFAULT_TARGET_REPO = "jolamyfoodsng/makechurcheasy-releases";
const REPO_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

type GitHubAsset = {
  id: number;
  name: string;
  size: number;
  content_type?: string;
  url: string;
  browser_download_url?: string;
  digest?: string;
};

type GitHubRelease = {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  upload_url: string;
  assets: GitHubAsset[];
};

type MirrorRequest = {
  tag?: string;
  sourceRepo?: string;
  targetRepo?: string;
  token?: string;
  dryRun?: boolean;
  replaceExisting?: boolean;
};

type AssetMirrorResult = {
  name: string;
  size: number;
  action: "uploaded" | "replaced" | "skipped" | "would-upload" | "would-replace" | "would-skip";
  message?: string;
};

class GitHubApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeRepo(value: unknown, fallback: string): string {
  const repo = String(value || fallback).trim();
  if (!REPO_PATTERN.test(repo)) {
    throw new Error(`Invalid repository "${repo}". Use owner/name.`);
  }
  return repo;
}

function normalizeTag(value: unknown): string {
  const tag = String(value || "latest").trim();
  if (!tag) return "latest";
  if (tag.includes("/") || tag.includes("..")) {
    throw new Error("Invalid release tag.");
  }
  return tag;
}

function getGithubToken(override?: string): string {
  const direct = override?.trim();
  if (direct) return direct;

  const envToken =
    process.env.RELEASE_MIRROR_GITHUB_TOKEN ||
    process.env.UPDATER_GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN ||
    "";
  if (envToken.trim()) return envToken.trim();

  try {
    return execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return "";
  }
}

function githubHeaders(token: string, extra?: HeadersInit): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "makechurcheasy-release-mirror",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}

async function githubJson<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: githubHeaders(token, init.headers),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GitHubApiError(body || res.statusText, res.status);
  }

  return res.json() as Promise<T>;
}

async function githubJsonOrNull<T>(token: string, url: string): Promise<T | null> {
  try {
    return await githubJson<T>(token, url);
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  }
}

async function githubEmpty(token: string, url: string, init: RequestInit): Promise<void> {
  const res = await fetch(url, {
    ...init,
    headers: githubHeaders(token, init.headers),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GitHubApiError(body || res.statusText, res.status);
  }
}

function sourceReleaseUrl(repo: string, tag: string): string {
  const suffix = tag.toLowerCase() === "latest" ? "latest" : `tags/${encodeURIComponent(tag)}`;
  return `https://api.github.com/repos/${repo}/releases/${suffix}`;
}

function releaseByTagUrl(repo: string, tag: string): string {
  return `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`;
}

function releasesUrl(repo: string): string {
  return `https://api.github.com/repos/${repo}/releases`;
}

function releaseUrl(repo: string, id: number): string {
  return `https://api.github.com/repos/${repo}/releases/${id}`;
}

function assetUrl(repo: string, assetId: number): string {
  return `https://api.github.com/repos/${repo}/releases/assets/${assetId}`;
}

function cleanUploadUrl(uploadUrl: string): string {
  return uploadUrl.replace(/\{.*$/, "");
}

function rewriteLatestJson(raw: string, sourceRepo: string, targetRepo: string, tag: string): string {
  const sourceBase = `https://github.com/${sourceRepo}/releases/download/${tag}/`;
  const targetBase = `https://github.com/${targetRepo}/releases/download/${tag}/`;

  const rewriteUrl = (url?: string) => (url || "")
    .replaceAll(sourceBase, targetBase)
    .replaceAll(
      `https://github.com/${sourceRepo}/releases/latest/download/`,
      `https://github.com/${targetRepo}/releases/latest/download/`,
    );

  try {
    const manifest = JSON.parse(raw) as {
      version?: string;
      platforms?: Record<string, { signature?: string; url?: string }>;
      [key: string]: unknown;
    };
    const version = String(manifest.version || tag).replace(/^v/, "");
    const platforms = manifest.platforms || {};
    const urlFor = (filename: string) => `${targetBase}${filename}`;
    const firstEntry = (keys: string[]) => keys.map((key) => platforms[key]).find(Boolean) || null;
    const normalizeEntry = (keys: string[], fallbackFilename: string, fallbackSignature = "") => {
      const entry = firstEntry(keys);
      return {
        signature: entry?.signature || fallbackSignature || "",
        url: rewriteUrl(entry?.url) || urlFor(fallbackFilename),
      };
    };

    const windowsNsis = firstEntry(["windows-x86_64-nsis", "windows-x86_64-exe"]);
    const windowsMsi = firstEntry(["windows-x86_64", "windows-x86_64-msi"]);
    const darwinArm = firstEntry(["darwin-aarch64", "darwin-aarch64-app"]);
    const darwinX64 = firstEntry(["darwin-x86_64", "darwin-x86_64-app"]);
    const normalizedPlatforms: Record<string, { signature: string; url: string }> = {};

    if (windowsNsis) {
      normalizedPlatforms["windows-x86_64-nsis"] = normalizeEntry(
        ["windows-x86_64-nsis", "windows-x86_64-exe"],
        `MakeChurchEasy_${version}_x64-setup.exe`,
      );
    }
    if (windowsMsi) {
      normalizedPlatforms["windows-x86_64"] = normalizeEntry(
        ["windows-x86_64", "windows-x86_64-msi"],
        `MakeChurchEasy_${version}_x64_en-US.msi`,
      );
    }
    if (darwinArm) {
      normalizedPlatforms["darwin-aarch64"] = normalizeEntry(
        ["darwin-aarch64", "darwin-aarch64-app"],
        "MakeChurchEasy_aarch64.app.tar.gz",
      );
      normalizedPlatforms["darwin-aarch64-dmg"] = normalizeEntry(
        ["darwin-aarch64-dmg"],
        `MakeChurchEasy_${version}_aarch64.dmg`,
      );
    }
    if (darwinX64) {
      normalizedPlatforms["darwin-x86_64"] = normalizeEntry(
        ["darwin-x86_64", "darwin-x86_64-app"],
        "MakeChurchEasy_x64.app.tar.gz",
      );
      normalizedPlatforms["darwin-x86_64-dmg"] = normalizeEntry(
        ["darwin-x86_64-dmg"],
        `MakeChurchEasy_${version}_x64.dmg`,
      );
    }
    if (windowsNsis) {
      normalizedPlatforms["windows-x86_64-exe"] = normalizeEntry(
        ["windows-x86_64-exe", "windows-x86_64-nsis"],
        `MakeChurchEasy_${version}_x64-setup.exe`,
        windowsNsis.signature || "",
      );
    }

    return `${JSON.stringify({ ...manifest, version, platforms: normalizedPlatforms }, null, 2)}\n`;
  } catch {
    return raw
      .replaceAll(sourceBase, targetBase)
      .replaceAll(
        `https://github.com/${sourceRepo}/releases/latest/download/`,
        `https://github.com/${targetRepo}/releases/latest/download/`,
      );
  }
}

async function ensureAdmin(req: NextRequest): Promise<NextResponse | null> {
  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3004";
  const cookie = req.headers.get("cookie") || "";

  try {
    const statusUrl = new URL("/api/auth/status", backendUrl).toString();
    const res = await fetch(statusUrl, {
      headers: { cookie },
      cache: "no-store",
    });
    const body = await res.json().catch(() => null) as { authenticated?: boolean; user?: { role?: string } } | null;
    if (res.ok && body?.authenticated && body.user?.role === "admin") {
      return null;
    }
  } catch {
    return jsonError("Could not verify your admin session. Make sure the API is running locally.", 503);
  }

  return jsonError("Unauthorized. Admin access is required.", 403);
}

async function createOrUpdateTargetRelease({
  token,
  sourceRelease,
  targetRepo,
  dryRun,
  logs,
}: {
  token: string;
  sourceRelease: GitHubRelease;
  targetRepo: string;
  dryRun: boolean;
  logs: string[];
}): Promise<GitHubRelease> {
  const tag = sourceRelease.tag_name;
  const existing = await githubJsonOrNull<GitHubRelease>(token, releaseByTagUrl(targetRepo, tag));

  const payload = {
    tag_name: tag,
    name: sourceRelease.name || `MakeChurchEasy ${tag}`,
    body: sourceRelease.body || "",
    draft: false,
    prerelease: false,
    make_latest: "true",
  };

  if (existing) {
    logs.push(`Target release ${tag} already exists.`);
    if (!dryRun) {
      const updated = await githubJson<GitHubRelease>(token, releaseUrl(targetRepo, existing.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      logs.push("Release title, notes, and latest status updated.");
      return updated;
    }
    return existing;
  }

  logs.push(`Target release ${tag} will be created.`);
  if (dryRun) {
    return {
      ...sourceRelease,
      id: 0,
      html_url: `https://github.com/${targetRepo}/releases/tag/${tag}`,
      upload_url: `https://uploads.github.com/repos/${targetRepo}/releases/0/assets{?name,label}`,
      assets: [],
    };
  }

  const created = await githubJson<GitHubRelease>(token, releasesUrl(targetRepo), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  logs.push(`Target release ${tag} created.`);
  return created;
}

async function mirrorAsset({
  token,
  asset,
  sourceRepo,
  targetRepo,
  tag,
  targetRelease,
  existingTarget,
  dryRun,
  replaceExisting,
}: {
  token: string;
  asset: GitHubAsset;
  sourceRepo: string;
  targetRepo: string;
  tag: string;
  targetRelease: GitHubRelease;
  existingTarget?: GitHubAsset;
  dryRun: boolean;
  replaceExisting: boolean;
}): Promise<AssetMirrorResult> {
  if (existingTarget && !replaceExisting) {
    return {
      name: asset.name,
      size: asset.size,
      action: dryRun ? "would-skip" : "skipped",
      message: "Asset already exists on target release.",
    };
  }

  if (dryRun) {
    return {
      name: asset.name,
      size: asset.size,
      action: existingTarget ? "would-replace" : "would-upload",
    };
  }

  if (existingTarget) {
    await githubEmpty(token, assetUrl(targetRepo, existingTarget.id), { method: "DELETE" });
  }

  const downloadRes = await fetch(asset.url, {
    headers: githubHeaders(token, { Accept: "application/octet-stream" }),
    cache: "no-store",
  });
  if (!downloadRes.ok) {
    const body = await downloadRes.text().catch(() => "");
    throw new GitHubApiError(`Failed to download ${asset.name}: ${body || downloadRes.statusText}`, downloadRes.status);
  }

  const isLatestManifest = asset.name === "latest.json";
  const uploadBody = isLatestManifest
    ? rewriteLatestJson(await downloadRes.text(), sourceRepo, targetRepo, tag)
    : await downloadRes.arrayBuffer();
  const contentType = isLatestManifest ? "application/json" : asset.content_type || "application/octet-stream";
  const uploadUrl = `${cleanUploadUrl(targetRelease.upload_url)}?name=${encodeURIComponent(asset.name)}`;

  await githubJson<GitHubAsset>(token, uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: uploadBody,
  });

  return {
    name: asset.name,
    size: isLatestManifest ? new TextEncoder().encode(String(uploadBody)).byteLength : asset.size,
    action: existingTarget ? "replaced" : "uploaded",
  };
}

export async function POST(req: NextRequest) {
  const adminError = await ensureAdmin(req);
  if (adminError) return adminError;

  try {
    const body = await req.json().catch(() => ({})) as MirrorRequest;
    const sourceRepo = normalizeRepo(body.sourceRepo, DEFAULT_SOURCE_REPO);
    const targetRepo = normalizeRepo(body.targetRepo, DEFAULT_TARGET_REPO);
    const requestedTag = normalizeTag(body.tag);
    const dryRun = body.dryRun === true;
    const replaceExisting = body.replaceExisting !== false;
    const token = getGithubToken(body.token);

    if (!token) {
      return jsonError(
        "No GitHub token found. Sign in with GitHub CLI locally, set RELEASE_MIRROR_GITHUB_TOKEN, or paste a token for this action.",
        400,
      );
    }

    const logs: string[] = [];
    const sourceRelease = await githubJson<GitHubRelease>(token, sourceReleaseUrl(sourceRepo, requestedTag));
    const tag = sourceRelease.tag_name;
    logs.push(`Source release resolved to ${tag}.`);

    if (!sourceRelease.assets.length) {
      return jsonError(`Source release ${tag} has no assets to mirror.`, 400);
    }

    const targetRelease = await createOrUpdateTargetRelease({
      token,
      sourceRelease,
      targetRepo,
      dryRun,
      logs,
    });

    const existingByName = new Map((targetRelease.assets || []).map((asset) => [asset.name, asset]));
    const assets: AssetMirrorResult[] = [];

    for (const asset of sourceRelease.assets) {
      const result = await mirrorAsset({
        token,
        asset,
        sourceRepo,
        targetRepo,
        tag,
        targetRelease,
        existingTarget: existingByName.get(asset.name),
        dryRun,
        replaceExisting,
      });
      assets.push(result);
    }

    logs.push(dryRun ? "Dry run complete. No GitHub changes were made." : "Mirror complete.");

    return NextResponse.json({
      ok: true,
      dryRun,
      sourceRepo,
      targetRepo,
      tag,
      sourceReleaseUrl: sourceRelease.html_url,
      targetReleaseUrl: `https://github.com/${targetRepo}/releases/tag/${tag}`,
      latestManifestUrl: `https://github.com/${targetRepo}/releases/latest/download/latest.json`,
      assets,
      logs,
    });
  } catch (error) {
    const status = error instanceof GitHubApiError && error.status >= 400 && error.status < 500 ? error.status : 500;
    const message = error instanceof Error ? error.message : "Release mirror failed";
    return jsonError(message, status);
  }
}
