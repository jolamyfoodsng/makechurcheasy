import assert from "node:assert/strict";
import { test } from "node:test";

import type { ResolvedPricing } from "@/types/countryPricing";
import { selectFlutterwavePricing } from "./flutterwavePricing";

function pricing(overrides: Partial<ResolvedPricing> = {}): ResolvedPricing {
  return {
    countryCode: "US",
    countryName: "United States",
    currency: "USD",
    currencySymbol: "$",
    plans: {
      basic: { monthly: 7, yearly: 70 },
      growth: { monthly: 10, yearly: 100 },
    },
    baseUsdPlans: {
      basic: { monthly: 7, yearly: 70 },
      growth: { monthly: 10, yearly: 100 },
    },
    pricingVersion: 1,
    source: "country",
    ...overrides,
  };
}

test("uses configured local pricing for a mapped country", () => {
  const result = selectFlutterwavePricing({
    countryCode: "GH",
    countryName: "Ghana",
    countryPricing: pricing({
      countryCode: "GH",
      countryName: "Ghana",
      currency: "GHS",
      currencySymbol: "GH₵",
      plans: {
        basic: { monthly: 60, yearly: 600 },
        growth: { monthly: 120, yearly: 1200 },
      },
    }),
    usdPricing: pricing(),
  });

  assert.equal(result.currency, "GHS");
  assert.equal(result.plans.basic.monthly, 60);
  assert.equal(result.checkoutCurrencySource, "local");
});

test("falls back to the configured USD price for an unsupported country", () => {
  const result = selectFlutterwavePricing({
    countryCode: "ET",
    countryName: "Ethiopia",
    countryPricing: pricing({
      countryCode: "ET",
      countryName: "Ethiopia",
      currency: "ETB",
      currencySymbol: "Br",
      plans: {
        basic: { monthly: 500, yearly: 5000 },
        growth: { monthly: 800, yearly: 8000 },
      },
    }),
    usdPricing: pricing({
      plans: {
        basic: { monthly: 7, yearly: 70 },
        growth: { monthly: 10, yearly: 100 },
      },
    }),
  });

  assert.equal(result.currency, "USD");
  assert.equal(result.currencySymbol, "$");
  assert.equal(result.plans.basic.monthly, 7);
  assert.equal(result.checkoutCountryCode, "ET");
  assert.equal(result.checkoutCurrencySource, "usd_fallback");
});

test("keeps a country's own USD plan when the database configures USD directly", () => {
  const result = selectFlutterwavePricing({
    countryCode: "AE",
    countryName: "United Arab Emirates",
    countryPricing: pricing({
      countryCode: "AE",
      countryName: "United Arab Emirates",
      currency: "USD",
      currencySymbol: "$",
      plans: {
        basic: { monthly: 6, yearly: 60 },
        growth: { monthly: 15, yearly: 150 },
      },
    }),
    usdPricing: pricing({
      plans: {
        basic: { monthly: 7, yearly: 70 },
        growth: { monthly: 10, yearly: 100 },
      },
    }),
  });

  assert.equal(result.currency, "USD");
  assert.equal(result.plans.basic.monthly, 6);
  assert.equal(result.plans.growth.monthly, 15);
  assert.equal(result.checkoutCurrencySource, "usd_fallback");
});
