import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getAdminReferralOverview } from "@/lib/referrals";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 500;
    const overview = await getAdminReferralOverview(Number.isFinite(limit) ? limit : 500);

    return NextResponse.json(overview);
  } catch (error) {
    console.error("[admin/referrals] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load referrals" },
      { status: 500 },
    );
  }
}
