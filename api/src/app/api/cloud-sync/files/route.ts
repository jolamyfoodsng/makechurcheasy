import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  buildObjectKey,
  deleteObject,
  filesCollection,
  getCloudStorageLimitBytes,
  getCloudUsage,
  headObjectSize,
  isR2Configured,
  resolveCloudAccess,
  signDownload,
  signUpload,
} from "@/lib/cloudStorage";

async function authorize(req: NextRequest) {
  const authUser = await getAuthUserFromRequest(req);
  if (!authUser?.mongoUser?._id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  const access = await resolveCloudAccess(authUser.mongoUser);
  if (!access.allowed) {
    return {
      error: NextResponse.json({ error: "Cloud backup needs a Basic or Growth plan.", requiredPlan: "basic" }, { status: 403 }),
    } as const;
  }
  return { userId: authUser.mongoUser._id.toString(), plan: access.plan } as const;
}

// GET /api/cloud-sync/files — list backed-up pictures/videos (?download=1 adds temporary download links)
export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req);
    if ("error" in auth) return auth.error;
    const wantLinks = new URL(req.url).searchParams.get("download") === "1";
    const rows = await (await filesCollection()).find({ userId: auth.userId, status: "stored" }).toArray();
    const files = await Promise.all(
      rows.map(async (f) => ({
        id: String(f._id),
        fileKey: f.fileKey,
        name: f.name,
        kind: f.kind,
        sizeBytes: f.sizeBytes,
        downloadUrl: wantLinks ? await signDownload(f.objectKey).catch(() => undefined) : undefined,
      })),
    );
    return NextResponse.json({ files });
  } catch (error) {
    console.error("[cloud-sync/files] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/cloud-sync/files — { action: "presign" | "complete" }
export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req);
    if ("error" in auth) return auth.error;
    if (!isR2Configured()) {
      return NextResponse.json({ error: "Cloud file storage is not configured." }, { status: 503 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const files = await filesCollection();
    const now = new Date().toISOString();

    if (body?.action === "presign") {
      const fileKey = String(body.fileKey || "").slice(0, 300);
      const name = String(body.name || "file").slice(0, 200);
      const kind = body.kind === "video" ? "video" : body.kind === "image" ? "image" : null;
      const sizeBytes = Number(body.sizeBytes) || 0;
      const contentType = String(body.contentType || (kind === "video" ? "video/mp4" : "image/png")).slice(0, 100);
      if (!fileKey || !kind || sizeBytes <= 0) {
        return NextResponse.json({ error: "fileKey, kind and sizeBytes are required" }, { status: 400 });
      }
      if (sizeBytes > (kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
        return NextResponse.json({ error: `That ${kind} is too large to back up.`, code: "file_too_large" }, { status: 413 });
      }

      const existing = await files.findOne({ userId: auth.userId, fileKey });
      if (existing?.status === "stored" && existing.sizeBytes === sizeBytes) {
        return NextResponse.json({ exists: true, id: String(existing._id) });
      }

      const usage = await getCloudUsage(auth.userId);
      const limitBytes = getCloudStorageLimitBytes(auth.plan);
      const replaced = existing?.status === "stored" ? existing.sizeBytes : 0;
      if (usage.usedBytes - replaced + sizeBytes > limitBytes) {
        return NextResponse.json(
          { error: "Your cloud storage is full.", code: "storage_full", usedBytes: usage.usedBytes, limitBytes },
          { status: 413 },
        );
      }

      const objectKey = existing?.objectKey || buildObjectKey(auth.userId, name);
      await files.updateOne(
        { userId: auth.userId, fileKey },
        {
          $set: { name, kind, sizeBytes: existing?.status === "stored" ? existing.sizeBytes : sizeBytes, contentType, objectKey, updatedAt: now },
          $setOnInsert: { userId: auth.userId, fileKey, status: "pending", createdAt: now },
        },
        { upsert: true },
      );
      const saved = await files.findOne({ userId: auth.userId, fileKey });
      const uploadUrl = await signUpload(objectKey, contentType);
      return NextResponse.json({ exists: false, id: String(saved?._id), uploadUrl });
    }

    if (body?.action === "complete") {
      const fileKey = String(body.fileKey || "");
      const doc = await files.findOne({ userId: auth.userId, fileKey });
      if (!doc) return NextResponse.json({ error: "Unknown file" }, { status: 404 });
      const size = await headObjectSize(doc.objectKey);
      if (size === null) {
        return NextResponse.json({ error: "The upload did not arrive. Try again." }, { status: 409 });
      }
      await files.updateOne({ _id: doc._id as never }, { $set: { status: "stored", sizeBytes: size, updatedAt: now } });
      const usage = await getCloudUsage(auth.userId);
      return NextResponse.json({ success: true, usedBytes: usage.usedBytes });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[cloud-sync/files] POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/cloud-sync/files?fileKey=... — remove one backed-up file
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authorize(req);
    if ("error" in auth) return auth.error;
    const fileKey = new URL(req.url).searchParams.get("fileKey") || "";
    const files = await filesCollection();
    const doc = await files.findOne({ userId: auth.userId, fileKey });
    if (!doc) return NextResponse.json({ success: true });
    await deleteObject(doc.objectKey);
    await files.deleteOne({ _id: doc._id as never });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[cloud-sync/files] DELETE Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
