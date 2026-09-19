import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getTrialSettings, upsertTrialSettings } from "@/lib/trialSettings";

/**
 * GET /api/admin/trial-settings
 *
 * Admin-only endpoint to read current trial settings.
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const settings = await getTrialSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Get trial settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/trial-settings
 *
 * Admin-only endpoint to update trial settings.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as Record<string, unknown>;
    const allowed = [
      "enableForNewUsers",
      "enableForExistingUsers",
      "defaultDurationDays",
      "sendExtensionEmails",
      "sendRestartEmails",
      "sendStopEmails",
    ];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await upsertTrialSettings(patch);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update trial settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
