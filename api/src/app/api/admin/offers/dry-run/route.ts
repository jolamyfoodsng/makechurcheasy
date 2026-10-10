/**
 * POST /api/admin/offers/dry-run
 *
 * Shows what the next daily run would do with the saved settings, including
 * for ladders that are switched off, without issuing, emailing or changing
 * anything. Use it before turning a ladder on.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { runOfferJourneys } from "@/lib/offerJourneys";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const report = await runOfferJourneys({ dryRun: true });
    return NextResponse.json({ report });
  } catch (error) {
    console.error("[AdminOffers dry-run] Error:", error);
    return NextResponse.json({ error: "Preview failed" }, { status: 500 });
  }
}
