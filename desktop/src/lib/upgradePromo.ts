import { REGION_PRICING } from "./subscriptionSourceOfTruth";

export const UPGRADE_ENTRY_PRICE_NGN =
  REGION_PRICING.NG.plans.basic.introductoryMonthly
  || REGION_PRICING.NG.plans.basic.monthly;

export const UPGRADE_ENTRY_PRICE_LABEL = `₦${UPGRADE_ENTRY_PRICE_NGN.toLocaleString("en-US")}`;

export const UPGRADE_PROMO_FALLBACK = `Plans start from just ${UPGRADE_ENTRY_PRICE_LABEL} today.`;

export function appendUpgradePromo(message: string, promo = UPGRADE_PROMO_FALLBACK): string {
  const trimmed = message.trim();
  if (!trimmed) return promo;
  if (trimmed.includes(promo)) return trimmed;
  return `${trimmed}${/[.!?]$/.test(trimmed) ? "" : "."} ${promo}`;
}
