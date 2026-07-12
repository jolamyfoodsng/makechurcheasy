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

import { buildLegacyCompatiblePlanConfig } from "../lib/subscriptionSourceOfTruth";

// ── Core Types ───────────────────────────────────────────────────────────────

export type PlanTier = "free" | "trial" | "basic" | "growth" | "pro" | "ambassador" | "unlimited";

/** Ordered list of tiers from lowest to highest (excludes "trial" — it's a temporary state, not a purchasable tier). */
export const ALL_TIERS: PlanTier[] = ["free", "basic", "growth", "pro", "ambassador", "unlimited"];

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
  countdowns: boolean;
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
  /** Minimum plan tier required when denied (e.g. "basic", "growth"). */
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
  | "slideshow"
  | "countdowns";

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
  countdowns: "Countdowns",
};

// ── Derived Constants ────────────────────────────────────────────────────────

/**
 * Compute the minimum plan tier required for each feature.
 * Derived at runtime from the entitlements — NOT hardcoded.
 *
 * For boolean features: the first tier where the feature is `true`.
 * For numeric quota features: the first paid tier that increases the free limit.
 */
export function deriveFeatureRequiredPlan(
  config: PlanConfig,
): Record<string, PlanTier> {
  const result: Record<string, PlanTier> = {};
  const allKeys = Object.keys(FEATURE_LABELS) as Array<keyof PlanEntitlements>;

  for (const key of allKeys) {
    let found: PlanTier = "pro"; // default to highest if nothing found
    const freeEnt = config.plans.free?.entitlements;
    const freeVal = freeEnt?.[key];

    for (const tier of ALL_TIERS) {
      const ent = config.plans[tier]?.entitlements;
      if (!ent) continue;
      const val = ent[key];
      if (typeof val === "boolean") {
        if (val) { found = tier; break; }
      } else if (typeof val === "number") {
        if (typeof freeVal === "number") {
          if (tier !== "free" && (val === -1 || val > freeVal)) {
            found = tier;
            break;
          }
        } else if (val !== 0) {
          found = tier;
          break;
        }
      }
    }

    if (typeof freeVal === "number" && found === "pro" && freeVal !== 0) {
      found = "free";
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
export const DEFAULT_PLAN_CONFIG: PlanConfig = buildLegacyCompatiblePlanConfig({
  updatedAt: "2026-07-10T00:00:00.000Z",
});
