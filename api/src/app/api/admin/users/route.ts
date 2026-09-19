import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { calculateBulkCredits } from "@/lib/credits";
import { checkAllExpiredAdminTemporaryPlans } from "@/lib/adminTemporaryPlan";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";
import { getEffectivePlan } from "@/lib/trial";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    await checkAllExpiredAdminTemporaryPlans().catch((err) => {
      console.error("Admin list users temporary-plan expiry check failed:", err);
    });

    const client = await clientPromise;
    const db = client.db();

    let users = await db
      .collection("users")
      .find({}, {
        projection: {
          password: 0,
        },
      })
      .sort({ createdAt: -1 })
      .toArray();

    users = await Promise.all(
      users.map((u) => {
        const scheduledAt =
          u.scheduledDowngradeAt ||
          (u.adminManagedSubscription?.active ? u.adminManagedSubscription.expiresAt : null);
        const scheduledMs = scheduledAt ? new Date(String(scheduledAt)).getTime() : NaN;
        if ((u.plan || "free") !== "free" && Number.isFinite(scheduledMs) && scheduledMs <= Date.now()) {
          return checkAndApplyScheduledDowngrade(u._id.toString(), u);
        }
        return u;
      }),
    );

    // Bulk-calculate real credit balances (2 queries total, regardless of user count)
    const creditBalances = await calculateBulkCredits(
      users.map((u) => ({
        id: u._id.toString(),
        role: u.role,
        plan: u.plan,
        trial: u.trial,
        ambassador: u.ambassador,
        adminTemporaryPlan: u.adminTemporaryPlan,
        adminManagedSubscription: u.adminManagedSubscription,
        subscriptionExpiresAt: u.subscriptionExpiresAt,
      }))
    );

    // Query latest active session per user from security_sessions
    const sessionMap = new Map<string, string>();
    try {
      const latestSessions = await db
        .collection("security_sessions")
        .aggregate<{ _id: string; latestActive: string }>([
          { $match: { lastActive: { $ne: null } } },
          { $group: { _id: "$userId", latestActive: { $max: "$lastActive" } } },
        ])
        .toArray();
      for (const s of latestSessions) {
        if (s._id && s.latestActive) {
          sessionMap.set(String(s._id), String(s.latestActive));
        }
      }
    } catch (err) {
      console.warn("Could not aggregate security_sessions:", err);
    }

    const formatted = users.map((u) => {
      const id = u._id.toString();
      const effectivePlan = getEffectivePlan(u as any);
      const trial =
        effectivePlan === "trial"
          ? u.trial || null
          : u.trial
            ? { ...u.trial, active: false }
            : null;

      const lastActiveRaw = u.lastActive?.toISOString?.() || u.lastActive || null;
      const lastLoginRaw = u.lastLogin?.toISOString?.() || u.lastLogin || null;
      const sessionActiveRaw = sessionMap.get(id) || null;

      const timestamps = [lastActiveRaw, lastLoginRaw, sessionActiveRaw]
        .map((t) => (t ? new Date(t).getTime() : NaN))
        .filter((n) => Number.isFinite(n) && n > 0);

      const latestActiveMs = timestamps.length > 0 ? Math.max(...timestamps) : null;
      const effectiveLastActive = latestActiveMs ? new Date(latestActiveMs).toISOString() : null;

      return {
        id,
        name: u.name || "",
        email: u.email || "",
        avatar: u.avatar || "",
        churchName: u.churchName || "",
        role: u.role || "user",
        accountStatus: u.isActive === false ? "suspended" : "active",
        credits: creditBalances.get(id) ?? 0,
        // Display the effective entitlement, not a stale stored paid plan.
        // Active trials remain labelled Free so the existing trial badge is shown.
        plan: effectivePlan === "trial" ? "free" : effectivePlan,
        signupDate: u.createdAt?.toISOString?.() || u.createdAt || null,
        createdAt: u.createdAt?.toISOString?.() || u.createdAt || null,
        lastLogin: lastLoginRaw,
        lastActive: effectiveLastActive,
        appId: u.appId || "",
        isActive: effectiveLastActive
          ? new Date(effectiveLastActive).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
          : false,
        trial,
        ambassador: u.ambassador || null,
        adminTemporaryPlan: u.adminTemporaryPlan || null,
        adminManagedSubscription: u.adminManagedSubscription || null,
        subscriptionExpiresAt: effectivePlan === "free" ? null : (u.subscriptionExpiresAt || null),
        scheduledDowngradeAt: u.scheduledDowngradeAt || null,
      };
    });

    return NextResponse.json({ users: formatted });
  } catch (error) {
    console.error("Admin list users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
