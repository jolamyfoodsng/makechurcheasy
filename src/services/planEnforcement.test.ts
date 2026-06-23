/**
 * planEnforcement.test.ts — Tests for plan enforcement logic.
 *
 * Validates entitlement checks, quota enforcement, feature gating,
 * and trial-to-paid upgrade paths across all plan tiers.
 */

import { describe, it, expect } from "vitest";

// ── Inline plan config (mirrors production schema v2) ──

const PLAN_CONFIG = {
  version: 2,
  plans: {
    free: {
      label: "Free",
      credits: 25,
      entitlements: {
        songs: 3, images: 2, videos: 1, themes: 1, lowerThirds: 1, devices: 1,
        bibleVersions: 4, multiviewTemplates: 0, tickerThemes: 0, themePresets: 0,
        cloudStorageGB: 0,
        multiview: false, tickers: false, massImport: false, easyWorshipImport: false,
        proPresenterImport: false, translation: false, speechToScripture: false,
        sermonExport: false, aiFeatures: false, cloudSync: false, advancedAnalytics: false,
        customReports: false, mobileControl: false, apiAccess: false, slideshow: false,
        teamManagement: false, campusManagement: false,
      },
    },
    basic: {
      label: "Basic",
      credits: 50,
      entitlements: {
        songs: 30, images: 20, videos: 10, themes: 3, lowerThirds: 1, devices: 2,
        bibleVersions: 20, multiviewTemplates: 0, tickerThemes: 0, themePresets: 3,
        cloudStorageGB: 1,
        multiview: false, tickers: false, massImport: false, easyWorshipImport: false,
        proPresenterImport: false, translation: false, speechToScripture: false,
        sermonExport: false, aiFeatures: false, cloudSync: false, advancedAnalytics: false,
        customReports: false, mobileControl: false, apiAccess: false, slideshow: true,
        teamManagement: false, campusManagement: false,
      },
    },
    starter: {
      label: "Starter",
      credits: 500,
      entitlements: {
        songs: -1, images: -1, videos: -1, themes: 10, lowerThirds: -1, devices: 5,
        bibleVersions: -1, multiviewTemplates: 2, tickerThemes: 5, themePresets: 10,
        cloudStorageGB: 5,
        multiview: true, tickers: true, massImport: true, easyWorshipImport: true,
        proPresenterImport: true, translation: true, speechToScripture: true,
        sermonExport: true, aiFeatures: false, cloudSync: false, advancedAnalytics: false,
        customReports: false, mobileControl: false, apiAccess: false, slideshow: true,
        teamManagement: false, campusManagement: false,
      },
    },
    growth: {
      label: "Growth",
      credits: 2000,
      entitlements: {
        songs: -1, images: -1, videos: -1, themes: -1, lowerThirds: -1, devices: -1,
        bibleVersions: -1, multiviewTemplates: -1, tickerThemes: -1, themePresets: -1,
        cloudStorageGB: 20,
        multiview: true, tickers: true, massImport: true, easyWorshipImport: true,
        proPresenterImport: true, translation: true, speechToScripture: true,
        sermonExport: true, aiFeatures: true, cloudSync: true, advancedAnalytics: true,
        customReports: false, mobileControl: false, apiAccess: false, slideshow: true,
        teamManagement: false, campusManagement: false,
      },
    },
    pro: {
      label: "Pro",
      credits: -1,
      entitlements: {
        songs: -1, images: -1, videos: -1, themes: -1, lowerThirds: -1, devices: -1,
        bibleVersions: -1, multiviewTemplates: -1, tickerThemes: -1, themePresets: -1,
        cloudStorageGB: 200,
        multiview: true, tickers: true, massImport: true, easyWorshipImport: true,
        proPresenterImport: true, translation: true, speechToScripture: true,
        sermonExport: true, aiFeatures: true, cloudSync: true, advancedAnalytics: true,
        customReports: true, mobileControl: true, apiAccess: true, slideshow: true,
        teamManagement: true, campusManagement: true,
      },
    },
  },
};

// ── Entitlement check logic (mirrors entitlementClient.ts) ──

type PlanTier = keyof typeof PLAN_CONFIG.plans;

function checkEntitlement(
  plan: string,
  feature: string,
  currentCount: number = 0,
): { allowed: boolean; limit: number | boolean; reason?: string } {
  const planTier = PLAN_CONFIG.plans[plan as PlanTier];
  if (!planTier) return { allowed: false, limit: false, reason: "Unknown plan" };
  const val = planTier.entitlements[feature as keyof typeof planTier.entitlements];
  if (val === undefined) return { allowed: false, limit: false, reason: "Unknown feature" };
  if (typeof val === "boolean") {
    return { allowed: val, limit: val, reason: val ? undefined : `${feature} not available on ${plan} plan` };
  }
  if (typeof val === "number") {
    const isUnlimited = val === -1;
    const allowed = isUnlimited || currentCount < val;
    return { allowed, limit: val, reason: allowed ? undefined : `Limit reached (${currentCount}/${val})` };
  }
  return { allowed: false, limit: false, reason: "Invalid entitlement" };
}

function getEffectivePlan(userPlan: string, trialEndsAt?: string | null): string {
  if (userPlan === "free" && trialEndsAt && new Date(trialEndsAt).getTime() > Date.now()) {
    return "starter";
  }
  return userPlan;
}

// ── Tests ──

describe("Plan enforcement — numeric resource limits", () => {
  describe("songs", () => {
    it("free: allows up to 3", () => {
      expect(checkEntitlement("free", "songs", 2).allowed).toBe(true);
      expect(checkEntitlement("free", "songs", 3).allowed).toBe(false);
    });

    it("basic: allows up to 30", () => {
      expect(checkEntitlement("basic", "songs", 29).allowed).toBe(true);
      expect(checkEntitlement("basic", "songs", 30).allowed).toBe(false);
    });

    it("starter: unlimited", () => {
      expect(checkEntitlement("starter", "songs", 99999).allowed).toBe(true);
    });

    it("growth: unlimited", () => {
      expect(checkEntitlement("growth", "songs", 99999).allowed).toBe(true);
    });

    it("pro: unlimited", () => {
      expect(checkEntitlement("pro", "songs", 99999).allowed).toBe(true);
    });
  });

  describe("images", () => {
    it("free: allows up to 2", () => {
      expect(checkEntitlement("free", "images", 1).allowed).toBe(true);
      expect(checkEntitlement("free", "images", 2).allowed).toBe(false);
    });

    it("basic: allows up to 20", () => {
      expect(checkEntitlement("basic", "images", 20).allowed).toBe(false);
    });

    it("starter and above: unlimited", () => {
      for (const tier of ["starter", "growth", "pro"]) {
        expect(checkEntitlement(tier, "images", 99999).allowed).toBe(true);
      }
    });
  });

  describe("cloudStorageGB", () => {
    it("free: 0 GB", () => {
      expect(checkEntitlement("free", "cloudStorageGB").limit).toBe(0);
      expect(checkEntitlement("free", "cloudStorageGB").allowed).toBe(false);
    });

    it("basic: 1 GB", () => {
      expect(checkEntitlement("basic", "cloudStorageGB").limit).toBe(1);
    });

    it("starter: 5 GB", () => {
      expect(checkEntitlement("starter", "cloudStorageGB").limit).toBe(5);
    });

    it("growth: 20 GB", () => {
      expect(checkEntitlement("growth", "cloudStorageGB").limit).toBe(20);
    });

    it("pro: 200 GB", () => {
      expect(checkEntitlement("pro", "cloudStorageGB").limit).toBe(200);
    });

    it("blocks when over quota", () => {
      expect(checkEntitlement("growth", "cloudStorageGB", 20).allowed).toBe(false);
      expect(checkEntitlement("pro", "cloudStorageGB", 200).allowed).toBe(false);
    });
  });
});

describe("Plan enforcement — boolean feature gating", () => {
  describe("multiview", () => {
    it("blocked on free and basic", () => {
      expect(checkEntitlement("free", "multiview").allowed).toBe(false);
      expect(checkEntitlement("basic", "multiview").allowed).toBe(false);
    });

    it("allowed on starter and above", () => {
      for (const tier of ["starter", "growth", "pro"]) {
        expect(checkEntitlement(tier, "multiview").allowed).toBe(true);
      }
    });
  });

  describe("aiFeatures", () => {
    it("blocked on free, basic, starter", () => {
      for (const tier of ["free", "basic", "starter"]) {
        expect(checkEntitlement(tier, "aiFeatures").allowed).toBe(false);
      }
    });

    it("allowed on growth and pro", () => {
      expect(checkEntitlement("growth", "aiFeatures").allowed).toBe(true);
      expect(checkEntitlement("pro", "aiFeatures").allowed).toBe(true);
    });
  });

  describe("cloudSync", () => {
    it("blocked below Growth", () => {
      for (const tier of ["free", "basic", "starter"]) {
        expect(checkEntitlement(tier, "cloudSync").allowed).toBe(false);
      }
    });

    it("allowed on Growth and Pro", () => {
      expect(checkEntitlement("growth", "cloudSync").allowed).toBe(true);
      expect(checkEntitlement("pro", "cloudSync").allowed).toBe(true);
    });
  });

  describe("teamManagement", () => {
    it("blocked below Pro", () => {
      for (const tier of ["free", "basic", "starter", "growth"]) {
        expect(checkEntitlement(tier, "teamManagement").allowed).toBe(false);
      }
    });

    it("allowed on Pro only", () => {
      expect(checkEntitlement("pro", "teamManagement").allowed).toBe(true);
    });
  });

  describe("campusManagement", () => {
    it("blocked below Pro", () => {
      for (const tier of ["free", "basic", "starter", "growth"]) {
        expect(checkEntitlement(tier, "campusManagement").allowed).toBe(false);
      }
    });

    it("allowed on Pro only", () => {
      expect(checkEntitlement("pro", "campusManagement").allowed).toBe(true);
    });
  });

  describe("slideshow", () => {
    it("blocked on free", () => {
      expect(checkEntitlement("free", "slideshow").allowed).toBe(false);
    });

    it("allowed on basic and above", () => {
      for (const tier of ["basic", "starter", "growth", "pro"]) {
        expect(checkEntitlement(tier, "slideshow").allowed).toBe(true);
      }
    });
  });

  describe("advancedAnalytics", () => {
    it("blocked below Growth", () => {
      for (const tier of ["free", "basic", "starter"]) {
        expect(checkEntitlement(tier, "advancedAnalytics").allowed).toBe(false);
      }
    });

    it("allowed on Growth and Pro", () => {
      expect(checkEntitlement("growth", "advancedAnalytics").allowed).toBe(true);
      expect(checkEntitlement("pro", "advancedAnalytics").allowed).toBe(true);
    });
  });

  describe("mobileControl", () => {
    it("blocked below Pro", () => {
      for (const tier of ["free", "basic", "starter", "growth"]) {
        expect(checkEntitlement(tier, "mobileControl").allowed).toBe(false);
      }
    });

    it("allowed on Pro only", () => {
      expect(checkEntitlement("pro", "mobileControl").allowed).toBe(true);
    });
  });

  describe("apiAccess", () => {
    it("blocked below Pro", () => {
      for (const tier of ["free", "basic", "starter", "growth"]) {
        expect(checkEntitlement(tier, "apiAccess").allowed).toBe(false);
      }
    });

    it("allowed on Pro only", () => {
      expect(checkEntitlement("pro", "apiAccess").allowed).toBe(true);
    });
  });
});

describe("Plan enforcement — trial users", () => {
  it("free user with active trial gets starter entitlements", () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(getEffectivePlan("free", futureDate)).toBe("starter");
  });

  it("free user with expired trial stays free", () => {
    const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(getEffectivePlan("free", pastDate)).toBe("free");
  });

  it("paid user ignores trial", () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(getEffectivePlan("growth", futureDate)).toBe("growth");
  });

  it("trial user can use multiview (starter entitlement)", () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const effectivePlan = getEffectivePlan("free", futureDate);
    expect(checkEntitlement(effectivePlan, "multiview").allowed).toBe(true);
  });

  it("trial user cannot use AI features (starter doesn't have them)", () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const effectivePlan = getEffectivePlan("free", futureDate);
    expect(checkEntitlement(effectivePlan, "aiFeatures").allowed).toBe(false);
  });
});

describe("Plan enforcement — edge cases", () => {
  it("unknown plan returns denied", () => {
    const result = checkEntitlement("unknown", "songs");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Unknown plan");
  });

  it("unknown feature returns denied", () => {
    const result = checkEntitlement("pro", "nonexistent");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Unknown feature");
  });

  it("null plan is treated as unknown (denied)", () => {
    const result = checkEntitlement(null as any, "songs", 0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Unknown plan");
  });

  it("all tiers have entitlements for all known features", () => {
    const allFeatures = Object.keys(PLAN_CONFIG.plans.free.entitlements);
    for (const tier of Object.keys(PLAN_CONFIG.plans)) {
      for (const feature of allFeatures) {
        const result = checkEntitlement(tier, feature);
        expect(result.reason).not.toBe("Unknown feature");
      }
    }
  });
});
