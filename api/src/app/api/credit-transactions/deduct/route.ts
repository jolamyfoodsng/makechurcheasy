import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getPlanConfig, insertCreditTransaction } from "@/lib/db";
import { checkCredits, calculateUserCredits } from "@/lib/credits";
import { getAuthUserFromRequest } from "@/lib/auth";
import { apiLimiter } from "@/lib/rateLimit";
import { CreditTransactionType } from "@/types/schemas";
import { getEffectivePlan } from "@/lib/trial";
import {
  getFreeSpeechToScriptureLimitMinutes,
  getFreeSpeechToScriptureUsage,
} from "@/lib/speechToScriptureUsage";

/**
 * POST /api/credit-transactions/deduct
 *
 * Atomically checks and deducts credits using a MongoDB transaction.
 * Returns the new dynamically-calculated balance.
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
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
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
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const clientSession = client.startSession();

    try {
      // Check credits first (outside transaction — works on all MongoDB)
      const check = await checkCredits(userId, mongoUser, amount);
      if (!check.allowed) {
        return NextResponse.json(
          { error: "Insufficient credits", currentBalance: check.remaining, required: amount },
          { status: 402 }
        );
      }

      if (mongoUser.role !== "admin" && getEffectivePlan(mongoUser) === "free" && ["transcription", "speech_to_scripture"].includes(String(source).toLowerCase())) {
        const planConfig = await getPlanConfig();
        const transcriptionCost = planConfig.creditCosts.find((cost) => cost.name === "Speech-to-Scripture")?.cost || 1;
        const usage = await getFreeSpeechToScriptureUsage(db, userId, transcriptionCost);
        const dailyLimitMinutes = getFreeSpeechToScriptureLimitMinutes();
        const requestedMinutes = amount / (transcriptionCost > 0 ? transcriptionCost : 1);
        if (usage.usedMinutes + requestedMinutes > dailyLimitMinutes) {
          return NextResponse.json(
            {
              error: "Daily Speech to Scripture limit reached",
              reason: "daily_speech_limit",
              currentBalance: check.remaining,
              dailyLimitMinutes,
              dailyUsedMinutes: usage.usedMinutes,
              dailyRemainingSeconds: Math.max(0, Math.floor((dailyLimitMinutes - usage.usedMinutes) * 60)),
            },
            { status: 402 },
          );
        }
      }

      const txData = {
        userId,
        type: CreditTransactionType.USAGE,
        source,
        amount: -amount,
        description,
        metadata: metadata ?? {},
        createdAt: new Date().toISOString(),
      };

      // Try transactional insert (replica set / Atlas).
      // Falls back to plain insert for standalone MongoDB (local dev).
      try {
        await clientSession.startTransaction();
        await insertCreditTransaction(txData, clientSession);
        await clientSession.commitTransaction();
      } catch (txErr: any) {
        // Roll back any partially-started transaction
        try { await clientSession.abortTransaction(); } catch { /* ignore */ }

        if (txErr?.codeName === "IllegalOperation" || txErr?.message?.includes("replica set")) {
          // Standalone MongoDB — no transaction support, use plain insert
          await insertCreditTransaction(txData);
        } else {
          throw txErr;
        }
      }

      // Re-aggregate after commit for accurate balance
      const { credits } = await calculateUserCredits(userId, mongoUser);
      return NextResponse.json({ credits, deducted: amount });
    } finally {
      try { await clientSession.endSession(); } catch { /* ignore */ }
    }
  } catch (error) {
    console.error("Deduct credits error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
