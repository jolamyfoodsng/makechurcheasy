import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getTranscriptionBalanceSummary } from "@/lib/transcriptionCredits";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Device-Secret, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    const userId = authUser.mongoUser._id.toString();
    const mongoUser = await checkAndApplyScheduledDowngrade(userId, authUser.mongoUser);
    const balance = await getTranscriptionBalanceSummary(userId, mongoUser);

    return NextResponse.json(balance, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[api/transcription/balance] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
}
