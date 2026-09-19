/**
 * GET /api/user/subscription-state
 *
 * Returns the user's current subscription state as a signed payload.
 * The desktop app uses this to maintain offline-capable subscription data.
 *
 * Credits are calculated dynamically from plan config + transactions.
 * Admin users always get -1 (unlimited).
 *
 * Auth: fb-token cookie (web) OR X-Device-Id header (desktop app).
 * Rate limit: 10 req/min per user.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/db";
import { calculateUserCredits } from "@/lib/credits";
import {
  signPayload,
  SubscriptionSigningConfigurationError,
  type SubscriptionPayload,
} from "@/lib/subscriptionSigner";
import { rateLimit } from "@/lib/rateLimit";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";

const limiter = rateLimit({ windowMs: 60_000, max: 10 });

export async function GET(req: NextRequest) {
  try {
    const rl = limiter.check(req);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authUser.mongoUser._id.toString();
    const user = await checkAndApplyScheduledDowngrade(
      userId,
      authUser.mongoUser,
    );

    // Get active subscription
    const subscription = await getActiveSubscription(userId);

    // Calculate credits dynamically (admin bypass built-in)
    const { credits, effectivePlan } = await calculateUserCredits(userId, user);

    // Build payload
    const now = new Date();
    const offlineExpiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const rawStatus = subscription?.status;
    const mappedStatus: SubscriptionPayload["subscriptionStatus"] =
      rawStatus === "active" || rawStatus === "trialing" || rawStatus === "past_due"
        ? "active"
        : rawStatus
          ? "expired"
          : "none";

    const payload: SubscriptionPayload = {
      userId,
      plan: effectivePlan === "trial" ? "growth" : effectivePlan,
      subscriptionStatus: mappedStatus,
      creditsRemaining: credits,
      expiresAt: subscription?.currentPeriodEnd || null,
      lastVerifiedAt: now.toISOString(),
      offlineExpiresAt: offlineExpiresAt.toISOString(),
    };

    const signature = signPayload(payload);

    return NextResponse.json({ payload, signature });
  } catch (error) {
    console.error("Subscription state error:", error);
    if (error instanceof SubscriptionSigningConfigurationError) {
      return NextResponse.json(
        { error: "Subscription signing is not configured on this server." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
