import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { checkVersionGate } from "@/lib/versionGate";
import { extractDeviceInfo } from "@/lib/deviceInfo";
import { getDeviceIdFromRequest } from "@/lib/deviceRequest";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-MCE-Device-Id, X-Device-Secret, X-App-Version",
};

/**
 * Check if a device still exists.
 * GET /api/device/check?deviceId=xxx
 *
 * No auth required — the desktop app doesn't have an Auth.js session.
 * Used by the desktop app to detect if its device was removed from the web.
 *
 * Also enforces minimum version — old versions are rejected with 403.
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  // Block old desktop app versions
  const blocked = await checkVersionGate(req);
  if (blocked) {
    for (const [k, v] of Object.entries(CORS_HEADERS)) blocked.headers.set(k, v);
    return blocked;
  }

  const deviceId = getDeviceIdFromRequest(req);
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId required" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const client = await clientPromise;
    const db = client.db();
    const device = await db.collection("devices").findOne({ deviceId });
    const exists = !!device && device.status !== "deleted";
    if (device && exists) {
      const { appVersion, appPlatform } = extractDeviceInfo(req);
      await db.collection("devices").updateOne(
        { deviceId },
        { $set: { lastSeen: new Date(), appVersion, appPlatform } }
      );
    }
    return NextResponse.json({ exists }, { headers: CORS_HEADERS });
  } catch {
    return NextResponse.json({ exists: true }, { headers: CORS_HEADERS });
  }
}
