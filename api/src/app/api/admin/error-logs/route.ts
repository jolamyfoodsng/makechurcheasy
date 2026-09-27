/**
 * GET /api/admin/error-logs — List and search system error logs for admin.
 *
 * Query params:
 *   ?page=1&limit=25&search=foo&userId=123&startDate=...&endDate=...
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getErrorLogs } from "@/lib/errorLog";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "25", 10);
    const search = url.searchParams.get("search") || undefined;
    const userId = url.searchParams.get("userId") || undefined;
    const startDate = url.searchParams.get("startDate") || undefined;
    const endDate = url.searchParams.get("endDate") || undefined;

    const result = await getErrorLogs({
      page,
      limit,
      search,
      userId,
      startDate,
      endDate,
    });

    return NextResponse.json({
      logs: result.logs,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
      todayCount: result.todayCount,
      uniqueUsersCount: result.uniqueUsersCount,
    });
  } catch (error) {
    console.error("[admin/error-logs] Error fetching error logs:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
