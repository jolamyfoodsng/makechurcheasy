import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { calculateBulkCredits } from "@/lib/credits";
import { checkAllExpiredAdminTemporaryPlans } from "@/lib/adminTemporaryPlan";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";
import { getEffectivePlan } from "@/lib/trial";
import { calculateUserActivityScore, calculateUserActivityMultiPeriod } from "@/lib/userActivityScore";
import { GROWTH_REACTIVATION_CAMPAIGN_KEY } from "@/lib/reactivationAudience";

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

    const reactivationOfferMap = new Map<string, {
      status: string;
      offeredAt: string | null;
      grantedAt: string | null;
      expiresAt: string | null;
    }>();
    try {
      const offers = await db.collection("reactivation_offers")
        .find(
          { campaignKey: GROWTH_REACTIVATION_CAMPAIGN_KEY, userId: { $in: userIds } },
          { projection: { userId: 1, status: 1, offeredAt: 1, grantedAt: 1, expiresAt: 1 } },
        )
        .toArray();
      for (const offer of offers) {
        reactivationOfferMap.set(String(offer.userId), {
          status: String(offer.status || "available"),
          offeredAt: offer.offeredAt?.toISOString?.() || offer.offeredAt || null,
          grantedAt: offer.grantedAt?.toISOString?.() || offer.grantedAt || null,
          expiresAt: offer.expiresAt?.toISOString?.() || offer.expiresAt || null,
        });
      }
    } catch (err) {
      console.warn("Could not query reactivation offers:", err);
    }

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

    // Query device counts and latest lastSeen per user
    const deviceCountMap = new Map<string, number>();
    const deviceLastSeenMap = new Map<string, string>();
    try {
      const deviceAgg = await db
        .collection("devices")
        .aggregate<{ _id: string; count: number; latestSeen?: string | Date }>([
          { $match: { userId: { $in: userIds }, $or: [{ status: "active" }, { status: { $exists: false } }] } },
          { $group: { _id: "$userId", count: { $sum: 1 }, latestSeen: { $max: "$lastSeen" } } },
        ])
        .toArray();
      for (const d of deviceAgg) {
        if (d._id) {
          deviceCountMap.set(String(d._id), d.count);
          if (d.latestSeen) {
            deviceLastSeenMap.set(String(d._id), new Date(d.latestSeen).toISOString());
          }
        }
      }
    } catch (err) {
      console.warn("Could not aggregate devices:", err);
    }

    // Query latest activity per user from activity_events
    const activityLastSeenMap = new Map<string, string>();
    try {
      const activityAgg = await db
        .collection("activity_events")
        .aggregate<{ _id: string; latestTime: string | Date }>([
          {
            $match: {
              $or: [
                { userId: { $in: userIds } },
                { userId: { $in: userObjectIds } },
              ],
            },
          },
          {
            $group: {
              _id: "$userId",
              latestTime: { $max: { $ifNull: ["$timestamp", "$createdAt"] } },
            },
          },
        ])
        .toArray();
      for (const a of activityAgg) {
        if (a._id && a.latestTime) {
          activityLastSeenMap.set(String(a._id), new Date(a.latestTime).toISOString());
        }
      }
    } catch (err) {
      console.warn("Could not aggregate activity_events:", err);
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

    // Query transcription balances
    const transcriptionBalanceMap = new Map<
      string,
      {
        includedSeconds: number;
        purchasedSeconds: number;
        totalAvailableSeconds: number;
        includedHours: number;
        purchasedHours: number;
        totalAvailableHours: number;
        totalAvailableCredits: number;
      }
    >();
    try {
      const transDocs = await db.collection("transcription_balances").find({ userId: { $in: userIds } }).toArray();
      for (const tb of transDocs) {
        const inc = tb.includedSeconds || 0;
        const pur = tb.purchasedSeconds || 0;
        const tot = inc + pur;
        transcriptionBalanceMap.set(tb.userId, {
          includedSeconds: inc,
          purchasedSeconds: pur,
          totalAvailableSeconds: tot,
          includedHours: Math.round((inc / 3600) * 10) / 10,
          purchasedHours: Math.round((pur / 3600) * 10) / 10,
          totalAvailableHours: Math.round((tot / 3600) * 10) / 10,
          totalAvailableCredits: Math.round(tot / 60),
        });
      }
    } catch (err) {
      console.warn("Could not query transcription_balances:", err);
    }

    // Query subscriptions to get real billing cycles & statuses
    const subscriptionMap = new Map<string, {
      plan: string;
      billingCycle: string;
      status: string;
      currentPeriodEnd: string | null;
      gracePeriodEndsAt: string | null;
    }>();
    try {
      const subs = await db
        .collection("subscriptions")
        .find({ userId: { $in: userIds } })
        .sort({ createdAt: -1 })
        .toArray();
      for (const s of subs) {
        const uid = String(s.userId);
        if (!subscriptionMap.has(uid)) {
          subscriptionMap.set(uid, {
            plan: s.plan || "free",
            billingCycle: s.billingCycle || "monthly",
            status: s.status || "active",
            currentPeriodEnd: s.currentPeriodEnd || null,
            gracePeriodEndsAt: s.gracePeriodEndsAt || null,
          });
        }
      }
    } catch (err) {
      console.warn("Could not query subscriptions:", err);
    }

    const formatted = users.map((u) => {
      const id = u._id.toString();
      const userSub = subscriptionMap.get(id) || null;
      const effectivePlan = getEffectivePlan(u as any);
      const billingCycle = userSub?.billingCycle || u.adminManagedSubscription?.billingCycle || (effectivePlan !== "free" ? "monthly" : null);
      const trial =
        effectivePlan === "trial"
          ? u.trial || null
          : u.trial
            ? { ...u.trial, active: false }
            : null;

      const lastActiveRaw = u.lastActive?.toISOString?.() || u.lastActive || null;
      const lastLoginRaw = u.lastLogin?.toISOString?.() || u.lastLogin || null;
      const sessionActiveRaw = sessionMap.get(id) || null;
      const deviceActiveRaw = deviceLastSeenMap.get(id) || null;
      const activityActiveRaw = activityLastSeenMap.get(id) || activityLastSeenMap.get(u._id.toString()) || null;

      const timestamps = [lastActiveRaw, lastLoginRaw, sessionActiveRaw, deviceActiveRaw, activityActiveRaw]
        .map((t) => (t ? new Date(t).getTime() : NaN))
        .filter((n) => Number.isFinite(n) && n > 0);

      const latestActiveMs = timestamps.length > 0 ? Math.max(...timestamps) : null;
      const effectiveLastActive = latestActiveMs ? new Date(latestActiveMs).toISOString() : null;

      const userUsage = usageMap.get(id) || usageMap.get(u._id.toString()) || null;
      const deviceCount = deviceCountMap.get(id) ?? 0;
      const activityInput = {
        lastLogin: lastLoginRaw,
        lastActive: effectiveLastActive,
        plan: effectivePlan,
        trial,
        ambassador: u.ambassador || null,
        deviceIds: deviceCount > 0 ? Array(deviceCount).fill("device") : [],
        activationMilestones: u.activationMilestones || null,
        usage: userUsage,
      };
      const activityBreakdown = calculateUserActivityScore(activityInput);
      const multiPeriod = calculateUserActivityMultiPeriod(activityInput);

      const effectiveExpiresAt =
        u.adminManagedSubscription?.active && u.adminManagedSubscription.expiresAt
          ? u.adminManagedSubscription.expiresAt
          : u.adminTemporaryPlan?.active && u.adminTemporaryPlan.expiresAt
            ? u.adminTemporaryPlan.expiresAt
            : effectivePlan === "trial" && (trial?.expiresAt || trial?.endsAt)
              ? (trial.expiresAt || trial.endsAt)
              : (effectivePlan !== "free" && u.subscriptionExpiresAt)
                ? u.subscriptionExpiresAt
                : u.scheduledDowngradeAt || null;

      return {
        id,
        name: u.name || "",
        email: u.email || "",
        phone: u.phone || u.phoneNumber || "",
        avatar: u.avatar || "",
        churchName: u.churchName || "",
        churchRole: u.churchRole || u.roleInChurch || "",
        country: u.country || "",
        role: u.role || "user",
        accountStatus: u.isActive === false ? "suspended" : "active",
        billingCycle,
        subscriptionStatus: userSub?.status || null,
        credits: creditBalances.get(id) ?? 0,
        transcriptionBalance: transcriptionBalanceMap.get(id) || null,
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
        subscriptionExpiresAt: effectiveExpiresAt,
        scheduledDowngradeAt: u.scheduledDowngradeAt || null,
        activationMilestones: u.activationMilestones || null,
        reactivationOffer: reactivationOfferMap.get(id) || null,
        usage: userUsage,
        activityScore: {
          score: activityBreakdown.score,
          grade: activityBreakdown.grade,
          color: activityBreakdown.color,
          badgeBg: activityBreakdown.badgeBg,
          barColor: activityBreakdown.barColor,
          daily: multiPeriod.daily,
          weekly: multiPeriod.weekly,
          monthly: multiPeriod.monthly,
        },
      };
    });

    return NextResponse.json({ users: formatted });
  } catch (error) {
    console.error("Admin list users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
