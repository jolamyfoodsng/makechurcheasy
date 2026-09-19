import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { insertCreditTransaction } from "@/lib/db";
import { calculateUserCredits } from "@/lib/credits";
import { logAuditEvent } from "@/lib/auditLog";
import { CreditTransactionType } from "@/types/schemas";

/**
 * POST /api/admin/users/[id]/credits
 *
 * Grants credits to a user by inserting an admin_grant transaction.
 * The user's balance is then dynamically recalculated from all transactions.
 * No $inc on the user document — transaction history is the source of truth.
 *
 * Auth: Admin only (requireAdmin).
 *
 * Body: { amount, reason? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const { id } = await params;
    const body = await req.json() as { amount: number; reason?: string };
    const { amount, reason } = body;

    if (typeof amount !== "number" || amount <= 0 || !Number.isFinite(amount)) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 },
      );
    }

    // Get current balance before grant
    const { calculateUserCredits: calcBefore } = await import("@/lib/credits");

    // Fetch target user for credit calculation
    const client = await (await import("@/lib/mongodb")).default;
    const db = client.db();
    const { ObjectId } = await import("mongodb");
    const targetUser = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const beforeResult = await calcBefore(id, targetUser);

    // Insert admin_grant transaction (positive amount)
    await insertCreditTransaction({
      userId: id,
      type: CreditTransactionType.ADMIN_GRANT,
      source: "admin_adjustment",
      amount,
      description: reason || `Admin granted ${amount} credits`,
      metadata: {
        adminId: authResult.adminUserId,
        createdBy: `admin:${authResult.adminUserId}`,
        reason: reason || `Admin granted ${amount} credits`,
      },
      createdAt: new Date().toISOString(),
    });

    // Recalculate after grant
    const afterResult = await calculateUserCredits(id, targetUser);

    await logAuditEvent({
      adminId: authResult.adminUserId,
      action: "credit_grant",
      targetUserId: id,
      details: {
        amount,
        previousCredits: beforeResult.credits,
        newCredits: afterResult.credits,
      },
      timestamp: new Date(),
    });

    return NextResponse.json({
      credits: afterResult.credits,
      added: amount,
      message: `Added ${amount} credits`,
    });
  } catch (error) {
    console.error("Admin add credits error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
