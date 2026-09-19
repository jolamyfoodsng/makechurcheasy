/** Fallback device limits used only when plan_config cannot be read. */
export const FALLBACK_DEVICE_LIMITS: Record<string, number> = {
  free: 1,
  trial: 10,
  basic: 3,
  growth: 10,
  ambassador: 10,
  unlimited: 10,
};

export const FALLBACK_TRIAL_DEVICE_LIMIT = 10;

export function normalizeDeviceLimitPlan(plan?: string | null): string {
  const normalized = String(plan || "free").trim().toLowerCase();
  return normalized === "pro" ? "growth" : normalized;
}

export function getFallbackDeviceLimitForPlan(plan?: string | null): number {
  const key = normalizeDeviceLimitPlan(plan);
  return FALLBACK_DEVICE_LIMITS[key] ?? FALLBACK_DEVICE_LIMITS.free;
}
