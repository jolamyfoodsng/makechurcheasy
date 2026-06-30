/**
 * useCountryPricing.ts — Fetches country-specific pricing for the desktop app.
 *
 * Reads from GET /api/pricing/country with the device secret header.
 * Caches in localStorage (user-scoped) so the UI renders instantly on load.
 * Stale-while-revalidate: serves cache immediately, refreshes in background.
 *
 * Requirements:
 *  - Never hardcode prices
 *  - Never fall back to hardcoded USD
 *  - Show loading / retry states when pricing unavailable
 *  - Desktop and dashboard always display identical prices for the same user
 */

import { useState, useEffect, useCallback } from "react";
import { getDeviceSecret } from "../services/authService";
import { getUserScopedKey } from "../services/userScopedStorage";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlanPrice {
  monthly: number;
  yearly: number;
}

export interface CountryPricing {
  countryCode: string;
  countryName: string;
  currency: string;
  currencySymbol: string;
  plans: {
    basic: PlanPrice;
    starter: PlanPrice;
    growth: PlanPrice;
    pro: PlanPrice;
  };
  pricingVersion: number;
  source: "country" | "regional" | "global";
}

// ── Constants ────────────────────────────────────────────────────────────────

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://api.makechurcheasy.creatorstudioslabs.stream";

const CACHE_KEY = "ocs-country-pricing";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const HARD_EXPIRY_MS = CACHE_TTL_MS * 10; // 50 minutes max

// ── Cache helpers ────────────────────────────────────────────────────────────

interface CacheEntry {
  pricing: CountryPricing;
  fetchedAt: number;
}

function readCache(): CountryPricing | null {
  try {
    const raw = localStorage.getItem(getUserScopedKey(CACHE_KEY));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > HARD_EXPIRY_MS) return null;
    return entry.pricing;
  } catch {
    return null;
  }
}

function writeCache(pricing: CountryPricing): void {
  try {
    localStorage.setItem(
      getUserScopedKey(CACHE_KEY),
      JSON.stringify({ pricing, fetchedAt: Date.now() })
    );
  } catch {
    // quota exceeded — ignore
  }
}

// ── Fetcher ──────────────────────────────────────────────────────────────────

let inflight: Promise<CountryPricing> | null = null;

async function fetchPricing(): Promise<CountryPricing> {
  if (inflight) return inflight;
  inflight = doFetch().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doFetch(): Promise<CountryPricing> {
  const secret = getDeviceSecret();
  const res = await fetch(`${API_BASE}/api/pricing/country`, {
    headers: {
      "X-Device-Secret": secret || "",
    },
  });
  if (!res.ok) {
    throw new Error(`Pricing API returned ${res.status}`);
  }
  const data = await res.json();
  if (!data?.plans || !data?.currency) {
    throw new Error("Invalid pricing response");
  }
  writeCache(data);
  return data;
}

// ── React hook ───────────────────────────────────────────────────────────────

interface UseCountryPricingResult {
  pricing: CountryPricing | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  formatPrice: (amount: number) => string;
  getPlanPrice: (
    planId: "basic" | "starter" | "growth" | "pro",
    cycle: "monthly" | "yearly"
  ) => number;
  getFormattedPlanPrice: (
    planId: "basic" | "starter" | "growth" | "pro",
    cycle: "monthly" | "yearly"
  ) => string;
  currency: string;
  currencySymbol: string;
}

export function useCountryPricing(): UseCountryPricingResult {
  const [pricing, setPricing] = useState<CountryPricing | null>(() => readCache());
  const [loading, setLoading] = useState(!pricing);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    // Serve cache unless forced refresh
    if (!force) {
      const cached = readCache();
      if (cached) {
        setPricing(cached);
        setLoading(false);
        // Background refresh
        fetchPricing()
          .then((fresh) => setPricing(fresh))
          .catch(() => {});
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const fresh = await fetchPricing();
      setPricing(fresh);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load pricing"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const retry = useCallback(() => {
    load(true);
  }, [load]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const formatPrice = useCallback(
    (amount: number): string => {
      if (!pricing) return "...";
      if (amount === 0) return `${pricing.currencySymbol}0`;
      const formatted = amount.toLocaleString("en-US");
      return `${pricing.currencySymbol}${formatted}`;
    },
    [pricing]
  );

  const getPlanPrice = useCallback(
    (
      planId: "basic" | "starter" | "growth" | "pro",
      cycle: "monthly" | "yearly"
    ): number => {
      if (!pricing) return 0;
      return pricing.plans[planId]?.[cycle] ?? 0;
    },
    [pricing]
  );

  const getFormattedPlanPrice = useCallback(
    (
      planId: "basic" | "starter" | "growth" | "pro",
      cycle: "monthly" | "yearly"
    ): string => {
      const amount = getPlanPrice(planId, cycle);
      return formatPrice(amount);
    },
    [getPlanPrice, formatPrice]
  );

  return {
    pricing,
    loading,
    error,
    retry,
    formatPrice,
    getPlanPrice,
    getFormattedPlanPrice,
    currency: pricing?.currency ?? "",
    currencySymbol: pricing?.currencySymbol ?? "",
  };
}
