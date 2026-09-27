import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { calculateTopupPricing } from "@/lib/transcriptionCredits";
import { getSubscription } from "@/lib/db";

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
    let currency = req.nextUrl.searchParams.get("currency") || "";

    if (!currency && authUser?.mongoUser?._id) {
      const sub = await getSubscription(authUser.mongoUser._id.toString());
      if (sub?.currency) {
        currency = sub.currency;
      }
    }

    if (!currency) {
      currency = "NGN";
    }

    const pricing = await calculateTopupPricing(currency);

    return NextResponse.json(pricing, {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[api/transcription/packages] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
}
