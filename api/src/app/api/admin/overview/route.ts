/**
 * GET /api/admin/overview — Dashboard overview data.
 *
 * Returns KPIs, signup chart data, and recent activity feed.
 * All data derived from real MongoDB collections (users, daily_metrics, activity_events).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { COLLECTIONS, getPlanConfig } from "@/lib/db";
import { getGatewayPaymentAnalytics } from "@/lib/paymentAnalytics";
import type { Db } from "mongodb";

export const dynamic = "force-dynamic";

const COUNTRY_ALIASES: Record<string, string> = {
  ghana: "GH",
  nigeria: "NG",
  "united arab emirates": "AE",
  uae: "AE",
  "united kingdom": "GB",
  uk: "GB",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
};

function hasFutureDate(value?: string | Date | null): boolean {
  if (!value) return false;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

async function buildCountryAliases(db: Db): Promise<Map<string, string>> {
  const aliases = new Map<string, string>();
  for (const [name, code] of Object.entries(COUNTRY_ALIASES)) {
    aliases.set(name, code);
    aliases.set(code, code);
  }

  try {
    const countries = await db
      .collection(COLLECTIONS.COUNTRIES)
      .find({}, { projection: { iso2: 1, iso3: 1, name: 1 } })
      .toArray();

    for (const country of countries) {
      const iso2 = typeof country.iso2 === "string" ? country.iso2.trim().toUpperCase() : "";
      if (!/^[A-Z]{2}$/.test(iso2)) continue;

      aliases.set(iso2, iso2);

      const iso3 = typeof country.iso3 === "string" ? country.iso3.trim().toUpperCase() : "";
      if (/^[A-Z]{3}$/.test(iso3)) aliases.set(iso3, iso2);

      const name = typeof country.name === "string" ? country.name.trim().toLowerCase().replace(/\s+/g, " ") : "";
      if (name) aliases.set(name, iso2);
    }
  } catch {
    // Keep the overview usable even if the optional countries collection is unavailable.
  }

  return aliases;
}

function normalizeCountryForCounting(value: unknown, aliases: Map<string, string>): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  return aliases.get(key) || aliases.get(trimmed.toUpperCase()) || trimmed.toUpperCase();
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;
    const paymentAnalyticsPromise = getGatewayPaymentAnalytics(30);

    const client = await clientPromise;
    const db = client.db();
    const usersCol = db.collection("users");
    const metricsCol = db.collection("daily_metrics");
    const eventsCol = db.collection("activity_events");
    const config = await getPlanConfig();

    // ── KPIs ──────────────────────────────────────────────────────────────

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const paidTiers = Object.keys(config.plans).filter((t) => t !== "free" && t !== "trial");

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [totalUsers, activeToday, activeThisWeek, activeUsers, churchCount, freeUsers, trialUsers, ambassadorCount, rawCountries, deviceCount] = await Promise.all([
      usersCol.countDocuments({ status: { $ne: "deleted" } }),
      usersCol.countDocuments({ lastLogin: { $gte: startOfToday }, status: { $ne: "deleted" } }),
      usersCol.countDocuments({ lastLogin: { $gte: sevenDaysAgo }, status: { $ne: "deleted" } }),
      usersCol.countDocuments({
        lastLogin: { $gte: thirtyDaysAgo },
        status: { $ne: "deleted" },
      }),
      usersCol.distinct("churchName").then((names) => names.filter(Boolean).length),
      usersCol.countDocuments({ plan: { $in: ["free", null, ""] }, status: { $ne: "deleted" } }),
      db.collection("trials").countDocuments({ status: "active", endsAt: { $gt: now.toISOString() } }),
      usersCol.countDocuments({ "ambassador.active": true }),
      usersCol.distinct("country", { status: { $ne: "deleted" } }),
      db.collection("devices").countDocuments({ status: { $ne: "deleted" } }),
    ]);
    const countryAliases = await buildCountryAliases(db);
    const countries = new Set(rawCountries.map((country) => normalizeCountryForCounting(country, countryAliases)).filter(Boolean)).size;

    // Monthly revenue must come from active billing records, not stale user.plan values.
    const activeSubscriptions = await db
      .collection(COLLECTIONS.SUBSCRIPTIONS)
      .find({
        status: "active",
        plan: { $in: paidTiers },
      })
      .toArray();

    const paidUserIds = new Set<string>();

    for (const subscription of activeSubscriptions) {
      if (!hasFutureDate(subscription.currentPeriodEnd)) continue;
      if (subscription.userId) paidUserIds.add(String(subscription.userId));
    }

    const adminManagedPaidUsers = await usersCol
      .find(
        {
          "adminManagedSubscription.active": true,
          "adminManagedSubscription.plan": { $in: paidTiers },
          status: { $ne: "deleted" },
        },
        {
          projection: {
            adminManagedSubscription: 1,
          },
        },
      )
      .toArray();

    for (const user of adminManagedPaidUsers) {
      const userId = user._id?.toString?.() || "";
      if (!userId || paidUserIds.has(userId)) continue;
      const managed = user.adminManagedSubscription || {};
      if (!hasFutureDate(managed.expiresAt)) continue;
      paidUserIds.add(userId);
    }

    const paidCount = paidUserIds.size;

    // AI hours: rough proxy from voice events in daily_metrics
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const sixtyDaysStr = sixtyDaysAgo.toISOString().slice(0, 10);

    const voiceAgg = await metricsCol
      .aggregate([
        { $match: { date: { $gte: sixtyDaysStr } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$voiceEvents", 0] } } } },
      ])
      .toArray();
    const aiHoursUsed = Math.round((voiceAgg[0]?.total || 0) * 0.025); // ~1.5 min per event

    // ── Signup chart (last 30 days) ───────────────────────────────────────

    const thirtyDaysStr = thirtyDaysAgo.toISOString().slice(0, 10);
    const metricsDocs = await metricsCol
      .find({ date: { $gte: thirtyDaysStr } })
      .sort({ date: 1 })
      .toArray();

    // Build a full 30-day array, filling zeros for missing days
    const signupChart: { date: string; signups: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const doc = metricsDocs.find((m) => m.date === key);
      signupChart.push({ date: label, signups: doc?.signups || 0 });
    }

    // ── Activity feed (last 20 events) ───────────────────────────────────

    const recentEvents = await eventsCol
      .find({ userId: { $ne: null } })
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();

    // Batch-fetch user names for the events
    const userIds = [...new Set(recentEvents.map((e) => e.userId).filter(Boolean))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { ObjectId } = await import("mongodb");
      const objectIds = userIds
        .filter((id) => {
          try { new ObjectId(id); return true; } catch { return false; }
        })
        .map((id) => new ObjectId(id));
      if (objectIds.length > 0) {
        const users = await usersCol
          .find({ _id: { $in: objectIds } }, { projection: { name: 1 } })
          .toArray();
        userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u.name || "Unknown"]));
      }
    }

    const EVENT_LABELS: Record<string, string> = {
      user_signup: "signed up for MakeChurchEasy",
      user_login: "logged in",
      device_paired: "paired a device",
      bible_search: "searched the Bible",
      bible_present: "presented a Bible verse",
      worship_song_created: "created a worship song",
      worship_song_imported: "imported a worship song",
      worship_song_presented: "presented worship lyrics",
      media_uploaded: "uploaded media",
      media_presented: "presented media",
      voice_session_started: "started a voice session",
      voice_session_completed: "completed a voice session",
      transcript_created: "created a transcript",
      transcript_exported: "exported a transcript",
      translation_generated: "generated a translation",
      theme_created: "created a theme",
      theme_applied: "applied a theme",
      app_started: "opened the app",
      obs_connected: "connected to OBS",
    };

    const EVENT_TYPES: Record<string, "signup" | "usage" | "export" | "theme" | "song" | "transcript"> = {
      user_signup: "signup",
      bible_search: "usage",
      bible_present: "usage",
      worship_song_created: "song",
      worship_song_imported: "song",
      worship_song_presented: "song",
      media_uploaded: "usage",
      media_presented: "usage",
      voice_session_started: "usage",
      voice_session_completed: "usage",
      transcript_created: "transcript",
      transcript_exported: "export",
      translation_generated: "export",
      theme_created: "theme",
      theme_applied: "theme",
    };

    const activity = recentEvents.map((e, i) => ({
      id: e._id?.toString() || `evt-${i}`,
      message: `${userMap[e.userId] || "Someone"} ${EVENT_LABELS[e.event] || e.event}`,
      timestamp: e.timestamp?.toISOString?.() || e.timestamp?.toString?.() || new Date().toISOString(),
      type: EVENT_TYPES[e.event] || "usage",
    }));

    const paymentAnalytics = await paymentAnalyticsPromise;

    return NextResponse.json({
      kpis: {
        totalUsers,
        activeUsers,
        activeToday,
        activeThisWeek,
        activeThisMonth: activeUsers,
        churches: churchCount,
        paidSubscribers: paidCount,
        payingCustomers: paidCount,
        trialUsers,
        freeUsers,
        countries,
        devices: deviceCount,
        paymentAnalytics,
        aiHoursUsed,
        ambassadorCount,
      },
      signupChart,
      activity,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin overview error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
