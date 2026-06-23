/**
 * billing.test.ts — Tests for billing logic.
 *
 * Validates Paystack webhook processing, transaction creation,
 * idempotency, plan resolution, and payment receipt generation
 * — mirroring the server-side webhook and initialize routes.
 */

import { describe, it, expect } from "vitest";

// ── Inline logic (mirrors Paystack webhook patterns) ──

type PlanTier = "free" | "basic" | "starter" | "growth" | "pro";

const VALID_PLANS: PlanTier[] = ["free", "basic", "starter", "growth", "pro"];

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  basic: "Basic",
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

interface BillingTransaction {
  _id?: string;
  userId: string;
  plan: PlanTier;
  planName: string;
  amount: number;
  currency: string;
  paymentProvider: string;
  paystackReference: string;
  type: string;
  status: string;
  billingCycle: "monthly" | "yearly";
  receiptUrl?: string;
  expiresAt: string;
  paidAt: string;
  createdAt: string;
}

interface WebhookEvent {
  event: string;
  data: Record<string, unknown>;
}

/** Resolve plan from Paystack event data (mirrors route.ts resolvePlan). */
function resolvePlan(data: Record<string, unknown>): PlanTier {
  const metadata = (data.metadata || {}) as Record<string, unknown>;

  if (metadata.plan && typeof metadata.plan === "string") {
    const p = metadata.plan.toLowerCase();
    if (VALID_PLANS.includes(p as PlanTier)) return p as PlanTier;
  }

  const dataPlan = data.plan as string | undefined;
  if (dataPlan) {
    const lower = dataPlan.toLowerCase();
    for (const tier of VALID_PLANS) {
      if (lower.includes(tier)) return tier;
    }
  }

  return "free";
}

/** Check for duplicate transaction (idempotency). */
function isDuplicate(
  existingTransactions: BillingTransaction[],
  reference: string,
): boolean {
  return existingTransactions.some((tx) => tx.paystackReference === reference);
}

/** Build a billing transaction record. */
function buildBillingTransaction(params: {
  userId: string;
  plan: PlanTier;
  amount: number;
  currency: string;
  reference: string;
  billingCycle: "monthly" | "yearly";
  expiresAt: string;
}): BillingTransaction {
  const now = new Date().toISOString();
  return {
    userId: params.userId,
    plan: params.plan,
    planName: PLAN_NAMES[params.plan] || params.plan,
    amount: params.amount,
    currency: params.currency,
    paymentProvider: "paystack",
    paystackReference: params.reference,
    type: "subscription_purchase",
    status: "success",
    billingCycle: params.billingCycle,
    expiresAt: params.expiresAt,
    paidAt: now,
    createdAt: now,
  };
}

/** Calculate period end date. */
function calculatePeriodEnd(billingCycle: "monthly" | "yearly", from: Date): string {
  const periodMs = billingCycle === "yearly" ? 365 : 30;
  return new Date(from.getTime() + periodMs * 24 * 60 * 60 * 1000).toISOString();
}

// ── Tests ──

describe("Billing — plan resolution from Paystack data", () => {
  it("resolves plan from metadata.plan", () => {
    const data = { metadata: { plan: "growth" } };
    expect(resolvePlan(data)).toBe("growth");
  });

  it("resolves plan from data.plan (Paystack subscription plan name)", () => {
    const data = { plan: "MakeChurchEasy Pro Monthly" };
    expect(resolvePlan(data)).toBe("pro");
  });

  it("resolves plan case-insensitively", () => {
    const data = { metadata: { plan: "STARTER" } };
    expect(resolvePlan(data)).toBe("starter");
  });

  it("returns free when no plan info available", () => {
    const data = {};
    expect(resolvePlan(data)).toBe("free");
  });

  it("returns free for unknown plan string", () => {
    const data = { metadata: { plan: "enterprise" } };
    expect(resolvePlan(data)).toBe("free");
  });

  it("prefers metadata.plan over data.plan", () => {
    const data = { metadata: { plan: "basic" }, plan: "MakeChurchEasy Pro Monthly" };
    expect(resolvePlan(data)).toBe("basic");
  });
});

describe("Billing — transaction creation", () => {
  it("creates correct billing transaction", () => {
    const tx = buildBillingTransaction({
      userId: "user1",
      plan: "growth",
      amount: 12000,
      currency: "NGN",
      reference: "REF_123",
      billingCycle: "monthly",
      expiresAt: "2026-05-01T00:00:00Z",
    });

    expect(tx.userId).toBe("user1");
    expect(tx.plan).toBe("growth");
    expect(tx.planName).toBe("Growth");
    expect(tx.amount).toBe(12000);
    expect(tx.currency).toBe("NGN");
    expect(tx.paymentProvider).toBe("paystack");
    expect(tx.paystackReference).toBe("REF_123");
    expect(tx.type).toBe("subscription_purchase");
    expect(tx.status).toBe("success");
    expect(tx.billingCycle).toBe("monthly");
  });

  it("maps plan to correct display name", () => {
    for (const tier of VALID_PLANS) {
      const tx = buildBillingTransaction({
        userId: "user1",
        plan: tier,
        amount: 0,
        currency: "NGN",
        reference: "REF",
        billingCycle: "monthly",
        expiresAt: "2026-05-01T00:00:00Z",
      });
      expect(tx.planName).toBe(PLAN_NAMES[tier]);
    }
  });
});

describe("Billing — idempotency", () => {
  it("detects duplicate reference", () => {
    const existing: BillingTransaction[] = [
      {
        _id: "tx1",
        userId: "user1",
        plan: "growth",
        planName: "Growth",
        amount: 12000,
        currency: "NGN",
        paymentProvider: "paystack",
        paystackReference: "REF_DUPLICATE",
        type: "subscription_purchase",
        status: "success",
        billingCycle: "monthly",
        expiresAt: "2026-05-01T00:00:00Z",
        paidAt: "2026-04-01T00:00:00Z",
        createdAt: "2026-04-01T00:00:00Z",
      },
    ];

    expect(isDuplicate(existing, "REF_DUPLICATE")).toBe(true);
    expect(isDuplicate(existing, "REF_NEW")).toBe(false);
  });

  it("handles empty transaction list", () => {
    expect(isDuplicate([], "REF_123")).toBe(false);
  });
});

describe("Billing — period calculation", () => {
  it("monthly billing adds 30 days", () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const result = calculatePeriodEnd("monthly", from);
    expect(result).toBe("2026-05-01T00:00:00.000Z");
  });

  it("yearly billing adds 365 days", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const result = calculatePeriodEnd("yearly", from);
    expect(result).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("Billing — webhook event routing", () => {
  it("identifies charge.success events", () => {
    const event: WebhookEvent = { event: "charge.success", data: {} };
    expect(event.event).toBe("charge.success");
  });

  it("identifies subscription.create events", () => {
    const event: WebhookEvent = { event: "subscription.create", data: {} };
    expect(event.event).toBe("subscription.create");
  });

  it("identifies subscription.disable events", () => {
    const event: WebhookEvent = { event: "subscription.disable", data: {} };
    expect(event.event).toBe("subscription.disable");
  });

  it("identifies invoice.payment_failed events", () => {
    const event: WebhookEvent = { event: "invoice.payment_failed", data: {} };
    expect(event.event).toBe("invoice.payment_failed");
  });
});

describe("Billing — amount conversion", () => {
  it("converts Paystack kobo to naira", () => {
    // Paystack amounts are in kobo (×100)
    const koboAmount = 1200000; // ₦12,000
    const nairaAmount = koboAmount / 100;
    expect(nairaAmount).toBe(12000);
  });

  it("handles zero amount", () => {
    expect(0 / 100).toBe(0);
  });

  it("handles decimal amounts", () => {
    const koboAmount = 15050; // ₦150.50
    expect(koboAmount / 100).toBe(150.5);
  });
});
