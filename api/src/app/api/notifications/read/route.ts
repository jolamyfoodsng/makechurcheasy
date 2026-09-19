/**
 * POST /api/notifications/read — Mark notifications as read
 *
 * Body: { notificationIds?: string[] } — mark specific ones as read
 *        or omit to mark ALL as read
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authUser.mongoUser._id.toString();
    const body = await req.json().catch(() => ({}));
    const { notificationIds } = body;

    const client = await clientPromise;
    const db = client.db();

    const query: Record<string, unknown> = { userId, read: false };
    if (notificationIds?.length) {
      query._id = { $in: notificationIds.map((id: string) => new ObjectId(id)) };
    }

    const result = await db
      .collection("notifications")
      .updateMany(query, { $set: { read: true } });

    return NextResponse.json({
      success: true,
      markedRead: result.modifiedCount,
    });
  } catch (error) {
    console.error("[Notifications] Read error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
