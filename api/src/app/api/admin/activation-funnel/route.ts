import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import {
  CORE_USE_EVENTS,
  PAYWALL_EVENTS,
  RETURN_EVENTS,
} from "@/lib/activation";
import { getTrialExperimentSettings } from "@/lib/trialExperiment";
import { ensureIndexes } from "@/lib/db";
import type { ActivationSurveyReason } from "@/types/schemas";

const STAGES = [
  { key: "signedUp", label: "Signed up" },
  { key: "onboardingStarted", label: "Started setup" },
  { key: "onboardingCompleted", label: "Completed setup" },
  { key: "obsConnected", label: "Connected OBS" },
  { key: "firstUsefulUse", label: "First useful result" },
  { key: "returnedWithin7d", label: "Returned within 7 days" },
  { key: "paywallSeen", label: "Saw upgrade prompt" },
  { key: "checkoutStarted", label: "Started checkout" },
  { key: "paid", label: "Paid" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function pct(value: number, total: number): number {
  return total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;
}

function startOfCohort(date: Date): string {
  const result = new Date(date);
  const day = result.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  result.setUTCDate(result.getUTCDate() - daysFromMonday);
  result.setUTCHours(0, 0, 0, 0);
  return result.toISOString().slice(0, 10);
}

function eventDate(event: any): Date | null {
  return toDate(event.timestamp) || toDate(event.createdAt);
}

function hasEvent(events: any[], names: Set<string>): boolean {
  return events.some((event) => names.has(String(event.event || "")));
}

function hasEventAfterSignup(events: any[], signupDate: Date, maxDays: number): boolean {
  const min = signupDate.getTime() + 12 * 60 * 60 * 1000;
  const max = signupDate.getTime() + maxDays * 24 * 60 * 60 * 1000;
  return events.some((event) => {
    if (!RETURN_EVENTS.has(String(event.event || ""))) return false;
    const occurredAt = eventDate(event)?.getTime();
    return occurredAt != null && occurredAt >= min && occurredAt <= max;
  });
}

function userStageSet(user: any, events: any[]): Set<StageKey> {
  const signupDate = toDate(user.createdAt) || toDate(user.signupDate) || new Date();
  const stages = new Set<StageKey>(["signedUp"]);
  if (hasEvent(events, new Set(["onboarding_started"]))) stages.add("onboardingStarted");
  if (hasEvent(events, new Set(["onboarding_completed"])) || user.onboarding?.activationCompletedAt) stages.add("onboardingCompleted");
  if (hasEvent(events, new Set(["obs_connected"])) || user.activationMilestones?.obsConnected) stages.add("obsConnected");
  if (hasEvent(events, CORE_USE_EVENTS) || user.activationMilestones?.firstUse || user.activationMilestones?.firstPresentation) stages.add("firstUsefulUse");
  if (hasEventAfterSignup(events, signupDate, 7)) stages.add("returnedWithin7d");
  if (hasEvent(events, PAYWALL_EVENTS)) stages.add("paywallSeen");
  if (hasEvent(events, new Set(["checkout_started"]))) stages.add("checkoutStarted");
  if (user.plan && !["free", "trial"].includes(String(user.plan).toLowerCase())) stages.add("paid");
  return stages;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const days = Math.min(Math.max(Number.parseInt(url.searchParams.get("days") || "30", 10) || 30, 7), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await ensureIndexes();
    const client = await clientPromise;
    const db = client.db();

    const users = await db.collection("users").aggregate([
      { $match: { status: { $ne: "deleted" } } },
      {
        $addFields: {
          cohortCreatedAt: {
            $convert: { input: { $ifNull: ["$createdAt", "$signupDate"] }, to: "date", onError: null, onNull: null },
          },
        },
      },
      { $match: { cohortCreatedAt: { $gte: since } } },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          plan: 1,
          createdAt: 1,
          signupDate: 1,
          cohortCreatedAt: 1,
          activationMilestones: 1,
          onboarding: 1,
          trialExperiment: 1,
        },
      },
    ]).toArray();

    const userIds = users.map((user) => user._id.toString());
    const events = userIds.length
      ? await db.collection("activity_events").find({ userId: { $in: userIds } }).toArray()
      : [];
    const eventsByUser = new Map<string, any[]>();
    for (const event of events) {
      const id = event.userId?.toString();
      if (!id) continue;
      const list = eventsByUser.get(id) || [];
      list.push(event);
      eventsByUser.set(id, list);
    }

    const userStages = new Map<string, Set<StageKey>>();
    const cohorts = new Map<string, { users: any[]; stageUsers: Map<StageKey, Set<string>> }>();
    for (const user of users) {
      const id = user._id.toString();
      const userEvents = eventsByUser.get(id) || [];
      const stages = userStageSet(user, userEvents);
      userStages.set(id, stages);
      const cohort = startOfCohort(user.cohortCreatedAt || user.createdAt || user.signupDate);
      const bucket: { users: any[]; stageUsers: Map<StageKey, Set<string>> } = cohorts.get(cohort) || {
        users: [],
        stageUsers: new Map<StageKey, Set<string>>(),
      };
      bucket.users.push(user);
      for (const stage of stages) {
        const stageUsers = bucket.stageUsers.get(stage) || new Set<string>();
        stageUsers.add(id);
        bucket.stageUsers.set(stage, stageUsers);
      }
      cohorts.set(cohort, bucket);
    }

    const totalUsers = users.length;
    const funnel = STAGES.map((stage, index) => {
      const count = users.reduce((sum, user) => sum + (userStages.get(user._id.toString())?.has(stage.key) ? 1 : 0), 0);
      const previous = index === 0
        ? totalUsers
        : users.reduce((sum, user) => sum + (userStages.get(user._id.toString())?.has(STAGES[index - 1].key) ? 1 : 0), 0);
      return {
        key: stage.key,
        label: stage.label,
        users: count,
        rate: pct(count, totalUsers),
        dropoffFromPrevious: Math.max(0, previous - count),
      };
    });

    const cohortRows = Array.from(cohorts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cohort, bucket]) => {
        const matured = bucket.users.filter((user) => {
          const date = toDate(user.cohortCreatedAt || user.createdAt || user.signupDate);
          return date ? Date.now() - date.getTime() >= 7 * 24 * 60 * 60 * 1000 : false;
        }).length;
        const stageCounts = Object.fromEntries(STAGES.map((stage) => [
          stage.key,
          bucket.stageUsers.get(stage.key)?.size || 0,
        ]));
        return {
          cohort,
          totalUsers: bucket.users.length,
          maturedFor7DayReturn: matured,
          stages: stageCounts,
        };
      });

    const feedback = await db.collection("activation_feedback")
      .find({ createdAt: { $gte: since.toISOString() } })
      .sort({ createdAt: -1 })
      .limit(250)
      .toArray();
    const feedbackCounts = new Map<string, number>();
    for (const item of feedback) feedbackCounts.set(item.reason, (feedbackCounts.get(item.reason) || 0) + 1);

    const experimentSettings = await getTrialExperimentSettings();
    const variantStats = new Map<string, { assigned: number; activated: number; paid: number }>();
    for (const user of users) {
      const assignment = user.trialExperiment;
      if (!assignment?.experimentId) continue;
      const stats = variantStats.get(assignment.variant) || { assigned: 0, activated: 0, paid: 0 };
      stats.assigned += 1;
      const stages = userStages.get(user._id.toString());
      const userEvents = eventsByUser.get(user._id.toString()) || [];
      if (assignment.activatedAt || user.activationMilestones?.trialActivated || hasEvent(userEvents, new Set(["trial_activated"]))) stats.activated += 1;
      if (stages?.has("paid")) stats.paid += 1;
      variantStats.set(assignment.variant, stats);
    }

    const betaUsers = await db.collection("users")
      .find({ "trialExperiment.betaCohort": true, status: { $ne: "deleted" } }, { projection: { _id: 1, name: 1, email: 1, plan: 1, trialExperiment: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const feedbackOptions: Record<ActivationSurveyReason, number> = {
      could_not_connect: feedbackCounts.get("could_not_connect") || 0,
      did_not_understand: feedbackCounts.get("did_not_understand") || 0,
      did_not_need_it_yet: feedbackCounts.get("did_not_need_it_yet") || 0,
      missing_feature: feedbackCounts.get("missing_feature") || 0,
      technical_problem: feedbackCounts.get("technical_problem") || 0,
      already_use_something_else: feedbackCounts.get("already_use_something_else") || 0,
      still_testing: feedbackCounts.get("still_testing") || 0,
      other: feedbackCounts.get("other") || 0,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      periodDays: days,
      since: since.toISOString(),
      totalUsers,
      funnel,
      cohorts: cohortRows,
      feedback: {
        total: feedback.length,
        options: feedbackOptions,
        recent: feedback.slice(0, 50).map((item) => ({
          id: item._id?.toString(),
          userId: item.userId,
          reason: item.reason,
          detail: item.detail || "",
          source: item.source,
          createdAt: item.createdAt,
        })),
      },
      experiment: {
        settings: experimentSettings,
        variants: Array.from(variantStats.entries()).map(([variant, stats]) => ({ variant, ...stats })),
        betaUsers: betaUsers.map((user) => ({
          id: user._id.toString(),
          name: user.name || "",
          email: user.email || "",
          plan: user.plan || "free",
          variant: user.trialExperiment?.variant || null,
          createdAt: user.createdAt || null,
        })),
      },
      definitions: {
        firstUsefulUse: "A distinct user event for a Bible, worship, media, translation, or speech-to-scripture result.",
        returnedWithin7d: "An app/login/OBS/core-use event at least 12 hours after signup and within seven days.",
        paid: "Current user plan is Basic, Growth, or another non-free/non-trial plan.",
      },
    });
  } catch (error) {
    console.error("[admin/activation-funnel] Error:", error);
    return NextResponse.json({ error: "Could not load activation funnel" }, { status: 500 });
  }
}
