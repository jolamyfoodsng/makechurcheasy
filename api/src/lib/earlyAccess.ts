import { normalizeCountryCode } from "./countryNormalization";
import type { PlatformSettings } from "./platformSettings";

type EarlyAccessUser = {
  _id?: unknown;
  email?: string | null;
  country?: string | null;
  createdAt?: string | Date | null;
  signupDate?: string | Date | null;
};

export interface EarlyAccessOfferResult {
  enabled: boolean;
  eligible: boolean;
  plan: "growth";
  offerName: string;
  description: string;
  price: number;
  currency: "NGN" | "USD";
  currencySymbol: "₦" | "$";
}

function normalizeList(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];
}

function getUserCreatedAt(user: EarlyAccessUser): Date | null {
  const raw = user.createdAt ?? user.signupDate;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateEligible(settings: PlatformSettings["earlyAccess"], user: EarlyAccessUser): boolean {
  if (!settings.allowRegistrationDateEligibility) return false;
  if (!settings.registeredAfter && !settings.registeredBefore) return false;

  const createdAt = getUserCreatedAt(user);
  if (!createdAt) return false;

  if (settings.registeredAfter) {
    const after = new Date(settings.registeredAfter);
    if (Number.isFinite(after.getTime()) && createdAt < after) return false;
  }

  if (settings.registeredBefore) {
    const before = new Date(settings.registeredBefore);
    if (Number.isFinite(before.getTime())) {
      before.setHours(23, 59, 59, 999);
      if (createdAt > before) return false;
    }
  }

  return true;
}

export async function resolveEarlyAccessOffer(
  platformSettings: PlatformSettings,
  user: EarlyAccessUser,
): Promise<EarlyAccessOfferResult> {
  const settings = platformSettings.earlyAccess;
  const userId = String(user._id ?? "").trim().toLowerCase();
  const email = String(user.email ?? "").trim().toLowerCase();
  const eligibleUserIds = normalizeList(settings.eligibleUserIds);
  const eligibleEmails = normalizeList(settings.eligibleEmails);
  const explicitEligible =
    (userId && eligibleUserIds.includes(userId)) ||
    (email && eligibleEmails.includes(email));
  const eligible = Boolean(settings.enabled && (explicitEligible || dateEligible(settings, user)));
  const country = await normalizeCountryCode(user.country || "").catch(() => "");
  const isNigeria = country === "NG";
  const price = Number(isNigeria ? settings.priceNGN : settings.priceUSD) || 0;

  return {
    enabled: Boolean(settings.enabled),
    eligible,
    plan: "growth",
    offerName: settings.offerName || "Early Access Lifetime",
    description: settings.description || "One-time lifetime Growth access.",
    price,
    currency: isNigeria ? "NGN" : "USD",
    currencySymbol: isNigeria ? "₦" : "$",
  };
}
