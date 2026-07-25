export const CANONICAL_PLAN_IDS = ["free", "basic", "growth", "pro"] as const;

export type CanonicalPlanId = (typeof CANONICAL_PLAN_IDS)[number];
export type PricingRegion = "NG" | "AFRICA" | "ROW";

export interface CanonicalPlanEntitlements {
  credits: number;
  maxSongs: number;
  maxImages: number;
  maxVideos: number;
  maxBibleVersions: number;
  maxTeams: number;
  maxDevices: number;
  tickers: boolean;
  multiview: boolean;
  remoteControl: boolean;
  mobileSupport: boolean;
  presentationMode: boolean;
  bulkImport: boolean;
  easyWorshipImport: boolean;
  propresenterImport: boolean;
  cloudSync: boolean;
  lowerThirds: boolean;
  prioritySupport?: boolean;
  priorityFeatureRequests?: boolean;
  earlyAccessFeatures?: boolean;
}

export interface EffectivePlanUserLike {
  plan?: string | null;
  role?: string | null;
  trial?: {
    active?: boolean;
    status?: string | null;
    endsAt?: string | null;
  } | null;
  ambassador?: {
    active?: boolean;
  } | null;
  adminTemporaryPlan?: {
    active?: boolean;
    expiresAt?: string | null;
  } | null;
  adminManagedSubscription?: {
    active?: boolean;
    expiresAt?: string | null;
  } | null;
  subscriptionExpiresAt?: string | null;
}

export interface PlanPrice {
  monthly: number;
  yearly: number;
  introductoryMonthly?: number;
}

export interface RegionPricingProfile {
  currency: "NGN" | "USD";
  currencySymbol: string;
  plans: Record<Exclude<CanonicalPlanId, "free">, PlanPrice>;
}

export interface LegacyCompatibleEntitlements {
  songs: number;
  images: number;
  videos: number;
  themes: number;
  lowerThirds: number;
  devices: number;
  bibleVersions: number;
  multiviewTemplates: number;
  tickerThemes: number;
  themePresets: number;
  cloudStorageGB: number;
  multiview: boolean;
  tickers: boolean;
  massImport: boolean;
  easyWorshipImport: boolean;
  proPresenterImport: boolean;
  translation: boolean;
  speechToScripture: boolean;
  sermonExport: boolean;
  aiFeatures: boolean;
  cloudSync: boolean;
  advancedAnalytics: boolean;
  customReports: boolean;
  mobileControl: boolean;
  presentationMode: boolean;
  apiAccess: boolean;
  teamManagement: boolean;
  campusManagement: boolean;
  slideshow: boolean;
  countdowns: boolean;
}

export interface LegacyCompatiblePlanTierConfig {
  label: string;
  pricing: {
    NGN: { monthly: number; yearly: number };
    USD: { monthly: number; yearly: number };
  };
  paystack: {
    monthlyPlanCode: string;
    yearlyPlanCode: string;
  };
  credits: number;
  entitlements: LegacyCompatibleEntitlements;
}

export interface LegacyCompatiblePlanConfig {
  version: number;
  plans: Record<string, LegacyCompatiblePlanTierConfig>;
  creditCosts: Array<{
    name: string;
    cost: number;
    unit: string;
    description: string;
  }>;
  translationWordsPerCredit: number;
  trial: {
    durationDays: number;
    enabled: boolean;
  };
  pricingPlans: Array<{
    id: string;
    name: string;
    target: string;
    iconName: string;
    styles: {
      iconBg: string;
      iconColor: string;
      border: string;
      button: string;
      buttonHover: string;
      popular?: boolean;
      popularBadgeBg?: string;
      checkColor: string;
    };
    pricing: {
      NGN: {
        monthly: string;
        originalMonthly?: string;
        yearly: string;
        originalYearly?: string;
      };
      USD: {
        monthly: string;
        originalMonthly?: string;
        yearly: string;
        originalYearly?: string;
      };
    };
    features: Array<{ text: string; prefixHighlight?: string }>;
    buttonText: string;
    paystackPlanCode?: string;
    paystackAmount?: {
      NGN: number;
      USD: number;
    };
  }>;
  featureBanners: Array<{
    id: string;
    title: string;
    description: string;
    iconName: string;
    bg: string;
    color: string;
  }>;
  updatedAt: string;
}

export type LegacyCompatibleFeatureKey = keyof LegacyCompatibleEntitlements;
export type CanonicalBooleanEntitlementKey = {
  [K in keyof CanonicalPlanEntitlements]: CanonicalPlanEntitlements[K] extends boolean | undefined ? K : never;
}[keyof CanonicalPlanEntitlements];
export type CanonicalLimitEntitlementKey = {
  [K in keyof CanonicalPlanEntitlements]: CanonicalPlanEntitlements[K] extends number ? K : never;
}[keyof CanonicalPlanEntitlements];

export const PLAN_ENTITLEMENTS: Record<CanonicalPlanId, CanonicalPlanEntitlements> = {
  free: {
    credits: 50,
    maxSongs: 3,
    maxImages: 3,
    maxVideos: 2,
    maxBibleVersions: 3,
    maxTeams: 3,
    maxDevices: 1,
    tickers: false,
    multiview: false,
    remoteControl: false,
    mobileSupport: false,
    presentationMode: false,
    bulkImport: false,
    easyWorshipImport: false,
    propresenterImport: false,
    cloudSync: false,
    lowerThirds: false,
  },
  basic: {
    credits: 300,
    maxSongs: 50,
    maxImages: 50,
    maxVideos: 50,
    maxBibleVersions: 10,
    maxTeams: 5,
    maxDevices: 3,
    tickers: true,
    multiview: true,
    remoteControl: false,
    mobileSupport: false,
    presentationMode: false,
    bulkImport: false,
    easyWorshipImport: false,
    propresenterImport: false,
    cloudSync: false,
    lowerThirds: true,
  },
  growth: {
    credits: 1000,
    maxSongs: -1,
    maxImages: -1,
    maxVideos: -1,
    maxBibleVersions: -1,
    maxTeams: 20,
    maxDevices: 10,
    tickers: true,
    multiview: true,
    remoteControl: true,
    mobileSupport: true,
    presentationMode: true,
    bulkImport: true,
    easyWorshipImport: true,
    propresenterImport: true,
    cloudSync: true,
    lowerThirds: true,
  },
  pro: {
    credits: 3000,
    maxSongs: -1,
    maxImages: -1,
    maxVideos: -1,
    maxBibleVersions: -1,
    maxTeams: 20,
    maxDevices: 10,
    tickers: true,
    multiview: true,
    remoteControl: true,
    mobileSupport: true,
    presentationMode: true,
    bulkImport: true,
    easyWorshipImport: true,
    propresenterImport: true,
    cloudSync: true,
    lowerThirds: true,
    prioritySupport: true,
    priorityFeatureRequests: true,
    earlyAccessFeatures: true,
  },
};

export const REGION_PRICING: Record<PricingRegion, RegionPricingProfile> = {
  NG: {
    currency: "NGN",
    currencySymbol: "₦",
    plans: {
      basic: { introductoryMonthly: 3500, monthly: 4000, yearly: 40000 },
      growth: { introductoryMonthly: 7500, monthly: 8500, yearly: 85000 },
      pro: { monthly: 12000, yearly: 120000 },
    },
  },
  AFRICA: {
    currency: "USD",
    currencySymbol: "$",
    plans: {
      basic: { monthly: 4, yearly: 40 },
      growth: { monthly: 10, yearly: 100 },
      pro: { monthly: 20, yearly: 200 },
    },
  },
  ROW: {
    currency: "USD",
    currencySymbol: "$",
    plans: {
      basic: { monthly: 6, yearly: 60 },
      growth: { monthly: 15, yearly: 150 },
      pro: { monthly: 30, yearly: 300 },
    },
  },
};

const LEGACY_PLAN_ALIASES: Record<string, CanonicalPlanId> = {
  starter: "growth",
  trial: "growth",
  ambassador: "pro",
  unlimited: "pro",
  admin: "pro",
};

const AFRICAN_COUNTRIES = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CG",
  "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN",
  "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "YT", "MA",
  "MZ", "NA", "NE", "NG", "RE", "RW", "SH", "ST", "SN", "SC", "SL", "SO",
  "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "EH", "ZM", "ZW",
]);

function normalizeBooleanFlag(value: unknown): boolean {
  return value === true;
}

function isExpiredAdminTemporaryPlan(
  user: EffectivePlanUserLike | null | undefined,
  nowMs: number,
): boolean {
  const temp = user?.adminTemporaryPlan;
  if (!normalizeBooleanFlag(temp?.active)) return false;
  if (!temp?.expiresAt) return false;
  const expiresAtMs = new Date(temp.expiresAt).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

function isExpiredAdminManagedSubscription(
  user: EffectivePlanUserLike | null | undefined,
  nowMs: number,
): boolean {
  const managed = user?.adminManagedSubscription;
  const expiresAt = managed?.expiresAt || user?.subscriptionExpiresAt;
  if (!normalizeBooleanFlag(managed?.active)) return false;
  if (!expiresAt) return false;
  const expiresAtMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

export function normalizePlanId(plan?: string | null): CanonicalPlanId {
  const normalized = String(plan || "free").trim().toLowerCase();
  if ((CANONICAL_PLAN_IDS as readonly string[]).includes(normalized)) {
    return normalized as CanonicalPlanId;
  }
  return LEGACY_PLAN_ALIASES[normalized] || "free";
}

export function isActiveTrial(
  user: EffectivePlanUserLike | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const trial = user?.trial;
  if (!trial?.endsAt) return false;

  const endsAtMs = new Date(trial.endsAt).getTime();
  if (!Number.isFinite(endsAtMs) || endsAtMs <= nowMs) return false;

  if (trial.status) {
    return String(trial.status).toLowerCase() === "active";
  }

  return normalizeBooleanFlag(trial.active);
}

export function getEffectivePlan(
  user: EffectivePlanUserLike | null | undefined,
  nowMs: number = Date.now(),
): CanonicalPlanId {
  if (!user) return "free";
  if (String(user.role || "").toLowerCase() === "admin") return "pro";
  if (isExpiredAdminTemporaryPlan(user, nowMs)) return "free";
  if (isExpiredAdminManagedSubscription(user, nowMs)) return "free";
  if (normalizeBooleanFlag(user.ambassador?.active)) return "pro";
  if (isActiveTrial(user, nowMs)) return "growth";
  return normalizePlanId(user.plan);
}

export function getCanonicalEntitlementsForUser(
  user: EffectivePlanUserLike | null | undefined,
  nowMs: number = Date.now(),
): CanonicalPlanEntitlements {
  return PLAN_ENTITLEMENTS[getEffectivePlan(user, nowMs)];
}

export function isUnlimitedLimit(value: number): boolean {
  return value === -1;
}

export function getPricingRegion(countryCode?: string | null): PricingRegion {
  const code = String(countryCode || "NG").trim().toUpperCase();
  if (code === "NG") return "NG";
  if (AFRICAN_COUNTRIES.has(code)) return "AFRICA";
  return "ROW";
}

export function resolveRegionPricing(countryCode?: string | null): {
  countryCode: string;
  region: PricingRegion;
  currency: "NGN" | "USD";
  currencySymbol: string;
  plans: RegionPricingProfile["plans"];
  pricingVersion: number;
} {
  const normalizedCountryCode = String(countryCode || "NG").trim().toUpperCase() || "NG";
  const region = getPricingRegion(normalizedCountryCode);
  const profile = REGION_PRICING[region];

  return {
    countryCode: normalizedCountryCode,
    region,
    currency: profile.currency,
    currencySymbol: profile.currencySymbol,
    plans: profile.plans,
    pricingVersion: 2,
  };
}

function formatPrice(amount: number, symbol: string): string {
  return `${symbol}${amount.toLocaleString("en-US")}`;
}

export function toLegacyCompatibleEntitlements(
  planId: CanonicalPlanId,
  entitlements: CanonicalPlanEntitlements,
): LegacyCompatibleEntitlements {
  const isGrowthOrHigher = planId === "growth" || planId === "pro";
  const isPro = planId === "pro";

  return {
    songs: entitlements.maxSongs,
    images: entitlements.maxImages,
    videos: entitlements.maxVideos,
    themes: planId === "free" ? 2 : isGrowthOrHigher ? -1 : 10,
    lowerThirds: entitlements.lowerThirds ? -1 : 0,
    devices: entitlements.maxDevices,
    bibleVersions: entitlements.maxBibleVersions,
    multiviewTemplates: entitlements.multiview ? -1 : 0,
    tickerThemes: entitlements.tickers ? -1 : 0,
    themePresets: entitlements.lowerThirds ? -1 : 0,
    cloudStorageGB: entitlements.cloudSync ? (isPro ? 200 : 20) : 0,
    multiview: entitlements.multiview,
    tickers: entitlements.tickers,
    massImport: entitlements.bulkImport,
    easyWorshipImport: entitlements.easyWorshipImport,
    proPresenterImport: entitlements.propresenterImport,
    translation: isGrowthOrHigher,
    speechToScripture: isGrowthOrHigher,
    sermonExport: isGrowthOrHigher,
    aiFeatures: isGrowthOrHigher,
    cloudSync: entitlements.cloudSync,
    advancedAnalytics: isPro,
    customReports: isPro,
    mobileControl: entitlements.mobileSupport || entitlements.remoteControl,
    presentationMode: entitlements.presentationMode,
    apiAccess: isPro,
    teamManagement: entitlements.maxTeams > 0,
    campusManagement: isPro,
    slideshow: true,
    countdowns: planId !== "free",
  };
}

export function getLegacyCompatibleEntitlementsForPlan(
  planId: CanonicalPlanId,
): LegacyCompatibleEntitlements {
  return toLegacyCompatibleEntitlements(planId, PLAN_ENTITLEMENTS[planId]);
}

export function getLegacyCompatibleEntitlementsForUser(
  user: EffectivePlanUserLike | null | undefined,
  nowMs: number = Date.now(),
): LegacyCompatibleEntitlements {
  return getLegacyCompatibleEntitlementsForPlan(getEffectivePlan(user, nowMs));
}

export function getLegacyFeatureValue(
  planId: CanonicalPlanId,
  feature: LegacyCompatibleFeatureKey,
): LegacyCompatibleEntitlements[LegacyCompatibleFeatureKey] {
  return getLegacyCompatibleEntitlementsForPlan(planId)[feature];
}

export function findRequiredPlanForLegacyFeature(
  feature: LegacyCompatibleFeatureKey,
): CanonicalPlanId {
  const freeValue = getLegacyFeatureValue("free", feature);
  if (typeof freeValue === "boolean") {
    for (const planId of CANONICAL_PLAN_IDS) {
      if (getLegacyFeatureValue(planId, feature) === true) {
        return planId;
      }
    }
    return "pro";
  }

  for (const planId of CANONICAL_PLAN_IDS.slice(1)) {
    const value = getLegacyFeatureValue(planId, feature);
    if (typeof value === "number" && (value === -1 || value > freeValue)) {
      return planId;
    }
  }

  return freeValue !== 0 ? "free" : "pro";
}

export function findRequiredPlanForCanonicalFeature(
  feature: CanonicalBooleanEntitlementKey | CanonicalLimitEntitlementKey,
): CanonicalPlanId {
  const featureKey = feature as keyof CanonicalPlanEntitlements;
  const freeValue = PLAN_ENTITLEMENTS.free[featureKey] ?? 0;

  if (typeof freeValue === "boolean") {
    for (const planId of CANONICAL_PLAN_IDS) {
      if (PLAN_ENTITLEMENTS[planId][featureKey] === true) {
        return planId;
      }
    }
    return "pro";
  }

  for (const planId of CANONICAL_PLAN_IDS.slice(1)) {
    const value = PLAN_ENTITLEMENTS[planId][featureKey];
    if (typeof value === "number" && (value === -1 || value > freeValue)) {
      return planId;
    }
  }

  return freeValue !== 0 ? "free" : "pro";
}

function buildTierConfig(
  planId: CanonicalPlanId,
  label: string,
  paystackCodes: { monthlyPlanCode: string; yearlyPlanCode: string },
): LegacyCompatiblePlanTierConfig {
  const zeroPricing = { monthly: 0, yearly: 0 };
  const canonicalEntitlements = PLAN_ENTITLEMENTS[planId];

  if (planId === "free") {
    return {
      label,
      pricing: { NGN: zeroPricing, USD: zeroPricing },
      paystack: paystackCodes,
      credits: canonicalEntitlements.credits,
      entitlements: toLegacyCompatibleEntitlements(planId, canonicalEntitlements),
    };
  }

  const ngPricing = REGION_PRICING.NG.plans[planId];
  const usdPricing = REGION_PRICING.ROW.plans[planId];

  return {
    label,
    pricing: {
      NGN: { monthly: ngPricing.monthly, yearly: ngPricing.yearly },
      USD: { monthly: usdPricing.monthly, yearly: usdPricing.yearly },
    },
    paystack: paystackCodes,
    credits: canonicalEntitlements.credits,
    entitlements: toLegacyCompatibleEntitlements(planId, canonicalEntitlements),
  };
}

export function buildLegacyCompatiblePlanConfig(options?: {
  updatedAt?: string;
  trialDurationDays?: number;
  trialEnabled?: boolean;
}): LegacyCompatiblePlanConfig {
  const updatedAt = options?.updatedAt || new Date().toISOString();
  const trialDurationDays = options?.trialDurationDays ?? 20;
  const trialEnabled = options?.trialEnabled ?? true;

  const freeTier = buildTierConfig("free", "Free", { monthlyPlanCode: "", yearlyPlanCode: "" });
  const basicTier = buildTierConfig("basic", "Basic", {
    monthlyPlanCode: "mce_basic_monthly",
    yearlyPlanCode: "mce_basic_yearly",
  });
  const growthTier = buildTierConfig("growth", "Growth", {
    monthlyPlanCode: "mce_growth_monthly",
    yearlyPlanCode: "mce_growth_yearly",
  });
  const proTier = buildTierConfig("pro", "Pro", {
    monthlyPlanCode: "mce_pro_monthly",
    yearlyPlanCode: "mce_pro_yearly",
  });

  return {
    version: 5,
    plans: {
      free: freeTier,
      trial: {
        ...growthTier,
        label: "Growth Trial",
        pricing: {
          NGN: { monthly: 0, yearly: 0 },
          USD: { monthly: 0, yearly: 0 },
        },
        paystack: { monthlyPlanCode: "", yearlyPlanCode: "" },
      },
      basic: basicTier,
      growth: growthTier,
      pro: proTier,
      ambassador: {
        ...proTier,
        label: "Ambassador",
      },
      unlimited: {
        ...proTier,
        label: "Unlimited",
        credits: -1,
      },
    },
    creditCosts: [
      {
        name: "Speech-to-Scripture",
        cost: 1,
        unit: "per minute",
        description: "Automatically transcribe live audio and detect scripture references.",
      },
      {
        name: "Live Translation",
        cost: 2,
        unit: "per minute",
        description: "Translate live speech into another language.",
      },
      {
        name: "AI Summary",
        cost: 5,
        unit: "flat",
        description: "Generate a sermon summary.",
      },
    ],
    translationWordsPerCredit: 150,
    trial: {
      durationDays: trialDurationDays,
      enabled: trialEnabled,
    },
    pricingPlans: [
      {
        id: "basic",
        name: "Basic",
        target: "For small and medium churches",
        iconName: "leaf",
        styles: {
          iconBg: "bg-emerald-50",
          iconColor: "text-emerald-600",
          border: "border-emerald-200",
          button: "bg-emerald-600 text-white",
          buttonHover: "hover:bg-emerald-700",
          checkColor: "text-emerald-600",
        },
        pricing: {
          NGN: {
            monthly: formatPrice(REGION_PRICING.NG.plans.basic.introductoryMonthly || REGION_PRICING.NG.plans.basic.monthly, "₦"),
            originalMonthly: formatPrice(REGION_PRICING.NG.plans.basic.monthly, "₦"),
            yearly: formatPrice(REGION_PRICING.NG.plans.basic.yearly, "₦"),
          },
          USD: {
            monthly: formatPrice(REGION_PRICING.ROW.plans.basic.monthly, "$"),
            yearly: formatPrice(REGION_PRICING.ROW.plans.basic.yearly, "$"),
          },
        },
        features: [
          { text: "50 songs, 50 images, and 50 videos" },
          { text: "10 Bible versions and 3 devices" },
          { text: "Up to 5 team members" },
          { text: "Tickers, Lower Thirds, and Multiview" },
          { text: "300 credits every month" },
        ],
        buttonText: "Get Basic",
        paystackPlanCode: "mce_basic_monthly",
        paystackAmount: { NGN: REGION_PRICING.NG.plans.basic.monthly * 100, USD: REGION_PRICING.ROW.plans.basic.monthly * 100 },
      },
      {
        id: "growth",
        name: "Growth",
        target: "For growing churches and media departments",
        iconName: "chart",
        styles: {
          iconBg: "bg-blue-50",
          iconColor: "text-blue-600",
          border: "border-blue-300 border-2",
          button: "bg-blue-600 text-white",
          buttonHover: "hover:bg-blue-700",
          popular: true,
          popularBadgeBg: "bg-blue-600",
          checkColor: "text-blue-600",
        },
        pricing: {
          NGN: {
            monthly: formatPrice(REGION_PRICING.NG.plans.growth.introductoryMonthly || REGION_PRICING.NG.plans.growth.monthly, "₦"),
            originalMonthly: formatPrice(REGION_PRICING.NG.plans.growth.monthly, "₦"),
            yearly: formatPrice(REGION_PRICING.NG.plans.growth.yearly, "₦"),
          },
          USD: {
            monthly: formatPrice(REGION_PRICING.ROW.plans.growth.monthly, "$"),
            yearly: formatPrice(REGION_PRICING.ROW.plans.growth.yearly, "$"),
          },
        },
        features: [
          { text: "Unlimited songs, images, videos, and Bible versions" },
          { text: "10 devices and 20 team members" },
          { text: "Mobile Controller and Remote OBS Control" },
          { text: "Bulk import, EasyWorship, and ProPresenter" },
          { text: "Cloud Sync and 1,000 monthly credits" },
        ],
        buttonText: "Get Growth",
        paystackPlanCode: "mce_growth_monthly",
        paystackAmount: { NGN: REGION_PRICING.NG.plans.growth.monthly * 100, USD: REGION_PRICING.ROW.plans.growth.monthly * 100 },
      },
      {
        id: "pro",
        name: "Pro",
        target: "For advanced church production teams",
        iconName: "crown",
        styles: {
          iconBg: "bg-amber-50",
          iconColor: "text-amber-600",
          border: "border-amber-200",
          button: "bg-amber-600 text-white",
          buttonHover: "hover:bg-amber-700",
          checkColor: "text-amber-600",
        },
        pricing: {
          NGN: {
            monthly: formatPrice(REGION_PRICING.NG.plans.pro.monthly, "₦"),
            yearly: formatPrice(REGION_PRICING.NG.plans.pro.yearly, "₦"),
          },
          USD: {
            monthly: formatPrice(REGION_PRICING.ROW.plans.pro.monthly, "$"),
            yearly: formatPrice(REGION_PRICING.ROW.plans.pro.yearly, "$"),
          },
        },
        features: [
          { text: "Everything in Growth" },
          { text: "3,000 credits every month" },
          { text: "Priority Support" },
          { text: "Priority Feature Requests" },
          { text: "Early Access Features" },
        ],
        buttonText: "Get Pro",
        paystackPlanCode: "mce_pro_monthly",
        paystackAmount: { NGN: REGION_PRICING.NG.plans.pro.monthly * 100, USD: REGION_PRICING.ROW.plans.pro.monthly * 100 },
      },
    ],
    featureBanners: [
      {
        id: "control",
        title: "Control Every Screen",
        description: "Run worship, Bible, lower thirds, and multiview from one entitlement engine.",
        iconName: "monitor",
        bg: "bg-blue-50",
        color: "text-blue-600",
      },
      {
        id: "sync",
        title: "Stay In Sync",
        description: "Cloud Sync and remote control unlock only when the effective plan allows them.",
        iconName: "smartphone",
        bg: "bg-emerald-50",
        color: "text-emerald-600",
      },
      {
        id: "import",
        title: "Import Faster",
        description: "Bulk import and presentation migration tools are gated centrally instead of in the UI.",
        iconName: "clock",
        bg: "bg-amber-50",
        color: "text-amber-600",
      },
    ],
    updatedAt,
  };
}
