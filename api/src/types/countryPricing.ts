import { ObjectId } from "mongodb";

// ─── Country Pricing ────────────────────────────────────────────────────────

export type PlanTierKey = "basic" | "growth";

export interface PlanPrice {
  monthly: number;          // Renewal price per month
  yearly: number;           // Price per year
  introductoryMonthly?: number; // First-month discount (if applicable)
}

export interface CountryPricingEntry {
  country: string;       // Country name
  currency: string;      // ISO 4217 currency code
  currencySymbol: string;
  enabled: boolean;      // Whether this country is active
  plans: Record<PlanTierKey, PlanPrice>;
  regionalFallback?: string;  // Optional regional group (e.g. "africa", "south_asia")
}

export interface CountryPricingDoc {
  _id?: ObjectId;
  version: number;       // Pricing version for subscription locking
  countries: Record<string, CountryPricingEntry>;
  regionalFallbacks: Record<string, string>;  // region → country code to use as template
  updatedAt: string;
}

// ─── Subscription Country Lock ──────────────────────────────────────────────

export interface SubscriptionCountryLock {
  subscriptionCountry: string;
  subscriptionCurrency: string;
  subscriptionCurrencySymbol: string;
  pricingVersion: number;
}

// ─── Pricing Resolution Result ──────────────────────────────────────────────

export interface ResolvedPricing {
  countryCode: string;
  countryName: string;
  currency: string;
  currencySymbol: string;
  plans: Record<PlanTierKey, PlanPrice>;
  /** The plan values before conversion, used by crypto checkout in USD. */
  baseUsdPlans: Record<PlanTierKey, PlanPrice>;
  /** Current USD → local-currency rate used to produce `plans`. */
  usdToLocalRate?: number;
  pricingVersion: number;
  source: "country" | "regional" | "global" | "override" | "fallback";
  region?: "nigeria" | "africa" | "global";
  detectedCountry?: string;
}
