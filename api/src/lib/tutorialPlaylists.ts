import clientPromise from "./mongodb";
import { COLLECTIONS, ensureIndexes } from "./db";

export type TutorialRelease = "current" | "legacy";

export interface TutorialVideoDocument {
  videoId: string;
  title: string;
  description: string;
  youtubeUrl: string;
  thumbnailUrl?: string;
  duration?: string;
  tags: string[];
  release: TutorialRelease;
  featured: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface TutorialPlaylistDocument {
  _id?: unknown;
  playlistId: string;
  youtubePlaylistUrl?: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  category: string;
  tags: string[];
  featured: boolean;
  enabled: boolean;
  sortOrder: number;
  videos: TutorialVideoDocument[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface TutorialPlaylistInput {
  playlistId?: unknown;
  youtubePlaylistUrl?: unknown;
  title?: unknown;
  description?: unknown;
  thumbnailUrl?: unknown;
  category?: unknown;
  tags?: unknown;
  featured?: unknown;
  enabled?: unknown;
  sortOrder?: unknown;
  videos?: unknown;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, fallback = "", maxLength = 2_000): string {
  return typeof value === "string" ? value.slice(0, maxLength).trim() : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(-10_000, Math.min(10_000, Math.trunc(value))) : fallback;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function normalizeId(value: unknown, fallback: string, prefix: string): string {
  const slug = slugify(readString(value, "", 120) || fallback);
  if (!slug) return `${prefix}-${Date.now().toString(36)}`;
  return slug.startsWith(`${prefix}-`) ? slug : `${prefix}-${slug}`;
}

function normalizeTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return values
    .map((tag) => readString(tag, "", 48))
    .filter(Boolean)
    .slice(0, 20);
}

function validateUrl(value: string, label: string, required = false): string | undefined {
  if (!value) {
    if (required) throw new Error(`${label} is required`);
    return undefined;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Unsupported protocol");
    return parsed.toString();
  } catch {
    throw new Error(`${label} must be a valid HTTP URL`);
  }
}

function validateYouTubeVideoUrl(value: string, label: string): string {
  const safeUrl = validateUrl(value, label, true)!;
  const parsed = new URL(safeUrl);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  let videoId = "";

  if (host === "youtu.be") {
    videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
  } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    videoId = parsed.searchParams.get("v") || "";
    if (!videoId) {
      const segments = parsed.pathname.split("/").filter(Boolean);
      const videoRoute = segments.findIndex((segment) => ["embed", "shorts", "live"].includes(segment));
      if (videoRoute >= 0) videoId = segments[videoRoute + 1] || "";
    }
  }

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error(`${label} must be a YouTube video link`);
  }

  // Keep saved links secure while preserving the URL format entered by admins.
  parsed.protocol = "https:";
  return parsed.toString();
}

function normalizeVideo(value: unknown, index: number): TutorialVideoDocument {
  if (!isRecord(value)) throw new Error(`Video ${index + 1} must be an object`);
  const title = readString(value.title, "", 180);
  if (!title) throw new Error(`Video ${index + 1} needs a title`);
  const youtubeUrl = validateYouTubeVideoUrl(readString(value.youtubeUrl, "", 1_000), `Video ${index + 1} YouTube URL`);
  const videoId = normalizeId(value.videoId, title, "video");
  return {
    videoId,
    title,
    description: readString(value.description, "", 1_200),
    youtubeUrl,
    thumbnailUrl: validateUrl(readString(value.thumbnailUrl, "", 1_000), `Video ${index + 1} thumbnail URL`),
    duration: readString(value.duration, "", 40) || undefined,
    tags: normalizeTags(value.tags),
    release: value.release === "legacy" ? "legacy" : "current",
    featured: readBoolean(value.featured, false),
    enabled: readBoolean(value.enabled, true),
    sortOrder: readNumber(value.sortOrder, index),
  };
}

function normalizeVideos(value: unknown): TutorialVideoDocument[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const videos = value.slice(0, 100).map(normalizeVideo);
  for (const video of videos) {
    if (seen.has(video.videoId)) throw new Error(`Video IDs must be unique: ${video.videoId}`);
    seen.add(video.videoId);
  }
  return videos.sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title));
}

export function normalizeTutorialPlaylistInput(
  input: TutorialPlaylistInput,
  adminUserId: string,
  existing?: TutorialPlaylistDocument | null,
): TutorialPlaylistDocument {
  const now = new Date().toISOString();
  const title = readString(input.title, existing?.title ?? "", 180);
  if (!title) throw new Error("Playlist title is required");
  const playlistId = normalizeId(input.playlistId ?? existing?.playlistId, title, "playlist");

  return {
    ...(existing ?? {}),
    playlistId,
    youtubePlaylistUrl: validateUrl(readString(input.youtubePlaylistUrl, existing?.youtubePlaylistUrl ?? "", 1_000), "YouTube playlist URL"),
    title,
    description: readString(input.description, existing?.description ?? "", 1_200),
    thumbnailUrl: validateUrl(readString(input.thumbnailUrl, existing?.thumbnailUrl ?? "", 1_000), "Playlist thumbnail URL"),
    category: readString(input.category, existing?.category ?? "General", 80) || "General",
    tags: normalizeTags(input.tags ?? existing?.tags),
    featured: readBoolean(input.featured, existing?.featured ?? false),
    enabled: readBoolean(input.enabled, existing?.enabled ?? true),
    sortOrder: readNumber(input.sortOrder, existing?.sortOrder ?? 0),
    videos: normalizeVideos(input.videos ?? existing?.videos ?? []),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdBy: existing?.createdBy ?? adminUserId,
    updatedBy: adminUserId,
  };
}

export function serializeTutorialPlaylist(playlist: TutorialPlaylistDocument): Record<string, unknown> {
  return {
    ...playlist,
    _id: playlist._id && typeof playlist._id === "object" && "toString" in playlist._id
      ? String(playlist._id.toString())
      : playlist._id,
  };
}

export async function listTutorialPlaylists(options: { includeDisabled?: boolean } = {}): Promise<TutorialPlaylistDocument[]> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  return db
    .collection<TutorialPlaylistDocument>(COLLECTIONS.TUTORIAL_PLAYLISTS)
    .find(options.includeDisabled ? {} : { enabled: true })
    .sort({ featured: -1, sortOrder: 1, title: 1 })
    .toArray();
}

export async function upsertTutorialPlaylist(
  input: TutorialPlaylistInput,
  adminUserId: string,
): Promise<TutorialPlaylistDocument> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const collection = db.collection<TutorialPlaylistDocument>(COLLECTIONS.TUTORIAL_PLAYLISTS);
  const requestedId = readString(input.playlistId, "", 120);
  const existing = requestedId
    ? await collection.findOne({ playlistId: normalizeId(requestedId, requestedId, "playlist") })
    : null;
  const doc = normalizeTutorialPlaylistInput(input, adminUserId, existing);

  await collection.updateOne(
    { playlistId: doc.playlistId },
    {
      $set: {
        youtubePlaylistUrl: doc.youtubePlaylistUrl,
        title: doc.title,
        description: doc.description,
        thumbnailUrl: doc.thumbnailUrl,
        category: doc.category,
        tags: doc.tags,
        featured: doc.featured,
        enabled: doc.enabled,
        sortOrder: doc.sortOrder,
        videos: doc.videos,
        updatedAt: doc.updatedAt,
        updatedBy: doc.updatedBy,
      },
      $setOnInsert: {
        playlistId: doc.playlistId,
        createdAt: doc.createdAt,
        createdBy: doc.createdBy,
      },
    },
    { upsert: true },
  );

  const saved = await collection.findOne({ playlistId: doc.playlistId });
  if (!saved) throw new Error("Failed to save tutorial playlist");
  return saved;
}

export async function setTutorialPlaylistEnabled(
  playlistId: string,
  enabled: boolean,
  adminUserId: string,
): Promise<TutorialPlaylistDocument | null> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  return db.collection<TutorialPlaylistDocument>(COLLECTIONS.TUTORIAL_PLAYLISTS).findOneAndUpdate(
    { playlistId },
    { $set: { enabled, updatedAt: new Date().toISOString(), updatedBy: adminUserId } },
    { returnDocument: "after" },
  );
}

export async function deleteTutorialPlaylist(playlistId: string): Promise<boolean> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const result = await db.collection<TutorialPlaylistDocument>(COLLECTIONS.TUTORIAL_PLAYLISTS).deleteOne({ playlistId });
  return Boolean(result.deletedCount && result.deletedCount > 0);
}

export function unescapeXml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractYouTubePlaylistId(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const list = url.searchParams.get("list");
    if (list && /^[A-Za-z0-9_-]+$/.test(list)) return list;
  } catch {}
  const match = trimmed.match(/[?&]list=([A-Za-z0-9_-]+)/i);
  if (match && match[1]) return match[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

export async function fetchYouTubePlaylistVideos(urlOrId: string): Promise<{
  playlistId: string;
  youtubePlaylistUrl: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videos: TutorialVideoDocument[];
}> {
  const playlistId = extractYouTubePlaylistId(urlOrId);
  if (!playlistId) throw new Error("Invalid YouTube playlist URL or ID. Please provide a link with ?list=...");
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`;
  const res = await fetch(feedUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("YouTube playlist not found. Make sure the playlist is set to Public or Unlisted on YouTube.");
    }
    throw new Error(`YouTube returned status ${res.status}`);
  }
  const xml = await res.text();
  const titleMatch = xml.match(/<feed[^>]*>[\s\S]*?<title>([^<]+)<\/title>/);
  const playlistTitle = unescapeXml(titleMatch ? titleMatch[1] : "").trim() || "YouTube Playlist";

  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;
  const videos: TutorialVideoDocument[] = [];
  let sortOrder = 0;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const videoId = (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1] || "";
    const title = unescapeXml((entry.match(/<title>([^<]+)<\/title>/) || [])[1] || "").trim();
    const desc = unescapeXml((entry.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || "").trim();
    const thumb = (entry.match(/<media:thumbnail[^>]+url="([^"]+)"/) || [])[1] || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");
    if (videoId && title) {
      videos.push({
        videoId,
        title,
        description: desc.slice(0, 1000),
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnailUrl: thumb,
        duration: "",
        tags: [],
        release: "current",
        featured: false,
        enabled: true,
        sortOrder: sortOrder++,
      });
    }
  }

  if (videos.length === 0) {
    throw new Error("No videos found in this playlist. Ensure the playlist is Public or Unlisted on YouTube.");
  }

  return {
    playlistId: `playlist-${playlistId.toLowerCase()}`,
    youtubePlaylistUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
    title: playlistTitle,
    description: `Complete tutorial series (${videos.length} videos).`,
    thumbnailUrl: videos[0]?.thumbnailUrl || "",
    videos,
  };
}
