import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getDashboardConfig } from "@/lib/configService";

/**
 * GET /api/config/dashboard
 *
 * Admin-only endpoint. Returns the full platform settings
 * for the admin dashboard configuration view.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const config = await getDashboardConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error("Get dashboard config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
