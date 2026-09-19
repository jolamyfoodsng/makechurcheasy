import { NextRequest, NextResponse } from "next/server";
import {
  getCreditTransactions,
  getCreditTransactionCount,
} from "@/lib/db";
import { getAuthUserFromRequest } from "@/lib/auth";
import { CreditTransactionType } from "@/types/schemas";

/**
 * GET /api/credit-transactions
 *
 * Lists credit transactions for the authenticated user.
 * Supports pagination and optional type filter.
 *
 * Auth: fb-token cookie (web) OR X-Device-Id header (desktop app).
 */
export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
    const skip = parseInt(req.nextUrl.searchParams.get("skip") || "0", 10);
    const type = req.nextUrl.searchParams.get("type") || undefined;

    // Validate type filter against enum if provided
    if (type) {
      const validTypes = Object.values(CreditTransactionType);
      if (!validTypes.includes(type as any)) {
        return NextResponse.json(
          { error: `type must be one of: ${validTypes.join(", ")}` },
          { status: 400 }
        );
      }
    }

    const [transactions, total] = await Promise.all([
      getCreditTransactions(userId, { limit, skip, type }),
      getCreditTransactionCount(userId, type),
    ]);

    return NextResponse.json({ transactions, total, limit, skip });
  } catch (error) {
    console.error("Get credit transactions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
