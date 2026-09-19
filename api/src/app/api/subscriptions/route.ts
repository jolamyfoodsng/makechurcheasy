import { NextRequest, NextResponse } from "next/server";
import { getSubscription, upsertSubscription, getPlanConfig } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import type { PlanTier } from "@/types/schemas";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const subscription = await getSubscription(userId);

    // Use users.plan as the authoritative plan source.
    // This prevents stale subscription.plan values from causing mismatches.
    const client = await clientPromise;
    const db = client.db();
    const user = await db.collection("users").findOne({ _id: new (await import("mongodb")).ObjectId(userId) });
    const userPlan = (user?.plan as string) || "free";

    if (subscription) {
      // If subscription plan differs from users.plan, sync it
      if (subscription.plan !== userPlan) {
        const syncStatus = userPlan === "free" ? "cancelled" : "active";
        await upsertSubscription(userId, { plan: userPlan as PlanTier, status: syncStatus });
        subscription.plan = userPlan as PlanTier;
      }

      // Check if pendingPlan matches current userPlan. If so, clean it up from DB.
      if (
        subscription.pendingPlan &&
        subscription.pendingPlan.toLowerCase() === userPlan.toLowerCase()
      ) {
        await db.collection("subscriptions").updateOne(
          { userId },
          {
            $unset: {
              pendingPlan: "",
              pendingChangeType: "",
              pendingChangeEffectiveAt: "",
            },
            $set: { updatedAt: new Date().toISOString() },
          }
        );
        try {
          await db.collection("users").updateOne(
            { _id: new (await import("mongodb")).ObjectId(userId) },
            { $unset: { scheduledDowngradeAt: "" } }
          );
        } catch {}
        delete (subscription as any).pendingPlan;
        delete (subscription as any).pendingChangeType;
        delete (subscription as any).pendingChangeEffectiveAt;
      }

      return NextResponse.json(subscription);
    }

    // No subscription record — create one using the authoritative user plan
    const now = new Date().toISOString();
    return NextResponse.json({
      userId,
      plan: userPlan,
      status: "active",
      billingCycle: "month",
      price: 0,
      currency: "USD",
      startDate: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      nextBillingDate: null,
      autoRenew: false,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error("Get subscription error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const body = (await req.json()) as Record<string, any>;
    const { action, plan: targetPlan } = body;

    // ── Scheduled downgrade flow ──────────────────────────────────────────────
    if (action === "scheduleDowngrade" && targetPlan) {
      const planConfig = await getPlanConfig();
      if (!planConfig.plans[targetPlan]) {
        return NextResponse.json(
          { error: `Unknown plan: ${targetPlan}` },
          { status: 400 },
        );
      }

      // Only paid plans can schedule downgrades (free users upgrade via payment)
      if (authUser.mongoUser.plan === "free") {
        return NextResponse.json(
          { error: "Free plan users should upgrade via payment" },
          { status: 400 },
        );
      }

      if (targetPlan.toLowerCase() === (authUser.mongoUser.plan || "").toLowerCase()) {
        return NextResponse.json(
          { error: "Target plan is the same as your current plan" },
          { status: 400 },
        );
      }

      const currentPlan = authUser.mongoUser.plan;
      const currentSubscription = await getSubscription(userId);

      // Determine the effective date: end of current billing period
      const effectiveAt = currentSubscription?.currentPeriodEnd
        || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Update the subscription with pending change
      const updated = await upsertSubscription(userId, {
        pendingPlan: targetPlan as PlanTier,
        pendingChangeType: "downgrade",
        pendingChangeEffectiveAt: effectiveAt,
        // Keep current plan active until effective date
        status: "active",
      });

      // Also set on user document for the existing scheduledDowngrade system
      const client = await clientPromise;
      const db = client.db();
      await db.collection("users").updateOne(
        { _id: new (await import("mongodb")).ObjectId(userId) },
        { $set: { scheduledDowngradeAt: effectiveAt } },
      );

      return NextResponse.json({
        ...updated,
        message: `Downgrade to ${targetPlan} scheduled for ${new Date(effectiveAt).toLocaleDateString()}`,
      });
    }

    // ── Cancel scheduled change ───────────────────────────────────────────────
    if (action === "cancelPendingChange") {
      const client = await clientPromise;
      const db = client.db();
      await db.collection("subscriptions").updateOne(
        { userId },
        {
          $unset: {
            pendingPlan: "",
            pendingChangeType: "",
            pendingChangeEffectiveAt: "",
          },
          $set: { updatedAt: new Date().toISOString() },
        }
      );
      // Also clear the user doc field
      try {
        await db.collection("users").updateOne(
          { _id: new (await import("mongodb")).ObjectId(userId) },
          { $unset: { scheduledDowngradeAt: "" } },
        );
      } catch {}

      const updated = await getSubscription(userId);
      return NextResponse.json({ ...updated, message: "Scheduled change cancelled" });
    }

    // ── Legacy update flow ────────────────────────────────────────────────────
    const { userId: _ignored, action: _a, plan: _p, ...updates } = body;

    const allowedFields = [
      "plan",
      "status",
      "billingCycle",
      "price",
      "currency",
      "startDate",
      "currentPeriodStart",
      "currentPeriodEnd",
      "nextBillingDate",
      "autoRenew",
      "cancelledAt",
    ];

    const sanitized: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        sanitized[key] = updates[key];
      }
    }

    if (Object.keys(sanitized).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    if (sanitized.plan) {
      const planConfig = await getPlanConfig();
      if (!planConfig.plans[sanitized.plan as string]) {
        return NextResponse.json({ error: `Unknown plan: ${sanitized.plan}` }, { status: 400 });
      }
    }

    const subscription = await upsertSubscription(userId, sanitized);
    return NextResponse.json(subscription);
  } catch (error) {
    console.error("Upsert subscription error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
