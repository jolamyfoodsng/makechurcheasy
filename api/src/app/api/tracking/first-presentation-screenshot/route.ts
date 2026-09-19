/**
 * POST /api/tracking/first-presentation-screenshot
 *
 * Ingests an OBS screenshot taken on the user's first presentation,
 * uploads it to Cloudflare R2, and links it to the user's activation milestones.
 */

import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { getAuthUserFromRequest } from "@/lib/auth";
import { COLLECTIONS } from "@/lib/db";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT?.trim(),
  credentials: {
    accessKeyId: (process.env.R2_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || "").trim(),
  },
});

function getCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, X-Device-Id, X-MCE-Device-Id, X-Device-Secret, X-App-Version, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(req),
  });
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req);

  try {
    const authUser = await getAuthUserFromRequest(req).catch(() => null);
    let resolvedUserId = authUser?.mongoUser?._id?.toString() || null;

    const body = (await req.json().catch(() => ({}))) as {
      screenshot?: string;
      type?: string;
      details?: Record<string, unknown>;
      userId?: string;
    };

    if (!resolvedUserId && typeof body.userId === "string" && body.userId.trim()) {
      resolvedUserId = body.userId.trim();
    }

    if (!resolvedUserId) {
      const deviceIdHeader =
        req.headers.get("x-device-id") || req.headers.get("x-mce-device-id");
      if (deviceIdHeader) {
        const client = await clientPromise;
        const db = client.db();
        const device = await db
          .collection("devices")
          .findOne({ deviceId: deviceIdHeader.trim() });
        if (device?.userId) {
          resolvedUserId = device.userId.toString();
        }
      }
    }

    if (!resolvedUserId) {
      return NextResponse.json(
        { error: "User identity required" },
        { status: 401, headers: corsHeaders },
      );
    }

    const { screenshot, type = "presentation", details = {} } = body;
    if (!screenshot || typeof screenshot !== "string") {
      return NextResponse.json(
        { error: "Screenshot data is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Strip data URL prefix if present
    const cleanBase64 = screenshot.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
    const imageBuffer = Buffer.from(cleanBase64, "base64");

    if (!imageBuffer || imageBuffer.length === 0) {
      return NextResponse.json(
        { error: "Invalid image data" },
        { status: 400, headers: corsHeaders },
      );
    }

    const bucket = (process.env.R2_BUCKET_NAME || "").trim();
    const baseUrl = (process.env.R2_PUBLIC_BASE_URL || "").trim();
    const prefix = (process.env.R2_PREFIX || "").trim();
    const timestamp = Date.now();
    const key = `${prefix}first-presentations/${resolvedUserId}-${timestamp}.jpg`;

    let screenshotUrl = "";

    if (
      bucket &&
      baseUrl &&
      process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY
    ) {
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: imageBuffer,
          ContentType: "image/jpeg",
        }),
      );
      screenshotUrl = `${baseUrl}/${key}`;
    } else {
      // Fallback to storing small data URL if R2 is not configured
      screenshotUrl = `data:image/jpeg;base64,${cleanBase64.slice(0, 5000)}...`;
    }

    const client = await clientPromise;
    const db = client.db();
    const objectId = ObjectId.isValid(resolvedUserId)
      ? new ObjectId(resolvedUserId)
      : null;

    const nowIso = new Date().toISOString();

    if (objectId) {
      // Update user milestones
      await db.collection("users").updateOne(
        { _id: objectId },
        {
          $set: {
            "activationMilestones.firstPresentation": true,
            "activationMilestones.firstPresentationScreenshotUrl": screenshotUrl,
            "activationMilestones.firstPresentationType": type,
            lastActive: nowIso,
          },
        },
      );

      // Clean up any historical duplicate first_presentation activity events for this user
      // Keep only the earliest one, and attach the screenshotUrl to it
      const eventsCol = db.collection(COLLECTIONS.ACTIVITY_EVENTS);
      const userPresentationEvents = await eventsCol
        .find({
          $or: [
            { userId: resolvedUserId },
            { userId: objectId },
            { userId: objectId.toString() },
          ],
          event: "first_presentation",
        })
        .sort({ timestamp: 1, _id: 1 })
        .toArray();

      if (userPresentationEvents.length > 0) {
        const firstEvent = userPresentationEvents[0];
        // Attach screenshotUrl to earliest event
        await eventsCol.updateOne(
          { _id: firstEvent._id },
          {
            $set: {
              "properties.screenshotUrl": screenshotUrl,
              "properties.presentationType": type,
              "properties.details": details,
            },
          },
        );

        // Remove subsequent duplicate first_presentation rows if any
        if (userPresentationEvents.length > 1) {
          const duplicateIds = userPresentationEvents.slice(1).map((e) => e._id);
          await eventsCol.deleteMany({ _id: { $in: duplicateIds } });
        }
      } else {
        // If no first_presentation event was logged yet, insert one now
        await eventsCol.insertOne({
          event: "first_presentation",
          userId: resolvedUserId,
          properties: {
            source: "screenshot_upload",
            presentationType: type,
            screenshotUrl,
            details,
          },
          timestamp: new Date(),
          createdAt: nowIso,
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        url: screenshotUrl,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[first-presentation-screenshot] Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload screenshot" },
      { status: 500, headers: corsHeaders },
    );
  }
}
