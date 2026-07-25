/**
 * planConfigService.ts — Fetches plan configuration from the backend API.
 *
 * Types match the canonical definitions in desktop/src/services/planConfigTypes.ts.
 * The API at /api/plan-config serves the canonical PlanConfig structure from MongoDB.
 */

import { buildLegacyCompatiblePlanConfig } from "@/lib/subscriptionSourceOfTruth";

// ── Canonical Types (mirror desktop/src/services/planConfigTypes.ts) ──────────

export type PlanTier = "free" | "trial" | "basic" | "growth" | "pro" | "ambassador" | "unlimited";

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
  presentationMode: boolean;
  apiAccess: boolean;
  teamManagement: boolean;
  campusManagement: boolean;
  slideshow: boolean;
  countdowns: boolean;
}

export interface PlanPricing {
  NGN: { monthly: number; yearly: number };
  USD: { monthly: number; yearly: number };
}

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
  plans: Record<string, PlanTierConfig>;
  creditCosts: CreditCostConfig[];
  translationWordsPerCredit: number;
  pricingPlans?: PricingPlanConfig[];
  featureBanners?: PricingFeatureBanner[];
  updatedAt: string;
}

// ── Dashboard-Specific UI Types ──────────────────────────────────────────────

export interface PricingPlanFeature {
  text: string;
  prefixHighlight?: string;
}

export interface PricingPlanStyles {
  iconBg: string;
  iconColor: string;
  border: string;
  button: string;
  buttonHover: string;
  popular?: boolean;
  popularBadgeBg?: string;
  checkColor: string;
}

export interface PricingPlanCurrencyPricing {
  monthly: string;
  originalMonthly?: string;
  yearly: string;
  originalYearly?: string;
}

export interface PricingPlanConfig {
  id: string;
  name: string;
  target: string;
  iconName: string;
  styles: PricingPlanStyles;
  pricing: {
    NGN: PricingPlanCurrencyPricing;
    USD: PricingPlanCurrencyPricing;
  };
  features: PricingPlanFeature[];
  buttonText: string;
  paystackPlanCode?: string;
  paystackAmount?: { NGN: number; USD: number };
}

export interface PricingFeatureBanner {
  id: string;
  title: string;
  description: string;
  iconName: string;
  bg: string;
  color: string;
}

export type BillingCycle = 'monthly' | 'yearly' | 'lifetime';
export type Currency = 'NGN' | 'USD';

// ── Offline Fallback ─────────────────────────────────────────────────────────

const CACHE_KEY = "mce_plan_config";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const DEFAULT_PLAN_CONFIG: PlanConfig = buildLegacyCompatiblePlanConfig();

// ── Cache & Fetch Logic ──────────────────────────────────────────────────────

interface CacheEntry {
  config: PlanConfig;
  fetchedAt: number;
}

function readCacheEntry(): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS * 10) return null;
    return entry;
  } catch {
    return null;
  }
}

function readCache(): PlanConfig | null {
  return readCacheEntry()?.config ?? null;
}

function writeCache(config: PlanConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ config, fetchedAt: Date.now() }));
  } catch { /* ignore */ }
}

let inflight: Promise<PlanConfig> | null = null;

export async function getPlanConfig(): Promise<PlanConfig> {
  const cachedEntry = readCacheEntry();
  if (cachedEntry) {
    if (Date.now() - cachedEntry.fetchedAt >= CACHE_TTL_MS) {
      refreshInBackground();
    }
    return cachedEntry.config;
  }
  return fetchConfig();
}

async function fetchConfig(): Promise<PlanConfig> {
  if (inflight) return inflight;
  inflight = doFetch().finally(() => { inflight = null; });
  return inflight;
}

async function doFetch(): Promise<PlanConfig> {
  try {
    const res = await fetch("/api/plan-config");
    if (res.ok) {
      const data = await res.json();
      if (data && data.plans) {
        writeCache(data);
        return data;
      }
    }
  } catch { /* fall through */ }
  return DEFAULT_PLAN_CONFIG;
}

function refreshInBackground(): void {
  if (inflight) return;
  inflight = doFetch().finally(() => { inflight = null; });
}

export async function refreshPlanConfig(): Promise<PlanConfig> {
  if (typeof window !== "undefined") localStorage.removeItem(CACHE_KEY);
  return fetchConfig();
}
