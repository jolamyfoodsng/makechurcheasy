import { NextRequest, NextResponse } from "next/server";
import { getCreditUsageByDay } from "@/lib/db";
import { getAuthUserFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const days = parseInt(req.nextUrl.searchParams.get("days") || "7", 10);
    const usage = (await getCreditUsageByDay(userId, days)).map((day) => ({
      ...day,
      creditsUsed: day.amount,
    }));

    return NextResponse.json({ usage });
  } catch (error) {
    console.error("Get credit usage stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
