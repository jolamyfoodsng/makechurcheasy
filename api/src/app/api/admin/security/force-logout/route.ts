import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { requireAdmin } from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const client = await clientPromise;
    const db = client.db();
    const now = new Date();

    const result = await db.collection("users").updateMany(
      { role: { $ne: "admin" } },
      {
        $inc: { tokenVersion: 1 },
        $set: { forceLoggedOutAt: now.toISOString() },
      }
    );

    await db.collection("audit_logs").insertOne({
      userId: auth.adminUserId,
      action: "admin_force_logout",
      details: {
        matchedUsers: result.matchedCount,
        modifiedUsers: result.modifiedCount,
      },
      ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
      userAgent: req.headers.get("user-agent") || null,
      timestamp: now.toISOString(),
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      matchedUsers: result.matchedCount,
      modifiedUsers: result.modifiedCount,
    });
  } catch (error) {
    console.error("[Admin Force Logout] Error:", error);
    return NextResponse.json({ error: "Failed to force logout users" }, { status: 500 });
  }
}
