import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { calculateBulkCredits } from "@/lib/credits";
import { checkAllExpiredAdminTemporaryPlans } from "@/lib/adminTemporaryPlan";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";
import { getEffectivePlan } from "@/lib/trial";
import { calculateUserActivityScore } from "@/lib/userActivityScore";

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

    const userIds = users.map((u) => u._id.toString());
    const userObjectIds = users.map((u) => u._id);

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

    // Query device counts per user
    const deviceCountMap = new Map<string, number>();
    try {
      const deviceAgg = await db
        .collection("devices")
        .aggregate<{ _id: string; count: number }>([
          { $match: { userId: { $in: userIds }, $or: [{ status: "active" }, { status: { $exists: false } }] } },
          { $group: { _id: "$userId", count: { $sum: 1 } } },
        ])
        .toArray();
      for (const d of deviceAgg) {
        if (d._id) deviceCountMap.set(String(d._id), d.count);
      }
    } catch (err) {
      console.warn("Could not aggregate devices:", err);
    }

    // Query usage per user from user_usage collection
    const usageMap = new Map<string, { bibleSearches: number; songsCreated: number; mediaUploaded: number; transcriptCount: number; aiHoursUsed: number }>();
    try {
      const usageDocs = await db
        .collection("user_usage")
        .find({
          $or: [
            { userId: { $in: userIds } },
            { userId: { $in: userObjectIds } },
          ],
        })
        .toArray();
      for (const u of usageDocs) {
        const uid = String(u.userId);
        usageMap.set(uid, {
          bibleSearches: (u.bibleSearches || 0) + (u.bibleSearchVersions || 0),
          songsCreated: u.songs || 0,
          mediaUploaded: (u.images || 0) + (u.videos || 0),
          transcriptCount: u.transcripts || 0,
          aiHoursUsed: u.aiHoursUsed || 0,
        });
      }
    } catch (err) {
      console.warn("Could not query user_usage:", err);
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

      const userUsage = usageMap.get(id) || usageMap.get(u._id.toString()) || null;
      const deviceCount = deviceCountMap.get(id) ?? 0;
      const activityBreakdown = calculateUserActivityScore({
        lastLogin: lastLoginRaw,
        lastActive: effectiveLastActive,
        plan: effectivePlan,
        trial,
        ambassador: u.ambassador || null,
        deviceIds: deviceCount > 0 ? Array(deviceCount).fill("device") : [],
        activationMilestones: u.activationMilestones || null,
        usage: userUsage,
      });

      return {
        id,
        name: u.name || "",
        email: u.email || "",
        avatar: u.avatar || "",
        churchName: u.churchName || "",
        country: u.country || "",
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
        activationMilestones: u.activationMilestones || null,
        usage: userUsage,
        activityScore: {
          score: activityBreakdown.score,
          grade: activityBreakdown.grade,
          color: activityBreakdown.color,
          badgeBg: activityBreakdown.badgeBg,
          barColor: activityBreakdown.barColor,
        },
      };
    });

    return NextResponse.json({ users: formatted });
  } catch (error) {
    console.error("Admin list users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
