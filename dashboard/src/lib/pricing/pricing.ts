/**
 * pricing.ts — Base plan prices and price resolution
 */

export interface PlanPrices {
  basic: number;
  growth: number;
  pro: number;
}

export interface PlanIntro {
  basic?: number;
  growth?: number;
  pro?: number;
}

export interface ResolvedPricing {
  region: "nigeria" | "africa" | "global";
  currency: string;
  prices: PlanPrices;
  introPrices: PlanIntro;
  country?: string;
  countryName?: string;
  converted?: boolean;
  exchangeRate?: number;
}

// Nigeria — fixed NGN pricing
export const NIGERIA_PRICES: PlanPrices = { basic: 4000, growth: 8000, pro: 12000 };
export const NIGERIA_INTRO: PlanIntro = { basic: 3500, growth: 7500 };

// Africa — USD base pricing ($4/$8/$12)
export const AFRICA_USD_PRICES: PlanPrices = { basic: 4, growth: 8, pro: 12 };
export const AFRICA_INTRO: PlanIntro = { basic: 3, growth: 6 };

// Global — USD base pricing ($5/$10/$15)
export const GLOBAL_USD_PRICES: PlanPrices = { basic: 5, growth: 10, pro: 15 };
export const GLOBAL_INTRO: PlanIntro = { basic: 4, growth: 8 };

// Yearly multiplier: 10 months for the price of 12 (save 2 months)
export const YEARLY_MULTIPLIER = 10;
