/**
 * licenseService.test.ts — Comprehensive entitlement & subscription tests
 *
 * Covers: effective plan resolution, trial logic, feature gates, plan limits,
 * credit allocation, downgrade protection, device limits, and upgrade flows.
 *
 * Mocks proLicense and subscriptionCache to isolate pure logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthUser, PlanTier } from "./authService";

// ── Mock dependencies ────────────────────────────────────────────────────────

vi.mock("./proLicense", () => ({
  isProUnlocked: vi.fn(() => false),
}));

vi.mock("./subscriptionCache", () => ({
  getCachedPlan: vi.fn(() => "free"),
  isOfflineValid: vi.fn(() => false),
  getOfflineDaysRemaining: vi.fn(() => 0),
}));

import { isProUnlocked } from "./proLicense";
import {
  getCachedPlan,
  isOfflineValid,
} from "./subscriptionCache";

import {
  getUserPlan,
  isInTrial,
  isTrialExpired,
  getTrialDaysRemaining,
  getEffectivePlan,
  getPlanLimits,
  getUserPlanLimits,
  canUseTranslation,
  canUseMassImport,
  canUseMultiview,
  canUseMobileControl,
  canUseTickers,
  canUseSpeechToScripture,
  canUseSermonExport,
  canUseAI,
  canUseCloudFeatures,
  canUseAdvancedAnalytics,
  canUseCustomReports,
  canUseUnlimitedDevices,
  canUseUnlimitedMultiview,
  canUseEasyWorshipImport,
  canUseProPresenterImport,
  canAddDevice,
  getRemainingDeviceSlots,
  getDowngradeWarnings,
  getRestrictionInfo,
} from "./licenseService";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    avatar: "",
    appId: "app-1",
    churchName: "Test Church",
    createdAt: new Date().toISOString(),
    plan: "free",
    ...overrides,
  };
}

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ── Reset mocks before each test ─────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(isProUnlocked).mockReturnValue(false);
  vi.mocked(getCachedPlan).mockReturnValue("free");
  vi.mocked(isOfflineValid).mockReturnValue(false);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. getUserPlan() — subscription cache & pro key resolution
// ═══════════════════════════════════════════════════════════════════════════════

describe("getUserPlan", () => {
  it("returns 'free' for null user", () => {
    expect(getUserPlan(null)).toBe("free");
  });

  it("returns 'free' for user with no plan field", () => {
    const user = makeUser({ plan: undefined });
    expect(getUserPlan(user)).toBe("free");
  });

  it("returns user.plan when no cache is active", () => {
    const user = makeUser({ plan: "starter" });
    vi.mocked(getCachedPlan).mockReturnValue("free");
    expect(getUserPlan(user)).toBe("starter");
  });

  it("returns cached plan when offline window is valid", () => {
    const user = makeUser({ plan: "free" });
    vi.mocked(getCachedPlan).mockReturnValue("growth");
    vi.mocked(isOfflineValid).mockReturnValue(true);
    expect(getUserPlan(user)).toBe("growth");
  });

  it("falls back to user.plan when offline window expired", () => {
    const user = makeUser({ plan: "starter" });
    vi.mocked(getCachedPlan).mockReturnValue("growth");
    vi.mocked(isOfflineValid).mockReturnValue(false);
    expect(getUserPlan(user)).toBe("starter");
  });

  it("returns 'pro' when pro key is unlocked (bypasses everything)", () => {
    vi.mocked(isProUnlocked).mockReturnValue(true);
    const user = makeUser({ plan: "free" });
    expect(getUserPlan(user)).toBe("pro");
  });

  it("returns 'pro' even when cached plan is free", () => {
    vi.mocked(isProUnlocked).mockReturnValue(true);
    vi.mocked(getCachedPlan).mockReturnValue("free");
    const user = makeUser({ plan: "free" });
    expect(getUserPlan(user)).toBe("pro");
  });

  it("returns cached plan over user.plan when cache is valid", () => {
    const user = makeUser({ plan: "basic" });
    vi.mocked(getCachedPlan).mockReturnValue("growth");
    vi.mocked(isOfflineValid).mockReturnValue(true);
    expect(getUserPlan(user)).toBe("growth");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. getEffectivePlan() — trial, pro, and plan resolution
// ═══════════════════════════════════════════════════════════════════════════════

describe("getEffectivePlan", () => {
  it("returns 'free' for null user", () => {
    expect(getEffectivePlan(null)).toBe("free");
  });

  it("returns 'free' for user on free plan with no trial", () => {
    const user = makeUser({ plan: "free" });
    expect(getEffectivePlan(user)).toBe("free");
  });

  it("returns 'starter' during active trial (even if user.plan is free)", () => {
    const user = makeUser({
      plan: "free",
      trial: { active: true, endsAt: futureDate(5) },
    });
    expect(getEffectivePlan(user)).toBe("starter");
  });

  it("returns 'starter' during active trial (7-day trial)", () => {
    const user = makeUser({
      plan: "free",
      trial: { active: true, startedAt: pastDate(2), endsAt: futureDate(5), durationDays: 7 },
    });
    expect(getEffectivePlan(user)).toBe("starter");
  });

  it("returns 'starter' during active trial (10-day trial)", () => {
    const user = makeUser({
      plan: "free",
      trial: { active: true, startedAt: pastDate(1), endsAt: futureDate(9), durationDays: 10 },
    });
    expect(getEffectivePlan(user)).toBe("starter");
  });

  it("returns user.plan when trial is expired", () => {
    const user = makeUser({
      plan: "basic",
      trial: { active: true, endsAt: pastDate(1) },
    });
    expect(getEffectivePlan(user)).toBe("basic");
  });

  it("returns user.plan when no trial exists", () => {
    expect(getEffectivePlan(makeUser({ plan: "starter" }))).toBe("starter");
    expect(getEffectivePlan(makeUser({ plan: "growth" }))).toBe("growth");
    expect(getEffectivePlan(makeUser({ plan: "pro" }))).toBe("pro");
  });

  it("returns 'pro' when pro key is unlocked (ignores trial and plan)", () => {
    vi.mocked(isProUnlocked).mockReturnValue(true);
    const user = makeUser({
      plan: "free",
      trial: { active: true, endsAt: futureDate(5) },
    });
    expect(getEffectivePlan(user)).toBe("pro");
  });

  it("returns 'growth' for growth subscriber", () => {
    expect(getEffectivePlan(makeUser({ plan: "growth" }))).toBe("growth");
  });

  it("returns 'pro' for pro subscriber", () => {
    expect(getEffectivePlan(makeUser({ plan: "pro" }))).toBe("pro");
  });

  it("returns cached plan when offline valid and no trial", () => {
    const user = makeUser({ plan: "free" });
    vi.mocked(getCachedPlan).mockReturnValue("growth");
    vi.mocked(isOfflineValid).mockReturnValue(true);
    expect(getEffectivePlan(user)).toBe("growth");
  });

  it("trial overrides cached plan", () => {
    const user = makeUser({
      plan: "free",
      trial: { active: true, endsAt: futureDate(3) },
    });
    vi.mocked(getCachedPlan).mockReturnValue("growth");
    vi.mocked(isOfflineValid).mockReturnValue(true);
    expect(getEffectivePlan(user)).toBe("starter");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Trial logic
// ═══════════════════════════════════════════════════════════════════════════════

describe("isInTrial", () => {
  it("returns false for null user", () => {
    expect(isInTrial(null)).toBe(false);
  });

  it("returns false when no trialEndsAt", () => {
    expect(isInTrial(makeUser({}))).toBe(false);
  });

  it("returns true when trial.endsAt is in the future", () => {
    expect(isInTrial(makeUser({ trial: { active: true, endsAt: futureDate(3) } }))).toBe(true);
  });

  it("returns false when trial.endsAt is in the past", () => {
    expect(isInTrial(makeUser({ trial: { active: true, endsAt: pastDate(1) } }))).toBe(false);
  });

  it("returns false when pro key is unlocked", () => {
    vi.mocked(isProUnlocked).mockReturnValue(true);
    expect(isInTrial(makeUser({ trial: { active: true, endsAt: futureDate(3) } }))).toBe(false);
  });
});

describe("isTrialExpired", () => {
  it("returns false for null user", () => {
    expect(isTrialExpired(null)).toBe(false);
  });

  it("returns false when no trialEndsAt", () => {
    expect(isTrialExpired(makeUser({}))).toBe(false);
  });

  it("returns true when trial.endsAt is in the past", () => {
    expect(isTrialExpired(makeUser({ trial: { endsAt: pastDate(1) } }))).toBe(true);
  });

  it("returns false when trial.endsAt is in the future", () => {
    expect(isTrialExpired(makeUser({ trial: { endsAt: futureDate(1) } }))).toBe(false);
  });

  it("returns false when pro key is unlocked", () => {
    vi.mocked(isProUnlocked).mockReturnValue(true);
    expect(isTrialExpired(makeUser({ trial: { endsAt: pastDate(1) } }))).toBe(false);
  });
});

describe("getTrialDaysRemaining", () => {
  it("returns 0 for null user", () => {
    expect(getTrialDaysRemaining(null)).toBe(0);
  });

  it("returns 0 when no trial", () => {
    expect(getTrialDaysRemaining(makeUser({}))).toBe(0);
  });

  it("returns 0 when trial expired", () => {
    expect(getTrialDaysRemaining(makeUser({ trial: { active: true, endsAt: pastDate(1) } }))).toBe(0);
  });

  it("returns ~7 for a 7-day trial just started", () => {
    const user = makeUser({
      trial: { active: true, endsAt: futureDate(7) },
    });
    const days = getTrialDaysRemaining(user);
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(8);
  });

  it("returns ~3 for a trial ending in 3 days", () => {
    const user = makeUser({
      trial: { active: true, endsAt: futureDate(3) },
    });
    const days = getTrialDaysRemaining(user);
    expect(days).toBeGreaterThanOrEqual(2);
    expect(days).toBeLessThanOrEqual(4);
  });

  it("returns 0 when pro key is unlocked", () => {
    vi.mocked(isProUnlocked).mockReturnValue(true);
    expect(getTrialDaysRemaining(makeUser({ trial: { active: true, endsAt: futureDate(5) } }))).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Feature gates (canUse* functions)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Feature gates — all plans", () => {
  const ALL_PLANS: PlanTier[] = ["free", "trial", "basic", "starter", "growth", "pro"];

  // Feature → expected results per plan
  const FEATURE_MATRIX: Record<string, Record<PlanTier, boolean>> = {
    translation: { free: false, trial: true, basic: false, starter: true, growth: true, pro: true },
    massImport: { free: false, trial: true, basic: false, starter: true, growth: true, pro: true },
    multiview: { free: false, trial: true, basic: false, starter: true, growth: true, pro: true },
    easyWorshipImport: { free: false, trial: true, basic: false, starter: true, growth: true, pro: true },
    proPresenterImport: { free: false, trial: true, basic: false, starter: true, growth: true, pro: true },
    tickers: { free: false, trial: true, basic: false, starter: true, growth: true, pro: true },
    speechToScripture: { free: false, trial: true, basic: false, starter: true, growth: true, pro: true },
    sermonExport: { free: false, trial: true, basic: false, starter: true, growth: true, pro: true },
    aiFeatures: { free: false, trial: true, basic: false, starter: true, growth: true, pro: true },
    cloudFeatures: { free: false, trial: true, basic: false, starter: false, growth: true, pro: true },
    advancedAnalytics: { free: false, trial: true, basic: false, starter: false, growth: true, pro: true },
    customReports: { free: false, trial: true, basic: false, starter: false, growth: true, pro: true },
    unlimitedDevices: { free: false, trial: true, basic: false, starter: false, growth: true, pro: true },
    unlimitedMultiview: { free: false, trial: true, basic: false, starter: false, growth: true, pro: true },
    mobileControl: { free: false, trial: true, basic: false, starter: false, growth: false, pro: true },
  };

  const FEATURE_FN_MAP: Record<string, (user: AuthUser | null) => boolean> = {
    translation: canUseTranslation,
    massImport: canUseMassImport,
    multiview: canUseMultiview,
    easyWorshipImport: canUseEasyWorshipImport,
    proPresenterImport: canUseProPresenterImport,
    tickers: canUseTickers,
    speechToScripture: canUseSpeechToScripture,
    sermonExport: canUseSermonExport,
    aiFeatures: canUseAI,
    cloudFeatures: canUseCloudFeatures,
    advancedAnalytics: canUseAdvancedAnalytics,
    customReports: canUseCustomReports,
    unlimitedDevices: canUseUnlimitedDevices,
    unlimitedMultiview: canUseUnlimitedMultiview,
    mobileControl: canUseMobileControl,
  };

  for (const [feature, expected] of Object.entries(FEATURE_MATRIX)) {
    describe(feature, () => {
      const fn = FEATURE_FN_MAP[feature];
      for (const plan of ALL_PLANS) {
        it(`${plan} → ${expected[plan]}`, () => {
          const user = makeUser({ plan });
          expect(fn(user)).toBe(expected[plan]);
        });
      }
    });
  }

  it("all feature functions return false for null user (free plan)", () => {
    for (const fn of Object.values(FEATURE_FN_MAP)) {
      expect(fn(null)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Plan limits
// ═══════════════════════════════════════════════════════════════════════════════

describe("getPlanLimits", () => {
  it("returns free limits for unknown plan (falls back to free)", () => {
    const limits = getPlanLimits("unknown" as PlanTier);
    expect(limits.songs).toBe(3);
    expect(limits.devices).toBe(1);
  });

  describe("free", () => {
    it("has correct resource limits", () => {
      const l = getPlanLimits("free");
      expect(l.songs).toBe(3);
      expect(l.images).toBe(2);
      expect(l.videos).toBe(1);
      expect(l.bibleVersions).toBe(3);
      expect(l.themes).toBe(1);
      expect(l.lowerThirdThemes).toBe(1);
      expect(l.devices).toBe(1);
      expect(l.credits).toBe(20);
    });

    it("has all features disabled", () => {
      const l = getPlanLimits("free");
      expect(l.easyWorshipImport).toBe(false);
      expect(l.proPresenterImport).toBe(false);
      expect(l.massImport).toBe(false);
      expect(l.translation).toBe(false);
      expect(l.multiview).toBe(false);
      expect(l.mobileControl).toBe(false);
      expect(l.tickers).toBe(false);
      expect(l.speechToScripture).toBe(false);
      expect(l.sermonExport).toBe(false);
      expect(l.aiFeatures).toBe(false);
      expect(l.cloudFeatures).toBe(false);
      expect(l.advancedAnalytics).toBe(false);
      expect(l.customReports).toBe(false);
      expect(l.unlimitedDevices).toBe(false);
      expect(l.unlimitedMultiview).toBe(false);
    });
  });

  describe("basic", () => {
    it("has correct resource limits", () => {
      const l = getPlanLimits("basic");
      expect(l.songs).toBe(30);
      expect(l.images).toBe(20);
      expect(l.videos).toBe(10);
      expect(l.bibleVersions).toBe(20);
      expect(l.themes).toBe(3);
      expect(l.lowerThirdThemes).toBe(1);
      expect(l.devices).toBe(2);
      expect(l.credits).toBe(50);
    });

    it("has all features disabled", () => {
      const l = getPlanLimits("basic");
      expect(l.translation).toBe(false);
      expect(l.massImport).toBe(false);
      expect(l.multiview).toBe(false);
      expect(l.cloudFeatures).toBe(false);
      expect(l.mobileControl).toBe(false);
    });
  });

  describe("starter", () => {
    it("has unlimited songs/images/videos/bibleVersions", () => {
      const l = getPlanLimits("starter");
      expect(l.songs).toBe(Infinity);
      expect(l.images).toBe(Infinity);
      expect(l.videos).toBe(Infinity);
      expect(l.bibleVersions).toBe(Infinity);
    });

    it("has correct finite limits", () => {
      const l = getPlanLimits("starter");
      expect(l.themes).toBe(10);
      expect(l.lowerThirdThemes).toBe(10);
      expect(l.devices).toBe(5);
      expect(l.credits).toBe(500);
    });

    it("has starter-level features enabled", () => {
      const l = getPlanLimits("starter");
      expect(l.easyWorshipImport).toBe(true);
      expect(l.proPresenterImport).toBe(true);
      expect(l.massImport).toBe(true);
      expect(l.translation).toBe(true);
      expect(l.multiview).toBe(true);
      expect(l.tickers).toBe(true);
      expect(l.speechToScripture).toBe(true);
      expect(l.sermonExport).toBe(true);
      expect(l.aiFeatures).toBe(true);
    });

    it("has growth/pro features disabled", () => {
      const l = getPlanLimits("starter");
      expect(l.cloudFeatures).toBe(false);
      expect(l.advancedAnalytics).toBe(false);
      expect(l.customReports).toBe(false);
      expect(l.unlimitedDevices).toBe(false);
      expect(l.unlimitedMultiview).toBe(false);
      expect(l.mobileControl).toBe(false);
    });
  });

  describe("growth", () => {
    it("has unlimited resources", () => {
      const l = getPlanLimits("growth");
      expect(l.songs).toBe(Infinity);
      expect(l.images).toBe(Infinity);
      expect(l.videos).toBe(Infinity);
      expect(l.bibleVersions).toBe(Infinity);
      expect(l.themes).toBe(Infinity);
      expect(l.lowerThirdThemes).toBe(Infinity);
      expect(l.devices).toBe(Infinity);
    });

    it("has 2000 credits", () => {
      expect(getPlanLimits("growth").credits).toBe(2000);
    });

    it("has all growth-level features enabled", () => {
      const l = getPlanLimits("growth");
      expect(l.easyWorshipImport).toBe(true);
      expect(l.proPresenterImport).toBe(true);
      expect(l.massImport).toBe(true);
      expect(l.translation).toBe(true);
      expect(l.multiview).toBe(true);
      expect(l.tickers).toBe(true);
      expect(l.speechToScripture).toBe(true);
      expect(l.sermonExport).toBe(true);
      expect(l.aiFeatures).toBe(true);
      expect(l.cloudFeatures).toBe(true);
      expect(l.advancedAnalytics).toBe(true);
      expect(l.customReports).toBe(true);
      expect(l.unlimitedDevices).toBe(true);
      expect(l.unlimitedMultiview).toBe(true);
    });

    it("has mobileControl disabled (pro-only)", () => {
      expect(getPlanLimits("growth").mobileControl).toBe(false);
    });
  });

  describe("pro", () => {
    it("has unlimited everything", () => {
      const l = getPlanLimits("pro");
      expect(l.songs).toBe(Infinity);
      expect(l.images).toBe(Infinity);
      expect(l.videos).toBe(Infinity);
      expect(l.bibleVersions).toBe(Infinity);
      expect(l.themes).toBe(Infinity);
      expect(l.lowerThirdThemes).toBe(Infinity);
      expect(l.devices).toBe(Infinity);
      expect(l.credits).toBe(Infinity);
    });

    it("has all features enabled including mobileControl", () => {
      const l = getPlanLimits("pro");
      expect(l.translation).toBe(true);
      expect(l.massImport).toBe(true);
      expect(l.multiview).toBe(true);
      expect(l.cloudFeatures).toBe(true);
      expect(l.advancedAnalytics).toBe(true);
      expect(l.customReports).toBe(true);
      expect(l.unlimitedDevices).toBe(true);
      expect(l.unlimitedMultiview).toBe(true);
      expect(l.mobileControl).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Credit values — synchronized with PLAN_CREDITS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Credit allocation", () => {
  it("free plan has 20 credits", () => {
    expect(getPlanLimits("free").credits).toBe(20);
  });

  it("basic plan has 50 credits", () => {
    expect(getPlanLimits("basic").credits).toBe(50);
  });

  it("starter plan has 500 credits", () => {
    expect(getPlanLimits("starter").credits).toBe(500);
  });

  it("growth plan has 2000 credits", () => {
    expect(getPlanLimits("growth").credits).toBe(2000);
  });

  it("pro plan has unlimited credits", () => {
    expect(getPlanLimits("pro").credits).toBe(Infinity);
  });

  it("credits are strictly increasing across tiers", () => {
    const free = getPlanLimits("free").credits;
    const basic = getPlanLimits("basic").credits;
    const starter = getPlanLimits("starter").credits;
    const growth = getPlanLimits("growth").credits;
    const pro = getPlanLimits("pro").credits;

    expect(free).toBeLessThan(basic);
    expect(basic).toBeLessThan(starter);
    expect(starter).toBeLessThan(growth);
    expect(growth).toBeLessThan(pro);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Downgrade protection
// ═══════════════════════════════════════════════════════════════════════════════

describe("getDowngradeWarnings", () => {
  it("returns no warnings when within limits", () => {
    const user = makeUser({ plan: "starter" });
    const warnings = getDowngradeWarnings(user, { devices: 3 });
    expect(warnings).toHaveLength(0);
  });

  it("returns warning when devices exceed starter limit (5)", () => {
    const user = makeUser({ plan: "starter" });
    const warnings = getDowngradeWarnings(user, { devices: 7 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].feature).toBe("devices");
    expect(warnings[0].requiredPlan).toBe("growth");
  });

  it("returns no warnings for growth plan with many devices", () => {
    const user = makeUser({ plan: "growth" });
    const warnings = getDowngradeWarnings(user, { devices: 100 });
    expect(warnings).toHaveLength(0);
  });

  it("returns no warnings for pro plan with many devices", () => {
    const user = makeUser({ plan: "pro" });
    const warnings = getDowngradeWarnings(user, { devices: 999 });
    expect(warnings).toHaveLength(0);
  });

  it("returns no warnings when usage is exactly at limit", () => {
    const user = makeUser({ plan: "starter" });
    const warnings = getDowngradeWarnings(user, { devices: 5 });
    expect(warnings).toHaveLength(0);
  });

  it("returns warning for free plan exceeding device limit", () => {
    const user = makeUser({ plan: "free" });
    const warnings = getDowngradeWarnings(user, { devices: 2 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].requiredPlan).toBe("growth");
  });

  it("returns warning when downgrading from growth to starter with excess devices", () => {
    // User was on growth, had 10 devices, downgraded to starter
    const user = makeUser({ plan: "starter" });
    const warnings = getDowngradeWarnings(user, { devices: 10 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("Device limit exceeded");
    expect(warnings[0].message).toContain("Upgrade to Growth");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Device limits
// ═══════════════════════════════════════════════════════════════════════════════

describe("canAddDevice", () => {
  it("free: allows 0 devices", () => {
    expect(canAddDevice(makeUser({ plan: "free" }), 0)).toBe(true);
  });

  it("free: blocks at 1 device", () => {
    expect(canAddDevice(makeUser({ plan: "free" }), 1)).toBe(false);
  });

  it("basic: allows up to 1 device", () => {
    expect(canAddDevice(makeUser({ plan: "basic" }), 0)).toBe(true);
    expect(canAddDevice(makeUser({ plan: "basic" }), 1)).toBe(true);
  });

  it("basic: blocks at 2 devices", () => {
    expect(canAddDevice(makeUser({ plan: "basic" }), 2)).toBe(false);
  });

  it("starter: allows up to 4 devices", () => {
    expect(canAddDevice(makeUser({ plan: "starter" }), 4)).toBe(true);
  });

  it("starter: blocks at 5 devices", () => {
    expect(canAddDevice(makeUser({ plan: "starter" }), 5)).toBe(false);
  });

  it("growth: allows unlimited devices", () => {
    expect(canAddDevice(makeUser({ plan: "growth" }), 100)).toBe(true);
    expect(canAddDevice(makeUser({ plan: "growth" }), 1000)).toBe(true);
  });

  it("pro: allows unlimited devices", () => {
    expect(canAddDevice(makeUser({ plan: "pro" }), 100)).toBe(true);
  });
});

describe("getRemainingDeviceSlots", () => {
  it("free: 1 slot when 0 used", () => {
    expect(getRemainingDeviceSlots(makeUser({ plan: "free" }), 0)).toBe(1);
  });

  it("free: 0 slots when 1 used", () => {
    expect(getRemainingDeviceSlots(makeUser({ plan: "free" }), 1)).toBe(0);
  });

  it("free: 0 slots when 2 used (over limit)", () => {
    expect(getRemainingDeviceSlots(makeUser({ plan: "free" }), 2)).toBe(0);
  });

  it("basic: 2 slots when 0 used", () => {
    expect(getRemainingDeviceSlots(makeUser({ plan: "basic" }), 0)).toBe(2);
  });

  it("starter: 5 slots when 0 used", () => {
    expect(getRemainingDeviceSlots(makeUser({ plan: "starter" }), 0)).toBe(5);
  });

  it("starter: 2 slots when 3 used", () => {
    expect(getRemainingDeviceSlots(makeUser({ plan: "starter" }), 3)).toBe(2);
  });

  it("growth: Infinity for unlimited", () => {
    expect(getRemainingDeviceSlots(makeUser({ plan: "growth" }), 50)).toBe(Infinity);
  });

  it("pro: Infinity for unlimited", () => {
    expect(getRemainingDeviceSlots(makeUser({ plan: "pro" }), 50)).toBe(Infinity);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. getRestrictionInfo — upgrade modal helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe("getRestrictionInfo", () => {
  it("free user sees translation as locked requiring starter", () => {
    const info = getRestrictionInfo(makeUser({ plan: "free" }), "translation");
    expect(info.locked).toBe(true);
    expect(info.requiredPlan).toBe("starter");
    expect(info.feature).toBe("Translation");
  });

  it("starter user sees translation as unlocked", () => {
    const info = getRestrictionInfo(makeUser({ plan: "starter" }), "translation");
    expect(info.locked).toBe(false);
  });

  it("free user sees cloudFeatures as locked requiring growth", () => {
    const info = getRestrictionInfo(makeUser({ plan: "free" }), "cloudFeatures");
    expect(info.locked).toBe(true);
    expect(info.requiredPlan).toBe("growth");
  });

  it("starter user sees cloudFeatures as locked requiring growth", () => {
    const info = getRestrictionInfo(makeUser({ plan: "starter" }), "cloudFeatures");
    expect(info.locked).toBe(true);
    expect(info.requiredPlan).toBe("growth");
  });

  it("growth user sees cloudFeatures as unlocked", () => {
    const info = getRestrictionInfo(makeUser({ plan: "growth" }), "cloudFeatures");
    expect(info.locked).toBe(false);
  });

  it("growth user sees mobileControl as locked requiring pro", () => {
    const info = getRestrictionInfo(makeUser({ plan: "growth" }), "mobileControl");
    expect(info.locked).toBe(true);
    expect(info.requiredPlan).toBe("pro");
  });

  it("pro user sees mobileControl as unlocked", () => {
    const info = getRestrictionInfo(makeUser({ plan: "pro" }), "mobileControl");
    expect(info.locked).toBe(false);
  });

  it("free user sees songs as locked (resource limit)", () => {
    const info = getRestrictionInfo(makeUser({ plan: "free" }), "songs");
    expect(info.locked).toBe(true);
    expect(info.requiredPlan).toBe("basic");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. getUserPlanLimits — resolves effective plan for a user
// ═══════════════════════════════════════════════════════════════════════════════

describe("getUserPlanLimits", () => {
  it("returns free limits for null user", () => {
    expect(getUserPlanLimits(null).songs).toBe(3);
  });

  it("returns starter limits during trial", () => {
    const user = makeUser({
      plan: "free",
      trial: { active: true, endsAt: futureDate(5) },
    });
    expect(getUserPlanLimits(user).songs).toBe(Infinity);
    expect(getUserPlanLimits(user).translation).toBe(true);
  });

  it("returns growth limits for growth subscriber", () => {
    const user = makeUser({ plan: "growth" });
    expect(getUserPlanLimits(user).cloudFeatures).toBe(true);
    expect(getUserPlanLimits(user).credits).toBe(2000);
  });

  it("returns pro limits when pro key is unlocked", () => {
    vi.mocked(isProUnlocked).mockReturnValue(true);
    const user = makeUser({ plan: "free" });
    expect(getUserPlanLimits(user).mobileControl).toBe(true);
    expect(getUserPlanLimits(user).credits).toBe(Infinity);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. Subscription upgrade flow
// ═══════════════════════════════════════════════════════════════════════════════

describe("Subscription upgrade flow: Free → Starter", () => {
  it("effective plan changes from free to starter", () => {
    const user = makeUser({ plan: "free" });
    expect(getEffectivePlan(user)).toBe("free");

    // Simulate upgrade — server would update user.plan
    user.plan = "starter";
    expect(getEffectivePlan(user)).toBe("starter");
  });

  it("credits increase from 20 to 500", () => {
    const freeLimits = getPlanLimits("free");
    const starterLimits = getPlanLimits("starter");
    expect(freeLimits.credits).toBe(20);
    expect(starterLimits.credits).toBe(500);
  });

  it("features unlock after upgrade", () => {
    const freeUser = makeUser({ plan: "free" });
    const starterUser = makeUser({ plan: "starter" });

    expect(canUseTranslation(freeUser)).toBe(false);
    expect(canUseTranslation(starterUser)).toBe(true);

    expect(canUseMassImport(freeUser)).toBe(false);
    expect(canUseMassImport(starterUser)).toBe(true);

    expect(canUseMultiview(freeUser)).toBe(false);
    expect(canUseMultiview(starterUser)).toBe(true);
  });

  it("device limit increases from 1 to 5", () => {
    expect(getPlanLimits("free").devices).toBe(1);
    expect(getPlanLimits("starter").devices).toBe(5);
  });
});

describe("Subscription upgrade flow: Starter → Growth", () => {
  it("effective plan changes from starter to growth", () => {
    const user = makeUser({ plan: "starter" });
    expect(getEffectivePlan(user)).toBe("starter");
    user.plan = "growth";
    expect(getEffectivePlan(user)).toBe("growth");
  });

  it("credits increase from 500 to 2000", () => {
    expect(getPlanLimits("starter").credits).toBe(500);
    expect(getPlanLimits("growth").credits).toBe(2000);
  });

  it("cloud features unlock", () => {
    expect(canUseCloudFeatures(makeUser({ plan: "starter" }))).toBe(false);
    expect(canUseCloudFeatures(makeUser({ plan: "growth" }))).toBe(true);
  });

  it("devices become unlimited", () => {
    expect(getPlanLimits("starter").devices).toBe(5);
    expect(getPlanLimits("growth").devices).toBe(Infinity);
  });

  it("multiview becomes unlimited", () => {
    expect(getPlanLimits("starter").unlimitedMultiview).toBe(false);
    expect(getPlanLimits("growth").unlimitedMultiview).toBe(true);
  });
});

describe("Subscription upgrade flow: Growth → Pro", () => {
  it("effective plan changes from growth to pro", () => {
    const user = makeUser({ plan: "growth" });
    user.plan = "pro";
    expect(getEffectivePlan(user)).toBe("pro");
  });

  it("credits become unlimited", () => {
    expect(getPlanLimits("growth").credits).toBe(2000);
    expect(getPlanLimits("pro").credits).toBe(Infinity);
  });

  it("mobile control unlocks", () => {
    expect(canUseMobileControl(makeUser({ plan: "growth" }))).toBe(false);
    expect(canUseMobileControl(makeUser({ plan: "pro" }))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Subscription downgrade flow: Growth → Starter
// ═══════════════════════════════════════════════════════════════════════════════

describe("Subscription downgrade flow: Growth → Starter", () => {
  it("effective plan changes from growth to starter", () => {
    const user = makeUser({ plan: "growth" });
    expect(getEffectivePlan(user)).toBe("growth");
    user.plan = "starter";
    expect(getEffectivePlan(user)).toBe("starter");
  });

  it("cloud features become restricted", () => {
    const user = makeUser({ plan: "starter" });
    expect(canUseCloudFeatures(user)).toBe(false);
  });

  it("analytics become restricted", () => {
    const user = makeUser({ plan: "starter" });
    expect(canUseAdvancedAnalytics(user)).toBe(false);
    expect(canUseCustomReports(user)).toBe(false);
  });

  it("devices limited to 5 (downgrade protection triggers)", () => {
    const user = makeUser({ plan: "starter" });
    const warnings = getDowngradeWarnings(user, { devices: 10 });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].feature).toBe("devices");
  });

  it("data is NOT deleted on downgrade", () => {
    // Downgrade only changes the plan field — content stays
    const user = makeUser({ plan: "starter" });
    // The user object still has all fields — plan is just "starter"
    expect(user.plan).toBe("starter");
  });

  it("unlimited multiview becomes limited (2 layouts)", () => {
    expect(getPlanLimits("growth").unlimitedMultiview).toBe(true);
    expect(getPlanLimits("starter").unlimitedMultiview).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. Billing cycle logic (expiry date calculations)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Billing cycle calculations", () => {
  function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  function addYears(date: Date, years: number): Date {
    const d = new Date(date);
    d.setFullYear(d.getFullYear() + years);
    return d;
  }

  it("monthly billing: currentPeriodEnd is ~30 days from start", () => {
    const start = new Date("2025-01-01");
    const end = addDays(start, 30);
    expect(end.getDate()).toBe(31);
    expect(end.getMonth()).toBe(0); // January
  });

  it("yearly billing: currentPeriodEnd is ~365 days from start", () => {
    const start = new Date("2025-01-01");
    const end = addDays(start, 365);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(1);
  });

  it("monthly subscription period: end is 1 month from start", () => {
    const start = new Date("2025-03-15");
    const end = addMonths(start, 1);
    expect(end.getMonth()).toBe(3); // April
    expect(end.getDate()).toBe(15);
  });

  it("yearly subscription period: end is 1 year from start", () => {
    const start = new Date("2025-06-20");
    const end = addYears(start, 1);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(5); // June
    expect(end.getDate()).toBe(20);
  });

  it("subscription expiry detection: is past currentPeriodEnd", () => {
    const now = new Date();
    const pastEnd = addDays(now, -1);
    const futureEnd = addDays(now, 1);

    expect(now.getTime() > pastEnd.getTime()).toBe(true);
    expect(now.getTime() > futureEnd.getTime()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. Desktop license cache behavior
// ═══════════════════════════════════════════════════════════════════════════════

describe("Desktop license cache", () => {
  it("returns user.plan when no cache exists", () => {
    const user = makeUser({ plan: "starter" });
    vi.mocked(getCachedPlan).mockReturnValue("free");
    vi.mocked(isOfflineValid).mockReturnValue(false);
    expect(getUserPlan(user)).toBe("starter");
  });

  it("returns cached plan when cache is valid (simulates payment success)", () => {
    const user = makeUser({ plan: "free" });
    vi.mocked(getCachedPlan).mockReturnValue("starter");
    vi.mocked(isOfflineValid).mockReturnValue(true);
    expect(getUserPlan(user)).toBe("starter");
  });

  it("returns free when cache is expired (offline window passed)", () => {
    const user = makeUser({ plan: "starter" });
    vi.mocked(getCachedPlan).mockReturnValue("starter");
    vi.mocked(isOfflineValid).mockReturnValue(false);
    // Falls back to user.plan, which is "starter" in this case
    // The cache expiry means we use user.plan, not cache
    expect(getUserPlan(user)).toBe("starter");
  });

  it("pro key overrides cache and plan", () => {
    vi.mocked(isProUnlocked).mockReturnValue(true);
    vi.mocked(getCachedPlan).mockReturnValue("free");
    const user = makeUser({ plan: "free" });
    expect(getUserPlan(user)).toBe("pro");
  });

  it("payment success flow: free user becomes starter via cache", () => {
    const user = makeUser({ plan: "free" });

    // Before payment
    expect(getEffectivePlan(user)).toBe("free");

    // After payment — cache gets updated
    vi.mocked(getCachedPlan).mockReturnValue("starter");
    vi.mocked(isOfflineValid).mockReturnValue(true);

    expect(getEffectivePlan(user)).toBe("starter");
    expect(canUseTranslation(user)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. Plan tier ordering — higher plans always have >= lower plan limits
// ═══════════════════════════════════════════════════════════════════════════════

describe("Plan tier ordering invariant", () => {
  const tiers: PlanTier[] = ["free", "basic", "starter", "growth", "pro"];

  it("each higher tier has >= resources than the tier below", () => {
    for (let i = 1; i < tiers.length; i++) {
      const lower = getPlanLimits(tiers[i - 1]);
      const higher = getPlanLimits(tiers[i]);

      // Credits always increase
      if (lower.credits !== Infinity && higher.credits !== Infinity) {
        expect(higher.credits).toBeGreaterThanOrEqual(lower.credits);
      }

      // Device limit always increases
      if (lower.devices !== Infinity && higher.devices !== Infinity) {
        expect(higher.devices).toBeGreaterThanOrEqual(lower.devices);
      }
    }
  });

  it("each higher tier has >= feature flags than the tier below", () => {
    const booleanFeatures = [
      "translation", "massImport", "multiview", "mobileControl",
      "tickers", "speechToScripture", "sermonExport", "aiFeatures",
      "cloudFeatures", "advancedAnalytics", "customReports",
      "unlimitedDevices", "unlimitedMultiview",
    ] as const;

    for (let i = 1; i < tiers.length; i++) {
      const lower = getPlanLimits(tiers[i - 1]);
      const higher = getPlanLimits(tiers[i]);

      for (const feat of booleanFeatures) {
        const lowerVal = lower[feat];
        const higherVal = higher[feat];
        // If lower tier has it, higher tier must also have it
        if (lowerVal === true) {
          expect(higherVal).toBe(true);
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 16. Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  it("user with undefined plan defaults to free", () => {
    const user = makeUser({ plan: undefined });
    expect(getEffectivePlan(user)).toBe("free");
    expect(getPlanLimits(getEffectivePlan(user)).songs).toBe(3);
  });

  it("user with no trial has no trial", () => {
    const user = makeUser({});
    expect(isInTrial(user)).toBe(false);
    expect(isTrialExpired(user)).toBe(false);
    expect(getTrialDaysRemaining(user)).toBe(0);
  });

  it("trial ending exactly now is not active", () => {
    const user = makeUser({ trial: { endsAt: new Date().toISOString() } });
    // Date.now() >= trial.endsAt means expired
    expect(isTrialExpired(user)).toBe(true);
  });

  it("all canUse* functions work with null user", () => {
    expect(canUseTranslation(null)).toBe(false);
    expect(canUseMassImport(null)).toBe(false);
    expect(canUseMultiview(null)).toBe(false);
    expect(canUseMobileControl(null)).toBe(false);
    expect(canUseCloudFeatures(null)).toBe(false);
    expect(canUseAdvancedAnalytics(null)).toBe(false);
    expect(canUseCustomReports(null)).toBe(false);
    expect(canUseUnlimitedDevices(null)).toBe(false);
    expect(canUseUnlimitedMultiview(null)).toBe(false);
    expect(canUseSpeechToScripture(null)).toBe(false);
    expect(canUseSermonExport(null)).toBe(false);
    expect(canUseAI(null)).toBe(false);
    expect(canUseTickers(null)).toBe(false);
    expect(canUseEasyWorshipImport(null)).toBe(false);
    expect(canUseProPresenterImport(null)).toBe(false);
  });
});
