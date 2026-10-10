/**
 * GET  /api/admin/offers/users/[id]   One person's offers and journeys.
 * POST /api/admin/offers/users/[id]   { action: "suppress" | "issue", ladderId }
 *
 * "suppress" stops all further offers to this person on a ladder.
 * "issue" gives them the next rung now instead of waiting for the daily run.
 */
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/adminAuth";
import { getUserOfferHistory, issueNextRungNow, OfferError, suppressJourney } from "@/lib/offerJourneys";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    const history = await getUserOfferHistory(id);
    return NextResponse.json(history);
  } catch (error) {
    console.error("[AdminOffers user GET] Error:", error);
    return NextResponse.json({ error: "Failed to load offers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { action?: unknown; ladderId?: unknown };
    const ladderId = typeof body.ladderId === "string" ? body.ladderId : "";
    if (!ladderId) return NextResponse.json({ error: "ladderId is required" }, { status: 400 });

    if (body.action === "suppress") {
      await suppressJourney(id, ladderId, auth.adminUserId);
      return NextResponse.json({ success: true });
    }
    if (body.action === "issue") {
      const issued = await issueNextRungNow(id, ladderId, auth.adminUserId);
      return NextResponse.json({ success: true, ...issued });
    }
    return NextResponse.json({ error: "action must be suppress or issue" }, { status: 400 });
  } catch (error) {
    if (error instanceof OfferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[AdminOffers user POST] Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
