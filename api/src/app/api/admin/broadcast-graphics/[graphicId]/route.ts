import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  deleteBroadcastGraphic,
  serializeForAdmin,
  updateBroadcastGraphicSettings,
} from "@/lib/broadcastGraphics";

/** PATCH — change status (active / paused / hidden), tiers, order, or a package's name / category. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ graphicId: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { graphicId } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const doc = await updateBroadcastGraphicSettings(decodeURIComponent(graphicId), body, auth.adminUserId);
    if (!doc) return NextResponse.json({ error: "Graphic not found" }, { status: 404 });
    return NextResponse.json({ success: true, graphic: serializeForAdmin(doc) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update the graphic";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE — remove an uploaded package, or reset a bundled graphic to its defaults. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ graphicId: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { graphicId } = await params;
    const ok = await deleteBroadcastGraphic(decodeURIComponent(graphicId));
    if (!ok) return NextResponse.json({ error: "Graphic not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete the graphic";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
