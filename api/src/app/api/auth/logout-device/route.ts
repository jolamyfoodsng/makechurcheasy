import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getAuthUserFromRequest } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Version, X-Device-Id",
};

const limiter = rateLimit({ windowMs: 60_000, max: 10 });

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const rateResult = limiter.check(req);
    if (!rateResult.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: CORS_HEADERS });
    }

    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS_HEADERS }
      );
    }
    const userId = authUser.mongoUser._id.toString();

    const { deviceId } = await req.json();

    if (!deviceId) {
      return NextResponse.json(
        { error: "deviceId is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    // Verify the device belongs to this user before deleting
    const device = await db.collection("devices").findOne({ deviceId });
    if (!device || device.userId !== userId) {
      return NextResponse.json(
        { error: "Device not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Soft-delete device — preserve record for analytics and audit history
    await db.collection("devices").updateOne(
      { deviceId },
      { $set: { status: "deleted", deletedAt: new Date() } }
    );

    // Remove from user's devices array if present
    await db.collection("users").updateOne(
      { _id: new (await import("mongodb")).ObjectId(userId) },
      { $pull: { devices: device._id.toString() } }
    );

    // Also clean up any pending login codes for this device
    await db.collection("loginCodes").deleteMany({ deviceId });

    return NextResponse.json(
      { success: true },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[logout-device] Error:", err);
    return NextResponse.json(
      { error: "Failed to logout device" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
