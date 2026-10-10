import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getGraphicUsageSummaries, getGraphicUsageUsers } from "@/lib/broadcastGraphicUsage";

/**
 * GET /api/admin/broadcast-graphics/usage
 *   → { graphics: [{ graphicId, usersAdded, addsTotal, usersShown, shownTotal, lastUsedAt }] }
 * GET /api/admin/broadcast-graphics/usage?graphicId=<id>
 *   → { graphicId, users: [{ userId, name, email, churchName, plan, addedCount, shownCount, firstAddedAt, lastAddedAt, lastShownAt }] }
 *
 * Counts start from the desktop release that sends the usage events.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const graphicId = req.nextUrl.searchParams.get("graphicId")?.trim();
    if (graphicId) {
      const users = await getGraphicUsageUsers(graphicId);
      return NextResponse.json({ graphicId, users }, { headers: { "Cache-Control": "no-store" } });
    }
    const graphics = await getGraphicUsageSummaries();
    return NextResponse.json({ graphics }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/admin/broadcast-graphics/usage error:", error);
    const detail = process.env.NODE_ENV !== "production" && error instanceof Error ? error.message : undefined;
    return NextResponse.json({ error: "Failed to load graphic usage", ...(detail ? { detail } : {}) }, { status: 500 });
  }
}
