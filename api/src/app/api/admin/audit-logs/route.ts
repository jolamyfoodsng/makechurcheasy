/**
 * GET /api/admin/audit-logs — List audit logs with pagination and filtering.
 *
 * Query params: ?page=1&limit=25&action=all|plan_change|credit_grant|ambassador_grant|...
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getAuditLogs } from "@/lib/auditLog";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "25", 10);
    const action = url.searchParams.get("action") || "all";

    const result = await getAuditLogs({ page, limit, action });

    return NextResponse.json({
      logs: result.logs,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    });
  } catch (error) {
    console.error("Audit logs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
