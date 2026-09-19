import type { ResolvedPricing } from "@/types/countryPricing";
import type { PlanConfig, PlanConfigSpecialOffer } from "@/types/schemas";

type OfferPlan = PlanConfigSpecialOffer["plan"];
type OfferBillingCycle = PlanConfigSpecialOffer["billingCycle"];

export type OfferUser = {
  _id?: unknown;
  email?: string | null;
  plan?: string | null;
  createdAt?: string | Date | null;
  signupDate?: string | Date | null;
  subscriptionExpiresAt?: string | null;
  trial?: {
    active?: boolean;
    status?: string | null;
    endsAt?: string | null;
  } | null;
};

export interface ResolvedSpecialOffer {
  id: string;
  enabled: boolean;
  name: string;
  description: string;
  badgeText: string;
  ctaText: string;
  kind: PlanConfigSpecialOffer["kind"];
  plan: OfferPlan;
  billingCycle: OfferBillingCycle;
  purchaseKind: "subscription" | "one_time";
  price: number;
  originalPrice: number;
  discountPercent: number | null;
  discountDurationMonths: number | null;
  discountAmount: number;
  currency: string;
  currencySymbol: string;
  startsAt: string | null;
  endsAt: string | null;
  accountAgeDays: number | null;
  eligibility: NonNullable<PlanConfigSpecialOffer["eligibility"]>;
}

export interface SpecialOfferEligibilityResult {
  offer: ResolvedSpecialOffer;
  eligible: boolean;
  reasons: string[];
}

const DEFAULT_OFFER_ELIGIBILITY: NonNullable<PlanConfigSpecialOffer["eligibility"]> = {
  minAccountAgeDays: null,
  maxAccountAgeDays: null,
  allowedPlans: [],
  eligibleUserIds: [],
  eligibleEmails: [],
  includeTrialUsers: true,
  excludeActivePaidUsers: false,
};

export function defaultSpecialOffers(now = new Date().toISOString()): PlanConfigSpecialOffer[] {
  return [
    {
      id: "growth-one-time-returning",
      enabled: false,
      name: "One-time Growth Access",
      description: "A one-time Growth purchase for eligible returning churches.",
      badgeText: "One-time offer",
      ctaText: "Buy Once",
      kind: "one_time",
      plan: "growth",
      billingCycle: "lifetime",
      price: { NGN: 50000, USD: 99 },
      discountPercent: null,
      discountDurationMonths: null,
      startsAt: null,
      endsAt: null,
      eligibility: {
        minAccountAgeDays: 90,
        maxAccountAgeDays: null,
        allowedPlans: ["free", "basic", "trial"],
        eligibleUserIds: [],
        eligibleEmails: [],
        includeTrialUsers: true,
        excludeActivePaidUsers: false,
      },
      sortOrder: 10,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function positiveNumber(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function normalizeId(value: unknown, fallback: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeEligibility(value: PlanConfigSpecialOffer["eligibility"]): NonNullable<PlanConfigSpecialOffer["eligibility"]> {
  return {
    ...DEFAULT_OFFER_ELIGIBILITY,
    ...(value || {}),
    minAccountAgeDays: positiveNumber(value?.minAccountAgeDays) ?? null,
    maxAccountAgeDays: positiveNumber(value?.maxAccountAgeDays) ?? null,
    allowedPlans: normalizeStringArray(value?.allowedPlans).map((plan) => plan.toLowerCase()),
    eligibleUserIds: normalizeStringArray(value?.eligibleUserIds).map((id) => id.toLowerCase()),
    eligibleEmails: normalizeStringArray(value?.eligibleEmails).map((email) => email.toLowerCase()),
    includeTrialUsers: value?.includeTrialUsers !== false,
    excludeActivePaidUsers: Boolean(value?.excludeActivePaidUsers),
  };
}

export function normalizeSpecialOffer(raw: Partial<PlanConfigSpecialOffer>, index = 0): PlanConfigSpecialOffer {
  const id = normalizeId(raw.id, `offer-${index + 1}`);
  const kind = raw.kind === "discounted_subscription" ? "discounted_subscription" : "one_time";
  const plan: OfferPlan = raw.plan === "basic" ? "basic" : "growth";
  const billingCycle: OfferBillingCycle = kind === "one_time"
    ? "lifetime"
    : raw.billingCycle === "yearly"
      ? "yearly"
      : "monthly";
  const discountPercent = positiveNumber(raw.discountPercent);
  const discountDurationMonths = positiveNumber(raw.discountDurationMonths);

  return {
    id,
    enabled: Boolean(raw.enabled),
    name: String(raw.name || "Special Offer").trim(),
    description: String(raw.description || "").trim(),
    badgeText: String(raw.badgeText || (kind === "one_time" ? "One-time offer" : "Limited offer")).trim(),
    ctaText: String(raw.ctaText || (kind === "one_time" ? "Buy Once" : "Claim Offer")).trim(),
    kind,
    plan,
    billingCycle,
    price: {
      ...(raw.price || {}),
      NGN: positiveNumber(raw.price?.NGN) ?? undefined,
      USD: positiveNumber(raw.price?.USD) ?? undefined,
    },
    discountPercent: discountPercent == null
      ? null
      : Math.max(1, Math.min(95, Math.round(discountPercent))),
    discountDurationMonths: discountDurationMonths == null
      ? null
      : Math.max(1, Math.min(60, Math.round(discountDurationMonths))),
    startsAt: raw.startsAt || null,
    endsAt: raw.endsAt || null,
    eligibility: normalizeEligibility(raw.eligibility),
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index + 1,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export function sanitizeSpecialOffers(raw: unknown): PlanConfigSpecialOffer[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((offer, index) => normalizeSpecialOffer(offer as Partial<PlanConfigSpecialOffer>, index));
}

function userCreatedAt(user: OfferUser): Date | null {
  const raw = user.createdAt ?? user.signupDate;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function accountAgeDays(user: OfferUser, now: Date): number | null {
  const createdAt = userCreatedAt(user);
  if (!createdAt) return null;
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000));
}

function isTrialing(user: OfferUser, now: Date): boolean {
  const trial = user.trial;
  if (!trial) return false;
  if (trial.active === true) return true;
  if (trial.status && String(trial.status).toLowerCase() === "active") return true;
  const endsAt = trial.endsAt ? new Date(trial.endsAt).getTime() : 0;
  return Number.isFinite(endsAt) && endsAt >= now.getTime();
}

function currentPlan(user: OfferUser, now: Date): string {
  if (isTrialing(user, now)) return "trial";
  const plan = String(user.plan || "free").trim().toLowerCase();
  if (plan === "pro") return "growth";
  return plan || "free";
}

function dateInWindow(offer: PlanConfigSpecialOffer, now: Date, reasons: string[]) {
  if (offer.startsAt) {
    const startsAt = new Date(offer.startsAt).getTime();
    if (Number.isFinite(startsAt) && now.getTime() < startsAt) {
      reasons.push("Offer has not started yet.");
    }
  }
  if (offer.endsAt) {
    const endsAt = new Date(offer.endsAt).getTime();
    if (Number.isFinite(endsAt) && now.getTime() > endsAt) {
      reasons.push("Offer has ended.");
    }
  }
}

function planOriginalPrice(
  offer: PlanConfigSpecialOffer,
  countryPricing: ResolvedPricing,
  planConfig: PlanConfig,
  finalCurrency: string,
): number {
  const cycle = offer.kind === "one_time" ? "yearly" : offer.billingCycle === "yearly" ? "yearly" : "monthly";
  if (finalCurrency === countryPricing.currency) {
    return countryPricing.plans[offer.plan]?.[cycle] || 0;
  }
  const planPricing = planConfig.plans[offer.plan]?.pricing;
  if (finalCurrency === "NGN") return Number(planPricing?.NGN?.[cycle] || 0);
  if (finalCurrency === "USD") return Number(planPricing?.USD?.[cycle] || 0);
  return countryPricing.plans[offer.plan]?.[cycle] || 0;
}

function resolveCurrencyAndPrice(
  offer: PlanConfigSpecialOffer,
  originalPrice: number,
  countryPricing: ResolvedPricing,
): { price: number; currency: string; currencySymbol: string; discountPercent: number | null; discountAmount: number } {
  if (offer.kind === "one_time") {
    const localPrice = positiveNumber(offer.price?.[countryPricing.currency]);
    const usdPrice = positiveNumber(offer.price?.USD);
    const ngnPrice = positiveNumber(offer.price?.NGN);
    const price = localPrice ?? (countryPricing.currency === "NGN" ? ngnPrice : usdPrice) ?? usdPrice ?? ngnPrice ?? 0;
    const currency = localPrice
      ? countryPricing.currency
      : countryPricing.currency === "NGN" && ngnPrice
        ? "NGN"
        : usdPrice
          ? "USD"
          : "NGN";
    const currencySymbol = currency === countryPricing.currency
      ? countryPricing.currencySymbol
      : currency === "NGN"
        ? "₦"
        : "$";
    return {
      price: roundMoney(price),
      currency,
      currencySymbol,
      discountPercent: null,
      discountAmount: Math.max(0, roundMoney(originalPrice - price)),
    };
  }

  const percentOff = Math.max(0, Math.min(95, Number(offer.discountPercent || 0)));
  const explicitPrice = positiveNumber(offer.price?.[countryPricing.currency]);
  const discountAmount = percentOff ? roundMoney((originalPrice * percentOff) / 100) : 0;
  const price = explicitPrice ?? Math.max(1, roundMoney(originalPrice - discountAmount));
  const effectiveDiscount = explicitPrice
    ? originalPrice > 0 ? Math.round(((originalPrice - explicitPrice) / originalPrice) * 100) : 0
    : percentOff;

  return {
    price: roundMoney(price),
    currency: countryPricing.currency,
    currencySymbol: countryPricing.currencySymbol,
    discountPercent: effectiveDiscount > 0 ? effectiveDiscount : null,
    discountAmount: Math.max(0, roundMoney(originalPrice - price)),
  };
}

export function evaluateSpecialOffer({
  offer: rawOffer,
  user,
  countryPricing,
  planConfig,
  now = new Date(),
}: {
  offer: PlanConfigSpecialOffer;
  user: OfferUser;
  countryPricing: ResolvedPricing;
  planConfig: PlanConfig;
  now?: Date;
}): SpecialOfferEligibilityResult {
  const offer = normalizeSpecialOffer(rawOffer);
  const reasons: string[] = [];
  const ageDays = accountAgeDays(user, now);
  const eligibility = normalizeEligibility(offer.eligibility);
  const plan = currentPlan(user, now);
  const trialing = plan === "trial";

  if (!offer.enabled) reasons.push("Offer is disabled.");
  dateInWindow(offer, now, reasons);

  if (eligibility.minAccountAgeDays != null && (ageDays == null || ageDays < eligibility.minAccountAgeDays)) {
    reasons.push(`Account must be at least ${eligibility.minAccountAgeDays} days old.`);
  }
  if (eligibility.maxAccountAgeDays != null && ageDays != null && ageDays > eligibility.maxAccountAgeDays) {
    reasons.push(`Account must be no older than ${eligibility.maxAccountAgeDays} days.`);
  }

  if (eligibility.allowedPlans?.length && !eligibility.allowedPlans.includes(plan)) {
    reasons.push(`Current plan ${plan} is not eligible.`);
  }

  if (trialing && eligibility.includeTrialUsers === false) {
    reasons.push("Trial users are not eligible for this offer.");
  }

  if (eligibility.excludeActivePaidUsers && (plan === "basic" || plan === "growth")) {
    reasons.push("Active paid users are excluded from this offer.");
  }

  const userId = String(user._id ?? "").trim().toLowerCase();
  const email = String(user.email ?? "").trim().toLowerCase();
  const hasUserList = Boolean(eligibility.eligibleUserIds?.length || eligibility.eligibleEmails?.length);
  if (hasUserList) {
    const matchedUser = Boolean(userId && eligibility.eligibleUserIds?.includes(userId));
    const matchedEmail = Boolean(email && eligibility.eligibleEmails?.includes(email));
    if (!matchedUser && !matchedEmail) {
      reasons.push("User is not in this offer audience.");
    }
  }

  const provisionalCurrency = offer.kind === "one_time" && !positiveNumber(offer.price?.[countryPricing.currency])
    ? positiveNumber(offer.price?.USD)
      ? "USD"
      : positiveNumber(offer.price?.NGN)
        ? "NGN"
        : countryPricing.currency
    : countryPricing.currency;
  const originalPrice = roundMoney(planOriginalPrice(offer, countryPricing, planConfig, provisionalCurrency));
  const pricing = resolveCurrencyAndPrice(offer, originalPrice, countryPricing);
  const discountDurationMonths = offer.kind === "discounted_subscription"
    ? Math.max(1, Math.round(Number(offer.discountDurationMonths || 1)))
    : null;

  const resolved: ResolvedSpecialOffer = {
    id: offer.id,
    enabled: offer.enabled,
    name: offer.name,
    description: offer.description,
    badgeText: offer.badgeText || (offer.kind === "one_time" ? "One-time offer" : "Limited offer"),
    ctaText: offer.ctaText || (offer.kind === "one_time" ? "Buy Once" : "Claim Offer"),
    kind: offer.kind,
    plan: offer.plan,
    billingCycle: offer.billingCycle,
    purchaseKind: offer.kind === "one_time" ? "one_time" : "subscription",
    price: pricing.price,
    originalPrice: originalPrice || pricing.price,
    discountPercent: pricing.discountPercent,
    discountDurationMonths,
    discountAmount: pricing.discountAmount,
    currency: pricing.currency,
    currencySymbol: pricing.currencySymbol,
    startsAt: offer.startsAt || null,
    endsAt: offer.endsAt || null,
    accountAgeDays: ageDays,
    eligibility,
  };

  if (!resolved.price || resolved.price <= 0) reasons.push("Offer does not have a valid price.");
  if (!planConfig.plans[offer.plan]) reasons.push("Offer points to an unavailable plan.");

  return {
    offer: resolved,
    eligible: reasons.length === 0,
    reasons,
  };
}

export function resolveEligibleSpecialOffers({
  planConfig,
  user,
  countryPricing,
  now = new Date(),
}: {
  planConfig: PlanConfig;
  user: OfferUser;
  countryPricing: ResolvedPricing;
  now?: Date;
}): ResolvedSpecialOffer[] {
  const offers = sanitizeSpecialOffers(planConfig.specialOffers);
  const sortOrder = new Map(offers.map((offer) => [offer.id, offer.sortOrder ?? 0]));
  return offers
    .map((offer) => evaluateSpecialOffer({ offer, user, countryPricing, planConfig, now }))
    .filter((result) => result.eligible)
    .map((result) => result.offer)
    .sort((a, b) => {
      const left = sortOrder.get(a.id) ?? 0;
      const right = sortOrder.get(b.id) ?? 0;
      return left - right || a.name.localeCompare(b.name);
    });
}

export function resolveSpecialOfferById({
  planConfig,
  user,
  countryPricing,
  offerId,
  now = new Date(),
}: {
  planConfig: PlanConfig;
  user: OfferUser;
  countryPricing: ResolvedPricing;
  offerId: string;
  now?: Date;
}): SpecialOfferEligibilityResult | null {
  const offer = sanitizeSpecialOffers(planConfig.specialOffers).find((item) => item.id === offerId);
  if (!offer) return null;
  return evaluateSpecialOffer({ offer, user, countryPricing, planConfig, now });
}
