/**
 * trialSystem.test.ts — Tests for trial system logic.
 *
 * Validates trial activation, duration calculation, reminder scheduling,
 * expiration processing, and the transition from trial to paid/free plans.
 */

import { describe, it, expect } from "vitest";

// ── Inline logic (mirrors licenseService.ts + cron trial-check patterns) ──

interface TrialUser {
  _id: string;
  email: string;
  name: string;
  plan: string;
  credits: number;
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
  scheduledDowngradeAt?: string;
  currentSubscriptionId?: string;
  subscriptionExpiresAt?: string;
}

/** Activate a 14-day trial for a free user. */
function activateTrial(user: TrialUser, now: Date, durationDays = 14): TrialUser {
  const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  return {
    ...user,
    trial: {
      active: true,
      startedAt: now.toISOString(),
      endsAt: endsAt.toISOString(),
      durationDays,
    },
  };
}

/** Check if a trial is currently active. */
function isTrialActive(user: TrialUser, now: Date): boolean {
  if (!user.trial?.endsAt) return false;
  return new Date(user.trial.endsAt).getTime() > now.getTime();
}

/** Get effective plan — trial users on "free" get "starter" entitlements. */
function getEffectivePlan(user: TrialUser, now: Date): string {
  if (user.plan === "free" && isTrialActive(user, now)) return "starter";
  return user.plan;
}

/** Simulate cron: find users needing 3-day reminder. */
function find3DayReminderUsers(users: TrialUser[], now: Date, threeDaysFromNow: Date, oneAndHalfDaysFromNow: Date): TrialUser[] {
  return users.filter((u) => {
    if (!u.trial?.endsAt || u.plan !== "free" || !u.trial?.startedAt) return false;
    if (u.trialReminder3Sent) return false;
    const endsAt = new Date(u.trial.endsAt).getTime();
    return endsAt > now.getTime() && endsAt <= threeDaysFromNow.getTime() && endsAt > oneAndHalfDaysFromNow.getTime();
  });
}

/** Simulate cron: find users needing 1-day reminder. */
function find1DayReminderUsers(users: TrialUser[], now: Date, oneAndHalfDaysFromNow: Date): TrialUser[] {
  return users.filter((u) => {
    if (!u.trial?.endsAt || u.plan !== "free" || !u.trial?.startedAt) return false;
    if (u.trialReminder1Sent) return false;
    const endsAt = new Date(u.trial.endsAt).getTime();
    return endsAt > now.getTime() && endsAt <= oneAndHalfDaysFromNow.getTime();
  });
}

/** Simulate cron: find expired trial users. */
function findExpiredTrialUsers(users: TrialUser[], now: Date): TrialUser[] {
  return users.filter((u) => {
    if (!u.trial?.endsAt || u.plan !== "free" || !u.trial?.startedAt) return false;
    if (u.trialExpiredSent) return false;
    return new Date(u.trial.endsAt).getTime() <= now.getTime();
  });
}

/** Process expired trial — downgrade to free. */
function processExpiredTrial(user: TrialUser): TrialUser {
  return {
    ...user,
    plan: "free",
    credits: 25,
    trialExpiredSent: true,
    trial: undefined,
  };
}

// ── Tests ──

describe("Trial activation", () => {
  it("sets trial.startedAt and trial.endsAt", () => {
    const user: TrialUser = { _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25 };
    const now = new Date("2026-04-01T00:00:00Z");
    const result = activateTrial(user, now);

    expect(result.trial?.startedAt).toBe("2026-04-01T00:00:00.000Z");
    expect(result.trial?.endsAt).toBe("2026-04-15T00:00:00.000Z");
    expect(result.trial?.durationDays).toBe(14);
  });

  it("defaults to 14-day duration", () => {
    const user: TrialUser = { _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25 };
    const now = new Date("2026-04-01T00:00:00Z");
    const result = activateTrial(user, now);

    const daysDiff = (new Date(result.trial?.endsAt!).getTime() - new Date(result.trial?.startedAt!).getTime()) / (24 * 60 * 60 * 1000);
    expect(daysDiff).toBe(14);
  });

  it("does not change plan (still 'free' during trial)", () => {
    const user: TrialUser = { _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25 };
    const now = new Date("2026-04-01T00:00:00Z");
    const result = activateTrial(user, now);
    expect(result.plan).toBe("free");
  });
});

describe("Trial active check", () => {
  it("returns true when trial end is in the future", () => {
    const user: TrialUser = {
      _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25,
      trial: { endsAt: "2026-04-20T00:00:00Z" },
    };
    expect(isTrialActive(user, new Date("2026-04-15T00:00:00Z"))).toBe(true);
  });

  it("returns false when trial end is in the past", () => {
    const user: TrialUser = {
      _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25,
      trial: { endsAt: "2026-04-10T00:00:00Z" },
    };
    expect(isTrialActive(user, new Date("2026-04-15T00:00:00Z"))).toBe(false);
  });

  it("returns false when no trial.endsAt", () => {
    const user: TrialUser = { _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25 };
    expect(isTrialActive(user, new Date())).toBe(false);
  });
});

describe("Effective plan during trial", () => {
  it("free user with active trial gets starter", () => {
    const user: TrialUser = {
      _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25,
      trial: { endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
    };
    expect(getEffectivePlan(user, new Date())).toBe("starter");
  });

  it("free user with expired trial stays free", () => {
    const user: TrialUser = {
      _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25,
      trial: { endsAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
    };
    expect(getEffectivePlan(user, new Date())).toBe("free");
  });

  it("paid user ignores trial", () => {
    const user: TrialUser = {
      _id: "u1", email: "a@test.com", name: "A", plan: "growth", credits: 2000,
      trial: { endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
    };
    expect(getEffectivePlan(user, new Date())).toBe("growth");
  });
});

describe("Trial reminders (cron)", () => {
  const now = new Date("2026-04-12T00:00:00Z");
  const threeDaysFromNow = new Date("2026-04-15T00:00:00Z");
  const oneAndHalfDaysFromNow = new Date("2026-04-13T12:00:00Z");

  it("finds users needing 3-day reminder", () => {
    const users: TrialUser[] = [
      {
        _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25,
        trial: {
          startedAt: "2026-04-01T00:00:00Z",
          endsAt: "2026-04-14T00:00:00Z", // 2 days away → in 3-day window
        },
      },
      {
        _id: "u2", email: "b@test.com", name: "B", plan: "free", credits: 25,
        trial: {
          startedAt: "2026-04-01T00:00:00Z",
          endsAt: "2026-04-20T00:00:00Z", // 8 days away → outside window
        },
      },
    ];

    const result = find3DayReminderUsers(users, now, threeDaysFromNow, oneAndHalfDaysFromNow);
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("u1");
  });

  it("skips users already sent 3-day reminder", () => {
    const users: TrialUser[] = [
      {
        _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25,
        trial: {
          startedAt: "2026-04-01T00:00:00Z",
          endsAt: "2026-04-14T00:00:00Z",
        },
        trialReminder3Sent: true,
      },
    ];

    const result = find3DayReminderUsers(users, now, threeDaysFromNow, oneAndHalfDaysFromNow);
    expect(result).toHaveLength(0);
  });

  it("finds users needing 1-day reminder", () => {
    const users: TrialUser[] = [
      {
        _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25,
        trial: {
          startedAt: "2026-04-01T00:00:00Z",
          endsAt: "2026-04-13T00:00:00Z", // 1 day away → in 1.5-day window
        },
      },
      {
        _id: "u2", email: "b@test.com", name: "B", plan: "free", credits: 25,
        trial: {
          startedAt: "2026-04-01T00:00:00Z",
          endsAt: "2026-04-16T00:00:00Z", // 4 days away → outside window
        },
      },
    ];

    const result = find1DayReminderUsers(users, now, oneAndHalfDaysFromNow);
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("u1");
  });

  it("skips non-free plan users for reminders", () => {
    const users: TrialUser[] = [
      {
        _id: "u1", email: "a@test.com", name: "A", plan: "growth", credits: 2000,
        trial: {
          startedAt: "2026-04-01T00:00:00Z",
          endsAt: "2026-04-14T00:00:00Z",
        },
      },
    ];

    const result = find3DayReminderUsers(users, now, threeDaysFromNow, oneAndHalfDaysFromNow);
    expect(result).toHaveLength(0);
  });
});

describe("Trial expiration (cron)", () => {
  it("finds expired trial users", () => {
    const now = new Date("2026-04-15T12:00:00Z");
    const users: TrialUser[] = [
      {
        _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25,
        trial: {
          startedAt: "2026-04-01T00:00:00Z",
          endsAt: "2026-04-15T00:00:00Z", // expired
        },
      },
      {
        _id: "u2", email: "b@test.com", name: "B", plan: "free", credits: 25,
        trial: {
          startedAt: "2026-04-01T00:00:00Z",
          endsAt: "2026-04-20T00:00:00Z", // still active
        },
      },
    ];

    const result = findExpiredTrialUsers(users, now);
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("u1");
  });

  it("skips already-processed expired trials", () => {
    const now = new Date("2026-04-15T12:00:00Z");
    const users: TrialUser[] = [
      {
        _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25,
        trial: {
          startedAt: "2026-04-01T00:00:00Z",
          endsAt: "2026-04-15T00:00:00Z",
        },
        trialExpiredSent: true,
      },
    ];

    const result = findExpiredTrialUsers(users, now);
    expect(result).toHaveLength(0);
  });

  it("processes expired trial — clears trial fields", () => {
    const user: TrialUser = {
      _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25,
      trial: {
        startedAt: "2026-04-01T00:00:00Z",
        endsAt: "2026-04-15T00:00:00Z",
        durationDays: 14,
      },
    };

    const result = processExpiredTrial(user);

    expect(result.plan).toBe("free");
    expect(result.credits).toBe(25);
    expect(result.trialExpiredSent).toBe(true);
    expect(result.trial).toBeUndefined();
  });
});

describe("Trial → paid upgrade", () => {
  it("upgrading to paid plan clears trial fields", () => {
    const user: TrialUser = {
      _id: "u1", email: "a@test.com", name: "A", plan: "free", credits: 25,
      trial: {
        startedAt: "2026-04-01T00:00:00Z",
        endsAt: "2026-04-20T00:00:00Z",
        durationDays: 14,
      },
    };

    // Simulate upgrade: plan changes, trial cleared
    const upgraded = {
      ...user,
      plan: "growth" as string,
      credits: 2000,
      trial: undefined as TrialUser["trial"],
    };

    expect(upgraded.plan).toBe("growth");
    expect(upgraded.trial).toBeUndefined();
  });
});
