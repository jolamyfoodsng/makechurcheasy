import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getPlanConfig, insertCreditTransaction } from "@/lib/db";
import { checkCredits, calculateUserCredits } from "@/lib/credits";
import { getAuthUserFromRequest } from "@/lib/auth";
import { apiLimiter } from "@/lib/rateLimit";
import { CreditTransactionType } from "@/types/schemas";
import { getEffectivePlan } from "@/lib/trial";
import {
  getFreeSpeechToScriptureUsage,
} from "@/lib/speechToScriptureUsage";
import { deductTranscriptionSeconds } from "@/lib/transcriptionCredits";

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
    const db = client.db();
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
        const requestedMinutes = amount / (transcriptionCost > 0 ? transcriptionCost : 1);
        const dailyExceeded = usage.dailyUsedMinutes + requestedMinutes > usage.dailyLimitMinutes;
        const weeklyExceeded = usage.weeklyUsedMinutes + requestedMinutes > usage.weeklyLimitMinutes;
        if (dailyExceeded || weeklyExceeded) {
          return NextResponse.json(
            {
              error: dailyExceeded
                ? "Daily Speech to Scripture limit reached"
                : "Weekly Speech to Scripture limit reached",
              reason: dailyExceeded ? "daily_speech_limit" : "weekly_speech_limit",
              currentBalance: check.remaining,
              dailyLimitMinutes: usage.dailyLimitMinutes,
              dailyUsedMinutes: usage.dailyUsedMinutes,
              dailyRemainingSeconds: usage.dailyRemainingSeconds,
              weeklyLimitMinutes: usage.weeklyLimitMinutes,
              weeklyUsedMinutes: usage.weeklyUsedMinutes,
              weeklyRemainingSeconds: usage.weeklyRemainingSeconds,
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

      // Sync transcription balance in seconds for transcription events
      if (["transcription", "speech_to_scripture"].includes(String(source).toLowerCase()) && getEffectivePlan(mongoUser) !== "free") {
        const seconds = typeof metadata?.durationSec === "number" && metadata.durationSec > 0
          ? metadata.durationSec
          : amount * 60;
        const requestId = typeof metadata?.requestId === "string" ? metadata.requestId : undefined;
        await deductTranscriptionSeconds({
          userId,
          seconds,
          requestId,
          description,
          metadata,
          mongoUser,
        }).catch((err) => console.warn("[deduct route] Transcription balance sync warning:", err));
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
