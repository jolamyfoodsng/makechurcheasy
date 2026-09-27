import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { calculateUserCredits } from "@/lib/credits";
import { logAuditEvent } from "@/lib/auditLog";
import {
  adminAdjustTranscriptionBalance,
  getTranscriptionBalanceSummary,
} from "@/lib/transcriptionCredits";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

/**
 * GET /api/admin/users/[id]/credits
 *
 * Returns current credit balance, separate transcription balance (included vs purchased hours),
 * and recent transaction history for this user.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const { id } = await params;

    const client = await clientPromise;
    const db = client.db();

    let targetUser = null;
    try {
      targetUser = await db.collection("users").findOne({ _id: new ObjectId(id) });
    } catch {
      targetUser = await db.collection("users").findOne({ _id: id as any });
    }

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [legacyCredits, transcriptionBalance, recentTransactions] = await Promise.all([
      calculateUserCredits(id, targetUser),
      getTranscriptionBalanceSummary(id, targetUser),
      db
        .collection("transcription_transactions")
        .find({ userId: id })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),
    ]);

    return NextResponse.json({
      credits: legacyCredits.credits,
      transcriptionBalance,
      recentTransactions,
    });
  } catch (error) {
    console.error("[api/admin/users/[id]/credits GET] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/users/[id]/credits
 *
 * Admin can INCREASE (+), DECREASE (-), or SET (=) a user's transcription & AI credits.
 * Supports specifying in hours, credits, or seconds, and targeting either top-up balance
 * (purchased hours, never expires) or included plan allowance.
 *
 * Body:
 * {
 *   amount: number,            // positive or negative
 *   unit?: "hours" | "credits" | "seconds", // default: "credits"
 *   action?: "increase" | "decrease" | "set", // default: inferred from amount sign
 *   target?: "purchased" | "included" | "auto", // default: "auto"
 *   reason?: string
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      amount?: number;
      unit?: "hours" | "credits" | "seconds";
      action?: "increase" | "decrease" | "set";
      target?: "purchased" | "included" | "auto";
      reason?: string;
    };

    const {
      amount = 0,
      unit = "credits",
      action = amount >= 0 ? "increase" : "decrease",
      target = "auto",
      reason = "",
    } = body;

    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      return NextResponse.json(
        { error: "amount must be a valid number" },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db();

    let targetUser = null;
    try {
      targetUser = await db.collection("users").findOne({ _id: new ObjectId(id) });
    } catch {
      targetUser = await db.collection("users").findOne({ _id: id as any });
    }

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const beforeBalance = await getTranscriptionBalanceSummary(id, targetUser);

    const adjustmentResult = await adminAdjustTranscriptionBalance({
      userId: id,
      amount,
      unit,
      action,
      target,
      adminId: authResult.adminUserId,
      reason: reason || `Admin adjusted user balance (${action} ${Math.abs(amount)} ${unit})`,
    });

    const afterResult = await calculateUserCredits(id, targetUser);

    await logAuditEvent({
      adminId: authResult.adminUserId,
      action: action === "decrease" ? "credit_deduct" : "credit_grant",
      targetUserId: id,
      details: {
        action,
        unit,
        amount,
        target,
        reason,
        previousTotalHours: beforeBalance.totalAvailableHours,
        newTotalHours: adjustmentResult.balance.totalAvailableHours,
        previousCredits: beforeBalance.totalAvailableCredits,
        newCredits: adjustmentResult.balance.totalAvailableCredits,
      },
      timestamp: new Date(),
    });

    return NextResponse.json({
      success: true,
      credits: afterResult.credits,
      transcriptionBalance: adjustmentResult.balance,
      adjustedHours: adjustmentResult.adjustedHours,
      adjustedCredits: adjustmentResult.adjustedCredits,
      action: adjustmentResult.action,
      message: `${action === "decrease" ? "Decreased" : "Increased"} user balance by ${Math.abs(adjustmentResult.adjustedHours)} hrs (${Math.abs(adjustmentResult.adjustedCredits)} credits)`,
    });
  } catch (error) {
    console.error("[api/admin/users/[id]/credits POST] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
