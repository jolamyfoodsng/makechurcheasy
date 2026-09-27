import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { apiLimiter } from "@/lib/rateLimit";
import { getEffectivePlan } from "@/lib/trial";
import {
  deductTranscriptionSeconds,
  getTranscriptionBalanceSummary,
} from "@/lib/transcriptionCredits";
import { getFreeSpeechToScriptureUsage } from "@/lib/speechToScriptureUsage";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Device-Secret, Authorization, X-App-Version",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const rl = apiLimiter.check(req);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    const userId = authUser.mongoUser._id.toString();
    const mongoUser = await checkAndApplyScheduledDowngrade(userId, authUser.mongoUser);

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const { seconds, requestId, description, metadata } = body;

    if (typeof seconds !== "number" || seconds < 0) {
      return NextResponse.json(
        { error: "Valid duration 'seconds' (>= 0) is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (mongoUser.role !== "admin" && getEffectivePlan(mongoUser) === "free") {
      const db = (await clientPromise).db();
      const usage = await getFreeSpeechToScriptureUsage(db, userId, 1);
      const requestedMinutes = seconds / 60;
      const dailyExceeded = usage.dailyUsedMinutes + requestedMinutes > usage.dailyLimitMinutes;
      const weeklyExceeded = usage.weeklyUsedMinutes + requestedMinutes > usage.weeklyLimitMinutes;
      if (dailyExceeded || weeklyExceeded) {
        const reason = dailyExceeded ? "daily_speech_limit" : "weekly_speech_limit";
        return NextResponse.json(
          {
            error: reason === "daily_speech_limit"
              ? "Daily Speech to Scripture limit reached"
              : "Weekly Speech to Scripture limit reached",
            reason,
            balance: await getTranscriptionBalanceSummary(userId, mongoUser),
            dailyLimitMinutes: usage.dailyLimitMinutes,
            dailyUsedMinutes: usage.dailyUsedMinutes,
            dailyRemainingSeconds: usage.dailyRemainingSeconds,
            weeklyLimitMinutes: usage.weeklyLimitMinutes,
            weeklyUsedMinutes: usage.weeklyUsedMinutes,
            weeklyRemainingSeconds: usage.weeklyRemainingSeconds,
          },
          { status: 402, headers: CORS_HEADERS },
        );
      }
    }

    const result = await deductTranscriptionSeconds({
      userId,
      seconds,
      requestId: typeof requestId === "string" ? requestId.trim() : undefined,
      description: typeof description === "string" ? description : undefined,
      metadata: typeof metadata === "object" && metadata !== null ? metadata : undefined,
      mongoUser,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Insufficient transcription credits",
          reason: "TRANSCRIPTION_CREDITS_EXHAUSTED",
          balance: result.balance,
        },
        { status: 402, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(result, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[api/transcription/deduct] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
}
