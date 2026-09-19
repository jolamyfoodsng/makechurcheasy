import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";

/**
 * POST /api/auth/welcome-complete
 *
 * Marks the first-login welcome modal as completed for the current user.
 * Called after the user dismisses the welcome modal so it never shows again.
 */
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await import("@/lib/mongodb").then((m) => m.default);
    const db = (await client).db();
    await db.collection("users").updateOne(
      { _id: authUser.mongoUser._id },
      { $set: { "onboarding.completedWelcome": true } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Welcome Complete] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
