import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { checkTranscriptionAccess } from "@/lib/transcriptionCredits";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Device-Secret, Authorization, X-App-Version",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ allowed: false, reason: "UNAUTHORIZED" }, { status: 401, headers: CORS_HEADERS });
    }

    const userId = authUser.mongoUser._id.toString();
    const mongoUser = await checkAndApplyScheduledDowngrade(userId, authUser.mongoUser);
    const result = await checkTranscriptionAccess(userId, mongoUser);

    return NextResponse.json(result, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[api/transcription/check-access] Error:", error);
    return NextResponse.json({ allowed: false, reason: "SERVER_ERROR" }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
