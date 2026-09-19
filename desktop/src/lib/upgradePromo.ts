import { REGION_PRICING } from "./subscriptionSourceOfTruth";

export const UPGRADE_ENTRY_PRICE_NGN =
  REGION_PRICING.NG.plans.basic.introductoryMonthly
  || REGION_PRICING.NG.plans.basic.monthly;

export const UPGRADE_ENTRY_PRICE_LABEL = `₦${UPGRADE_ENTRY_PRICE_NGN.toLocaleString("en-US")}`;

/**
 * Flexible fallback copy that does not hardcode prices, ensuring discounts
 * and promotions remain accurate and compelling.
 */
export const UPGRADE_PROMO_FALLBACK = "Upgrade your plan to unlock unlimited access and all premium features.";

export function getDiscountUpgradePromo(discountPercent?: number | null): string {
  if (discountPercent && discountPercent > 0) {
    return `Special Offer: Get ${discountPercent}% off your upgrade today!`;
  }
  return UPGRADE_PROMO_FALLBACK;
}

export function appendUpgradePromo(message: string, promo = UPGRADE_PROMO_FALLBACK): string {
  const trimmed = message.trim();
  if (!trimmed) return promo;
  if (trimmed.includes(promo)) return trimmed;
  return `${trimmed}${/[.!?]$/.test(trimmed) ? "" : "."} ${promo}`;
}

