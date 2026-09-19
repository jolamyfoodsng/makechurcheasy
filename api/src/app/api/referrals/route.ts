import { NextRequest, NextResponse } from "next/server";
import { AuthError, getAuthUserFromRequest } from "@/lib/auth";
import {
  applyReferralCode,
  dismissReferralPrompt,
  getReferralDashboard,
} from "@/lib/referrals";

async function requireCurrentUserId(req: NextRequest): Promise<string> {
  const authUser = await getAuthUserFromRequest(req);
  if (!authUser?.mongoUser?._id) {
    throw new AuthError("Unauthorized");
  }
  return authUser.mongoUser._id.toString();
}

function referralErrorStatus(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("not found")) return 404;
  if (lower.includes("own referral") || lower.includes("already")) return 409;
  if (lower.includes("enter") || lower.includes("invalid")) return 400;
  return 500;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireCurrentUserId(req);
    const dashboard = await getReferralDashboard(userId);
    return NextResponse.json(dashboard);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[referrals] GET error:", error);
    return NextResponse.json({ error: "Failed to load referrals" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireCurrentUserId(req);
    const body = (await req.json().catch(() => ({}))) as {
      code?: string;
      action?: "apply" | "dismiss";
    };

    if (body.action === "dismiss") {
      const skippedAt = await dismissReferralPrompt(userId);
      return NextResponse.json({ success: true, skippedAt });
    }

    const result = await applyReferralCode(userId, body.code || "");
    return NextResponse.json({
      success: true,
      alreadyApplied: result.alreadyApplied,
      referral: result.referral,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = error?.message || "Could not apply referral code";
    return NextResponse.json(
      { error: message },
      { status: referralErrorStatus(message) },
    );
  }
}
