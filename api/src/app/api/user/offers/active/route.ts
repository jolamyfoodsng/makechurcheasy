/**
 * GET /api/user/offers/active
 *
 * The win-back offers the signed-in person can act on right now (open offers,
 * and claimed free periods that still carry a discount). The plans page uses
 * this to apply the offer's code on its own, and the claim page uses it to
 * show what is on offer.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { listActiveOffersForUser } from "@/lib/offerJourneys";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Device-Secret, X-App-Version",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    const userId = authUser?.mongoUser?._id?.toString?.();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }
    const offers = await listActiveOffersForUser(userId);
    return NextResponse.json({ offers }, { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[UserOffers] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
}
