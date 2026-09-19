import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, upsertAppSettings } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

/**
 * GET /api/admin/app-settings
 *
 * Admin-only endpoint to read current app settings (full document).
 */
export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser || authUser.mongoUser.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const settings = await getAppSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Get app settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/app-settings
 *
 * Admin-only endpoint to update app settings (force updates, emergency lock, etc.).
 * Merges provided fields into the existing app_settings document.
 */
export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser || authUser.mongoUser.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const allowed = [
      "latestVersion",
      "minimumSupportedVersion",
      "forceUpdatesEnabled",
      "emergencyLock",
      "emergencyLockDelay",
      "gracePeriodHours",
      "updateMessage",
      "emergencyLockMessage",
      "windowsDownloadUrl",
      "macDownloadUrl",
      "linuxDownloadUrl",
      "releaseNotesUrl",
      "policyPublishedAt",
      "emergencyLockEnabledAt",
      "emergencyLockEffectiveAt",
    ];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await upsertAppSettings(patch);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update app settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
