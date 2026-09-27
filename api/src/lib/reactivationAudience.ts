import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

const MEMBER_COLLECTION = "reactivation_audience_members";
const RUN_COLLECTION = "reactivation_audience_runs";
const OFFER_COLLECTION = "reactivation_offers";
const CAMPAIGN_ANNOUNCEMENT_TAG = "growth-reactivation-2026-09";
export const GROWTH_REACTIVATION_CAMPAIGN_KEY = CAMPAIGN_ANNOUNCEMENT_TAG;
const COHORT_START = new Date("2026-06-01T00:00:00.000Z");
const COHORT_END = new Date("2026-09-01T00:00:00.000Z");
const INACTIVITY_DAYS = 60;
const ACTIVITY_EVENTS = [
  "user_login",
  "app_installed",
  "first_app_open",
  "app_started",
  "device_paired",
  "onboarding_started",
  "onboarding_step_completed",
  "onboarding_completed",
  "first_use_started",
  "first_use",
  "first_presentation",
  "obs_connected",
  "bible_present",
  "worship_song_presented",
  "song_presented",
  "media_presented",
  "translation_generated",
  "sts_push_to_live",
];
const USE_EVENTS = new Set([
  "first_use",
  "first_presentation",
  "obs_connected",
  "bible_present",
  "worship_song_presented",
  "song_presented",
  "media_presented",
  "translation_generated",
  "sts_push_to_live",
]);

type ActivityEvent = {
  userId?: string | ObjectId | null;
  event?: string;
  timestamp?: string | Date | null;
  createdAt?: string | Date | null;
};

type SessionRecord = { userId?: string | ObjectId | null; lastActive?: string | Date | null };
type DeviceRecord = { userId?: string | ObjectId | null };
type UsageRecord = {
  userId?: string | ObjectId | null;
  bibleSearches?: number;
  bibleSearchVersions?: number;
  songs?: number;
  images?: number;
  videos?: number;
  transcripts?: number;
  aiHoursUsed?: number;
};
type SubscriptionRecord = { userId?: string | ObjectId | null; status?: string };
type TrialRecord = { userId?: string | ObjectId | null; status?: string; endsAt?: string | Date | null };

function dateValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function userKey(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function hasUsage(record: UsageRecord): boolean {
  return [
    record.bibleSearches,
    record.bibleSearchVersions,
    record.songs,
    record.images,
    record.videos,
    record.transcripts,
    record.aiHoursUsed,
  ].some((count) => typeof count === "number" && count > 0);
}

function hasDevice(user: Record<string, unknown>): boolean {
  const devices = Array.isArray(user.devices) ? user.devices : [];
  const deviceIds = Array.isArray(user.deviceIds) ? user.deviceIds : [];
  return devices.length > 0 || deviceIds.length > 0;
}

/**
 * Refreshes the saved eligibility snapshot for the June-August 2026 cohort.
 * Users who qualify receive a persistent, one-time Growth offer record so the
 * offer remains available after the campaign brings them back to the app.
 * This function never sends email or exports email addresses.
 */
export async function refreshReactivationAudience(db: Db, now = new Date()) {
  const evaluatedAt = now;
  const inactiveBefore = new Date(now.getTime() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  const users = await db.collection("users").find({}, {
    projection: {
      createdAt: 1,
      lastLogin: 1,
      lastActive: 1,
      status: 1,
      isActive: 1,
      email: 1,
      name: 1,
      firstName: 1,
      emailVerified: 1,
      emailPreferences: 1,
      plan: 1,
      trial: 1,
      devices: 1,
      deviceIds: 1,
      onboarding: 1,
      activationMilestones: 1,
      adminTemporaryPlan: 1,
      adminManagedSubscription: 1,
      ambassador: 1,
    },
  }).toArray();

  const cohortUsers = users.filter((user) => {
    const createdAt = dateValue(user.createdAt);
    return user.status !== "deleted"
      && createdAt !== null
      && createdAt >= COHORT_START
      && createdAt < COHORT_END;
  });
  const userIds = cohortUsers.map((user) => String(user._id));
  const objectIds = userIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
  const idVariants = [...userIds, ...objectIds];

  const [events, recentSessions, activeDevices, usageRecords, subscriptions, activeTrials] = await Promise.all([
    db.collection<ActivityEvent>("activity_events").find(
      { userId: { $in: idVariants }, event: { $in: ACTIVITY_EVENTS } },
      { projection: { userId: 1, event: 1, timestamp: 1, createdAt: 1 } },
    ).toArray(),
    db.collection<SessionRecord>("security_sessions").find(
      {
        userId: { $in: idVariants },
        $or: [
          { lastActive: { $gte: inactiveBefore } },
          { lastActive: { $gte: inactiveBefore.toISOString() } },
        ],
      },
      { projection: { userId: 1, lastActive: 1 } },
    ).toArray(),
    db.collection<DeviceRecord>("devices").find(
      { userId: { $in: idVariants }, $or: [{ status: "active" }, { status: { $exists: false } }] },
      { projection: { userId: 1 } },
    ).toArray(),
    db.collection<UsageRecord>("user_usage").find(
      { userId: { $in: idVariants } },
      { projection: { userId: 1, bibleSearches: 1, bibleSearchVersions: 1, songs: 1, images: 1, videos: 1, transcripts: 1, aiHoursUsed: 1 } },
    ).toArray(),
    db.collection<SubscriptionRecord>("subscriptions").find(
      { userId: { $in: idVariants }, status: { $in: ["active", "trialing", "past_due"] } },
      { projection: { userId: 1, status: 1 } },
    ).toArray(),
    db.collection<TrialRecord>("trials").find(
      { userId: { $in: idVariants }, status: "active", endsAt: { $gt: now.toISOString() } },
      { projection: { userId: 1 } },
    ).toArray(),
  ]);

  const eventsByUser = new Map<string, { installed: boolean; used: boolean; recentlyActive: boolean }>();
  for (const event of events) {
    const key = userKey(event.userId);
    if (!key) continue;
    const state = eventsByUser.get(key) || { installed: false, used: false, recentlyActive: false };
    const eventAt = dateValue(event.timestamp) || dateValue(event.createdAt);
    if (eventAt && eventAt >= inactiveBefore) state.recentlyActive = true;
    if (event.event === "app_installed" || event.event === "first_app_open") state.installed = true;
    if (event.event && USE_EVENTS.has(event.event)) state.used = true;
    if (event.event === "device_paired" || event.event === "obs_connected") state.installed = true;
    eventsByUser.set(key, state);
  }

  const recentSessionIds = new Set(recentSessions.map((session) => userKey(session.userId)));
  const deviceIdsByUser = new Set(activeDevices.map((device) => userKey(device.userId)));
  const usageIds = new Set(usageRecords.filter(hasUsage).map((record) => userKey(record.userId)));
  const subscriptionIds = new Set(subscriptions.map((subscription) => userKey(subscription.userId)));
  const activeTrialIds = new Set(activeTrials.map((trial) => userKey(trial.userId)));

  const members = cohortUsers.map((user) => {
    const id = String(user._id);
    const milestones = user.activationMilestones || {};
    const onboarding = user.onboarding || {};
    const eventState = eventsByUser.get(id) || { installed: false, used: false, recentlyActive: false };
    const reasons: string[] = [];
    const recentLoginOrActivity = Boolean(
      (dateValue(user.lastLogin) && dateValue(user.lastLogin)! >= inactiveBefore)
      || (dateValue(user.lastActive) && dateValue(user.lastActive)! >= inactiveBefore)
      || recentSessionIds.has(id)
      || eventState.recentlyActive,
    );
    const installed = Boolean(
      milestones.appDownloaded
      || milestones.devicePaired
      || onboarding.downloadedStudio
      || onboarding.pairedFirstDevice
      || hasDevice(user)
      || deviceIdsByUser.has(id)
      || eventState.installed,
    );
    const used = Boolean(
      milestones.firstUse
      || milestones.firstPresentation
      || milestones.obsConnected
      || milestones.firstSpeechToScripture
      || milestones.firstTranslation
      || eventState.used
      || usageIds.has(id),
    );

    if (recentLoginOrActivity) reasons.push("recent_activity_within_60_days");
    if (installed) reasons.push("app_downloaded_or_device_paired");
    if (used) reasons.push("app_tested_or_content_used");
    if (user.emailVerified !== true
      || typeof user.email !== "string"
      || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user.email.trim())) {
      reasons.push("email_not_verified_or_missing");
    }
    if (user.emailPreferences?.marketing === false) reasons.push("marketing_opt_out");
    if (user.isActive === false) reasons.push("account_inactive");
    if (user.plan && user.plan !== "free") reasons.push("non_free_plan");
    if (subscriptionIds.has(id)) reasons.push("active_subscription");
    if (activeTrialIds.has(id) || user.trial?.active === true || user.trial?.status === "active") reasons.push("active_trial");
    if (user.adminTemporaryPlan?.active === true || user.adminManagedSubscription?.active === true) {
      reasons.push("admin_granted_plan");
    }
    if (user.ambassador?.active === true) reasons.push("active_ambassador");

    const fullName = typeof user.firstName === "string" && user.firstName.trim()
      ? user.firstName.trim()
      : typeof user.name === "string" ? user.name.trim() : "";
    const firstName = fullName.split(/\s+/)[0] || null;

    return {
      campaignKey: CAMPAIGN_ANNOUNCEMENT_TAG,
      userId: id,
      eligible: reasons.length === 0,
      firstName: reasons.length === 0 ? firstName : null,
      suppressionReasons: reasons,
      evaluatedAt,
      inactiveBefore,
    };
  });

  const membersCollection = db.collection(MEMBER_COLLECTION);
  const offersCollection = db.collection(OFFER_COLLECTION);
  await Promise.all([
    membersCollection.createIndex({ campaignKey: 1, userId: 1 }, { unique: true }),
    membersCollection.createIndex({ campaignKey: 1, eligible: 1 }),
    db.collection(RUN_COLLECTION).createIndex({ campaignKey: 1, runKey: 1 }, { unique: true }),
    offersCollection.createIndex({ campaignKey: 1, userId: 1 }, { unique: true }),
    offersCollection.createIndex({ campaignKey: 1, status: 1 }),
  ]);

  if (members.length > 0) {
    await membersCollection.bulkWrite(
      members.map((member) => ({
        updateOne: {
          filter: { campaignKey: CAMPAIGN_ANNOUNCEMENT_TAG, userId: member.userId },
          update: { $set: member },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  const eligibleCount = members.filter((member) => member.eligible).length;
  let offersCreated = 0;
  const eligibleMembers = members.filter((member) => member.eligible);
  if (eligibleMembers.length > 0) {
    const offerWrites = await Promise.all(eligibleMembers.map(async (member) => {
      const result = await offersCollection.updateOne(
        { campaignKey: CAMPAIGN_ANNOUNCEMENT_TAG, userId: member.userId },
        {
          $setOnInsert: {
            campaignKey: CAMPAIGN_ANNOUNCEMENT_TAG,
            userId: member.userId,
            status: "available",
            offeredAt: evaluatedAt,
            createdAt: evaluatedAt,
            updatedAt: evaluatedAt,
          },
        },
        { upsert: true },
      );
      return result.upsertedCount;
    }));
    offersCreated = offerWrites.reduce((sum, count) => sum + count, 0);
  }

  const availableOffers = await offersCollection.countDocuments({
    campaignKey: CAMPAIGN_ANNOUNCEMENT_TAG,
    status: "available",
  });

  // This active, targeted announcement appears in the dashboard and desktop
  // app only for users with an unclaimed offer. Admins can edit or pause it.
  if (availableOffers > 0) {
    const nowIso = evaluatedAt.toISOString();
    await db.collection("announcements").updateOne(
      { tags: CAMPAIGN_ANNOUNCEMENT_TAG },
      {
        $setOnInsert: {
          title: "We’ve missed you—your Growth month is on us",
          message: "Welcome back! Because you signed up some time ago and hadn’t explored MakeChurchEazy, we’re gifting you 30 days of the Growth plan. Claim your free month to activate it for your church.",
          tone: "offer",
          status: "active",
          surfaces: ["dashboard", "desktop"],
          audience: "reactivation_offer_users",
          tags: [CAMPAIGN_ANNOUNCEMENT_TAG],
          ctaLabel: "Get my free Growth month",
          ctaUrl: `/reactivation/claim?campaign=${encodeURIComponent(CAMPAIGN_ANNOUNCEMENT_TAG)}`,
          priority: 80,
          publishAt: nowIso,
          expiresAt: null,
          deliverySpacingMinutes: 1440,
          maxShowsPerUser: 5,
          createdBy: "system:reactivation-campaign",
          updatedBy: null,
          metrics: { shown: 0, dismissed: 0, clicked: 0 },
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      },
      { upsert: true },
    );
  }

  const runKey = `${CAMPAIGN_ANNOUNCEMENT_TAG}:${evaluatedAt.toISOString().slice(0, 10)}`;
  const run = {
    campaignKey: CAMPAIGN_ANNOUNCEMENT_TAG,
    runKey,
    evaluatedAt,
    inactiveBefore,
    cohortStart: COHORT_START,
    cohortEnd: COHORT_END,
    processed: members.length,
    eligible: eligibleCount,
    suppressed: members.length - eligibleCount,
    offersCreated,
    offersAvailable: availableOffers,
    suppressedByReason: members.reduce<Record<string, number>>((counts, member) => {
      for (const reason of member.suppressionReasons) counts[reason] = (counts[reason] || 0) + 1;
      return counts;
    }, {}),
  };
  await db.collection(RUN_COLLECTION).updateOne(
    { campaignKey: CAMPAIGN_ANNOUNCEMENT_TAG, runKey },
    { $set: run, $setOnInsert: { createdAt: evaluatedAt } },
    { upsert: true },
  );

  return run;
}
