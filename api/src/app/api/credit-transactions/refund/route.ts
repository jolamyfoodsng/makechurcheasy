import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { insertCreditTransaction } from "@/lib/db";
import { calculateUserCredits } from "@/lib/credits";
import { getAuthUserFromRequest } from "@/lib/auth";
import { apiLimiter } from "@/lib/rateLimit";
import { CreditTransactionType } from "@/types/schemas";

/**
 * POST /api/credit-transactions/refund
 *
 * Refunds a reserved credit deduction by creating a refund transaction.
 * Used when an operation fails after credits were already reserved.
 *
 * Body: { reservationId, description, metadata? }
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
    const mongoUser = authUser.mongoUser;

    const body = await req.json();
    const { reservationId, description, metadata } = body;

    if (!reservationId) {
      return NextResponse.json(
        { error: "reservationId is required" },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db();

    // Verify the reservation exists and hasn't already been refunded
    const reservation = await db.collection("credit_transactions").findOne({
      userId,
      type: CreditTransactionType.USAGE,
      "metadata.reservationId": reservationId,
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 },
      );
    }

    if (reservation.metadata?.refunded) {
      return NextResponse.json(
        { error: "Reservation already refunded" },
        { status: 409 },
      );
    }

    if (reservation.metadata?.committed) {
      return NextResponse.json(
        { error: "Reservation already committed" },
        { status: 409 },
      );
    }

    const refundAmount = Math.abs(Number(reservation.amount) || 0);
    if (refundAmount <= 0) {
      return NextResponse.json(
        { error: "Reservation has no refundable amount" },
        { status: 400 },
      );
    }

    // Mark original reservation as refunded
    const markResult = await db.collection("credit_transactions").updateOne(
      {
        _id: reservation._id,
        "metadata.refunded": { $ne: true },
        "metadata.committed": { $ne: true },
      },
      {
        $set: {
          "metadata.refunded": true,
          "metadata.refundedAt": new Date().toISOString(),
        },
      },
    );
    if (markResult.modifiedCount === 0) {
      return NextResponse.json(
        { error: "Reservation is no longer refundable" },
        { status: 409 },
      );
    }

    // Create refund transaction (positive amount restores credits)
    await insertCreditTransaction({
      userId,
      type: CreditTransactionType.REFUND,
      source: reservation.source || "refund",
      amount: refundAmount,
      description: description || `Refund for reservation ${reservationId}`,
      metadata: {
        ...(metadata ?? {}),
        originalReservationId: reservationId,
        originalAmount: reservation.amount,
        createdBy: "system",
      },
      createdAt: new Date().toISOString(),
    });

    // Re-aggregate for accurate balance
    const { credits } = await calculateUserCredits(userId, mongoUser);
    return NextResponse.json({ credits, refunded: true, refundedAmount: refundAmount, reservationId });
  } catch (error) {
    console.error("Refund credits error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
