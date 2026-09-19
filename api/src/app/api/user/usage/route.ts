/**
 * GET  /api/user/usage — Return the user's current usage counts
 * POST /api/user/usage — Upsert usage counts from the desktop app
 *
 * Auth: fb-token cookie (web) OR X-Device-Id header (desktop app).
 *
 * The desktop app syncs its IndexedDB counts to this endpoint periodically.
 * The web dashboard reads from this endpoint for the billing page.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getUserUsage, upsertUserUsage } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authUser.mongoUser._id.toString();
    const usage = await getUserUsage(userId);

    return NextResponse.json(usage || {
      userId,
      songs: 0,
      images: 0,
      videos: 0,
      themes: 0,
      lowerThirds: 0,
      devices: 0,
      bibleVersions: 0,
      lastSyncedAt: null,
    });
  } catch (error) {
    console.error("GET /api/user/usage error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authUser.mongoUser._id.toString();
    const body = await req.json();

    // Only accept known usage fields
    const allowed = ["songs", "images", "videos", "themes", "lowerThirds", "devices", "bibleVersions"];
    const patch: Record<string, number> = {};
    for (const key of allowed) {
      if (typeof body[key] === "number" && body[key] >= 0) {
        patch[key] = body[key];
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid usage fields provided" }, { status: 400 });
    }

    const usage = await upsertUserUsage(userId, {
      ...patch,
      lastSyncedAt: body.lastSyncedAt || new Date().toISOString(),
    });

    return NextResponse.json(usage);
  } catch (error) {
    console.error("POST /api/user/usage error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
