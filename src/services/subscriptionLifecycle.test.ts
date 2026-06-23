/**
 * subscriptionLifecycle.test.ts — Tests for subscription lifecycle logic.
 *
 * Validates cancellation handling, scheduled downgrades, expiration processing,
 * and period-end access preservation — mirroring the Paystack webhook and
 * cron job logic in the server routes.
 */

import { describe, it, expect } from "vitest";

// ── Inline logic (mirrors webhook + cron patterns) ──

type SubStatus = "active" | "cancelled" | "past_due" | "trialing";

interface Subscription {
  _id: string;
  userId: string;
  plan: string;
  status: SubStatus;
  billingCycle: "monthly" | "yearly";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
  cancelledAt?: string;
  paystackSubscriptionCode?: string;
  paystackCustomerCode?: string;
  entitlements?: Record<string, unknown>;
  planVersion?: number;
}

interface User {
  _id: string;
  email: string;
  name: string;
  plan: string;
  credits: number;
  currentSubscriptionId?: string;
  subscriptionExpiresAt?: string;
  scheduledDowngradeAt?: string;
  trial?: {
    active?: boolean;
    startedAt?: string;
    endsAt?: string;
    durationDays?: number;
    welcomeShown?: boolean;
  };
  trialExpiredSent?: boolean;
  trialReminder3Sent?: boolean;
  trialReminder1Sent?: boolean;
}

/** Simulate the subscription.disable webhook handler. */
function handleSubscriptionDisable(
  subscriptions: Subscription[],
  users: User[],
  subCode: string,
  now: string,
): { updatedSub: Subscription | null; updatedUser: User | null } {
  // Find and cancel the subscription
  let updatedSub: Subscription | null = null;
  for (const sub of subscriptions) {
    if (sub.paystackSubscriptionCode === subCode) {
      sub.status = "cancelled";
      sub.cancelledAt = now;
      sub.autoRenew = false;
      updatedSub = sub;
      break;
    }
  }

  if (!updatedSub) return { updatedSub: null, updatedUser: null };

  // Do NOT downgrade immediately — preserve access until currentPeriodEnd
  let updatedUser: User | null = null;
  for (const user of users) {
    if (user._id === updatedSub.userId) {
      user.currentSubscriptionId = "";
      user.scheduledDowngradeAt = updatedSub.currentPeriodEnd;
      updatedUser = user;
      break;
    }
  }

  return { updatedSub, updatedUser };
}

/** Simulate the cron job's scheduled downgrade processing (section 5a). */
function processScheduledDowngrades(
  users: User[],
  now: Date,
): { downgraded: string[] } {
  const downgraded: string[] = [];
  for (const user of users) {
    if (!user.scheduledDowngradeAt) continue;
    if (new Date(user.scheduledDowngradeAt).getTime() > now.getTime()) continue;

    user.plan = "free";
    user.credits = 25;
    user.scheduledDowngradeAt = undefined;
    user.currentSubscriptionId = "";
    user.subscriptionExpiresAt = undefined;
    downgraded.push(user._id);
  }
  return { downgraded };
}

/** Simulate the cron job's expired subscription processing (section 5b). */
function processExpiredSubscriptions(
  subscriptions: Subscription[],
  users: User[],
  now: Date,
): { downgraded: string[] } {
  const downgraded: string[] = [];
  for (const sub of subscriptions) {
    if (sub.status !== "cancelled") continue;
    if (!sub.currentPeriodEnd) continue;
    if (new Date(sub.currentPeriodEnd).getTime() > now.getTime()) continue;

    const user = users.find((u) => u._id === sub.userId);
    if (!user) continue;
    if (user.plan === "free") continue; // already processed

    user.plan = "free";
    user.credits = 25;
    user.currentSubscriptionId = "";
    user.subscriptionExpiresAt = undefined;
    downgraded.push(user._id);
  }
  return { downgraded };
}

// ── Tests ──

describe("Subscription disable webhook", () => {
  it("marks subscription as cancelled with autoRenew false", () => {
    const subs: Subscription[] = [
      {
        _id: "sub1",
        userId: "user1",
        plan: "growth",
        status: "active",
        billingCycle: "monthly",
        currentPeriodStart: "2026-04-01T00:00:00Z",
        currentPeriodEnd: "2026-05-01T00:00:00Z",
        autoRenew: true,
        paystackSubscriptionCode: "SUB_123",
      },
    ];
    const users: User[] = [
      { _id: "user1", email: "a@test.com", name: "A", plan: "growth", credits: 2000 },
    ];

    const result = handleSubscriptionDisable(subs, users, "SUB_123", "2026-04-15T12:00:00Z");

    expect(result.updatedSub).not.toBeNull();
    expect(result.updatedSub!.status).toBe("cancelled");
    expect(result.updatedSub!.autoRenew).toBe(false);
    expect(result.updatedSub!.cancelledAt).toBe("2026-04-15T12:00:00Z");
  });

  it("does NOT immediately downgrade user to free", () => {
    const subs: Subscription[] = [
      {
        _id: "sub1",
        userId: "user1",
        plan: "pro",
        status: "active",
        billingCycle: "yearly",
        currentPeriodStart: "2026-01-01T00:00:00Z",
        currentPeriodEnd: "2026-12-31T23:59:59Z",
        autoRenew: true,
        paystackSubscriptionCode: "SUB_456",
      },
    ];
    const users: User[] = [
      { _id: "user1", email: "b@test.com", name: "B", plan: "pro", credits: -1 },
    ];

    const result = handleSubscriptionDisable(subs, users, "SUB_456", "2026-06-01T00:00:00Z");

    // User plan should remain "pro" — not downgraded yet
    expect(result.updatedUser!.plan).toBe("pro");
    expect(result.updatedUser!.credits).toBe(-1);
  });

  it("sets scheduledDowngradeAt to currentPeriodEnd", () => {
    const periodEnd = "2026-05-01T00:00:00Z";
    const subs: Subscription[] = [
      {
        _id: "sub1",
        userId: "user1",
        plan: "growth",
        status: "active",
        billingCycle: "monthly",
        currentPeriodStart: "2026-04-01T00:00:00Z",
        currentPeriodEnd: periodEnd,
        autoRenew: true,
        paystackSubscriptionCode: "SUB_789",
      },
    ];
    const users: User[] = [
      { _id: "user1", email: "c@test.com", name: "C", plan: "growth", credits: 2000 },
    ];

    handleSubscriptionDisable(subs, users, "SUB_789", "2026-04-10T00:00:00Z");

    expect(users[0].scheduledDowngradeAt).toBe(periodEnd);
  });

  it("clears currentSubscriptionId on the user", () => {
    const subs: Subscription[] = [
      {
        _id: "sub1",
        userId: "user1",
        plan: "basic",
        status: "active",
        billingCycle: "monthly",
        currentPeriodStart: "2026-04-01T00:00:00Z",
        currentPeriodEnd: "2026-05-01T00:00:00Z",
        autoRenew: true,
        paystackSubscriptionCode: "SUB_ABC",
      },
    ];
    const users: User[] = [
      { _id: "user1", email: "d@test.com", name: "D", plan: "basic", credits: 50, currentSubscriptionId: "sub1" },
    ];

    handleSubscriptionDisable(subs, users, "SUB_ABC", "2026-04-15T00:00:00Z");

    expect(users[0].currentSubscriptionId).toBe("");
  });

  it("returns null when subscription code not found", () => {
    const subs: Subscription[] = [];
    const users: User[] = [];

    const result = handleSubscriptionDisable(subs, users, "NONEXISTENT", "2026-04-15T00:00:00Z");

    expect(result.updatedSub).toBeNull();
    expect(result.updatedUser).toBeNull();
  });
});

describe("Scheduled downgrade processing (cron 5a)", () => {
  it("downgrades user when scheduledDowngradeAt is in the past", () => {
    const users: User[] = [
      {
        _id: "user1",
        email: "a@test.com",
        name: "A",
        plan: "growth",
        credits: 2000,
        scheduledDowngradeAt: "2026-04-01T00:00:00Z",
      },
    ];

    const now = new Date("2026-04-15T12:00:00Z");
    const result = processScheduledDowngrades(users, now);

    expect(result.downgraded).toContain("user1");
    expect(users[0].plan).toBe("free");
    expect(users[0].credits).toBe(25);
    expect(users[0].scheduledDowngradeAt).toBeUndefined();
    expect(users[0].currentSubscriptionId).toBe("");
  });

  it("does NOT downgrade user when scheduledDowngradeAt is in the future", () => {
    const users: User[] = [
      {
        _id: "user1",
        email: "b@test.com",
        name: "B",
        plan: "pro",
        credits: -1,
        scheduledDowngradeAt: "2026-12-31T23:59:59Z",
      },
    ];

    const now = new Date("2026-04-15T12:00:00Z");
    const result = processScheduledDowngrades(users, now);

    expect(result.downgraded).toHaveLength(0);
    expect(users[0].plan).toBe("pro");
  });

  it("skips users without scheduledDowngradeAt", () => {
    const users: User[] = [
      { _id: "user1", email: "c@test.com", name: "C", plan: "growth", credits: 2000 },
    ];

    const now = new Date("2026-04-15T12:00:00Z");
    const result = processScheduledDowngrades(users, now);

    expect(result.downgraded).toHaveLength(0);
  });

  it("processes multiple users independently", () => {
    const users: User[] = [
      {
        _id: "user1",
        email: "a@test.com",
        name: "A",
        plan: "growth",
        credits: 2000,
        scheduledDowngradeAt: "2026-04-01T00:00:00Z", // past
      },
      {
        _id: "user2",
        email: "b@test.com",
        name: "B",
        plan: "pro",
        credits: -1,
        scheduledDowngradeAt: "2026-12-31T23:59:59Z", // future
      },
      {
        _id: "user3",
        email: "c@test.com",
        name: "C",
        plan: "starter",
        credits: 500,
        scheduledDowngradeAt: "2026-03-01T00:00:00Z", // past
      },
    ];

    const now = new Date("2026-04-15T12:00:00Z");
    const result = processScheduledDowngrades(users, now);

    expect(result.downgraded).toEqual(["user1", "user3"]);
    expect(users[0].plan).toBe("free");
    expect(users[1].plan).toBe("pro"); // unchanged
    expect(users[2].plan).toBe("free");
  });
});

describe("Expired subscription processing (cron 5b)", () => {
  it("downgrades user when cancelled sub's periodEnd is past", () => {
    const subs: Subscription[] = [
      {
        _id: "sub1",
        userId: "user1",
        plan: "growth",
        status: "cancelled",
        billingCycle: "monthly",
        currentPeriodStart: "2026-03-01T00:00:00Z",
        currentPeriodEnd: "2026-04-01T00:00:00Z",
        autoRenew: false,
      },
    ];
    const users: User[] = [
      { _id: "user1", email: "a@test.com", name: "A", plan: "growth", credits: 2000 },
    ];

    const now = new Date("2026-04-15T12:00:00Z");
    const result = processExpiredSubscriptions(subs, users, now);

    expect(result.downgraded).toContain("user1");
    expect(users[0].plan).toBe("free");
    expect(users[0].credits).toBe(25);
  });

  it("skips active subscriptions", () => {
    const subs: Subscription[] = [
      {
        _id: "sub1",
        userId: "user1",
        plan: "growth",
        status: "active",
        billingCycle: "monthly",
        currentPeriodStart: "2026-04-01T00:00:00Z",
        currentPeriodEnd: "2026-05-01T00:00:00Z",
        autoRenew: true,
      },
    ];
    const users: User[] = [
      { _id: "user1", email: "a@test.com", name: "A", plan: "growth", credits: 2000 },
    ];

    const now = new Date("2026-04-15T12:00:00Z");
    const result = processExpiredSubscriptions(subs, users, now);

    expect(result.downgraded).toHaveLength(0);
  });

  it("skips already-free users", () => {
    const subs: Subscription[] = [
      {
        _id: "sub1",
        userId: "user1",
        plan: "growth",
        status: "cancelled",
        billingCycle: "monthly",
        currentPeriodStart: "2026-03-01T00:00:00Z",
        currentPeriodEnd: "2026-04-01T00:00:00Z",
        autoRenew: false,
      },
    ];
    const users: User[] = [
      { _id: "user1", email: "a@test.com", name: "A", plan: "free", credits: 25 },
    ];

    const now = new Date("2026-04-15T12:00:00Z");
    const result = processExpiredSubscriptions(subs, users, now);

    expect(result.downgraded).toHaveLength(0);
  });

  it("skips cancelled subs whose periodEnd is still in the future", () => {
    const subs: Subscription[] = [
      {
        _id: "sub1",
        userId: "user1",
        plan: "growth",
        status: "cancelled",
        billingCycle: "monthly",
        currentPeriodStart: "2026-04-01T00:00:00Z",
        currentPeriodEnd: "2026-05-01T00:00:00Z",
        autoRenew: false,
      },
    ];
    const users: User[] = [
      { _id: "user1", email: "a@test.com", name: "A", plan: "growth", credits: 2000 },
    ];

    const now = new Date("2026-04-15T12:00:00Z");
    const result = processExpiredSubscriptions(subs, users, now);

    expect(result.downgraded).toHaveLength(0);
    expect(users[0].plan).toBe("growth");
  });

  it("does not downgrade if user not found", () => {
    const subs: Subscription[] = [
      {
        _id: "sub1",
        userId: "nonexistent",
        plan: "growth",
        status: "cancelled",
        billingCycle: "monthly",
        currentPeriodStart: "2026-03-01T00:00:00Z",
        currentPeriodEnd: "2026-04-01T00:00:00Z",
        autoRenew: false,
      },
    ];
    const users: User[] = [];

    const now = new Date("2026-04-15T12:00:00Z");
    const result = processExpiredSubscriptions(subs, users, now);

    expect(result.downgraded).toHaveLength(0);
  });
});

describe("Subscription lifecycle — end-to-end", () => {
  it("cancel → wait → expire → downgrade flow", () => {
    const subs: Subscription[] = [
      {
        _id: "sub1",
        userId: "user1",
        plan: "growth",
        status: "active",
        billingCycle: "monthly",
        currentPeriodStart: "2026-04-01T00:00:00Z",
        currentPeriodEnd: "2026-05-01T00:00:00Z",
        autoRenew: true,
        paystackSubscriptionCode: "SUB_E2E",
      },
    ];
    const users: User[] = [
      { _id: "user1", email: "e2e@test.com", name: "E2E", plan: "growth", credits: 2000, currentSubscriptionId: "sub1" },
    ];

    // Step 1: Cancel on April 15
    handleSubscriptionDisable(subs, users, "SUB_E2E", "2026-04-15T12:00:00Z");

    // User still has Growth plan
    expect(users[0].plan).toBe("growth");
    expect(users[0].scheduledDowngradeAt).toBe("2026-05-01T00:00:00Z");
    expect(subs[0].status).toBe("cancelled");

    // Step 2: Cron runs on April 20 — still before periodEnd, no downgrade
    let result = processScheduledDowngrades(users, new Date("2026-04-20T00:00:00Z"));
    expect(result.downgraded).toHaveLength(0);
    expect(users[0].plan).toBe("growth");

    // Step 3: Cron runs on May 2 — after periodEnd, downgrade
    result = processScheduledDowngrades(users, new Date("2026-05-02T00:00:00Z"));
    expect(result.downgraded).toContain("user1");
    expect(users[0].plan).toBe("free");
    expect(users[0].credits).toBe(25);
    expect(users[0].scheduledDowngradeAt).toBeUndefined();
  });
});
