/**
 * Country-Based Pricing Service
 *
 * Single source of truth for all regional pricing.
 * Supports: Country → Regional → Global fallback chain.
 * Nigeria uses fixed NGN pricing. Explicit country rows use their configured
 * amounts; generated fallback rows use the regional USD base and the latest
 * cached USD exchange rate for their local currency.
 */

import clientPromise from "./mongodb";
import { COLLECTIONS } from "./db";
import { getUsdExchangeRate } from "./exchangeRates";
import type {
  CountryPricingDoc,
  CountryPricingEntry,
  PlanTierKey,
  PlanPrice,
  ResolvedPricing,
} from "@/types/countryPricing";

// ─── In-Memory Cache ────────────────────────────────────────────────────────

let _cache: { doc: CountryPricingDoc; ts: number } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute

const AFRICAN_COUNTRY_CODES = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CG", "CD", "CI",
  "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS",
  "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "RW", "ST",
  "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW", "EH", "RE", "YT", "SH",
]);

type CountryCurrencyMeta = {
  name: string;
  currency: string;
  symbol: string;
};

/** Currency metadata for countries that may not have their own admin row yet. */
const COUNTRY_CURRENCY_META: Record<string, CountryCurrencyMeta> = {
  DZ: { name: "Algeria", currency: "DZD", symbol: "دج" },
  AO: { name: "Angola", currency: "AOA", symbol: "Kz" },
  BJ: { name: "Benin", currency: "XOF", symbol: "CFA" },
  CV: { name: "Cape Verde", currency: "CVE", symbol: "$" },
  BW: { name: "Botswana", currency: "BWP", symbol: "P" },
  BF: { name: "Burkina Faso", currency: "XOF", symbol: "CFA" },
  BI: { name: "Burundi", currency: "BIF", symbol: "FBu" },
  CM: { name: "Cameroon", currency: "XAF", symbol: "FCFA" },
  CF: { name: "Central African Republic", currency: "XAF", symbol: "FCFA" },
  TD: { name: "Chad", currency: "XAF", symbol: "FCFA" },
  KM: { name: "Comoros", currency: "KMF", symbol: "CF" },
  CG: { name: "Republic of the Congo", currency: "XAF", symbol: "FCFA" },
  CD: { name: "Democratic Republic of the Congo", currency: "CDF", symbol: "FC" },
  CI: { name: "Côte d'Ivoire", currency: "XOF", symbol: "CFA" },
  DJ: { name: "Djibouti", currency: "DJF", symbol: "Fdj" },
  EG: { name: "Egypt", currency: "EGP", symbol: "E£" },
  GQ: { name: "Equatorial Guinea", currency: "XAF", symbol: "FCFA" },
  ER: { name: "Eritrea", currency: "ERN", symbol: "Nfk" },
  SZ: { name: "Eswatini", currency: "SZL", symbol: "E" },
  ET: { name: "Ethiopia", currency: "ETB", symbol: "Br" },
  GA: { name: "Gabon", currency: "XAF", symbol: "FCFA" },
  GM: { name: "The Gambia", currency: "GMD", symbol: "D" },
  GH: { name: "Ghana", currency: "GHS", symbol: "GH₵" },
  GN: { name: "Guinea", currency: "GNF", symbol: "FG" },
  GW: { name: "Guinea-Bissau", currency: "XOF", symbol: "CFA" },
  KE: { name: "Kenya", currency: "KES", symbol: "KSh" },
  LS: { name: "Lesotho", currency: "LSL", symbol: "L" },
  LR: { name: "Liberia", currency: "LRD", symbol: "L$" },
  LY: { name: "Libya", currency: "LYD", symbol: "ل.د" },
  MG: { name: "Madagascar", currency: "MGA", symbol: "Ar" },
  MW: { name: "Malawi", currency: "MWK", symbol: "MK" },
  ML: { name: "Mali", currency: "XOF", symbol: "CFA" },
  MR: { name: "Mauritania", currency: "MRU", symbol: "UM" },
  MU: { name: "Mauritius", currency: "MUR", symbol: "Rs" },
  MA: { name: "Morocco", currency: "MAD", symbol: "د.م." },
  MZ: { name: "Mozambique", currency: "MZN", symbol: "MT" },
  NA: { name: "Namibia", currency: "NAD", symbol: "N$" },
  NE: { name: "Niger", currency: "XOF", symbol: "CFA" },
  RW: { name: "Rwanda", currency: "RWF", symbol: "FRw" },
  ST: { name: "São Tomé and Príncipe", currency: "STN", symbol: "Db" },
  SN: { name: "Senegal", currency: "XOF", symbol: "CFA" },
  SC: { name: "Seychelles", currency: "SCR", symbol: "Rs" },
  SL: { name: "Sierra Leone", currency: "SLE", symbol: "Le" },
  SO: { name: "Somalia", currency: "SOS", symbol: "Sh" },
  ZA: { name: "South Africa", currency: "ZAR", symbol: "R" },
  SS: { name: "South Sudan", currency: "SSP", symbol: "£" },
  SD: { name: "Sudan", currency: "SDG", symbol: "ج.س." },
  TZ: { name: "Tanzania", currency: "TZS", symbol: "TSh" },
  TG: { name: "Togo", currency: "XOF", symbol: "CFA" },
  TN: { name: "Tunisia", currency: "TND", symbol: "د.ت" },
  UG: { name: "Uganda", currency: "UGX", symbol: "UGX" },
  ZM: { name: "Zambia", currency: "ZMW", symbol: "ZK" },
  ZW: { name: "Zimbabwe", currency: "ZWG", symbol: "Z$" },
  EH: { name: "Western Sahara", currency: "MAD", symbol: "د.م." },
  RE: { name: "Réunion", currency: "EUR", symbol: "€" },
  YT: { name: "Mayotte", currency: "EUR", symbol: "€" },
  SH: { name: "Saint Helena", currency: "SHP", symbol: "£" },
  // Common non-African currencies so global users are also shown locally.
  US: { name: "United States", currency: "USD", symbol: "$" },
  CA: { name: "Canada", currency: "CAD", symbol: "CA$" },
  GB: { name: "United Kingdom", currency: "GBP", symbol: "£" },
  AU: { name: "Australia", currency: "AUD", symbol: "A$" },
  IN: { name: "India", currency: "INR", symbol: "₹" },
  PK: { name: "Pakistan", currency: "PKR", symbol: "₨" },
  BD: { name: "Bangladesh", currency: "BDT", symbol: "৳" },
  PH: { name: "Philippines", currency: "PHP", symbol: "₱" },
  IE: { name: "Ireland", currency: "EUR", symbol: "€" },
  FR: { name: "France", currency: "EUR", symbol: "€" },
  DE: { name: "Germany", currency: "EUR", symbol: "€" },
  ES: { name: "Spain", currency: "EUR", symbol: "€" },
  IT: { name: "Italy", currency: "EUR", symbol: "€" },
  NL: { name: "Netherlands", currency: "EUR", symbol: "€" },
  BE: { name: "Belgium", currency: "EUR", symbol: "€" },
  PT: { name: "Portugal", currency: "EUR", symbol: "€" },
  SE: { name: "Sweden", currency: "SEK", symbol: "kr" },
  NO: { name: "Norway", currency: "NOK", symbol: "kr" },
  DK: { name: "Denmark", currency: "DKK", symbol: "kr" },
  FI: { name: "Finland", currency: "EUR", symbol: "€" },
  PL: { name: "Poland", currency: "PLN", symbol: "zł" },
  CZ: { name: "Czechia", currency: "CZK", symbol: "Kč" },
  AT: { name: "Austria", currency: "EUR", symbol: "€" },
  CH: { name: "Switzerland", currency: "CHF", symbol: "CHF" },
  RO: { name: "Romania", currency: "RON", symbol: "lei" },
  HU: { name: "Hungary", currency: "HUF", symbol: "Ft" },
  BG: { name: "Bulgaria", currency: "BGN", symbol: "лв" },
  HR: { name: "Croatia", currency: "EUR", symbol: "€" },
  SK: { name: "Slovakia", currency: "EUR", symbol: "€" },
  SI: { name: "Slovenia", currency: "EUR", symbol: "€" },
  LT: { name: "Lithuania", currency: "EUR", symbol: "€" },
  LV: { name: "Latvia", currency: "EUR", symbol: "€" },
  EE: { name: "Estonia", currency: "EUR", symbol: "€" },
  GR: { name: "Greece", currency: "EUR", symbol: "€" },
  CY: { name: "Cyprus", currency: "EUR", symbol: "€" },
  MT: { name: "Malta", currency: "EUR", symbol: "€" },
  MX: { name: "Mexico", currency: "MXN", symbol: "$" },
  BR: { name: "Brazil", currency: "BRL", symbol: "R$" },
  AR: { name: "Argentina", currency: "ARS", symbol: "$" },
  JP: { name: "Japan", currency: "JPY", symbol: "¥" },
  KR: { name: "South Korea", currency: "KRW", symbol: "₩" },
  CN: { name: "China", currency: "CNY", symbol: "¥" },
  TW: { name: "Taiwan", currency: "TWD", symbol: "NT$" },
  HK: { name: "Hong Kong", currency: "HKD", symbol: "HK$" },
  NZ: { name: "New Zealand", currency: "NZD", symbol: "NZ$" },
  AI: { name: "Anguilla", currency: "XCD", symbol: "EC$" },
  AS: { name: "American Samoa", currency: "USD", symbol: "$" },
  NR: { name: "Nauru", currency: "AUD", symbol: "A$" },
};

const FLUTTERWAVE_LOCAL_COUNTRIES = new Set([
  "NG", "GH", "KE", "RW", "TZ", "UG", "ZA", "ZM",
]);

const NIGERIA_PLANS: Record<PlanTierKey, PlanPrice> = {
  basic: { monthly: 4000, yearly: 40000, introductoryMonthly: 3500 },
  growth: { monthly: 8000, yearly: 80000, introductoryMonthly: 7500 },
};

const AFRICA_BASE_USD_PLANS: Record<PlanTierKey, PlanPrice> = {
  basic: { monthly: 5, yearly: 50 },
  growth: { monthly: 8, yearly: 80 },
};

const GLOBAL_BASE_USD_PLANS: Record<PlanTierKey, PlanPrice> = {
  basic: { monthly: 7, yearly: 70 },
  growth: { monthly: 10, yearly: 100 },
};

// Version 3 repairs the original Ghana seed/override, which was persisted as
// USD even though the supported Flutterwave market and source defaults are GHS.
// Version 4 makes every enabled database country row authoritative for new
// pricing lookups, including rows that use USD and the explicit Nigeria row.
const COUNTRY_PRICING_MIGRATION_VERSION = 4;

export function invalidateCountryPricingCache() {
  _cache = null;
}

// ─── Default Seed Data ──────────────────────────────────────────────────────

const DEFAULT_COUNTRIES: Record<string, CountryPricingEntry> = {
  // ── Africa ──
  NG: {
    country: "Nigeria",
    currency: "NGN",
    currencySymbol: "₦",
    enabled: true,
    plans: {
      basic: { monthly: 4000, yearly: 40000, introductoryMonthly: 3500 },
      growth: { monthly: 8000, yearly: 80000, introductoryMonthly: 7500 },
    },
  },
  GH: {
    country: "Ghana",
    currency: "GHS",
    currencySymbol: "GH₵",
    enabled: true,
    plans: {
      basic: { monthly: 50, yearly: 500 },
      growth: { monthly: 220, yearly: 2200 },
    },
  },
  KE: {
    country: "Kenya",
    currency: "KES",
    currencySymbol: "KSh",
    enabled: true,
    plans: {
      basic: { monthly: 500, yearly: 5000 },
      growth: { monthly: 2200, yearly: 22000 },
    },
  },
  ZA: {
    country: "South Africa",
    currency: "ZAR",
    currencySymbol: "R",
    enabled: true,
    plans: {
      basic: { monthly: 80, yearly: 800 },
      growth: { monthly: 350, yearly: 3500 },
    },
  },
  UG: {
    country: "Uganda",
    currency: "UGX",
    currencySymbol: "UGX",
    enabled: true,
    plans: {
      basic: { monthly: 15000, yearly: 150000 },
      growth: { monthly: 70000, yearly: 700000 },
    },
  },
  TZ: {
    country: "Tanzania",
    currency: "TZS",
    currencySymbol: "TSh",
    enabled: true,
    plans: {
      basic: { monthly: 12000, yearly: 120000 },
      growth: { monthly: 55000, yearly: 550000 },
    },
  },

  // ── South Asia ──
  IN: {
    country: "India",
    currency: "INR",
    currencySymbol: "₹",
    enabled: true,
    plans: {
      basic: { monthly: 299, yearly: 2990 },
      growth: { monthly: 1299, yearly: 12990 },
    },
  },
  PK: {
    country: "Pakistan",
    currency: "PKR",
    currencySymbol: "₨",
    enabled: true,
    plans: {
      basic: { monthly: 800, yearly: 8000 },
      growth: { monthly: 3500, yearly: 35000 },
    },
  },
  BD: {
    country: "Bangladesh",
    currency: "BDT",
    currencySymbol: "৳",
    enabled: true,
    plans: {
      basic: { monthly: 300, yearly: 3000 },
      growth: { monthly: 1300, yearly: 13000 },
    },
  },

  // ── Southeast Asia ──
  PH: {
    country: "Philippines",
    currency: "PHP",
    currencySymbol: "₱",
    enabled: true,
    plans: {
      basic: { monthly: 150, yearly: 1500 },
      growth: { monthly: 650, yearly: 6500 },
    },
  },

  // ── Western markets ──
  US: {
    country: "United States",
    currency: "USD",
    currencySymbol: "$",
    enabled: true,
    plans: {
      basic: { monthly: 5, yearly: 50 },
      growth: { monthly: 10, yearly: 100 },
    },
  },
  CA: {
    country: "Canada",
    currency: "CAD",
    currencySymbol: "CA$",
    enabled: true,
    plans: {
      basic: { monthly: 7, yearly: 70 },
      growth: { monthly: 20, yearly: 200 },
    },
  },
  GB: {
    country: "United Kingdom",
    currency: "GBP",
    currencySymbol: "£",
    enabled: true,
    plans: {
      basic: { monthly: 4, yearly: 40 },
      growth: { monthly: 12, yearly: 120 },
    },
  },
  AU: {
    country: "Australia",
    currency: "AUD",
    currencySymbol: "A$",
    enabled: true,
    plans: {
      basic: { monthly: 7, yearly: 70 },
      growth: { monthly: 22, yearly: 220 },
    },
  },
};

// Regional fallback mappings: unsupported country → region → use closest supported country
const REGIONAL_FALLBACKS: Record<string, string> = {
  // West Africa
  SN: "NG", CI: "NG", CM: "NG", GH: "GH", BF: "NG", ML: "NG", NE: "NG",
  TG: "NG", BJ: "NG", GN: "NG", SL: "NG", LR: "NG", GM: "NG", CV: "NG",
  GW: "NG", GQ: "NG", GA: "NG", CG: "NG", CD: "NG", AO: "NG", ST: "NG",
  // East Africa
  ET: "KE", RW: "KE", BI: "KE", SS: "KE", SO: "KE", DJ: "KE", ER: "KE",
  MG: "KE", MU: "KE", SC: "KE", MZ: "KE", MW: "KE", ZM: "KE", ZW: "KE",
  BW: "ZA", NA: "ZA", LS: "ZA", SZ: "ZA",
  // North Africa
  EG: "ZA", LY: "NG", TN: "ZA", DZ: "ZA", MA: "ZA", SD: "KE",
  // Central Asia
  PK: "PK", AF: "PK", IR: "PK",
  // South Asia
  LK: "IN", NP: "IN", BT: "IN", MV: "IN", MM: "IN",
  // Southeast Asia
  VN: "PH", TH: "PH", MY: "PH", ID: "PH", SG: "PH", KH: "PH", LA: "PH", BN: "PH",
  // Europe (fallback to GBP)
  IE: "GB", FR: "GB", DE: "GB", ES: "GB", IT: "GB", NL: "GB", BE: "GB",
  PT: "GB", SE: "GB", NO: "GB", DK: "GB", FI: "GB", PL: "GB", CZ: "GB",
  AT: "GB", CH: "GB", RO: "GB", HU: "GB", BG: "GB", HR: "GB", SK: "GB",
  SI: "GB", LT: "GB", LV: "GB", EE: "GB", GR: "GB", CY: "GB", MT: "GB",
  // Americas (fallback to USD)
  MX: "US", BR: "US", AR: "US", CO: "US", CL: "US", PE: "US", EC: "US",
  VE: "US", BO: "US", PY: "US", UY: "US", CR: "US", PA: "US", GT: "US",
  HN: "US", SV: "US", NI: "US", BZ: "US", DO: "US", CU: "US", HT: "US",
  JM: "US", TT: "US", BB: "US", BS: "US", AG: "US", DM: "US", GD: "US",
  KN: "US", LC: "US", VC: "US", PR: "US",
  // Middle East (fallback to USD)
  SA: "US", AE: "US", QA: "US", KW: "US", BH: "US", OM: "US", JO: "US",
  LB: "US", IL: "US", IQ: "US", SY: "US", YE: "US",
  // East Asia
  JP: "US", KR: "US", CN: "PH", TW: "PH", HK: "PH", MO: "PH",
  // Oceania
  NZ: "AU", FJ: "AU", PG: "AU", SB: "AU", VU: "AU", WS: "AU", TO: "AU",
};

function pickPublicPlans(plans?: Partial<Record<string, PlanPrice>>): Record<PlanTierKey, PlanPrice> {
  return {
    basic: plans?.basic || DEFAULT_COUNTRIES.US.plans.basic,
    growth: plans?.growth || DEFAULT_COUNTRIES.US.plans.growth,
  };
}

function sanitizeCountryEntry(entry: CountryPricingEntry): CountryPricingEntry {
  return {
    ...entry,
    plans: pickPublicPlans(entry.plans as Partial<Record<string, PlanPrice>>),
  };
}

function enforceProviderCurrency(code: string, entry: CountryPricingEntry): CountryPricingEntry {
  const meta = COUNTRY_CURRENCY_META[code];
  if (!meta || !FLUTTERWAVE_LOCAL_COUNTRIES.has(code)) return entry;
  return {
    ...entry,
    currency: meta.currency,
    currencySymbol: meta.symbol,
  };
}

function hasLegacyUsdPlanShape(entry: CountryPricingEntry): boolean {
  return entry.plans.basic.monthly === 4
    && entry.plans.basic.yearly === 40
    && entry.plans.growth.monthly === 10
    && entry.plans.growth.yearly === 100;
}

function clonePlans(plans: Record<PlanTierKey, PlanPrice>): Record<PlanTierKey, PlanPrice> {
  return {
    basic: { ...plans.basic },
    growth: { ...plans.growth },
  };
}

function roundLocalAmount(amount: number): number {
  return Math.max(1, Math.round(amount));
}

function convertPlansToLocal(
  plans: Record<PlanTierKey, PlanPrice>,
  usdToLocalRate: number,
): Record<PlanTierKey, PlanPrice> {
  return {
    basic: {
      monthly: roundLocalAmount(plans.basic.monthly * usdToLocalRate),
      yearly: roundLocalAmount(plans.basic.yearly * usdToLocalRate),
      ...(plans.basic.introductoryMonthly != null
        ? { introductoryMonthly: roundLocalAmount(plans.basic.introductoryMonthly * usdToLocalRate) }
        : {}),
    },
    growth: {
      monthly: roundLocalAmount(plans.growth.monthly * usdToLocalRate),
      yearly: roundLocalAmount(plans.growth.yearly * usdToLocalRate),
      ...(plans.growth.introductoryMonthly != null
        ? { introductoryMonthly: roundLocalAmount(plans.growth.introductoryMonthly * usdToLocalRate) }
        : {}),
    },
  };
}

function convertPlansToUsd(
  plans: Record<PlanTierKey, PlanPrice>,
  usdToLocalRate: number,
): Record<PlanTierKey, PlanPrice> {
  const divide = (value: number) => Math.round((value / usdToLocalRate) * 100) / 100;
  return {
    basic: {
      monthly: divide(plans.basic.monthly),
      yearly: divide(plans.basic.yearly),
      ...(plans.basic.introductoryMonthly != null
        ? { introductoryMonthly: divide(plans.basic.introductoryMonthly) }
        : {}),
    },
    growth: {
      monthly: divide(plans.growth.monthly),
      yearly: divide(plans.growth.yearly),
      ...(plans.growth.introductoryMonthly != null
        ? { introductoryMonthly: divide(plans.growth.introductoryMonthly) }
        : {}),
    },
  };
}

function pricingRegion(code: string): "nigeria" | "africa" | "global" {
  if (code === "NG") return "nigeria";
  return AFRICAN_COUNTRY_CODES.has(code) ? "africa" : "global";
}

async function buildResolvedPricing({
  code,
  entry,
  source,
  version,
}: {
  code: string;
  entry?: CountryPricingEntry;
  source: ResolvedPricing["source"];
  version: number;
}): Promise<ResolvedPricing> {
  const meta = COUNTRY_CURRENCY_META[code];
  const countryName = entry?.country || meta?.name || code;
  const currency = (entry?.currency || meta?.currency || "USD").toUpperCase();
  const currencySymbol = entry?.currencySymbol || meta?.symbol || "$";
  const region = pricingRegion(code);
  const baseUsdPlans = region === "global" ? GLOBAL_BASE_USD_PLANS : AFRICA_BASE_USD_PLANS;
  const usdToLocalRate = await getUsdExchangeRate(currency);

  // An enabled country row is an explicit admin pricing decision. Use its
  // amounts exactly; only generated country/regional fallbacks should be
  // exchange-rate converted. This keeps the price shown in the dashboard,
  // the payment intent, and the provider checkout identical.
  // Rows for supported local markets with the legacy USD-shaped placeholder
  // are handled below by the exchange-rate fallback until their local amount
  // is explicitly configured.
  if (
    source === "country"
    && entry
    && !(currency !== "USD" && hasLegacyUsdPlanShape(entry) && !Object.prototype.hasOwnProperty.call(DEFAULT_COUNTRIES, code))
  ) {
    const configuredPlans = clonePlans(entry.plans);
    const configuredBaseUsdPlans = currency === "USD"
      ? clonePlans(configuredPlans)
      : usdToLocalRate
        ? convertPlansToUsd(configuredPlans, usdToLocalRate)
        : clonePlans(baseUsdPlans);

    return {
      countryCode: code,
      countryName,
      currency,
      currencySymbol,
      plans: configuredPlans,
      baseUsdPlans: configuredBaseUsdPlans,
      usdToLocalRate: usdToLocalRate || undefined,
      pricingVersion: version,
      source,
    };
  }

  if (region === "nigeria") {
    return {
      countryCode: code,
      countryName,
      currency,
      currencySymbol,
      plans: clonePlans(NIGERIA_PLANS),
      baseUsdPlans: usdToLocalRate
        ? convertPlansToUsd(NIGERIA_PLANS, usdToLocalRate)
        : clonePlans(AFRICA_BASE_USD_PLANS),
      usdToLocalRate: usdToLocalRate || undefined,
      pricingVersion: version,
      source,
    };
  }

  // Never display a stale local amount when the rate provider is unavailable.
  // Falling back to the USD base keeps the amount correct and transparent.
  if (!usdToLocalRate) {
    return {
      countryCode: code,
      countryName,
      currency: "USD",
      currencySymbol: "$",
      plans: clonePlans(baseUsdPlans),
      baseUsdPlans: clonePlans(baseUsdPlans),
      usdToLocalRate: 1,
      pricingVersion: version,
      source: "fallback",
    };
  }

  return {
    countryCode: code,
    countryName,
    currency,
    currencySymbol,
    plans: convertPlansToLocal(baseUsdPlans, usdToLocalRate),
    baseUsdPlans: clonePlans(baseUsdPlans),
    usdToLocalRate,
    pricingVersion: version,
    source,
  };
}

// ─── Database Operations ────────────────────────────────────────────────────

async function getCollection() {
  const client = await clientPromise;
  return client.db().collection<CountryPricingDoc>(COLLECTIONS.COUNTRY_PRICING);
}

async function loadDoc(): Promise<CountryPricingDoc> {
  if (_cache && (Date.now() - _cache.ts) < CACHE_TTL_MS) {
    return _cache.doc;
  }

  const col = await getCollection();
  let doc = await col.findOne({ _id: "default" as any });

  if (!doc) {
    // Seed with defaults
    doc = {
      _id: "default" as any,
      version: 1,
      countries: DEFAULT_COUNTRIES,
      regionalFallbacks: REGIONAL_FALLBACKS,
      updatedAt: new Date().toISOString(),
    };
    await col.updateOne(
      { _id: "default" as any },
      { $set: doc },
      { upsert: true }
    );
    console.log("[CountryPricing] Seeded default country pricing");
  }

  // Repair legacy provider-market rows once. The old row configured Ghana as
  // USD, which made Flutterwave receive USD even for a Ghanaian customer;
  // several other local rows also carried the old USD-shaped 4/10 values.
  // Custom admin prices are preserved because only that exact legacy shape is
  // migrated.
  const ghana = doc.countries?.GH;
  const needsGhanaFullRepair = !ghana || ghana.currency?.toUpperCase() !== "GHS";
  const localCurrencyRepairs: Record<string, CountryPricingEntry> = {};
  for (const code of FLUTTERWAVE_LOCAL_COUNTRIES) {
    const entry = doc.countries?.[code];
    const meta = COUNTRY_CURRENCY_META[code];
    const defaultEntry = DEFAULT_COUNTRIES[code];
    const needsCurrencyRepair = Boolean(
      entry && meta && (
        entry.currency?.toUpperCase() !== meta.currency
        || entry.currencySymbol !== meta.symbol
      ),
    );
    const needsPlanRepair = Boolean(entry && defaultEntry && hasLegacyUsdPlanShape(entry));
    if (entry && (needsCurrencyRepair || needsPlanRepair)) {
      const repaired = enforceProviderCurrency(code, entry);
      localCurrencyRepairs[code] = needsPlanRepair
        ? { ...repaired, plans: clonePlans(defaultEntry!.plans) }
        : repaired;
    }
  }
  if (needsGhanaFullRepair || Object.keys(localCurrencyRepairs).length > 0 || doc.version < COUNTRY_PRICING_MIGRATION_VERSION) {
    const now = new Date().toISOString();
    const nextVersion = Math.max(doc.version || 0, COUNTRY_PRICING_MIGRATION_VERSION);
    const update: Record<string, unknown> = {
      version: nextVersion,
      updatedAt: now,
    };

    if (needsGhanaFullRepair) {
      update["countries.GH"] = DEFAULT_COUNTRIES.GH;
    }
    for (const [code, entry] of Object.entries(localCurrencyRepairs)) {
      if (code !== "GH" || !needsGhanaFullRepair) update[`countries.${code}`] = entry;
    }

    await col.updateOne({ _id: "default" as any }, { $set: update });
    doc = {
      ...doc,
      version: nextVersion,
      updatedAt: now,
      countries: {
        ...doc.countries,
        ...(needsGhanaFullRepair ? { GH: DEFAULT_COUNTRIES.GH } : {}),
        ...Object.fromEntries(
          Object.entries(localCurrencyRepairs).filter(([code]) => code !== "GH" || !needsGhanaFullRepair),
        ),
      },
    };
    console.log(
      `[CountryPricing] Applied migration v${COUNTRY_PRICING_MIGRATION_VERSION}`
      + (needsGhanaFullRepair ? " (repaired Ghana currency to GHS)" : ""),
    );
  }

  _cache = { doc, ts: Date.now() };
  return doc;
}

// ─── Core Resolution ────────────────────────────────────────────────────────

/**
 * Resolve pricing for a given country code.
 *
 * Resolution chain:
 * 1. Country-specific pricing (if exists and enabled)
 * 2. Regional fallback (if configured)
 * 3. Global USD pricing (US fallback)
 *
 * Never returns null — always returns valid pricing.
 */
export async function getCountryPricing(countryCode: string): Promise<ResolvedPricing> {
  const doc = await loadDoc();
  const code = (countryCode || "US").toUpperCase();

  // 1. Direct country match
  const countryEntry = doc.countries[code];
  if (countryEntry?.enabled) {
    return buildResolvedPricing({
      code,
      entry: sanitizeCountryEntry(countryEntry),
      source: "country",
      version: doc.version,
    });
  }

  // A country can use local pricing even before an admin row is created.
  if (!countryEntry && COUNTRY_CURRENCY_META[code]) {
    return buildResolvedPricing({
      code,
      source: "country",
      version: doc.version,
    });
  }

  // 2. Regional fallback
  const regionalTarget = doc.regionalFallbacks[code];
  if (regionalTarget) {
    const regionalEntry = doc.countries[regionalTarget];
    if (regionalEntry?.enabled) {
      return buildResolvedPricing({
        code: regionalTarget,
        entry: sanitizeCountryEntry(regionalEntry),
        source: "regional",
        version: doc.version,
      });
    }
  }

  // 3. Global fallback → US pricing
  const globalEntry = doc.countries["US"];
  const sanitizedGlobalEntry = globalEntry ? sanitizeCountryEntry(globalEntry) : null;
  return buildResolvedPricing({
    code: "US",
    entry: sanitizedGlobalEntry || undefined,
    source: "global",
    version: doc.version,
  });
}

// ─── Currency Formatting ────────────────────────────────────────────────────

/**
 * Format a price with the correct currency symbol and locale formatting.
 * Uses Intl.NumberFormat for proper localization.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale?: string
): string {
  try {
    return new Intl.NumberFormat(locale || "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Fallback for unsupported currencies
    return `${amount} ${currency}`;
  }
}

/**
 * Format a price with the symbol from the country pricing doc.
 * For currencies like NGN (₦) or GHS (GH₵) that Intl may not render perfectly.
 */
export function formatPrice(amount: number, symbol: string): string {
  if (amount === 0) return "Free";
  // Format number with thousand separators
  const formatted = amount.toLocaleString("en-US");
  return `${symbol}${formatted}`;
}

// ─── Admin Operations ───────────────────────────────────────────────────────

/**
 * Get the full country pricing document (admin only).
 */
export async function getFullCountryPricing(): Promise<CountryPricingDoc> {
  const doc = await loadDoc();
  return {
    ...doc,
    countries: Object.fromEntries(
      Object.entries(doc.countries).map(([code, entry]) => [code, sanitizeCountryEntry(entry)])
    ),
  };
}

/**
 * Update a single country's pricing (admin only).
 */
export async function updateCountryPricing(
  countryCode: string,
  updates: Partial<CountryPricingEntry>
): Promise<CountryPricingEntry | null> {
  const doc = await loadDoc();
  const code = countryCode.toUpperCase();

  const existing = doc.countries[code];
  if (!existing) return null;

  const merged = enforceProviderCurrency(code, sanitizeCountryEntry({ ...existing, ...updates }));

  const col = await getCollection();
  await col.updateOne(
    { _id: "default" as any },
    {
      $set: {
        [`countries.${code}`]: merged,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  invalidateCountryPricingCache();
  return merged;
}

/**
 * Add a new country pricing entry (admin only).
 */
export async function addCountryPricing(
  countryCode: string,
  entry: CountryPricingEntry
): Promise<CountryPricingEntry> {
  const col = await getCollection();
  const code = countryCode.toUpperCase();

  const normalizedEntry = enforceProviderCurrency(code, sanitizeCountryEntry(entry));
  await col.updateOne(
    { _id: "default" as any },
    {
      $set: {
        [`countries.${code}`]: normalizedEntry,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  invalidateCountryPricingCache();
  return normalizedEntry;
}

/**
 * Remove a country pricing entry (admin only).
 */
export async function removeCountryPricing(
  countryCode: string
): Promise<boolean> {
  const col = await getCollection();
  const code = countryCode.toUpperCase();

  const result = await col.updateOne(
    { _id: "default" as any },
    {
      $unset: { [`countries.${code}`]: "" },
      $set: { updatedAt: new Date().toISOString() },
    }
  );

  invalidateCountryPricingCache();
  return result.modifiedCount > 0;
}

/**
 * Increment the pricing version (admin only).
 * Existing subscriptions keep their old version.
 * New purchases use the new version.
 */
export async function bumpPricingVersion(): Promise<number> {
  const doc = await loadDoc();
  const newVersion = doc.version + 1;

  const col = await getCollection();
  await col.updateOne(
    { _id: "default" as any },
    {
      $set: {
        version: newVersion,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  invalidateCountryPricingCache();
  return newVersion;
}

/**
 * Get pricing version without loading full doc.
 */
export async function getPricingVersion(): Promise<number> {
  const doc = await loadDoc();
  return doc.version;
}
