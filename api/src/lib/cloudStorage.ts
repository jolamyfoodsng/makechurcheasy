/**
 * cloudStorage.ts — Cloud backup storage: plan limits, usage and the R2 file store.
 *
 * The backup itself (a JSON document, `cloud_backups`) is small. Pictures and videos
 * are stored as files in Cloudflare R2 and tracked in `cloud_files`. Usage is always
 * computed here on the server (backup JSON + stored files), never taken from the app.
 */

import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getPlanConfig } from "@/lib/db";
import { resolveEffectivePlan, type EffectivePlan } from "@/lib/trial";

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

/**
 * Cloud storage per plan. Source of truth (not the admin Plan Config, whose production
 * values are older): Free 500 MB, Basic 5 GB, Growth 20 GB, trial counts as Basic.
 * Free cannot back up to the cloud; its number is shown so the app can display it.
 */
export const CLOUD_STORAGE_LIMIT_BYTES: Record<EffectivePlan, number> = {
  free: 500 * MB,
  trial: 5 * GB,
  basic: 5 * GB,
  growth: 20 * GB,
};

export const MAX_IMAGE_BYTES = 25 * MB;
export const MAX_VIDEO_BYTES = 2 * GB;

export function getCloudStorageLimitBytes(plan: EffectivePlan): number {
  return CLOUD_STORAGE_LIMIT_BYTES[plan] ?? CLOUD_STORAGE_LIMIT_BYTES.free;
}

/** Basic, Growth and trial can use cloud backup (the stored Plan Config may be older than this rule). */
export async function resolveCloudAccess(mongoUser: any): Promise<{ plan: EffectivePlan; allowed: boolean }> {
  const plan = resolveEffectivePlan(mongoUser);
  if (plan === "basic" || plan === "growth" || plan === "trial") return { plan, allowed: true };
  try {
    const config = await getPlanConfig();
    return { plan, allowed: Boolean(config.plans[plan]?.entitlements?.cloudSync) };
  } catch {
    return { plan, allowed: false };
  }
}

async function getDb() {
  const client = await (await import("@/lib/mongodb")).default;
  return client.db();
}

export interface CloudFileDoc {
  _id?: unknown;
  userId: string;
  fileKey: string;
  name: string;
  kind: "image" | "video";
  sizeBytes: number;
  contentType: string;
  objectKey: string;
  status: "pending" | "stored";
  createdAt: string;
  updatedAt: string;
}

export async function filesCollection() {
  return (await getDb()).collection<CloudFileDoc>("cloud_files");
}

export interface CloudUsage {
  backupBytes: number;
  imageBytes: number;
  videoBytes: number;
  fileBytes: number;
  usedBytes: number;
}

export async function getCloudUsage(userId: string): Promise<CloudUsage> {
  const db = await getDb();
  const backup = await db.collection("cloud_backups").findOne({ userId }, { projection: { sizeBytes: 1 } });
  const rows = await (await filesCollection())
    .aggregate<{ _id: string; total: number }>([
      { $match: { userId, status: "stored" } },
      { $group: { _id: "$kind", total: { $sum: "$sizeBytes" } } },
    ])
    .toArray();
  const imageBytes = rows.find((r) => r._id === "image")?.total || 0;
  const videoBytes = rows.find((r) => r._id === "video")?.total || 0;
  const backupBytes = Number(backup?.sizeBytes) || 0;
  const fileBytes = imageBytes + videoBytes;
  return { backupBytes, imageBytes, videoBytes, fileBytes, usedBytes: backupBytes + fileBytes };
}

// ── R2 ──────────────────────────────────────────────────────────────────────

function r2Config() {
  const bucket = (process.env.R2_BUCKET_NAME || "").trim();
  const endpoint = (process.env.R2_ENDPOINT || "").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return { bucket, endpoint, accessKeyId, secretAccessKey, prefix: (process.env.R2_PREFIX || "").trim() };
}

let client: S3Client | null = null;
function r2Client(): S3Client | null {
  const cfg = r2Config();
  if (!cfg) return null;
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }
  return client;
}

export function isR2Configured(): boolean {
  return r2Config() !== null;
}

/** Private object key: `<prefix>cloud-backup/<userId>/<random>-<safe name>`. */
export function buildObjectKey(userId: string, name: string): string {
  const cfg = r2Config();
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "file";
  const rand = Math.random().toString(36).slice(2, 10);
  return `${cfg?.prefix || ""}cloud-backup/${userId}/${Date.now().toString(36)}-${rand}-${safe}`;
}

export async function signUpload(objectKey: string, contentType: string): Promise<string> {
  const c = r2Client();
  const cfg = r2Config();
  if (!c || !cfg) throw new Error("Cloud file storage is not configured.");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(c, new PutObjectCommand({ Bucket: cfg.bucket, Key: objectKey, ContentType: contentType }), { expiresIn: 3600 });
}

export async function signDownload(objectKey: string): Promise<string> {
  const c = r2Client();
  const cfg = r2Config();
  if (!c || !cfg) throw new Error("Cloud file storage is not configured.");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(c, new GetObjectCommand({ Bucket: cfg.bucket, Key: objectKey }), { expiresIn: 3600 });
}

/** Size of an uploaded object, or null when it is not there. */
export async function headObjectSize(objectKey: string): Promise<number | null> {
  const c = r2Client();
  const cfg = r2Config();
  if (!c || !cfg) return null;
  try {
    const res = await c.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: objectKey }));
    return Number(res.ContentLength) || 0;
  } catch {
    return null;
  }
}

export async function deleteObject(objectKey: string): Promise<void> {
  const c = r2Client();
  const cfg = r2Config();
  if (!c || !cfg) return;
  try {
    await c.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: objectKey }));
  } catch (err) {
    console.warn("[cloudStorage] Could not delete object:", err);
  }
}
