/**
 * GET /api/notifications — List notifications for the current user
 * POST /api/notifications — Create a new notification (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authUser.mongoUser._id.toString();
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const client = await clientPromise;
    const db = client.db();

    const query: Record<string, unknown> = { userId };
    if (unreadOnly) query.read = false;

    const notifications = await db
      .collection("notifications")
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const unreadCount = await db
      .collection("notifications")
      .countDocuments({ userId, read: false });

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("[Notifications] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only admins can create notifications
    const admin = await requireAdmin(req);
    if (!admin.ok) {
      return admin.response;
    }

    const body = await req.json();
    const { userId, type, title, message } = body;

    if (!userId || !type || !title || !message) {
      return NextResponse.json(
        { error: "Missing required fields: userId, type, title, message" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const notification = {
      userId,
      type,
      title,
      message,
      read: false,
      createdAt: new Date().toISOString(),
    };

    const result = await db.collection("notifications").insertOne(notification);

    return NextResponse.json({
      success: true,
      notification: { ...notification, _id: result.insertedId },
    });
  } catch (error) {
    console.error("[Notifications] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
