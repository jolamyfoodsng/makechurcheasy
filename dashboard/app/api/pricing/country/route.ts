import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3004";

interface AfricanCountryPricing {
  name: string;
  currency: string;
  symbol: string;
  basic: number;
  growth: number;
  pro: number;
}

const AFRICAN_COUNTRY_DATA: Record<string, AfricanCountryPricing> = {
  NG: { name: "Nigeria", currency: "NGN", symbol: "₦", basic: 2700, growth: 5500, pro: 12000 },
  GH: { name: "Ghana", currency: "GHS", symbol: "GH₵", basic: 60, growth: 120, pro: 230 },
  KE: { name: "Kenya", currency: "KES", symbol: "KSh", basic: 500, growth: 1000, pro: 1900 },
  ZA: { name: "South Africa", currency: "ZAR", symbol: "R", basic: 70, growth: 140, pro: 260 },
  UG: { name: "Uganda", currency: "UGX", symbol: "UGX", basic: 15000, growth: 30000, pro: 56000 },
  TZ: { name: "Tanzania", currency: "TZS", symbol: "TSh", basic: 12000, growth: 24000, pro: 45000 },
  RW: { name: "Rwanda", currency: "RWF", symbol: "FRw", basic: 6000, growth: 12000, pro: 22500 },
  ZM: { name: "Zambia", currency: "ZMW", symbol: "ZK", basic: 130, growth: 260, pro: 490 },
  CM: { name: "Cameroon", currency: "XAF", symbol: "FCFA", basic: 3000, growth: 6000, pro: 11000 },
  CI: { name: "Côte d'Ivoire", currency: "XOF", symbol: "CFA", basic: 3000, growth: 6000, pro: 11000 },
  SN: { name: "Senegal", currency: "XOF", symbol: "CFA", basic: 3000, growth: 6000, pro: 11000 },
  BJ: { name: "Benin", currency: "XOF", symbol: "CFA", basic: 3000, growth: 6000, pro: 11000 },
  BF: { name: "Burkina Faso", currency: "XOF", symbol: "CFA", basic: 3000, growth: 6000, pro: 11000 },
  ML: { name: "Mali", currency: "XOF", symbol: "CFA", basic: 3000, growth: 6000, pro: 11000 },
  TG: { name: "Togo", currency: "XOF", symbol: "CFA", basic: 3000, growth: 6000, pro: 11000 },
  NE: { name: "Niger", currency: "XOF", symbol: "CFA", basic: 3000, growth: 6000, pro: 11000 },
  GA: { name: "Gabon", currency: "XAF", symbol: "FCFA", basic: 3000, growth: 6000, pro: 11000 },
  CG: { name: "Republic of the Congo", currency: "XAF", symbol: "FCFA", basic: 3000, growth: 6000, pro: 11000 },
  CD: { name: "Democratic Republic of the Congo", currency: "CDF", symbol: "FC", basic: 8500, growth: 17000, pro: 32000 },
  TD: { name: "Chad", currency: "XAF", symbol: "FCFA", basic: 3000, growth: 6000, pro: 11000 },
  CF: { name: "Central African Republic", currency: "XAF", symbol: "FCFA", basic: 3000, growth: 6000, pro: 11000 },
  GQ: { name: "Equatorial Guinea", currency: "XAF", symbol: "FCFA", basic: 3000, growth: 6000, pro: 11000 },
  GW: { name: "Guinea-Bissau", currency: "XOF", symbol: "CFA", basic: 3000, growth: 6000, pro: 11000 },
  EG: { name: "Egypt", currency: "EGP", symbol: "E£", basic: 240, growth: 480, pro: 900 },
  ET: { name: "Ethiopia", currency: "ETB", symbol: "Br", basic: 600, growth: 1200, pro: 2250 },
  MW: { name: "Malawi", currency: "MWK", symbol: "MK", basic: 8500, growth: 17000, pro: 32000 },
  SL: { name: "Sierra Leone", currency: "SLL", symbol: "Le", basic: 110000, growth: 220000, pro: 410000 },
  LR: { name: "Liberia", currency: "LRD", symbol: "L$", basic: 600, growth: 1200, pro: 2250 },
  GM: { name: "The Gambia", currency: "GMD", symbol: "D", basic: 200, growth: 400, pro: 750 },
  BW: { name: "Botswana", currency: "BWP", symbol: "P", basic: 40, growth: 80, pro: 150 },
  NA: { name: "Namibia", currency: "NAD", symbol: "N$", basic: 70, growth: 140, pro: 260 },
  ZW: { name: "Zimbabwe", currency: "ZWG", symbol: "Z$", basic: 80, growth: 160, pro: 300 },
  MU: { name: "Mauritius", currency: "MUR", symbol: "Rs", basic: 140, growth: 280, pro: 525 },
  MZ: { name: "Mozambique", currency: "MZN", symbol: "MT", basic: 200, growth: 400, pro: 750 },
  AO: { name: "Angola", currency: "AOA", symbol: "Kz", basic: 2700, growth: 5400, pro: 10000 },
  MG: { name: "Madagascar", currency: "MGA", symbol: "Ar", basic: 14000, growth: 28000, pro: 52500 },
  MA: { name: "Morocco", currency: "MAD", symbol: "د.م.", basic: 30, growth: 60, pro: 110 },
  DZ: { name: "Algeria", currency: "DZD", symbol: "دج", basic: 400, growth: 800, pro: 1500 },
  TN: { name: "Tunisia", currency: "TND", symbol: "د.ت", basic: 10, growth: 20, pro: 38 },
  LY: { name: "Libya", currency: "LYD", symbol: "ل.د", basic: 15, growth: 30, pro: 56 },
  SD: { name: "Sudan", currency: "SDG", symbol: "ج.س.", basic: 1800, growth: 3600, pro: 6750 },
  SS: { name: "South Sudan", currency: "SSP", symbol: "£", basic: 4000, growth: 8000, pro: 15000 },
  BI: { name: "Burundi", currency: "BIF", symbol: "FBu", basic: 9000, growth: 18000, pro: 33500 },
  SO: { name: "Somalia", currency: "SOS", symbol: "Sh", basic: 1700, growth: 3400, pro: 6400 },
  DJ: { name: "Djibouti", currency: "DJF", symbol: "Fdj", basic: 530, growth: 1060, pro: 2000 },
  ER: { name: "Eritrea", currency: "ERN", symbol: "Nfk", basic: 45, growth: 90, pro: 170 },
  SZ: { name: "Eswatini", currency: "SZL", symbol: "E", basic: 70, growth: 140, pro: 260 },
  LS: { name: "Lesotho", currency: "LSL", symbol: "L", basic: 70, growth: 140, pro: 260 },
  GN: { name: "Guinea", currency: "GNF", symbol: "FG", basic: 26000, growth: 52000, pro: 97500 },
  CV: { name: "Cape Verde", currency: "CVE", symbol: "$", basic: 300, growth: 600, pro: 1100 },
  ST: { name: "São Tomé and Príncipe", currency: "STN", symbol: "Db", basic: 70, growth: 140, pro: 260 },
  SC: { name: "Seychelles", currency: "SCR", symbol: "Rs", basic: 45, growth: 90, pro: 170 },
  KM: { name: "Comoros", currency: "KMF", symbol: "CF", basic: 1400, growth: 2800, pro: 5250 },
  MR: { name: "Mauritania", currency: "MRU", symbol: "UM", basic: 120, growth: 240, pro: 450 },
};

function getRequestCountry(req: NextRequest): string | null {
  const queryCountry = req.nextUrl.searchParams.get("country");
  if (queryCountry && /^[A-Z]{2}$/i.test(queryCountry.trim())) {
    return queryCountry.trim().toUpperCase();
  }

  const rawCountry =
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-mce-geo-country") ||
    req.headers.get("x-vercel-ip-country") ||
    (req as any).geo?.country ||
    "";
  const normalized = rawCountry.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) && normalized !== "XX" && normalized !== "T1" ? normalized : null;
}

function resolveFallbackPricing(countryCode: string | null, regionParam?: string | null) {
  const code = (countryCode || "NG").toUpperCase();

  // If a region override is passed
  if (regionParam === "nigeria" || (!regionParam && code === "NG")) {
    return {
      countryCode: "NG",
      countryName: "Nigeria",
      currency: "NGN",
      currencySymbol: "₦",
      region: "nigeria" as const,
      isAfrican: true,
      plans: {
        free: { monthly: 0, yearly: 0 },
        basic: { monthly: 2700, yearly: 27540 },
        growth: { monthly: 5500, yearly: 56100 },
        pro: { monthly: 12000, yearly: 122400 },
      },
      pricingVersion: 14,
      source: "fallback",
    };
  }

  if (regionParam === "global" || (!regionParam && !AFRICAN_COUNTRY_DATA[code])) {
    return {
      countryCode: code,
      countryName: code === "US" ? "United States" : code === "GB" ? "United Kingdom" : "Global",
      currency: "USD",
      currencySymbol: "$",
      region: "global" as const,
      isAfrican: false,
      plans: {
        free: { monthly: 0, yearly: 0 },
        basic: { monthly: 7, yearly: 71.4 },
        growth: { monthly: 12, yearly: 122.4 },
        pro: { monthly: 20, yearly: 204 },
      },
      pricingVersion: 14,
      source: "fallback",
    };
  }

  // African country
  const africanData = AFRICAN_COUNTRY_DATA[code] || {
    name: "Africa",
    currency: "USD",
    symbol: "$",
    basic: 4,
    growth: 8,
    pro: 15,
  };

  return {
    countryCode: code,
    countryName: africanData.name,
    currency: africanData.currency,
    currencySymbol: africanData.symbol,
    region: "africa" as const,
    isAfrican: true,
    plans: {
      free: { monthly: 0, yearly: 0 },
      basic: { monthly: africanData.basic, yearly: africanData.currency === "USD" ? 30 : Math.round(africanData.basic * 7.5) },
      growth: { monthly: africanData.growth, yearly: africanData.currency === "USD" ? 61.2 : Math.round(africanData.growth * 7.65) },
      pro: { monthly: africanData.pro, yearly: africanData.currency === "USD" ? 122 : Math.round(africanData.pro * 8.13) },
    },
    pricingVersion: 14,
    source: "fallback",
  };
}

export async function GET(req: NextRequest) {
  const country = getRequestCountry(req);
  const regionParam = req.nextUrl.searchParams.get("region");

  try {
    const upstreamUrl = new URL("/api/pricing/country", API_BASE);
    upstreamUrl.search = req.nextUrl.search;

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    const cookie = req.headers.get("cookie");
    if (cookie) headers.Cookie = cookie;

    if (country) headers["X-MCE-Geo-Country"] = country;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const upstream = await fetch(upstreamUrl, {
      headers,
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (upstream.ok) {
      const data = await upstream.json();
      // Ensure Free and Pro exist in plans for frontend components
      if (data?.plans) {
        if (!data.plans.free) {
          data.plans.free = { monthly: 0, yearly: 0 };
        }
        if (!data.plans.pro) {
          if (data.region === "nigeria" || data.currency === "NGN") {
            data.plans.pro = { monthly: 12000, yearly: 122400 };
          } else if (data.region === "africa") {
            data.plans.pro = { monthly: 15, yearly: 153 };
          } else {
            data.plans.pro = { monthly: 20, yearly: 204 };
          }
        }
      }
      return NextResponse.json(data, {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
          Vary: "Cookie, CF-IPCountry, X-MCE-Geo-Country",
        },
      });
    }
  } catch {
    // Upstream unavailable or timed out — resolve locally
  }

  // Graceful local resolution: never return 500
  const fallback = resolveFallbackPricing(country, regionParam);
  return NextResponse.json(fallback, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      Vary: "Cookie, CF-IPCountry, X-MCE-Geo-Country",
    },
  });
}
