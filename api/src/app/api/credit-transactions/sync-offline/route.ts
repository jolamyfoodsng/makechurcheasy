import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getPlanConfig, insertCreditTransaction } from "@/lib/db";
import { checkCredits, calculateUserCredits } from "@/lib/credits";
import { getAuthUserFromRequest } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { CreditTransactionType } from "@/types/schemas";
import { getEffectivePlan } from "@/lib/trial";
import {
  getFreeSpeechToScriptureLimitMinutes,
  getFreeSpeechToScriptureUsage,
} from "@/lib/speechToScriptureUsage";

const limiter = rateLimit({ windowMs: 60_000, max: 30 });

/**
 * POST /api/credit-transactions/sync-offline
 *
 * Syncs a single offline credit transaction to the server.
 * Used when the desktop app reconnects after being offline.
 *
 * Each transaction is validated and deducted atomically via MongoDB session.
 * Duplicate transactionIds are rejected (idempotent).
 *
 * Admin users bypass all credit checks.
 * Unlimited plans (-1) bypass all credit checks.
 *
 * Auth: X-Device-Id header (desktop app) OR fb-token cookie.
 * Rate limit: 30 req/min per IP.
 *
 * Body: { transactionId, feature, amount, description }
 */
export async function POST(req: NextRequest) {
  try {
    const rl = limiter.check(req);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();
    const mongoUser = authUser.mongoUser;

    const body = await req.json();
    const { transactionId, feature, amount, description } = body;

    if (!transactionId || typeof amount !== "number" || amount <= 0 || !feature || !description) {
      return NextResponse.json(
        { error: "transactionId, feature, amount (>0), and description are required" },
        { status: 400 }
      );
    }

    // Validate feature is a recognized credit source
    const validFeatures = [
      "transcription",
      "translation",
      "ai_generation",
      "ai_summary",
      "ai_sermon_notes",
      "ai_sermon_points",
      "worship_import_ai",
    ];
    if (!validFeatures.includes(feature)) {
      return NextResponse.json(
        { error: `Invalid feature. Must be one of: ${validFeatures.join(", ")}` },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    // Check for duplicate transactionId (idempotent)
    const existing = await db
      .collection("credit_transactions")
      .findOne({ userId, "metadata.transactionId": transactionId });

    if (existing) {
      // Already synced — return current balance
      const { credits } = await calculateUserCredits(userId, mongoUser);
      return NextResponse.json({
        success: true,
        newBalance: credits,
        duplicate: true,
      });
    }

    // Try transactional path first (replica set / Atlas).
    // Falls back to plain insert for standalone MongoDB (local dev).
    const clientSession = client.startSession();

    try {
      const check = await checkCredits(userId, mongoUser, amount);
      if (!check.allowed) {
        const { credits } = await calculateUserCredits(userId, mongoUser);
        return NextResponse.json(
          { error: "Insufficient credits", newBalance: credits },
          { status: 402 }
        );
      }

      if (mongoUser.role !== "admin" && getEffectivePlan(mongoUser) === "free" && feature === "transcription") {
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
              newBalance: check.remaining,
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
        source: feature as any,
        amount: -amount,
        description,
        metadata: { transactionId, offlineSync: true },
        createdAt: new Date().toISOString(),
      };

      try {
        await clientSession.startTransaction();
        await insertCreditTransaction(txData, clientSession);
        await clientSession.commitTransaction();
      } catch (txErr: any) {
        try { await clientSession.abortTransaction(); } catch { /* ignore */ }

        if (txErr?.codeName === "IllegalOperation" || txErr?.message?.includes("replica set")) {
          await insertCreditTransaction(txData);
        } else {
          throw txErr;
        }
      }

      const { credits } = await calculateUserCredits(userId, mongoUser);
      return NextResponse.json({ success: true, newBalance: credits });
    } finally {
      try { await clientSession.endSession(); } catch { /* ignore */ }
    }
  } catch (error) {
    console.error("Sync offline credit error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
