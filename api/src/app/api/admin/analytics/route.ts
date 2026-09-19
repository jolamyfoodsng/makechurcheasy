/**
 * GET /api/admin/analytics — Business Analytics + Product Analytics.
 *
 * Business Analytics: Derived from database records (users, churches,
 *   subscriptions, ambassadors, credits, devices, transcripts, themes).
 *   Always shows data when records exist.
 *
 * Product Analytics: Derived from activity_events and daily_metrics.
 *   Shows feature usage, signup trends, and retention.
 *
 * Supports ?period=7|30|90 query param (default 30) for Product Analytics.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { COLLECTIONS, getPlanConfig } from "@/lib/db";
import { getGatewayPaymentAnalytics } from "@/lib/paymentAnalytics";

export const dynamic = "force-dynamic";

// ── Helpers ──────────────────────────────────────────────────────────────────

function coerceDateExpression(field: string) {
  return {
    $switch: {
      branches: [
        {
          case: { $eq: [{ $type: `$${field}` }, "date"] },
          then: `$${field}`,
        },
        {
          case: { $eq: [{ $type: `$${field}` }, "string"] },
          then: {
            $dateFromString: {
              dateString: `$${field}`,
              onError: null,
              onNull: null,
            },
          },
        },
      ],
      default: null,
    },
  };
}

/** Build a month-keyed chart array from aggregation results. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMonthChart(agg: any[], fallbackCount = 0): { month: string; count: number }[] {
  const now = new Date();
  const months: { month: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const doc = agg.find(
      (a) => a._id?.year === year && a._id?.month === month,
    );
    months.push({ month: label, count: doc?.count ?? fallbackCount });
  }
  return months;
}

function percentOf(count: number, total: number): number {
  return total > 0 ? +((count / total) * 100).toFixed(1) : 0;
}

function displayBucket(value: unknown, fallback = "Unknown"): string {
  const label = String(value ?? "").trim();
  return label || fallback;
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const url = new URL(req.url);
    const requestedDays = Number.parseInt(url.searchParams.get("period") || "30", 10);
    const days = Number.isFinite(requestedDays) ? Math.max(1, Math.min(requestedDays, 90)) : 30;
    const paymentAnalyticsPromise = getGatewayPaymentAnalytics(days);

    const client = await clientPromise;
    const db = client.db();
    const usersCol = db.collection("users");
    const eventsCol = db.collection("activity_events");
    const metricsCol = db.collection("daily_metrics");
    const creditTxCol = db.collection("credit_transactions");

    const config = await getPlanConfig();
    const paidTiers = Object.keys(config.plans).filter((t) => t !== "free" && t !== "trial");
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ════════════════════════════════════════════════════════════════════════
    //  BUSINESS ANALYTICS — derived from database records
    // ════════════════════════════════════════════════════════════════════════

    // ── Overview KPIs ───────────────────────────────────────────────────

    const [totalUsers, activeUsersAgg, paidCount, ambassadorCount, totalChurches] = await Promise.all([
      usersCol.countDocuments({}),
      usersCol.aggregate([
        { $addFields: { normalizedLastLogin: coerceDateExpression("lastLogin") } },
        { $match: { normalizedLastLogin: { $gte: thirtyDaysAgo } } },
        { $count: "count" },
      ]).toArray(),
      usersCol.countDocuments({ plan: { $in: paidTiers } }),
      usersCol.countDocuments({ "ambassador.active": true }),
      usersCol.distinct("churchName").then((names) => names.filter(Boolean).length),
    ]);
    const activeUsers = activeUsersAgg[0]?.count || 0;

    // Countries and demographics from user/church profile documents.
    const [userCountryAgg, genderAgg, profileChurchSizeAgg, userChurchSizeAgg, churchProfileCount] = await Promise.all([
      usersCol.aggregate([
        { $match: { country: { $exists: true, $nin: [null, ""] } } },
        { $group: { _id: "$country", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      usersCol.aggregate([
        { $match: { gender: { $exists: true, $nin: [null, ""] } } },
        { $group: { _id: "$gender", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      db.collection(COLLECTIONS.CHURCH_PROFILES).aggregate([
        { $match: { churchSize: { $exists: true, $nin: [null, ""] } } },
        { $group: { _id: "$churchSize", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      usersCol.aggregate([
        { $match: { churchSize: { $exists: true, $nin: [null, ""] } } },
        { $group: { _id: "$churchSize", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      db.collection(COLLECTIONS.CHURCH_PROFILES).countDocuments({}),
    ]);

    const usersWithCountry = userCountryAgg.reduce((sum, c) => sum + (c.count || 0), 0);
    const usersWithGender = genderAgg.reduce((sum, g) => sum + (g.count || 0), 0);
    const churchSizeSource = profileChurchSizeAgg.length > 0 ? profileChurchSizeAgg : userChurchSizeAgg;
    const churchProfilesWithSize = churchSizeSource.reduce((sum, s) => sum + (s.count || 0), 0);

    const countriesRepresented = userCountryAgg.length;
    let supportedCountries = countriesRepresented;
    try {
      const pricingDoc = await db
        .collection(COLLECTIONS.COUNTRY_PRICING)
        .findOne({ _id: "default" } as any, { projection: { countries: 1 } });
      const countries = pricingDoc?.countries && typeof pricingDoc.countries === "object"
        ? pricingDoc.countries
        : {};
      supportedCountries = Math.max(Object.keys(countries).length, countriesRepresented);
    } catch {
      supportedCountries = countriesRepresented;
    }

    const countryDistribution = userCountryAgg.slice(0, 15).map((c) => ({
      country: displayBucket(c._id, "Unknown"),
      count: c.count || 0,
      percentage: percentOf(c.count || 0, usersWithCountry),
    }));

    const genderDistribution = genderAgg.map((g) => ({
      gender: displayBucket(g._id, "Unknown"),
      count: g.count || 0,
      percentage: percentOf(g.count || 0, usersWithGender),
    }));

    const churchSizeDistribution = churchSizeSource.map((s) => ({
      range: displayBucket(s._id, "Unknown"),
      count: s.count || 0,
      percentage: percentOf(s.count || 0, churchProfilesWithSize),
    }));

    const countryCoverage = {
      represented: countriesRepresented,
      supported: supportedCountries,
      percentage: percentOf(countriesRepresented, supportedCountries),
      usersWithoutCountry: Math.max(0, totalUsers - usersWithCountry),
    };

    const dataHealth = {
      usersWithoutCountry: Math.max(0, totalUsers - usersWithCountry),
      usersWithoutGender: Math.max(0, totalUsers - usersWithGender),
      usersWithCountry,
      usersWithGender,
      churchProfiles: churchProfilesWithSize || churchProfileCount,
    };

    // ── User Growth (monthly for last 12 months) ────────────────────────

    const userGrowthAgg = await usersCol
      .aggregate([
        { $addFields: { normalizedCreatedAt: coerceDateExpression("createdAt") } },
        { $match: { normalizedCreatedAt: { $ne: null } } },
        {
          $group: {
            _id: {
              year: { $year: "$normalizedCreatedAt" },
              month: { $month: "$normalizedCreatedAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ])
      .toArray();
    const userGrowthChart = buildMonthChart(userGrowthAgg);

    // ── Church Growth (monthly for last 12 months) ──────────────────────

    const churchGrowthAgg = await usersCol
      .aggregate([
        { $addFields: { normalizedCreatedAt: coerceDateExpression("createdAt") } },
        {
          $match: {
            churchName: { $exists: true, $nin: [null, ""] },
            normalizedCreatedAt: { $ne: null },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$normalizedCreatedAt" },
              month: { $month: "$normalizedCreatedAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ])
      .toArray();
    const churchGrowthChart = buildMonthChart(churchGrowthAgg);

    // ── Church Analytics ────────────────────────────────────────────────

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [churchesThisMonthAgg, churchesLastMonthAgg] = await Promise.all([
      usersCol.aggregate([
        { $addFields: { normalizedCreatedAt: coerceDateExpression("createdAt") } },
        {
          $match: {
            churchName: { $exists: true, $nin: [null, ""] },
            normalizedCreatedAt: { $gte: startOfMonth },
          },
        },
        { $count: "count" },
      ]).toArray(),
      usersCol.aggregate([
        { $addFields: { normalizedCreatedAt: coerceDateExpression("createdAt") } },
        {
          $match: {
            churchName: { $exists: true, $nin: [null, ""] },
            normalizedCreatedAt: { $gte: startOfLastMonth, $lt: startOfMonth },
          },
        },
        { $count: "count" },
      ]).toArray(),
    ]);
    const churchesThisMonth = churchesThisMonthAgg[0]?.count || 0;
    const churchesLastMonth = churchesLastMonthAgg[0]?.count || 0;

    const churchGrowth = churchesLastMonth > 0
      ? +(((churchesThisMonth - churchesLastMonth) / churchesLastMonth) * 100).toFixed(1)
      : churchesThisMonth > 0
        ? 100
        : 0;

    // ── Ambassador Analytics ────────────────────────────────────────────

    const ambassadorDetails = await usersCol
      .find(
        { "ambassador.active": { $exists: true } },
        { projection: { name: 1, email: 1, plan: 1, ambassador: 1, createdAt: 1 } },
      )
      .toArray();

    const activeAmbassadors = ambassadorDetails.filter((u) => u.ambassador?.active).length;
    const expiredAmbassadors = ambassadorDetails.filter(
      (u) => u.ambassador && !u.ambassador.active,
    ).length;

    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringSoon = ambassadorDetails.filter((u) => {
      if (!u.ambassador?.active || !u.ambassador?.endDate) return false;
      const endDate = new Date(u.ambassador.endDate);
      return endDate > now && endDate <= thirtyDaysFromNow;
    }).length;

    // ── Subscription Analytics ──────────────────────────────────────────

    const planAgg = await usersCol
      .aggregate([
        { $group: { _id: { $ifNull: ["$plan", "free"] }, count: { $sum: 1 } } },
      ])
      .toArray();

    const planCounts: Record<string, number> = {};
    for (const doc of planAgg) {
      planCounts[doc._id] = doc.count;
    }

    const planDistribution = Object.entries(config.plans).map(([tier, cfg]) => ({
      plan: cfg.label || tier,
      tier,
      count: planCounts[tier] || 0,
    }));

    if (planCounts["free"]) {
      planDistribution.unshift({
        plan: "Free",
        tier: "free",
        count: planCounts["free"],
      });
    }

    // ── Credit Analytics ────────────────────────────────────────────────

    const creditAgg = await creditTxCol
      .aggregate([
        { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ])
      .toArray();

    const creditStats = {
      totalConsumed: 0,
      totalGranted: 0,
      totalRefunded: 0,
      transactionCount: 0,
    };

    for (const doc of creditAgg) {
      creditStats.transactionCount += doc.count;
      if (doc._id === "usage") {
        creditStats.totalConsumed = Math.abs(doc.total);
      } else if (doc._id === "admin_grant") {
        creditStats.totalGranted += doc.total;
      } else if (doc._id === "refund") {
        creditStats.totalRefunded += Math.abs(doc.total);
      }
    }

    // ── Content Analytics (from user_usage if exists, else zeros) ────────

    let contentStats = {
      totalSongs: 0,
      totalMedia: 0,
      totalThemes: 0,
      totalTranscripts: 0,
    };

    try {
      const usageCol = db.collection("user_usage");
      const usageAgg = await usageCol
        .aggregate([
          {
            $group: {
              _id: null,
              totalSongs: { $sum: { $ifNull: ["$songs", 0] } },
              totalMedia: { $sum: { $ifNull: ["$media", 0] } },
              totalThemes: { $sum: { $ifNull: ["$themes", 0] } },
            },
          },
        ])
        .toArray();

      if (usageAgg.length > 0) {
        contentStats = {
          totalSongs: usageAgg[0].totalSongs,
          totalMedia: usageAgg[0].totalMedia,
          totalThemes: usageAgg[0].totalThemes,
          totalTranscripts: 0,
        };
      }
    } catch {
      // user_usage collection may not exist
    }

    // ════════════════════════════════════════════════════════════════════════
    //  PRODUCT ANALYTICS — derived from activity_events and daily_metrics
    // ════════════════════════════════════════════════════════════════════════

    const since = new Date(now);
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    // ── Feature Usage ───────────────────────────────────────────────────

    const featureAgg = await eventsCol
      .aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: { _id: "$event", count: { $sum: 1 } } },
      ])
      .toArray();

    const eventCounts: Record<string, number> = {};
    for (const doc of featureAgg) {
      eventCounts[doc._id] = doc.count;
    }

    const featureUsage = {
      bibleSearches:
        (eventCounts["bible_search"] || 0) + (eventCounts["bible_search_version"] || 0),
      worshipPresentations: eventCounts["worship_song_presented"] || 0,
      mediaPresentations: eventCounts["media_presented"] || 0,
      voiceSessions:
        (eventCounts["voice_session_started"] || 0) +
        (eventCounts["voice_session_completed"] || 0),
      transcriptViews:
        (eventCounts["transcript_created"] || 0) +
        (eventCounts["transcript_exported"] || 0),
      themesCreated:
        (eventCounts["theme_created"] || 0) + (eventCounts["theme_applied"] || 0),
    };

    // ── Signup Chart ────────────────────────────────────────────────────

    const metricsDocs = await metricsCol
      .find({ date: { $gte: sinceStr } })
      .sort({ date: 1 })
      .toArray();

    const signupChart: { date: string; signups: number }[] = [];
    const revenueChartPlaceholder: { date: string; revenue: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const doc = metricsDocs.find((m) => m.date === key);
      signupChart.push({ date: label, signups: doc?.signups || 0 });
      revenueChartPlaceholder.push({ date: label, revenue: 0 });
    }

    // ── Bible Analytics ─────────────────────────────────────────────────

    const bibleEvents = await eventsCol
      .aggregate([
        { $match: { event: { $in: ["bible_search", "bible_search_version"] }, timestamp: { $gte: since } } },
        { $group: { _id: { $ifNull: ["$properties.version", "Unknown"] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ])
      .toArray();

    const totalBibleSessions = bibleEvents.reduce((sum, e) => sum + e.count, 0);

    // ── Worship Analytics ───────────────────────────────────────────────

    const worshipAgg = await eventsCol
      .aggregate([
        { $match: { event: { $in: ["worship_song_created", "worship_song_imported", "worship_song_presented"] }, timestamp: { $gte: since } } },
        { $group: { _id: "$event", count: { $sum: 1 } } },
      ])
      .toArray();

    const worshipCounts: Record<string, number> = {};
    for (const doc of worshipAgg) {
      worshipCounts[doc._id] = doc.count;
    }

    // ── Media Analytics ─────────────────────────────────────────────────

    const mediaAgg = await eventsCol
      .aggregate([
        { $match: { event: { $in: ["media_uploaded", "media_presented"] }, timestamp: { $gte: since } } },
        { $group: { _id: "$event", count: { $sum: 1 } } },
      ])
      .toArray();

    const mediaCounts: Record<string, number> = {};
    for (const doc of mediaAgg) {
      mediaCounts[doc._id] = doc.count;
    }

    // ── Transcript Analytics ────────────────────────────────────────────

    const transcriptAgg = await eventsCol
      .aggregate([
        { $match: { event: { $in: ["transcript_created", "transcript_exported", "translation_generated"] }, timestamp: { $gte: since } } },
        { $group: { _id: "$event", count: { $sum: 1 } } },
      ])
      .toArray();

    const transcriptCounts: Record<string, number> = {};
    for (const doc of transcriptAgg) {
      transcriptCounts[doc._id] = doc.count;
    }

    // ── Retention ───────────────────────────────────────────────────────

    const retentionData: { date: string; value: number }[] = [];
    const weekMap = new Map<string, { active: Set<string>; total: number }>();

    for (const doc of metricsDocs) {
      const d = new Date(doc.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekKey = weekStart.toISOString().slice(0, 10);
      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, { active: new Set(), total: 0 });
      }
      const bucket = weekMap.get(weekKey)!;
      bucket.total++;
      if ((doc.activeUsers || 0) > 0) {
        bucket.active.add(doc.date);
      }
    }

    for (const [week, data] of weekMap) {
      retentionData.push({
        date: week,
        value: data.total > 0 ? Math.round((data.active.size / data.total) * 100) : 0,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    //  RESPONSE
    // ════════════════════════════════════════════════════════════════════════

    const paymentAnalytics = await paymentAnalyticsPromise;

    return NextResponse.json({
      payments: paymentAnalytics,
      business: {
        overview: {
          totalUsers,
          activeUsers,
          paidSubscribers: paidCount,
          ambassadors: ambassadorCount,
          totalChurches,
          countriesRepresented,
          conversionRate: totalUsers > 0 ? +((paidCount / totalUsers) * 100).toFixed(2) : 0,
        },
        countryDistribution,
        countryCoverage,
        genderDistribution,
        churchSizeDistribution,
        dataHealth,
        church: {
          total: totalChurches,
          newThisMonth: churchesThisMonth,
          growth: churchGrowth,
        },
        ambassadors: {
          active: activeAmbassadors,
          expired: expiredAmbassadors,
          expiringSoon,
        },
        subscriptions: planDistribution,
        credits: creditStats,
        content: contentStats,
        userGrowthChart,
        churchGrowthChart,
      },
      product: {
        featureUsage,
        signupChart,
        revenueChart: revenueChartPlaceholder,
        retentionData,
        bibleAnalytics: {
          mostUsedVersions: bibleEvents.map((e) => ({ name: e._id, count: e.count })),
          totalBibleSessions,
        },
        worshipAnalytics: {
          songsCreated: worshipCounts["worship_song_created"] || 0,
          songsImported: worshipCounts["worship_song_imported"] || 0,
          totalWorshipSlides: worshipCounts["worship_song_presented"] || 0,
        },
        mediaAnalytics: {
          imagesUploaded: mediaCounts["media_uploaded"] || 0,
          mediaPresentations: mediaCounts["media_presented"] || 0,
        },
        transcriptAnalytics: {
          totalTranscripts: transcriptCounts["transcript_created"] || 0,
          exportsGenerated: transcriptCounts["transcript_exported"] || 0,
          translationsGenerated: transcriptCounts["translation_generated"] || 0,
        },
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
