import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { markWelcomeShown, getTrialForUser } from "@/lib/trialRecords";

/**
 * POST /api/auth/trial-welcome
 *
 * Marks the trial welcome modal as shown for the current user.
 * Called after the modal is displayed so it never shows again.
 *
 * Supports both web (fb-token cookie) and desktop (X-Device-Id header) auth.
 * Updates the `trials` collection (single source of truth).
 */
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authUser.mongoUser._id.toString();

    // Find the user's trial record
    const trial = await getTrialForUser(userId);
    if (trial?._id) {
      await markWelcomeShown(trial._id.toString());
    } else {
      // Fallback: update legacy embedded trial if no trial record exists
      const client = await import("@/lib/mongodb").then((m) => m.default);
      const db = (await client).db();
      await db.collection("users").updateOne(
        { _id: authUser.mongoUser._id },
        { $set: { "trial.welcomeShown": true } }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Trial Welcome] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
