import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { getReferralDashboard } from "@/lib/referrals";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const client = await clientPromise;
    const db = client.db();
    const { ObjectId } = await import("mongodb");

    let objectId: InstanceType<typeof ObjectId>;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const dashboard = await getReferralDashboard(id);

    // If this user was referred by someone, lookup referrer info
    let referrerDetails: any = null;
    if (dashboard.referredBy?.referrerUserId) {
      try {
        const referrerUser = await db.collection("users").findOne(
          { _id: new ObjectId(dashboard.referredBy.referrerUserId) },
          { projection: { name: 1, email: 1, churchName: 1, plan: 1 } },
        );
        if (referrerUser) {
          referrerDetails = {
            id: referrerUser._id.toString(),
            name: referrerUser.name || "",
            email: referrerUser.email || "",
            churchName: referrerUser.churchName || "",
            plan: referrerUser.plan || "free",
          };
        }
      } catch (err) {
        console.warn("[admin/users/[id]/referrals] Could not fetch referrer details:", err);
      }
    }

    return NextResponse.json({
      ...dashboard,
      referredByDetails: referrerDetails,
    });
  } catch (error: any) {
    console.error("[admin/users/[id]/referrals] Error fetching user referrals:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
