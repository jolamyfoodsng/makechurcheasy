/**
 * GET /api/admin/payments — Read-only successful payment analytics.
 * Monetary totals come from gateway transactions and remain grouped by currency.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getGatewayPaymentAnalytics } from "@/lib/paymentAnalytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const url = new URL(req.url);
    const requestedDays = Number.parseInt(url.searchParams.get("period") || "30", 10);
    const periodDays = Number.isFinite(requestedDays) ? Math.max(1, Math.min(requestedDays, 90)) : 30;
    const payments = await getGatewayPaymentAnalytics(periodDays);

    return NextResponse.json(payments, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Admin payment analytics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
