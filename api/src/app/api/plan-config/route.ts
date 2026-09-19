import { NextResponse } from "next/server";
import { getPlanConfig } from "@/lib/db";

/**
 * GET /api/plan-config
 *
 * Public endpoint — returns the current plan configuration.
 * No authentication required (plan pricing is public information).
 * Auto-seeds defaults if the collection is empty.
 */
export async function GET() {
  try {
    const config = await getPlanConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error("Get plan config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
