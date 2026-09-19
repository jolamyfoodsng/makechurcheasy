/**
 * POST /api/admin/users/[id]/plan
 *
 * Admin-managed subscription action. Paid plans are treated as manually
 * confirmed subscriptions, useful when users pay an admin outside Paystack.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { logAuditEvent } from "@/lib/auditLog";
import {
  getPlanConfig,
  getSubscription,
  insertCreditTransaction,
  insertBillingTransaction,
  upsertSubscription,
} from "@/lib/db";
import { calculateUserCredits } from "@/lib/credits";
import {
  adminManagedSubscriptionEmail,
  sendEmail,
  subscriptionCancelledEmail,
} from "@/lib/emailTemplates";
import { getTrialForUser, updateTrialRecord } from "@/lib/trialRecords";
import { CreditTransactionType, type BillingCycle, type PlanTier } from "@/types/schemas";

const VALID_PLANS: PlanTier[] = ["free", "basic", "growth"];
const VALID_BILLING_CYCLES: BillingCycle[] = ["monthly", "yearly", "gift_3m", "gift_6m", "gift_12m"];
const PLAN_NAMES: Record<PlanTier, string> = {
  free: "Free",
  basic: "Basic",
  growth: "Growth",
};

function normalizePlan(plan: unknown): PlanTier | null {
  const normalized = String(plan || "").trim().toLowerCase();
  if (normalized === "pro") return "growth";
  return (VALID_PLANS as string[]).includes(normalized)
    ? (normalized as PlanTier)
    : null;
}

function normalizeBillingCycle(value: unknown): BillingCycle {
  const normalized = String(value || "monthly").trim().toLowerCase();
  return (VALID_BILLING_CYCLES as string[]).includes(normalized)
    ? (normalized as BillingCycle)
    : "monthly";
}

function parseAmount(value: unknown): number {
  if (value == null || value === "") return 0;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function addBillingPeriod(from: Date, billingCycle: BillingCycle): Date {
  const next = new Date(from);
  if (billingCycle === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  } else if (billingCycle === "gift_3m") {
    next.setMonth(next.getMonth() + 3);
  } else if (billingCycle === "gift_6m") {
    next.setMonth(next.getMonth() + 6);
  } else if (billingCycle === "gift_12m") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function formatMoney(amount: number, currency: string): string | undefined {
  if (!amount) return undefined;
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function getPlanChangeSource(previousPlan: PlanTier, nextPlan: PlanTier): "subscription_activation" | "monthly_renewal" | "plan_upgrade" | "plan_downgrade" {
  if (previousPlan === nextPlan) return "monthly_renewal";
  if (previousPlan === "free" && nextPlan !== "free") return "subscription_activation";
  const planOrder: Record<PlanTier, number> = { free: 0, basic: 1, growth: 2 };
  return planOrder[nextPlan] > planOrder[previousPlan] ? "plan_upgrade" : "plan_downgrade";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      plan?: unknown;
      billingCycle?: unknown;
      amountPaid?: unknown;
      currency?: unknown;
      paymentReference?: unknown;
      note?: unknown;
      notifyUser?: unknown;
    };
    const plan = normalizePlan(body.plan);

    if (!plan) {
      return NextResponse.json(
        { error: `plan must be one of: ${VALID_PLANS.join(", ")}` },
        { status: 400 },
      );
    }

    const { ObjectId } = await import("mongodb");
    const client = await clientPromise;
    const db = client.db();

    let objectId: InstanceType<typeof ObjectId>;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const user = await db.collection("users").findOne({ _id: objectId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const previousPlan = normalizePlan(user.plan) || "free";
    if (previousPlan === plan && plan === "free") {
      return NextResponse.json(
        { error: "User is already on this plan" },
        { status: 400 },
      );
    }

    const planConfig = await getPlanConfig();
    const now = new Date();
    const nowIso = now.toISOString();
    const billingCycle = normalizeBillingCycle(body.billingCycle);
    const amountPaid = parseAmount(body.amountPaid);
    const currency = String(body.currency || "NGN").trim().toUpperCase().slice(0, 8) || "NGN";
    const paymentReference = String(body.paymentReference || "").trim().slice(0, 120);
    const note = String(body.note || "").trim().slice(0, 500);
    const notifyUser = body.notifyUser !== false;
    const existingSubscription = await getSubscription(id).catch(() => null);
    const existingPeriodEndMs = existingSubscription?.currentPeriodEnd
      ? new Date(existingSubscription.currentPeriodEnd).getTime()
      : NaN;
    const isRenewal =
      plan !== "free" &&
      previousPlan === plan &&
      existingSubscription?.status === "active";
    const periodBase =
      isRenewal && Number.isFinite(existingPeriodEndMs) && existingPeriodEndMs > now.getTime()
        ? new Date(existingPeriodEndMs)
        : now;
    const expiresAt = addBillingPeriod(periodBase, billingCycle).toISOString();
    let credits = planConfig.plans[plan]?.credits ?? planConfig.plans.free.credits;
    let billingTransactionId = "";
    let emailSent = false;

    const setFields: Record<string, unknown> = {
      plan,
      credits,
      updatedAt: nowIso,
    };
    const unsetFields: Record<string, string> = {};
    let trialStopped = false;

    if (plan === "free") {
      credits = planConfig.plans.free.credits;
      setFields.credits = credits;
      setFields["adminManagedSubscription.active"] = false;
      setFields["adminManagedSubscription.endedAt"] = nowIso;
      setFields["adminManagedSubscription.endedBy"] = auth.adminUserId;
      setFields["adminManagedSubscription.endedReason"] = "admin_set_free";
      unsetFields.currentSubscriptionId = "";
      unsetFields.subscriptionExpiresAt = "";
      unsetFields.scheduledDowngradeAt = "";
    } else {
      // A paid subscription replaces the free trial. Stop it in both the
      // canonical trials collection and the legacy user field.
      const trialRecord = await getTrialForUser(id).catch(() => null);
      const hasActiveTrial =
        trialRecord?.status === "active" ||
        user.trial?.status === "active" ||
        user.trial?.active === true;
      if (hasActiveTrial) {
        if (trialRecord?._id) {
          await updateTrialRecord(trialRecord._id.toString(), {
            status: "stopped",
            stoppedAt: nowIso,
            stoppedReason: "converted_to_paid_plan",
            lastModifiedBy: auth.adminUserId,
          });
        }
        setFields.trial = {
          ...(user.trial || {}),
          active: false,
          status: "stopped",
          stoppedAt: nowIso,
          stoppedReason: "converted_to_paid_plan",
          lastModifiedBy: auth.adminUserId,
        };
        trialStopped = true;
      }

      const billingTransaction = await insertBillingTransaction({
        userId: id,
        plan,
        planName: PLAN_NAMES[plan],
        amount: amountPaid,
        currency,
        paymentProvider: "admin_collected",
        paystackReference: paymentReference || `admin-${Date.now()}-${id.slice(-6)}`,
        type: isRenewal ? "subscription_renewal" : "subscription_purchase",
        status: "success",
        billingCycle,
        expiresAt,
        paidAt: nowIso,
        createdAt: nowIso,
      });
      billingTransactionId = billingTransaction._id?.toString() || "";

      setFields.currentSubscriptionId = billingTransactionId;
      setFields.lastPaymentId = billingTransactionId;
      setFields.subscriptionExpiresAt = expiresAt;
      setFields.scheduledDowngradeAt = expiresAt;
      setFields["adminManagedSubscription.active"] = true;
      setFields["adminManagedSubscription.plan"] = plan;
      setFields["adminManagedSubscription.billingCycle"] = billingCycle;
      setFields["adminManagedSubscription.startedBy"] =
        user.adminManagedSubscription?.startedBy || auth.adminUserId;
      setFields["adminManagedSubscription.startedAt"] =
        user.adminManagedSubscription?.startedAt || nowIso;
      if (isRenewal) setFields["adminManagedSubscription.renewedAt"] = nowIso;
      setFields["adminManagedSubscription.expiresAt"] = expiresAt;
      setFields["adminManagedSubscription.amountCollected"] = amountPaid;
      setFields["adminManagedSubscription.currency"] = currency;
      setFields["adminManagedSubscription.paymentReference"] = paymentReference;
      setFields["adminManagedSubscription.note"] = note;
      setFields["adminManagedSubscription.endedAt"] = null;
      setFields["adminManagedSubscription.endedBy"] = null;
      setFields["adminManagedSubscription.endedReason"] = null;
      setFields["adminTemporaryPlan.active"] = false;
      setFields["adminTemporaryPlan.endedAt"] = nowIso;
      setFields["adminTemporaryPlan.endedBy"] = auth.adminUserId;
      setFields["adminTemporaryPlan.endedReason"] = "converted_to_admin_subscription";
    }

    await db.collection("users").updateOne(
      { _id: objectId },
      {
        $set: setFields,
        ...(Object.keys(unsetFields).length ? { $unset: unsetFields } : {}),
      },
    );

    if (plan === "free") {
      await upsertSubscription(id, {
        plan,
        status: "cancelled",
        autoRenew: false,
        cancelledAt: nowIso,
        currentPeriodEnd: nowIso,
      });
    } else {
      await upsertSubscription(id, {
        plan,
        status: "active",
        billingCycle,
        price: amountPaid,
        currency,
        startDate: existingSubscription?.startDate || nowIso,
        currentPeriodStart: periodBase.toISOString(),
        currentPeriodEnd: expiresAt,
        nextBillingDate: expiresAt,
        autoRenew: false,
        planVersion: planConfig.version,
        entitlements: planConfig.plans[plan]?.entitlements,
        paymentProvider: "admin_collected",
        adminManaged: true,
        managedByAdminId: auth.adminUserId,
        adminPaymentReference: paymentReference,
        adminPaymentNote: note,
        lastAdminPaymentAt: nowIso,
      });
    }

    const updatedUser = await db.collection("users").findOne({ _id: objectId });
    if (!updatedUser) {
      return NextResponse.json({ error: "User not found after update" }, { status: 404 });
    }

    const calculatedCredits = await calculateUserCredits(id, updatedUser);
    const targetCredits = credits;
    const creditDelta =
      calculatedCredits.unlimited || targetCredits === -1
        ? 0
        : targetCredits - calculatedCredits.credits;

    if (creditDelta !== 0) {
      const source = getPlanChangeSource(previousPlan, plan);
      await insertCreditTransaction({
        userId: id,
        type: creditDelta > 0 ? CreditTransactionType.ADMIN_GRANT : CreditTransactionType.REVOCATION,
        source,
        amount: creditDelta,
        balanceAfter: targetCredits,
        description:
          creditDelta > 0
            ? `Admin plan change credit top-up: ${PLAN_NAMES[previousPlan] || previousPlan} → ${PLAN_NAMES[plan]}`
            : `Admin plan change credit reset: ${PLAN_NAMES[previousPlan] || previousPlan} → ${PLAN_NAMES[plan]}`,
        metadata: {
          adminId: auth.adminUserId,
          createdBy: `admin:${auth.adminUserId}`,
          reason: "Admin-managed plan change credit rebalance",
          previousCredits: calculatedCredits.credits,
          previousPlan,
          plan,
          billingCycle,
          billingTransactionId,
          expiresAt: plan === "free" ? undefined : expiresAt,
        },
        createdAt: nowIso,
      });
    }

    if (notifyUser && user.email) {
      if (plan === "free") {
        emailSent = await sendEmail(
          subscriptionCancelledEmail({
            userName: user.name || "there",
            userEmail: user.email,
            planName: PLAN_NAMES[previousPlan] || previousPlan,
            expiresAt: nowIso,
          }),
        ).catch((err) => {
          console.error("[AdminPlan] Failed to send downgrade email:", err);
          return false;
        });
      } else {
        emailSent = await sendEmail(
          adminManagedSubscriptionEmail({
            userName: user.name || "there",
            userEmail: user.email,
            planName: PLAN_NAMES[plan],
            billingCycle,
            expiresAt,
            mode: isRenewal ? "renewed" : "started",
            amountPaid: formatMoney(amountPaid, currency),
            paymentReference,
          }),
        ).catch((err) => {
          console.error("[AdminPlan] Failed to send subscription email:", err);
          return false;
        });
      }

      if (emailSent && plan !== "free") {
        await db.collection("users").updateOne(
          { _id: objectId },
          { $set: { "adminManagedSubscription.emailSentAt": new Date().toISOString() } },
        );
      }
    }

    await logAuditEvent({
      adminId: auth.adminUserId,
      action:
        plan === "free"
          ? "plan_change"
          : isRenewal
            ? "admin_subscription_renew"
            : "admin_subscription_start",
      targetUserId: id,
      details: {
        previousPlan,
        newPlan: plan,
        billingCycle,
        amountPaid,
        currency,
        paymentReference,
        expiresAt: plan === "free" ? null : expiresAt,
        credits,
        creditAdjustment: creditDelta,
        emailSent,
        trialStopped,
      },
      timestamp: new Date(),
    });

    return NextResponse.json({
      success: true,
      previousPlan,
      plan,
      credits,
      creditAdjustment: creditDelta,
      billingCycle,
      operation: plan === "free" ? "downgraded" : isRenewal ? "renewed" : "started",
      subscriptionExpiresAt: plan === "free" ? null : expiresAt,
      scheduledDowngradeAt: plan === "free" ? null : expiresAt,
      billingTransactionId,
      emailSent,
      trial: updatedUser.trial || null,
      adminManagedSubscription:
        plan === "free"
          ? {
            ...(user.adminManagedSubscription || {}),
            active: false,
            endedAt: nowIso,
            endedBy: auth.adminUserId,
            endedReason: "admin_set_free",
          }
          : {
            active: true,
            plan,
            billingCycle,
            startedBy: user.adminManagedSubscription?.startedBy || auth.adminUserId,
            startedAt: user.adminManagedSubscription?.startedAt || nowIso,
            ...(isRenewal ? { renewedAt: nowIso } : {}),
            expiresAt,
            amountCollected: amountPaid,
            currency,
            paymentReference,
            note,
            ...(emailSent ? { emailSentAt: new Date().toISOString() } : {}),
          },
    });
  } catch (error) {
    console.error("Plan change error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
