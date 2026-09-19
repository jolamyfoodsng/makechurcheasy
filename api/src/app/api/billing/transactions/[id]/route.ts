/**
 * GET /api/billing/transactions/[id]
 *
 * Returns a single transaction (billing or credit) by ID,
 * normalized for the transaction detail page.
 *
 * Ownership check: only the transaction owner can access it.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import {
  getBillingTransactionById,
  getCreditTransactionById,
  getSubscription,
} from "@/lib/db";
import { ObjectId } from "mongodb";

function normalizeBillingTransaction(
  txn: any,
  subscription: any | null,
): Record<string, unknown> {
  const amount = Number(txn.amount || 0);
  const discount = Number(txn.discount || 0);
  const subtotal = Number(txn.subtotal || (discount > 0 ? amount + discount : amount));
  return {
    _id: txn._id.toString(),
    category: "billing",
    reference: txn.providerReference || txn.paystackReference || "",
    type: txn.type || "subscription_purchase",
    status: txn.status || "success",
    title: txn.type === "credit_purchase"
      ? "Credit Purchase"
      : `${(txn.planName || txn.plan || "Unknown")} Subscription`,
    description: txn.type === "subscription_purchase"
      ? `${txn.planName || txn.plan} ${txn.billingCycle || "Monthly"} Subscription`
      : txn.type === "subscription_renewal"
        ? `${txn.planName || txn.plan} ${txn.billingCycle || "Monthly"} Renewal`
        : txn.type === "plan_upgrade"
          ? `Plan upgraded to ${txn.planName || txn.plan}`
          : txn.type === "credit_purchase"
            ? "Credit Pack Purchase"
            : txn.type === "refund"
              ? "Refund"
              : `${txn.planName || txn.plan || ""} Transaction`,
    amount,
    currency: txn.currency || "USD",
    subtotal,
    discount,
    discountCode: txn.discountCode || null,
    discountPercent: txn.discountPercent || null,
    discountDurationMonths: txn.discountDurationMonths || null,
    tax: 0,
    total: amount,
    paymentMethod: txn.paymentMethod || null,
    paymentProvider: txn.paymentProvider || "paystack",
    providerReference: txn.providerReference || txn.paystackReference || "",
    plan: txn.plan || "",
    planName: txn.planName || txn.plan || "",
    billingCycle: txn.billingCycle || "monthly",
    billingPeriodStart: txn.paidAt || null,
    billingPeriodEnd: txn.expiresAt || null,
    nextBillingDate: subscription?.nextBillingDate || null,
    autoRenew: subscription?.autoRenew ?? true,
    failureCode: txn.status === "failed" ? txn.failureCode || null : null,
    failureReason: txn.status === "failed" ? txn.failureReason || "Payment could not be completed" : null,
    receiptUrl: txn.receiptUrl || null,
    paidAt: txn.paidAt || null,
    createdAt: txn.createdAt || new Date().toISOString(),
    userId: txn.userId,
  };
}

function normalizeCreditTransaction(
  txn: any,
  planConfig: any | null,
): Record<string, unknown> {
  const isAiUsage = ["transcription", "translation", "ai_generation"].includes(txn.source || "");
  const creditCosts = planConfig?.creditCosts || [];

  return {
    _id: txn._id.toString(),
    category: isAiUsage ? "ai_usage" : "credit",
    reference: `CR-${txn._id.toString().slice(-8)}`,
    type: isAiUsage ? "ai_usage" : txn.source || txn.type || "credit",
    status: "completed",
    title: isAiUsage
      ? (txn.source === "transcription" ? "Speech-to-Scripture" : txn.source === "translation" ? "Live Translation" : "AI Generation")
      : txn.type === "allocation"
        ? `${txn.description?.split("Plan")[0] || "Credit"} Renewal`
        : txn.type === "admin_grant"
          ? "Admin Credit Adjustment"
          : txn.type === "refund"
            ? "Credit Refund"
            : txn.description || "Credit Transaction",
    description: txn.description || "Credit transaction",
    amount: Math.abs(txn.amount || 0),
    isCredit: (txn.amount || 0) >= 0,
    creditChange: txn.amount || 0,
    balanceBefore: txn.balanceBefore ?? null,
    balanceAfter: txn.balanceAfter ?? null,
    feature: isAiUsage ? (txn.metadata?.feature || txn.source || "AI Service") : null,
    usageQuantity: isAiUsage ? (txn.metadata?.minutes || txn.metadata?.words || Math.abs(txn.amount || 0)) : null,
    usageUnit: txn.metadata?.words ? "words" : "minutes",
    duration: txn.metadata?.minutes
      ? `${txn.metadata.minutes} minute${txn.metadata.minutes !== 1 ? "s" : ""} ${txn.metadata.seconds ? `${txn.metadata.seconds} seconds` : ""}`
      : null,
    creditCosts: creditCosts.length > 0 ? creditCosts : null,
    createdAt: txn.createdAt || new Date().toISOString(),
    userId: txn.userId,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Transaction ID required" }, { status: 400 });
    }

    let txn: any = null;
    let category: string = "billing";

    if (id.startsWith("CR-")) {
      const actualId = id.replace("CR-", "");
      txn = await getCreditTransactionById(actualId);
      category = "credit";
    } else {
      txn = await getBillingTransactionById(id);
      if (!txn) {
        txn = await getCreditTransactionById(id);
        category = "credit";
      }
    }

    if (!txn) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (txn.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let normalized: Record<string, unknown>;

    if (category === "billing" || !("source" in (txn || {}))) {
      const subscription = await getSubscription(userId);
      normalized = normalizeBillingTransaction(txn, subscription);
    } else {
      const { getPlanConfig } = await import("@/lib/db");
      const planConfig = await getPlanConfig();
      normalized = normalizeCreditTransaction(txn, planConfig);
    }

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("Get transaction detail error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
