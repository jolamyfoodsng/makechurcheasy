import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { insertCreditTransaction } from "@/lib/db";
import { checkCredits, calculateUserCredits } from "@/lib/credits";
import { getAuthUserFromRequest } from "@/lib/auth";
import { apiLimiter } from "@/lib/rateLimit";
import { CreditTransactionType } from "@/types/schemas";
import { randomUUID } from "crypto";

/**
 * POST /api/credit-transactions/reserve
 *
 * Atomically checks and deducts credits for a pending operation.
 * Returns a reservationId that MUST be passed to /commit on success
 * or /refund on failure.
 *
 * Admin users bypass all credit checks.
 * Unlimited plans (-1) bypass all credit checks.
 *
 * Auth: fb-token cookie (web) OR X-Device-Id header (desktop app).
 *
 * Body: { amount, source, description, metadata? }
 */
export async function POST(req: NextRequest) {
  try {
    const rl = apiLimiter.check(req);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();
    const mongoUser = authUser.mongoUser;

    const body = await req.json();
    const { amount, source, description, metadata } = body;

    if (typeof amount !== "number" || amount <= 0 || !source || !description) {
      return NextResponse.json(
        { error: "amount (>0), source, and description are required" },
        { status: 400 },
      );
    }

    // Admin / unlimited bypass — still create a reservation for tracking
    const check = await checkCredits(userId, mongoUser, amount);
    if (!check.allowed) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          currentBalance: check.remaining,
          required: amount,
        },
        { status: 402 },
      );
    }

    const reservationId = randomUUID();

    const txData = {
      userId,
      type: CreditTransactionType.USAGE,
      source,
      amount: -amount,
      description,
      metadata: {
        ...(metadata ?? {}),
        reservationId,
        committed: false,
      },
      createdAt: new Date().toISOString(),
    };

    await insertCreditTransaction(txData);

    // Re-aggregate for accurate balance
    const { credits } = await calculateUserCredits(userId, mongoUser);
    return NextResponse.json({ credits, deducted: amount, reservationId });
  } catch (error) {
    console.error("Reserve credits error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
