import type { PlanConfig } from "@/lib/planConfigService";

export type AdminManagedSubscriptionCycle = "monthly" | "yearly" | "gift_3m" | "gift_6m" | "gift_12m" | string;

const GIFT_BILLING_CYCLES = new Set(["gift_3m", "gift_6m", "gift_12m"]);

export function getAdminManagedPlanCredits(planConfig: PlanConfig | null, plan: string): number | null {
  const tier = planConfig?.plans?.[plan];
  return typeof tier?.credits === "number" ? tier.credits : null;
}

export function getAdminManagedPlanAmount(
  planConfig: PlanConfig | null,
  plan: string,
  billingCycle: AdminManagedSubscriptionCycle,
  currency: string,
): string {
  if (!planConfig || plan === "free") return "";
  if (GIFT_BILLING_CYCLES.has(billingCycle)) return "0";

  const cycle = billingCycle === "yearly" ? "yearly" : "monthly";
  const normalizedCurrency = String(currency || "NGN").trim().toUpperCase();
  const tier = planConfig.plans?.[plan];
  const amount = tier?.pricing?.[normalizedCurrency as "NGN" | "USD"]?.[cycle];

  return typeof amount === "number" && Number.isFinite(amount) ? String(amount) : "";
}

export function formatPlanCredits(credits: number | null): string {
  if (credits == null) return "-";
  if (credits === -1) return "Unlimited";
  return credits.toLocaleString();
}
