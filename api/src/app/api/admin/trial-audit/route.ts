import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getTrialAuditLog } from "@/lib/trialAudit";

/**
 * GET /api/admin/trial-audit
 *
 * Admin-only endpoint to view trial audit logs.
 * Optional query params: ?userId=xxx&limit=50
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    const logs = await getTrialAuditLog(userId, limit);
    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Get trial audit log error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
