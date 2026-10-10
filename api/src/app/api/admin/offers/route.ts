/**
 * GET /api/admin/offers   Ladder settings, results and live counts.
 * PUT /api/admin/offers   Save settings and ladders (admin only).
 *
 * The ladders ship switched off. Nothing is issued or emailed until an admin
 * turns on the global switch and at least one ladder.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { countOpenOffers, getOfferResults, loadOfferConfig, saveOfferConfig } from "@/lib/offerJourneys";
import { FREE_PERIOD_PLAN } from "@/lib/offerLadderLogic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const config = await loadOfferConfig();
    const [results, openOffers] = await Promise.all([getOfferResults(config), countOpenOffers()]);
    return NextResponse.json({ ...config, results, openOffers, freePeriodPlan: FREE_PERIOD_PLAN });
  } catch (error) {
    console.error("[AdminOffers GET] Error:", error);
    return NextResponse.json({ error: "Failed to load offers" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => null)) as {
      settings?: Record<string, unknown>;
      ladders?: Array<Record<string, unknown>>;
    } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const config = await saveOfferConfig(
      {
        settings: body.settings && typeof body.settings === "object" ? (body.settings as never) : undefined,
        ladders: Array.isArray(body.ladders) ? (body.ladders as never) : undefined,
      },
      auth.adminUserId,
    );
    const [results, openOffers] = await Promise.all([getOfferResults(config), countOpenOffers()]);
    return NextResponse.json({ ...config, results, openOffers, freePeriodPlan: FREE_PERIOD_PLAN });
  } catch (error) {
    console.error("[AdminOffers PUT] Error:", error);
    return NextResponse.json({ error: "Failed to save offers" }, { status: 500 });
  }
}
