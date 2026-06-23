/**
 * growth-entitlements.test.ts — Tests for Growth Plan entitlement logic.
 *
 * Validates that the plan config correctly gates Growth-only features
 * and that the entitlement check logic works across all tiers.
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
      },
    },
  },
};

// ── Entitlement check logic (mirrors server-side pattern) ──

const TIERS = ["free", "basic", "starter", "growth", "pro"];

function getEffectivePlan(userPlan: string, trialEndsAt?: string | null): string {
  if (userPlan === "free" && trialEndsAt && new Date(trialEndsAt).getTime() > Date.now()) {
    return "starter";
  }
  return userPlan;
}

function checkEntitlement(
  plan: string,
  feature: string,
  currentCount: number = 0,
): { allowed: boolean; limit: number | boolean; reason?: string } {
  const planTier = PLAN_CONFIG.plans[plan as keyof typeof PLAN_CONFIG.plans];
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

// ── Tests ──

describe("Growth Plan entitlements", () => {
  describe("AI features (aiFeatures)", () => {
    it("blocks on free, basic, and starter", () => {
      for (const tier of ["free", "basic", "starter"]) {
        const result = checkEntitlement(tier, "aiFeatures");
        expect(result.allowed).toBe(false);
      }
    });

    it("allows on growth and pro", () => {
      for (const tier of ["growth", "pro"]) {
        const result = checkEntitlement(tier, "aiFeatures");
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe("Cloud sync (cloudSync)", () => {
    it("blocks on free, basic, and starter", () => {
      for (const tier of ["free", "basic", "starter"]) {
        const result = checkEntitlement(tier, "cloudSync");
        expect(result.allowed).toBe(false);
      }
    });

    it("allows on growth and pro", () => {
      for (const tier of ["growth", "pro"]) {
        const result = checkEntitlement(tier, "cloudSync");
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe("Advanced analytics (advancedAnalytics)", () => {
    it("blocks on free, basic, and starter", () => {
      for (const tier of ["free", "basic", "starter"]) {
        const result = checkEntitlement(tier, "advancedAnalytics");
        expect(result.allowed).toBe(false);
      }
    });

    it("allows on growth and pro", () => {
      for (const tier of ["growth", "pro"]) {
        const result = checkEntitlement(tier, "advancedAnalytics");
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe("Cloud storage (cloudStorageGB)", () => {
    it("free tier has 0 GB", () => {
      const result = checkEntitlement("free", "cloudStorageGB");
      expect(result.limit).toBe(0);
      expect(result.allowed).toBe(false);
    });

    it("basic tier has 1 GB", () => {
      const result = checkEntitlement("basic", "cloudStorageGB");
      expect(result.limit).toBe(1);
    });

    it("starter tier has 5 GB", () => {
      const result = checkEntitlement("starter", "cloudStorageGB");
      expect(result.limit).toBe(5);
    });

    it("growth tier has 20 GB", () => {
      const result = checkEntitlement("growth", "cloudStorageGB");
      expect(result.limit).toBe(20);
    });

    it("pro tier has 200 GB", () => {
      const result = checkEntitlement("pro", "cloudStorageGB");
      expect(result.limit).toBe(200);
      expect(result.allowed).toBe(true);
    });

    it("blocks when over quota", () => {
      const result = checkEntitlement("growth", "cloudStorageGB", 20);
      expect(result.allowed).toBe(false);
    });

    it("blocks pro tier over 200 GB", () => {
      const result = checkEntitlement("pro", "cloudStorageGB", 200);
      expect(result.allowed).toBe(false);
    });
  });

  describe("Unlimited resources on Growth", () => {
    const unlimitedFeatures = ["songs", "images", "videos", "themes", "lowerThirds", "devices", "bibleVersions"];

    for (const feature of unlimitedFeatures) {
      it(`${feature} is unlimited on growth`, () => {
        const result = checkEntitlement("growth", feature, 999999);
        expect(result.allowed).toBe(true);
        expect(result.limit).toBe(-1);
      });
    }
  });

  describe("Trial users get starter entitlements", () => {
    it("free user with active trial is treated as starter", () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const effectivePlan = getEffectivePlan("free", futureDate);
      expect(effectivePlan).toBe("starter");
    });

    it("free user with expired trial stays free", () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      const effectivePlan = getEffectivePlan("free", pastDate);
      expect(effectivePlan).toBe("free");
    });

    it("starter user ignores trial", () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const effectivePlan = getEffectivePlan("starter", futureDate);
      expect(effectivePlan).toBe("starter");
    });
  });

  describe("Feature upgrade path", () => {
    it("derives minimum plan for each Growth feature", () => {
      const growthFeatures = ["aiFeatures", "cloudSync", "advancedAnalytics"];
      for (const feature of growthFeatures) {
        let minPlan = "pro";
        for (const tier of TIERS) {
          const ent = PLAN_CONFIG.plans[tier as keyof typeof PLAN_CONFIG.plans]?.entitlements;
          if (!ent) continue;
          const val = ent[feature as keyof typeof ent];
          if (typeof val === "boolean" && val) { minPlan = tier; break; }
          if (typeof val === "number" && val !== 0) { minPlan = tier; break; }
        }
        expect(minPlan).toBe("growth");
      }
    });
  });
});
