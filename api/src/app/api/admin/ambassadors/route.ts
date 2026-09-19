/**
 * GET /api/admin/ambassadors — List all ambassadors (active + expired) with stats
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { calculateBulkCredits } from "@/lib/credits";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const client = await clientPromise;
    const db = client.db();

    // Fetch all users who have ever been granted ambassador access
    const users = await db
      .collection("users")
      .find(
        { ambassador: { $exists: true, $ne: null } },
        { projection: { password: 0 } },
      )
      .sort({ "ambassador.grantedAt": -1 })
      .toArray();

    // Bulk-calculate real credit balances
    const creditBalances = await calculateBulkCredits(
      users.map((u) => ({
        id: u._id.toString(),
        role: u.role,
        plan: u.plan,
        trial: u.trial,
        ambassador: u.ambassador,
      })),
    );

    const now = Date.now();
    let activeCount = 0;
    let expiredCount = 0;

    const ambassadors = users.map((u) => {
      const id = u._id.toString();
      const ambassador = u.ambassador as Record<string, unknown> | null;

      const isActive = ambassador?.active === true;
      const expiresAt = ambassador?.expiresAt as string | undefined;
      const isExpired = isActive && expiresAt
        ? new Date(expiresAt).getTime() <= now
        : !isActive;

      if (isActive && !isExpired) activeCount++;
      else expiredCount++;

      return {
        id,
        name: u.name || "",
        email: u.email || "",
        churchName: u.churchName || "",
        ambassador: {
          active: isActive && !isExpired,
          grantedAt: (ambassador?.grantedAt as string) || null,
          expiresAt: expiresAt || null,
          creditsGranted: (ambassador?.creditsGranted as number) ?? null,
          previousPlan: (ambassador?.previousPlan as string) || "free",
          notes: (ambassador?.notes as string) || "",
        },
        credits: creditBalances.get(id) ?? 0,
        plan: (u.plan as string) || "free",
      };
    });

    return NextResponse.json({
      stats: {
        total: ambassadors.length,
        active: activeCount,
        expired: expiredCount,
      },
      ambassadors,
    });
  } catch (error) {
    console.error("Admin list ambassadors error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
