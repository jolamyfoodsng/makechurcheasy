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
export const NIGERIA_PRICES: PlanPrices = { basic: 2800, growth: 7000 };
export const NIGERIA_INTRO: PlanIntro = {};

// Africa — USD base pricing
export const AFRICA_USD_PRICES: PlanPrices = { basic: 3, growth: 6 };
export const AFRICA_INTRO: PlanIntro = {};

// Global — USD base pricing
export const GLOBAL_USD_PRICES: PlanPrices = { basic: 7, growth: 12 };
export const GLOBAL_INTRO: PlanIntro = {};

// Yearly multiplier: 15% discount
export const YEARLY_MULTIPLIER = 10.2;
