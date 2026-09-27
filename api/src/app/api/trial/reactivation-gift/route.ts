import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getAuthUserFromRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { upsertSubscription } from "@/lib/db";
import { logAuditEvent } from "@/lib/auditLog";
import { GROWTH_REACTIVATION_CAMPAIGN_KEY } from "@/lib/reactivationAudience";

const OFFER_COLLECTION = "reactivation_offers";
const GIFT_DAYS = 30;
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

function isActiveTrial(user: Record<string, any>): boolean {
  const trial = user.trial || {};
  return (trial.active === true || trial.status === "active")
    && (!trial.endsAt || new Date(trial.endsAt).getTime() > Date.now());
}

function isUnavailableForGift(user: Record<string, any>): string | null {
  if (user.status === "deleted" || user.isActive === false) return "account_inactive";
  if (user.emailVerified !== true) return "email_not_verified";
  if (String(user.plan || "free").toLowerCase() !== "free") return "not_free_plan";
  if (user.adminTemporaryPlan?.active || user.adminManagedSubscription?.active) return "another_plan_is_active";
  if (isActiveTrial(user)) return "another_trial_is_active";
  if (user.ambassador?.active) return "active_ambassador";
  return null;
}

function successPayload(offer: Record<string, any>, user: Record<string, any>, alreadyClaimed = false) {
  const expiresAt = offer.expiresAt || user.adminTemporaryPlan?.expiresAt || null;
  const active = Boolean(
    user.adminTemporaryPlan?.active
    && user.adminTemporaryPlan?.campaignKey === GROWTH_REACTIVATION_CAMPAIGN_KEY
    && expiresAt
    && new Date(expiresAt).getTime() > Date.now(),
  );
  return {
    success: true,
    alreadyClaimed,
    active,
    plan: "growth",
    durationDays: GIFT_DAYS,
    grantedAt: offer.grantedAt || user.adminTemporaryPlan?.grantedAt || null,
    expiresAt,
  };
}

/**
 * POST /api/trial/reactivation-gift
 * Claims a campaign-specific, database-issued Growth gift for the signed-in
 * recipient. The link is not a bearer grant: the user must authenticate and
 * have an available offer record for their own account.
 */
export async function POST(req: NextRequest) {
  const authUser = await getAuthUserFromRequest(req);
  const userId = authUser?.mongoUser?._id?.toString?.();
  if (!userId || !ObjectId.isValid(userId)) {
    return NextResponse.json({ error: "Sign in to claim your Growth gift." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { campaignKey?: unknown };
  const campaignKey = typeof body.campaignKey === "string" ? body.campaignKey : "";
  if (campaignKey !== GROWTH_REACTIVATION_CAMPAIGN_KEY) {
    return NextResponse.json({ error: "This Growth gift link is not valid." }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db = client.db();
    const users = db.collection("users");
    const offers = db.collection(OFFER_COLLECTION);
    const userObjectId = new ObjectId(userId);

    let [offer, user] = await Promise.all([
      offers.findOne({ campaignKey, userId }),
      users.findOne({ _id: userObjectId }),
    ]);
    if (!offer || !user) {
      return NextResponse.json({ error: "This Growth gift is not available for this account." }, { status: 404 });
    }

    if (offer.status === "granted") {
      return NextResponse.json(successPayload(offer, user, true));
    }

    const alreadyApplied = user.adminTemporaryPlan?.campaignKey === campaignKey;
    if (alreadyApplied) {
      const expiresAt = user.adminTemporaryPlan?.expiresAt || null;
      await upsertSubscription(userId, {
        plan: "growth",
        status: user.adminTemporaryPlan?.active && expiresAt && new Date(expiresAt).getTime() > Date.now()
          ? "active"
          : "cancelled",
        autoRenew: false,
        currentPeriodEnd: expiresAt,
      });
      const grantedAt = user.adminTemporaryPlan?.grantedAt || new Date().toISOString();
      await offers.updateOne(
        { campaignKey, userId },
        { $set: { status: "granted", grantedAt, expiresAt, updatedAt: new Date().toISOString() } },
      );
      offer = { ...offer, status: "granted", grantedAt, expiresAt };
      return NextResponse.json(successPayload(offer, user, true));
    }

    const unavailableReason = isUnavailableForGift(user);
    if (unavailableReason) {
      return NextResponse.json(
        { error: "This Growth gift is not available for this account.", reason: unavailableReason },
        { status: 409 },
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const [activeSubscription, activeTrial] = await Promise.all([
      db.collection("subscriptions").findOne({
        userId,
        status: { $in: ["active", "trialing", "past_due"] },
      }, { projection: { _id: 1 } }),
      db.collection("trials").findOne({
        userId,
        status: "active",
        endsAt: { $gt: nowIso },
      }, { projection: { _id: 1 } }),
    ]);
    if (activeSubscription || activeTrial) {
      return NextResponse.json(
        {
          error: "This Growth gift is reserved for eligible returning free accounts.",
          reason: activeSubscription ? "active_subscription" : "active_trial",
        },
        { status: 409 },
      );
    }

    const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS).toISOString();
    const claimLock = await offers.updateOne(
      {
        campaignKey,
        userId,
        $or: [
          { status: "available" },
          { status: "granting", claimStartedAt: { $lt: staleBefore } },
        ],
      },
      { $set: { status: "granting", claimStartedAt: nowIso, updatedAt: nowIso } },
    );

    if (claimLock.modifiedCount === 0) {
      const latest = await offers.findOne({ campaignKey, userId });
      if (latest?.status === "granted") {
        return NextResponse.json(successPayload(latest, user, true));
      }
      return NextResponse.json(
        { error: "Your Growth gift is being activated. Please try again in a moment." },
        { status: 409 },
      );
    }

    const expiresAt = new Date(now.getTime() + GIFT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const tempPlan = {
      active: true,
      plan: "growth",
      previousPlan: "free",
      returnPlan: "free",
      grantedBy: "reactivation_campaign",
      grantedAt: nowIso,
      startedAt: nowIso,
      expiresAt,
      durationDays: GIFT_DAYS,
      reason: "One-month Growth gift from the reactivation campaign.",
      campaignKey,
      endedAt: null,
      endedBy: null,
      endedReason: null,
      expiredAt: null,
    };

    const userGrant = await users.updateOne(
      {
        _id: userObjectId,
        $or: [{ plan: "free" }, { plan: { $exists: false } }, { plan: null }],
        "adminTemporaryPlan.active": { $ne: true },
        "adminManagedSubscription.active": { $ne: true },
        "ambassador.active": { $ne: true },
        $and: [
          { $or: [{ "trial.active": { $ne: true } }, { "trial.endsAt": { $lte: nowIso } }] },
          { $or: [{ "trial.status": { $ne: "active" } }, { "trial.endsAt": { $lte: nowIso } }] },
        ],
      },
      {
        $set: {
          plan: "growth",
          adminTemporaryPlan: tempPlan,
          reactivationProgram: { campaignKey, status: "claimed", grantedAt: nowIso, expiresAt },
        },
      },
    );

    if (userGrant.modifiedCount === 0) {
      await offers.updateOne(
        { campaignKey, userId, status: "granting" },
        { $set: { status: "available", updatedAt: new Date().toISOString() }, $unset: { claimStartedAt: "" } },
      );
      return NextResponse.json(
        { error: "This Growth gift is not available for this account." },
        { status: 409 },
      );
    }

    try {
      await upsertSubscription(userId, {
        plan: "growth",
        status: "active",
        autoRenew: false,
        currentPeriodEnd: expiresAt,
      });
    } catch (error) {
      // Keep the offer lock. A retry detects the campaign key on the user and
      // completes the subscription and offer records without granting twice.
      throw error;
    }

    await offers.updateOne(
      { campaignKey, userId, status: "granting" },
      { $set: { status: "granted", grantedAt: nowIso, expiresAt, updatedAt: nowIso }, $unset: { claimStartedAt: "" } },
    );

    await logAuditEvent({
      adminId: "reactivation_campaign",
      action: "temporary_plan_grant",
      targetUserId: userId,
      details: { plan: "growth", durationDays: GIFT_DAYS, expiresAt, campaignKey },
      timestamp: now,
    });

    user = { ...user, plan: "growth", adminTemporaryPlan: tempPlan };
    const updatedOffer = { ...offer, status: "granted", grantedAt: nowIso, expiresAt };
    return NextResponse.json(successPayload(updatedOffer, user));
  } catch (error) {
    console.error("[reactivation-gift] Claim failed:", error);
    return NextResponse.json({ error: "We could not activate your Growth gift. Please try again." }, { status: 500 });
  }
}
