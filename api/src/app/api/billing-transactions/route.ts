import { NextRequest, NextResponse } from "next/server";
import {
  getBillingTransactions,
  getBillingTransactionCount,
} from "@/lib/db";
import { getAuthUserFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
    const skip = parseInt(req.nextUrl.searchParams.get("skip") || "0", 10);

    const [transactions, total] = await Promise.all([
      getBillingTransactions(userId, { limit, skip }),
      getBillingTransactionCount(userId),
    ]);

    return NextResponse.json({ transactions, total, limit, skip });
  } catch (error) {
    console.error("Get billing transactions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
