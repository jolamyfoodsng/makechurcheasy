import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";

const TYPES = new Set(["license_tamper", "device_limit", "license_unsigned"]);

/**
 * GET /api/admin/security-events
 *   ?type=license_tamper|device_limit|license_unsigned   (optional)
 *   ?userId=...  ?deviceId=...                           (optional)
 *   ?days=7 (1–90)   ?limit=100 (1–500)
 *
 * Returns the newest events plus a per-user summary so repeat offenders stand out.
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const params = req.nextUrl.searchParams;
    const days = Math.min(90, Math.max(1, Number(params.get("days")) || 7));
    const limit = Math.min(500, Math.max(1, Number(params.get("limit")) || 100));

    const filter: Record<string, unknown> = {
      createdAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    };
    const type = params.get("type");
    if (type && TYPES.has(type)) filter.type = type;
    const userId = params.get("userId");
    if (userId) filter.userId = userId;
    const deviceId = params.get("deviceId");
    if (deviceId) filter.deviceId = deviceId;

    const client = await clientPromise;
    const events = client.db().collection("security_events");

    const [items, byUser] = await Promise.all([
      events.find(filter).sort({ createdAt: -1 }).limit(limit).toArray(),
      events.aggregate([
        { $match: filter },
        { $match: { userId: { $ne: null } } },
        { $group: { _id: "$userId", count: { $sum: 1 }, lastAt: { $max: "$createdAt" }, types: { $addToSet: "$type" } } },
        { $sort: { count: -1 } },
        { $limit: 25 },
      ]).toArray(),
    ]);

    return NextResponse.json({
      days,
      events: items.map((e) => ({ ...e, _id: String(e._id) })),
      topUsers: byUser.map((u) => ({ userId: u._id, count: u.count, lastAt: u.lastAt, types: u.types })),
    });
  } catch (err) {
    console.error("[admin/security-events] Error:", err);
    return NextResponse.json({ error: "Failed to load security events" }, { status: 500 });
  }
}
