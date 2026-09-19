import { NextRequest, NextResponse } from "next/server";
import { removeOtherSessions } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const body = await req.json();
    const { currentSessionId } = body;

    if (!currentSessionId) {
      return NextResponse.json(
        { error: "currentSessionId is required" },
        { status: 400 }
      );
    }

    const deletedCount = await removeOtherSessions(userId, currentSessionId);
    return NextResponse.json({ success: true, deletedCount });
  } catch (error) {
    console.error("Terminate other sessions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
