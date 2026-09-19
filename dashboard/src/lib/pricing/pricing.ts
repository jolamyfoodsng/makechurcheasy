/**
 * pricing.ts — Base plan prices and price resolution
 */

export interface PlanPrices {
  basic: number;
  growth: number;
}

export interface PlanIntro {
  basic?: number;
  growth?: number;
}

export interface ResolvedPricing {
  region: "nigeria" | "africa" | "global";
  currency: string;
  currencySymbol?: string;
  prices: PlanPrices;
  yearlyPrices?: PlanPrices;
  introPrices: PlanIntro;
  country?: string;
  countryName?: string;
  converted?: boolean;
  exchangeRate?: number;
}

// Nigeria — fixed NGN pricing
export const NIGERIA_PRICES: PlanPrices = { basic: 4000, growth: 8000 };
export const NIGERIA_INTRO: PlanIntro = { basic: 3500, growth: 7500 };

// Africa — USD base pricing
export const AFRICA_USD_PRICES: PlanPrices = { basic: 5, growth: 8 };
export const AFRICA_INTRO: PlanIntro = {};

// Global — USD base pricing
export const GLOBAL_USD_PRICES: PlanPrices = { basic: 7, growth: 10 };
export const GLOBAL_INTRO: PlanIntro = {};

// Yearly multiplier: 10 months for the price of 12 (save 2 months)
export const YEARLY_MULTIPLIER = 10;
