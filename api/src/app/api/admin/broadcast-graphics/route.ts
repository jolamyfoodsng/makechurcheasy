import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  listBroadcastGraphics,
  publishGraphicPackage,
  serializeForAdmin,
} from "@/lib/broadcastGraphics";

/** GET — every graphic: uploaded packages first, then the ones bundled with the app. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const graphics = await listBroadcastGraphics();
    return NextResponse.json({ graphics: graphics.map(serializeForAdmin) });
  } catch (error) {
    console.error("GET /api/admin/broadcast-graphics error:", error);
    return NextResponse.json({ error: "Failed to load broadcast graphics" }, { status: 500 });
  }
}

/**
 * POST — publish a graphic package (new, or a new version of an existing package).
 * Body: { package: {...mce-graphic@1...}, status?, tiers?, replaceId? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const doc = await publishGraphicPackage(
      body.package ?? body,
      { status: body.status, tiers: body.tiers, replaceId: typeof body.replaceId === "string" ? body.replaceId : undefined },
      auth.adminUserId,
    );
    return NextResponse.json({ success: true, graphic: serializeForAdmin(doc) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish the graphic";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
