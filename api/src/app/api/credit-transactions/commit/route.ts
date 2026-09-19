import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getAuthUserFromRequest } from "@/lib/auth";
import { apiLimiter } from "@/lib/rateLimit";
import { CreditTransactionType } from "@/types/schemas";

/**
 * POST /api/credit-transactions/commit
 *
 * Marks a reserved credit deduction as committed (operation succeeded).
 * The actual deduction already happened in /reserve — this just confirms it.
 *
 * Body: { reservationId }
 */
export async function POST(req: NextRequest) {
  try {
    const rl = apiLimiter.check(req);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const body = await req.json();
    const { reservationId } = body;

    if (!reservationId) {
      return NextResponse.json(
        { error: "reservationId is required" },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const result = await db.collection("credit_transactions").updateOne(
      {
        userId,
        type: CreditTransactionType.USAGE,
        "metadata.reservationId": reservationId,
        "metadata.refunded": { $ne: true },
      },
      {
        $set: {
          "metadata.committed": true,
          "metadata.committedAt": new Date().toISOString(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Reservation not found or already refunded" },
        { status: 404 },
      );
    }

    return NextResponse.json({ committed: true, reservationId });
  } catch (error) {
    console.error("Commit reservation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
