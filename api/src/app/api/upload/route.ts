import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { getAuthUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

const uploadLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const ALLOWED_UPLOAD_TYPES = new Set(["logo", "favicon", "avatar", "announcements"]);
const EXTENSIONS_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/x-icon": "ico",
};

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT?.trim(),
  credentials: {
    accessKeyId: (process.env.R2_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || "").trim(),
  },
});

function normalizeUploadType(value: string | null): string {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (normalized === "announcement") return "announcements";
  return ALLOWED_UPLOAD_TYPES.has(normalized) ? normalized : "uploads";
}

function extensionForFile(file: File): string {
  const rawExt = file.name.split(".").pop()?.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return rawExt || EXTENSIONS_BY_MIME[file.type] || "png";
}

export async function POST(req: NextRequest) {
  try {
    const rl = uploadLimiter.check(req);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = normalizeUploadType(formData.get("type") as string | null);

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp", "image/x-icon"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Allowed: PNG, JPG, SVG, WebP, ICO" }, { status: 400 });
    }

    const maxSize = 5 * 1024 * 1024; // 5MB hard cap
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Max: 5MB" }, { status: 400 });
    }

    const ext = extensionForFile(file);
    const prefix = (process.env.R2_PREFIX || "").trim();
    const key = `${prefix}${type}/${nanoid(8)}.${ext}`;
    const bucket = (process.env.R2_BUCKET_NAME || "").trim();
    const baseUrl = (process.env.R2_PUBLIC_BASE_URL || "").trim();
    if (!bucket || !baseUrl || !process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      return NextResponse.json({ error: "Cloudflare R2 storage is not configured." }, { status: 500 });
    }

    const bytes = await file.arrayBuffer();

    console.log("[upload] bucket:", JSON.stringify(bucket), "key:", key);

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: file.type || "image/png",
      })
    );

    const url = `${baseUrl}/${key}`;
    return NextResponse.json({ url });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
