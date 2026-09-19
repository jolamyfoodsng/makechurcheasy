import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getPlatformSettings, updatePlatformSection, reseedPlatformSettings } from "@/lib/platformSettings";

const VALID_SECTIONS = [
  "appUpdates",
  "trial",
  "credits",
  "ambassador",
  "earlyAccess",
  "authentication",
  "notifications",
  "emailBranding",
  "storage",
  "security",
  "system",
  "featureFlags",
] as const;

type SectionName = (typeof VALID_SECTIONS)[number];

/**
 * GET /api/admin/platform-settings
 *
 * Returns the full platform settings document.
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const settings = await getPlatformSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Get platform settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/platform-settings
 *
 * Update a single section. Body: { section: string, data: {...} }
 * Only the specified section is updated via $set.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { section, data } = body as { section: string; data: Record<string, unknown> };

    if (!section || !data) {
      return NextResponse.json(
        { error: "section and data are required" },
        { status: 400 }
      );
    }

    if (!VALID_SECTIONS.includes(section as SectionName)) {
      return NextResponse.json(
        { error: `Invalid section. Must be one of: ${VALID_SECTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const updated = await updatePlatformSection(
      section as SectionName,
      data,
      auth.adminUserId
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update platform settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/platform-settings
 *
 * Delete the settings document and re-seed with fresh defaults.
 * Use for schema migrations when old data shapes are incompatible.
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const settings = await reseedPlatformSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("Reseed platform settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
