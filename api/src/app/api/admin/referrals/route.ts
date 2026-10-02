import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getAdminReferralOverview, adminAssignReferral } from "@/lib/referrals";

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

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const body = (await req.json().catch(() => ({}))) as any;
    const { referrerUserId, referredUserId } = body || {};

    if (!referrerUserId || !referredUserId) {
      return NextResponse.json(
        { error: "Both referrerUserId and referredUserId are required" },
        { status: 400 },
      );
    }

    const result = await adminAssignReferral({
      referrerUserId,
      referredUserId,
    });

    return NextResponse.json({
      success: true,
      message: "Referral assigned successfully",
      ...result,
    });
  } catch (error: any) {
    console.error("[admin/referrals] POST error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to assign referral" },
      { status: 400 },
    );
  }
}

