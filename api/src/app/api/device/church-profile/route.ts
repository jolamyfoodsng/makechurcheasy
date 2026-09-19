import { NextRequest, NextResponse } from "next/server";
import { getChurchProfile } from "@/lib/db";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

/**
 * Device-authenticated church profile endpoint.
 *
 * The desktop app doesn't have Firebase session cookies, so it authenticates
 * via userId + deviceId (both obtained during the pairing flow and stored
 * securely in the Tauri store).
 *
 * The OBS dock only has deviceId (from the URL), so we also support
 * deviceId-only access — the device record contains the userId.
 *
 * GET /api/device/church-profile
 * Headers: X-Device-Id (required), X-User-Id (optional if deviceId provided)
 */

export async function GET(req: NextRequest) {
  try {
    const deviceId = req.headers.get("x-device-id");
    const userId = req.headers.get("x-user-id");

    if (!deviceId) {
      return NextResponse.json({ error: "Missing device credentials" }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    // Look up the device record — it always contains userId
    const device = await db.collection("devices").findOne(
      userId ? { userId, deviceId } : { deviceId }
    );

    if (!device) {
      return NextResponse.json({ error: "Invalid device" }, { status: 403 });
    }

    // Update lastSeen
    await db.collection("devices").updateOne(
      { _id: device._id },
      { $set: { lastSeen: new Date() } }
    );

    // Use userId from device record if not provided in headers
    const resolvedUserId = userId || device.userId;
    const profile = await getChurchProfile(resolvedUserId);
    return NextResponse.json(profile || null);
  } catch (error) {
    console.error("Device church profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
