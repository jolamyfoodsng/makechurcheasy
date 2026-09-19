/**
 * planTransitions.ts — Central plan hierarchy and transition logic.
 *
 * Defines the plan ordering (Free < Basic < Growth) and
 * provides a resolver to determine whether a target plan is an
 * upgrade, downgrade, or the current plan.
 */

export type PlanTier = "free" | "basic" | "growth";

export type PlanTransition = "current" | "upgrade" | "downgrade";

/** Ordered plan hierarchy (lowest → highest). Index = level. */
export const PLAN_ORDER: PlanTier[] = ["free", "basic", "growth"];

/** Numeric level for each plan. */
export const PLAN_LEVEL: Record<PlanTier, number> = {
  free: 0,
  basic: 1,
  growth: 2,
};

/**
 * Determines the relationship between a current plan and a target plan.
 *
 * Free   → Basic  = upgrade
 * Growth → Basic  = downgrade
 */
export function getPlanTransition(
  currentPlan: PlanTier | string,
  targetPlan: PlanTier | string,
): PlanTransition {
  const current = PLAN_LEVEL[currentPlan as PlanTier] ?? -1;
  const target = PLAN_LEVEL[targetPlan as PlanTier] ?? -1;

  if (current === -1 || target === -1) return "downgrade";
  if (target > current) return "upgrade";
  if (target < current) return "downgrade";
  return "current";
}

/**
 * Returns a human-readable action label for the plan card CTA button.
 */
export function getPlanActionLabel(
  currentPlan: PlanTier | string,
  targetPlan: PlanTier | string,
  targetName: string,
): string {
  const transition = getPlanTransition(currentPlan, targetPlan);
  switch (transition) {
    case "current":
      return "Current Plan";
    case "upgrade":
      return `Upgrade to ${targetName}`;
    case "downgrade":
      return `Downgrade to ${targetName}`;
  }
}

/**
 * Returns true if the target plan represents a higher tier than the current plan.
 */
export function isPlanUpgrade(
  currentPlan: PlanTier | string,
  targetPlan: PlanTier | string,
): boolean {
  return getPlanTransition(currentPlan, targetPlan) === "upgrade";
}

/**
 * Returns the list of plans ordered for display, with the current plan
 * always sorted by level.
 */
export function getSortedPlans(
  currentPlan: PlanTier | string,
): { key: PlanTier; label: string; transition: PlanTransition }[] {
  const names: Record<PlanTier, string> = {
    free: "Free",
    basic: "Basic",
    growth: "Growth",
  };

  return PLAN_ORDER.filter((p) => p !== "free").map((p) => ({
    key: p,
    label: names[p],
    transition: getPlanTransition(currentPlan, p),
  }));
}
