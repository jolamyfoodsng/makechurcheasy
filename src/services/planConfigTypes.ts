/**
 * planConfigTypes.ts — Single source of truth for all plan/entitlement types.
 *
 * EVERY consumer (desktop, dock, Vite server, web backend) imports from here.
 * No more duplicate PlanTier, PlanEntitlements, FEATURE_LABELS, or
 * FEATURE_REQUIRED_PLAN definitions scattered across the codebase.
 *
 * The deriveFeatureRequiredPlan() function computes the minimum plan tier
 * for each feature at runtime from the entitlements data — never hardcoded.
 */

// ── Core Types ───────────────────────────────────────────────────────────────

export type PlanTier = "free" | "trial" | "basic" | "starter" | "growth" | "pro";

/** Ordered list of tiers from lowest to highest (excludes "trial" — it's a temporary state, not a purchasable tier). */
export const ALL_TIERS: PlanTier[] = ["free", "basic", "starter", "growth", "pro"];

/**
 * Entitlements define what a plan tier can access.
 * -1 = Unlimited for numeric. 0 = Blocked. Positive number = hard cap.
 * Booleans: true = allowed, false = blocked.
 */
export interface PlanEntitlements {
  // Numeric resource limits (-1 = unlimited)
  songs: number;
  images: number;
  videos: number;
  themes: number;
  lowerThirds: number;
  devices: number;
  bibleVersions: number;
  multiviewTemplates: number;
  tickerThemes: number;
  themePresets: number;
  cloudStorageGB: number;

  // Boolean feature gates
  multiview: boolean;
  tickers: boolean;
  massImport: boolean;
  easyWorshipImport: boolean;
  proPresenterImport: boolean;
  translation: boolean;
  speechToScripture: boolean;
  sermonExport: boolean;
  aiFeatures: boolean;
  cloudSync: boolean;
  advancedAnalytics: boolean;
  customReports: boolean;
  mobileControl: boolean;
  apiAccess: boolean;
  teamManagement: boolean;
  campusManagement: boolean;
  slideshow: boolean;
}

/** Per-currency pricing. NGN amounts in whole naira. USD amounts in dollars. */
export interface PlanPricing {
  NGN: { monthly: number; yearly: number };
  USD: { monthly: number; yearly: number };
}

/** Paystack subscription plan codes for automated billing. */
export interface PaystackConfig {
  monthlyPlanCode: string;
  yearlyPlanCode: string;
}

export interface PlanTierConfig {
  label: string;
  pricing: PlanPricing;
  paystack: PaystackConfig;
  credits: number;
  entitlements: PlanEntitlements;
}

export interface CreditCostConfig {
  name: string;
  cost: number;
  unit: string;
  description: string;
}

export interface PlanConfig {
  _id?: unknown;
  version: number;
  plans: Record<PlanTier, PlanTierConfig>;
  creditCosts: CreditCostConfig[];
  translationWordsPerCredit: number;
  updatedAt: string;
}

// ── Entitlement Check Types ──────────────────────────────────────────────────

export interface EntitlementResult {
  /** Whether the action is allowed under the current plan. */
  allowed: boolean;
  /** Human-readable reason when denied (undefined when allowed). */
  reason?: string;
  /** Numeric limit for resource features (-1 = unlimited, 0 = blocked). */
  limit: number;
  /** Current count for resource features (undefined for boolean features). */
  current?: number;
  /** How many more items the user can add (-1 = unlimited, undefined for boolean). */
  remaining?: number;
  /** Minimum plan tier required when denied (e.g. "basic", "starter"). */
  requiredPlan?: string;
}

export type FeatureKey =
  // Numeric resources
  | "songs" | "images" | "videos" | "themes" | "lowerThirds"
  | "devices" | "bibleVersions"
  | "multiviewTemplates" | "tickerThemes" | "themePresets" | "cloudStorageGB"
  // Boolean gates
  | "multiview" | "tickers" | "massImport" | "easyWorshipImport"
  | "proPresenterImport" | "translation" | "speechToScripture"
  | "sermonExport" | "aiFeatures" | "cloudSync" | "advancedAnalytics"
  | "customReports" | "mobileControl" | "apiAccess"
  | "teamManagement" | "campusManagement"
  | "slideshow";

// ── Display Labels ───────────────────────────────────────────────────────────

export const FEATURE_LABELS: Record<string, string> = {
  songs: "Songs",
  images: "Images",
  videos: "Videos",
  themes: "Themes",
  lowerThirds: "Lower Third Themes",
  devices: "Devices",
  bibleVersions: "Bible Versions",
  multiviewTemplates: "Multiview Templates",
  tickerThemes: "Ticker Themes",
  themePresets: "Theme Presets",
  cloudStorageGB: "Cloud Storage",
  multiview: "Multiview",
  tickers: "Tickers",
  massImport: "Mass Import",
  easyWorshipImport: "EasyWorship Import",
  proPresenterImport: "ProPresenter Import",
  translation: "Translation",
  speechToScripture: "Speech-to-Scripture",
  sermonExport: "Sermon Export",
  aiFeatures: "AI Features",
  cloudSync: "Cloud Sync",
  advancedAnalytics: "Advanced Analytics",
  customReports: "Custom Reports",
  mobileControl: "Mobile Control",
  apiAccess: "API Access",
  teamManagement: "Team Management",
  campusManagement: "Multi-Campus",
  slideshow: "Slideshow",
};

// ── Derived Constants ────────────────────────────────────────────────────────

/**
 * Compute the minimum plan tier required for each feature.
 * Derived at runtime from the entitlements — NOT hardcoded.
 *
 * For boolean features: the first tier where the feature is `true`.
 * For numeric features: the first tier where the value is not 0.
 */
export function deriveFeatureRequiredPlan(
  config: PlanConfig,
): Record<string, PlanTier> {
  const result: Record<string, PlanTier> = {};
  const allKeys = Object.keys(FEATURE_LABELS) as Array<keyof PlanEntitlements>;

  for (const key of allKeys) {
    let found: PlanTier = "pro"; // default to highest if nothing found
    for (const tier of ALL_TIERS) {
      const ent = config.plans[tier]?.entitlements;
      if (!ent) continue;
      const val = ent[key];
      if (typeof val === "boolean") {
        if (val) { found = tier; break; }
      } else if (typeof val === "number") {
        if (val !== 0) { found = tier; break; }
      }
    }
    result[key] = found;
  }
  return result;
}

// ── Offline Fallback (production prices) ─────────────────────────────────────

/**
 * Default plan config used as an offline fallback when the backend is
 * unreachable. Prices match the production MongoDB document.
 * The desktop app fetches fresh config from /api/plan-config on startup
 * and caches it in localStorage with a 5-minute TTL.
 */
export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  version: 2,
  plans: {
    free: {
      label: "Free",
      pricing: {
        NGN: { monthly: 0, yearly: 0 },
        USD: { monthly: 0, yearly: 0 },
      },
      paystack: { monthlyPlanCode: "", yearlyPlanCode: "" },
      credits: 1000,
      entitlements: {
        songs: 3, images: 2, videos: 1, themes: 1, lowerThirds: 1, devices: 1,
        bibleVersions: 4, multiviewTemplates: 0, tickerThemes: 0, themePresets: 0,
        cloudStorageGB: 0,
        multiview: false, tickers: false, massImport: false, easyWorshipImport: false,
        proPresenterImport: false, translation: false, speechToScripture: false,
        sermonExport: false, aiFeatures: false, cloudSync: false, advancedAnalytics: false,
        customReports: false, mobileControl: false, apiAccess: false,
        teamManagement: false, campusManagement: false, slideshow: false,
      },
    },
    trial: {
      label: "Trial",
      pricing: {
        NGN: { monthly: 0, yearly: 0 },
        USD: { monthly: 0, yearly: 0 },
      },
      paystack: { monthlyPlanCode: "", yearlyPlanCode: "" },
      credits: 500,
      entitlements: {
        songs: -1, images: -1, videos: -1, themes: -1, lowerThirds: -1, devices: -1,
        bibleVersions: -1, multiviewTemplates: -1, tickerThemes: -1, themePresets: -1,
        cloudStorageGB: 200,
        multiview: true, tickers: true, massImport: true, easyWorshipImport: true,
        proPresenterImport: true, translation: true, speechToScripture: true,
        sermonExport: true, aiFeatures: true, cloudSync: true, advancedAnalytics: true,
        customReports: true, mobileControl: true, apiAccess: true,
        teamManagement: true, campusManagement: true, slideshow: true,
      },
    },
    basic: {
      label: "Basic",
      pricing: {
        NGN: { monthly: 3500, yearly: 42000 },
        USD: { monthly: 5, yearly: 60 },
      },
      paystack: {
        monthlyPlanCode: "mce_basic_monthly",
        yearlyPlanCode: "mce_basic_yearly",
      },
      credits: 50,
      entitlements: {
        songs: 30, images: 20, videos: 10, themes: 3, lowerThirds: 1, devices: 2,
        bibleVersions: 20, multiviewTemplates: 0, tickerThemes: 0, themePresets: 3,
        cloudStorageGB: 1,
        multiview: false, tickers: false, massImport: false, easyWorshipImport: false,
        proPresenterImport: false, translation: false, speechToScripture: false,
        sermonExport: false, aiFeatures: false, cloudSync: false, advancedAnalytics: false,
        customReports: false, mobileControl: false, apiAccess: false,
        teamManagement: false, campusManagement: false, slideshow: true,
      },
    },
    starter: {
      label: "Starter",
      pricing: {
        NGN: { monthly: 8500, yearly: 102000 },
        USD: { monthly: 10, yearly: 120 },
      },
      paystack: {
        monthlyPlanCode: "mce_starter_monthly",
        yearlyPlanCode: "mce_starter_yearly",
      },
      credits: 500,
      entitlements: {
        songs: -1, images: -1, videos: -1, themes: 10, lowerThirds: -1, devices: 5,
        bibleVersions: -1, multiviewTemplates: 2, tickerThemes: 5, themePresets: 10,
        cloudStorageGB: 5,
        multiview: true, tickers: true, massImport: true, easyWorshipImport: true,
        proPresenterImport: true, translation: true, speechToScripture: true,
        sermonExport: true, aiFeatures: false, cloudSync: false, advancedAnalytics: false,
        customReports: false, mobileControl: false, apiAccess: false,
        teamManagement: false, campusManagement: false, slideshow: true,
      },
    },
    growth: {
      label: "Growth",
      pricing: {
        NGN: { monthly: 15000, yearly: 180000 },
        USD: { monthly: 15, yearly: 180 },
      },
      paystack: {
        monthlyPlanCode: "mce_growth_monthly",
        yearlyPlanCode: "mce_growth_yearly",
      },
      credits: 2000,
      entitlements: {
        songs: -1, images: -1, videos: -1, themes: -1, lowerThirds: -1, devices: -1,
        bibleVersions: -1, multiviewTemplates: -1, tickerThemes: -1, themePresets: -1,
        cloudStorageGB: 20,
        multiview: true, tickers: true, massImport: true, easyWorshipImport: true,
        proPresenterImport: true, translation: true, speechToScripture: true,
        sermonExport: true, aiFeatures: true, cloudSync: true, advancedAnalytics: true,
        customReports: false, mobileControl: false, apiAccess: false,
        teamManagement: false, campusManagement: false, slideshow: true,
      },
    },
    pro: {
      label: "Pro",
      pricing: {
        NGN: { monthly: 34000, yearly: 408000 },
        USD: { monthly: 30, yearly: 360 },
      },
      paystack: {
        monthlyPlanCode: "mce_pro_monthly",
        yearlyPlanCode: "mce_pro_yearly",
      },
      credits: -1,
      entitlements: {
        songs: -1, images: -1, videos: -1, themes: -1, lowerThirds: -1, devices: -1,
        bibleVersions: -1, multiviewTemplates: -1, tickerThemes: -1, themePresets: -1,
        cloudStorageGB: 200,
        multiview: true, tickers: true, massImport: true, easyWorshipImport: true,
        proPresenterImport: true, translation: true, speechToScripture: true,
        sermonExport: true, aiFeatures: true, cloudSync: true, advancedAnalytics: true,
        customReports: true, mobileControl: true, apiAccess: true,
        teamManagement: true, campusManagement: true, slideshow: true,
      },
    },
  },
  creditCosts: [
    { name: "Speech-to-Scripture", cost: 1, unit: "per minute", description: "Automatically transcribe live audio and detect scripture references." },
    { name: "Live Translation", cost: 2, unit: "per minute", description: "Translate live speech into another language." },
    { name: "AI Summary", cost: 5, unit: "flat", description: "Generate a sermon summary." },
  ],
  translationWordsPerCredit: 150,
  updatedAt: "2026-06-20T00:00:00.000Z",
};
