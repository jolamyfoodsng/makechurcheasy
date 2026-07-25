/**
 * useLocalizedPricing.ts — Detects country, resolves pricing, converts currency
 *
 * Flow:
 *   detectCountry → getPricingRegion → getBasePrices → getCurrency → getExchangeRate → convert
 */

import { useState, useEffect, useCallback } from "react";
import { getPricingRegion } from "./pricing/countries";
import { getCurrencyForCountry } from "./pricing/currencies";
import { getExchangeRate, convertPrice } from "./pricing/exchange-rates";
import {
  NIGERIA_PRICES, NIGERIA_INTRO,
  AFRICA_USD_PRICES, AFRICA_INTRO,
  GLOBAL_USD_PRICES, GLOBAL_INTRO,
  PlanPrices, PlanIntro, ResolvedPricing, YEARLY_MULTIPLIER,
} from "./pricing/pricing";

interface UseLocalizedPricingResult {
  pricing: ResolvedPricing | null;
  loading: boolean;
  error: string | null;
  getPlanPrice: (plan: "basic" | "growth" | "pro", cycle: "monthly" | "yearly") => number;
  getIntroPrice: (plan: "basic" | "growth" | "pro") => number | undefined;
  formatPrice: (amount: number) => string;
  rawCurrency: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria", GH: "Ghana", KE: "Kenya", ZA: "South Africa",
  UG: "Uganda", TZ: "Tanzania", RW: "Rwanda", ZM: "Zambia",
  MW: "Malawi", ET: "Ethiopia", CM: "Cameroon", CI: "Côte d'Ivoire",
  SN: "Senegal", BF: "Burkina Faso", ML: "Mali", BJ: "Benin", TG: "Togo",
  NE: "Niger", GW: "Guinea-Bissau", SL: "Sierra Leone", LR: "Liberia",
  GM: "Gambia", CV: "Cape Verde", GQ: "Equatorial Guinea",
  GA: "Gabon", CG: "Congo", CD: "DR Congo", AO: "Angola",
  NA: "Namibia", BW: "Botswana", MZ: "Mozambique", MG: "Madagascar",
  MU: "Mauritius", SC: "Seychelles", KM: "Comoros", BI: "Burundi",
  DJ: "Djibouti", SO: "Somalia", SD: "Sudan", SS: "South Sudan",
  ER: "Eritrea", TD: "Chad", CF: "CAR", MR: "Mauritania",
  LY: "Libya", TN: "Tunisia", DZ: "Algeria", MA: "Morocco", EG: "Egypt",
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  DE: "Germany", FR: "France", IN: "India",
};

async function detectCountry(): Promise<string | null> {
  // Already detected and cached?
  const cached = localStorage.getItem("pricingCountry");
  if (cached) {
    try {
      const { ts, code } = JSON.parse(cached);
      if (Date.now() - ts < 30 * 60 * 1000) return code; // 30-min cache
    } catch { }
  }

  for (const api of [
    () => fetch("https://api.country.is").then(r => r.ok ? r.json() : Promise.reject()),
    () => fetch("https://ipapi.co/json/").then(r => r.ok ? r.json() : Promise.reject()),
  ]) {
    try {
      const data = await api();
      const code = data?.country || data?.country_code;
      if (code && /^[A-Z]{2}$/i.test(code)) {
        localStorage.setItem("pricingCountry", JSON.stringify({ ts: Date.now(), code: code.toUpperCase() }));
        return code.toUpperCase();
      }
    } catch { /* try next */ }
  }
  return null;
}

export function useLocalizedPricing(): UseLocalizedPricingResult {
  const [pricing, setPricing] = useState<ResolvedPricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        // Check for manual region override
        const isManual = localStorage.getItem("pricingRegionManual") === "true";
        const savedRegion = localStorage.getItem("pricingRegion");

        let country: string | null = null;
        let region = "global" as "nigeria" | "africa" | "global";

        if (isManual && savedRegion) {
          region = savedRegion as "nigeria" | "africa" | "global";
        } else {
          country = await detectCountry();
          region = getPricingRegion(country);
          if (!isManual && region) {
            localStorage.setItem("pricingRegion", region);
          }
          if (country) {
            localStorage.setItem("pricingCountry", JSON.stringify({ ts: Date.now(), code: country }));
          }
        }

        // Resolve base prices
        let prices: PlanPrices;
        let introPrices: PlanIntro;
        let currency: string;

        if (region === "nigeria") {
          prices = NIGERIA_PRICES;
          introPrices = NIGERIA_INTRO;
          currency = "NGN";
        } else {
          const basePrices = region === "africa" ? AFRICA_USD_PRICES : GLOBAL_USD_PRICES;
          const baseIntro = region === "africa" ? AFRICA_INTRO : GLOBAL_INTRO;

          // Try currency conversion
          const localCurrency = getCurrencyForCountry(country || "US");
          if (localCurrency !== "USD") {
            const rate = await getExchangeRate("USD", localCurrency);
            if (rate) {
              prices = {
                basic: convertPrice(basePrices.basic, rate),
                growth: convertPrice(basePrices.growth, rate),
                pro: convertPrice(basePrices.pro, rate),
              };
              introPrices = {
                basic: baseIntro.basic ? convertPrice(baseIntro.basic, rate) : undefined,
                growth: baseIntro.growth ? convertPrice(baseIntro.growth, rate) : undefined,
              };
              currency = localCurrency;
              if (!cancelled) setPricing({
                region, currency, prices, introPrices,
                country: country || undefined,
                countryName: country ? (COUNTRY_NAMES[country] || country) : undefined,
                converted: true,
                exchangeRate: rate,
              });
              return;
            }
          }

          // Fallback: show USD
          prices = basePrices;
          introPrices = baseIntro;
          currency = "USD";
        }

        if (!cancelled) setPricing({
          region, currency, prices, introPrices,
          country: country || undefined,
          countryName: country ? (COUNTRY_NAMES[country] || country) : undefined,
          converted: false,
        });
      } catch (err) {
        if (!cancelled) setError("Failed to load pricing");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, []);

  const getPlanPrice = useCallback(
    (plan: "basic" | "growth" | "pro", cycle: "monthly" | "yearly"): number => {
      if (!pricing) return 0;
      const base = pricing.prices[plan];
      return cycle === "yearly" ? Math.round(base * YEARLY_MULTIPLIER * 100) / 100 : base;
    },
    [pricing]
  );

  const getIntroPrice = useCallback(
    (plan: "basic" | "growth" | "pro"): number | undefined => {
      return pricing?.introPrices[plan];
    },
    [pricing]
  );

  const formatPrice = useCallback(
    (amount: number): string => {
      if (!pricing) return "...";
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: pricing.currency,
          maximumFractionDigits: 2,
        }).format(amount);
      } catch {
        return `${amount.toLocaleString()} ${pricing.currency}`;
      }
    },
    [pricing]
  );

  return {
    pricing, loading, error,
    getPlanPrice, getIntroPrice, formatPrice,
    rawCurrency: pricing?.currency || "USD",
  };
}
