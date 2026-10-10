/**
 * POST /api/offers/claim   { ladderId, rungId }
 *
 * Claims a free-period or trial-extension win-back offer for the signed-in
 * person. The offer has to have been issued to this account; the link alone
 * grants nothing. Free periods are the Basic plan and need no card.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { claimOffer, OfferError } from "@/lib/offerJourneys";

export async function POST(req: NextRequest) {
  const authUser = await getAuthUserFromRequest(req);
  const userId = authUser?.mongoUser?._id?.toString?.();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to claim this offer." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { ladderId?: unknown; rungId?: unknown };
  const ladderId = typeof body.ladderId === "string" ? body.ladderId : "";
  const rungId = typeof body.rungId === "string" ? body.rungId : "";
  if (!ladderId || !rungId) {
    return NextResponse.json({ error: "This offer link is not valid." }, { status: 400 });
  }

  try {
    const result = await claimOffer(userId, ladderId, rungId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OfferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Offers] Claim failed:", error);
    return NextResponse.json({ error: "We could not activate your offer. Please try again." }, { status: 500 });
  }
}
