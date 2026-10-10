/**
 * pricing.ts — Base plan prices and price resolution
 */

export interface PlanPrices {
  basic: number;
  growth: number;
  pro?: number;
}

export interface PlanIntro {
  basic?: number;
  growth?: number;
  pro?: number;
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
export const NIGERIA_PRICES: PlanPrices = { basic: 2700, growth: 5500, pro: 12000 };
export const NIGERIA_INTRO: PlanIntro = {};

// Africa — USD base pricing
export const AFRICA_USD_PRICES: PlanPrices = { basic: 4, growth: 8, pro: 15 };
export const AFRICA_INTRO: PlanIntro = {};

// Global — USD base pricing
export const GLOBAL_USD_PRICES: PlanPrices = { basic: 7, growth: 12, pro: 20 };
export const GLOBAL_INTRO: PlanIntro = {};

// Yearly multiplier: 15% discount
export const YEARLY_MULTIPLIER = 10.2;
