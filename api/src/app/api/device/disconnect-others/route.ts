import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { checkVersionGate } from "@/lib/versionGate";
import { resolveDeviceContext } from "@/lib/deviceRequest";
import { evictOtherActiveDevices } from "@/lib/deviceLimits";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-MCE-Device-Id, X-Device-Secret, X-App-Version",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/device/disconnect-others
 *
 * Allows an authenticated device to disconnect/log out other active devices
 * belonging to the same user account. Particularly useful on the Free plan
 * (which allows 1 device slot) when an account is opened on a new machine.
 *
 * Body (optional): { targetDeviceId?: string }
 * If targetDeviceId is omitted, all other active devices for this user are disconnected.
 */
export async function POST(req: NextRequest) {
  try {
    const blocked = await checkVersionGate(req);
    if (blocked) {
      for (const [k, v] of Object.entries(CORS_HEADERS)) blocked.headers.set(k, v);
      return blocked;
    }

    const resolved = await resolveDeviceContext(req, CORS_HEADERS, {
      transientOnDeviceAuthFailure: true,
    });
    if ("error" in resolved) return resolved.error;

    const { deviceId, userId } = resolved;
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const targetDeviceId = typeof body?.targetDeviceId === "string" ? body.targetDeviceId.trim() : null;

    const disconnectedCount = await evictOtherActiveDevices(
      userId,
      targetDeviceId
        ? { targetDeviceId }
        : { keepDeviceId: deviceId }
    );

    return NextResponse.json(
      {
        success: true,
        disconnectedCount,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[disconnect-others] Error:", err);
    return NextResponse.json(
      { error: "Failed to disconnect other devices" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
