/**
 * useCountryPricing — Fetches pricing from the 3-region model API.
 *
 * Regions:
 * - "nigeria": NGN pricing with introductory rates
 * - "africa": USD Africa pricing
 * - "global": USD Global pricing
 *
 * Detection: Cloudflare CF-IPCountry → Vercel x-vercel-ip-country → Global fallback
 * Manual override: localStorage("pricingRegion") → "nigeria" | "africa" | "global"
 */

import { useState, useEffect, useCallback } from "react";

export interface PlanPrice {
  monthly: number;
  yearly: number;
  introductoryMonthly?: number;
}

export interface CountryPricing {
  countryCode: string;
  countryName: string;
  currency: string;
  currencySymbol: string;
  plans: {
    basic: PlanPrice;
    growth: PlanPrice;
    pro: PlanPrice;
  };
  pricingVersion: number;
  region: "nigeria" | "africa" | "global";
  source: "country" | "override" | "fallback";
  detectedCountry?: string;
}

const FALLBACK_PRICING: CountryPricing = {
  countryCode: "US",
  countryName: "Global",
  currency: "USD",
  currencySymbol: "$",
  plans: {
    basic: { monthly: 5, yearly: 50 },
    growth: { monthly: 10, yearly: 100 },
    pro: { monthly: 15, yearly: 150 },
  },
  pricingVersion: 1,
  region: "global",
  source: "fallback",
};

export function useCountryPricing() {
  const [pricing, setPricing] = useState<CountryPricing>(FALLBACK_PRICING);
  const [loading, setLoading] = useState(true);
  const [manualRegion, setManualRegion] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem("pricingRegion");
    } catch {
      return null;
    }
  });

  const setRegion = useCallback((region: string) => {
    try {
      localStorage.setItem("pricingRegion", region);
    } catch { /* ignore */ }
    setManualRegion(region);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const regionParam = manualRegion ? `?region=${manualRegion}` : "";
        const res = await fetch(`/api/pricing/country${regionParam}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data?.plans && data?.currency) {
            setPricing(data);
          }
        }
      } catch {
        // Use fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [manualRegion]);

  const formatPrice = useCallback(
    (amount: number): string => {
      if (amount === 0) return `${pricing.currencySymbol}0`;
      const formatted = amount.toLocaleString("en-US");
      return `${pricing.currencySymbol}${formatted}`;
    },
    [pricing]
  );

  const getPlanPrice = useCallback(
    (planId: "basic" | "growth" | "pro", cycle: "monthly" | "yearly"): number => {
      return pricing.plans[planId]?.[cycle] ?? 0;
    },
    [pricing]
  );

  const getIntroPrice = useCallback(
    (planId: "basic" | "growth" | "pro"): number | undefined => {
      return pricing.plans[planId]?.introductoryMonthly;
    },
    [pricing]
  );

  const getFormattedPlanPrice = useCallback(
    (planId: "basic" | "growth" | "pro", cycle: "monthly" | "yearly"): string => {
      const amount = getPlanPrice(planId, cycle);
      return formatPrice(amount);
    },
    [getPlanPrice, formatPrice]
  );

  return {
    pricing,
    loading,
    formatPrice,
    getPlanPrice,
    getIntroPrice,
    getFormattedPlanPrice,
    currency: pricing.currency,
    currencySymbol: pricing.currencySymbol,
    countryCode: pricing.countryCode,
    region: pricing.region,
    source: pricing.source,
    detectedCountry: pricing.detectedCountry,
    manualRegion,
    setRegion,
  };
}
