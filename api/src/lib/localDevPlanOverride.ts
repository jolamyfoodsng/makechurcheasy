/**
 * Local-only plan simulation for end-to-end entitlement testing.
 *
 * This store is deliberately in memory. It is never persisted to MongoDB and
 * is unavailable to production API processes. The desktop test switcher uses
 * it to make the local API, web dashboard, and Dock see the same plan.
 */

export type LocalDevPlanId = "free" | "basic" | "growth";

const LOCAL_DEV_ADMIN_EMAIL = "admin@gmail.com";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const overrides = new Map<string, LocalDevPlanId>();

function normalizeUserId(userId: unknown): string {
  return String(userId ?? "").trim();
}

export function normalizeLocalDevPlan(value: unknown): LocalDevPlanId | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pro") return "basic";
  if (normalized === "free" || normalized === "basic" || normalized === "growth") {
    return normalized;
  }
  return null;
}

/** Only local development API requests may use the simulator. */
export function isLocalDevPlanOverrideRequest(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const appEnv = String(process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || "development")
    .trim()
    .toLowerCase();
  if (appEnv === "production") return false;

  try {
    const hostname = new URL(req.url).hostname.trim().toLowerCase();
    return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function isLocalDevPlanAdmin(user: any): boolean {
  return user?.role === "admin"
    && String(user?.email || "").trim().toLowerCase() === LOCAL_DEV_ADMIN_EMAIL;
}

export function getLocalDevPlanOverride(userId: unknown): LocalDevPlanId | null {
  const normalizedId = normalizeUserId(userId);
  return normalizedId ? overrides.get(normalizedId) || null : null;
}

export function setLocalDevPlanOverride(userId: unknown, plan: LocalDevPlanId): void {
  const normalizedId = normalizeUserId(userId);
  if (!normalizedId) return;
  overrides.set(normalizedId, plan);
}

export function clearLocalDevPlanOverride(userId: unknown): void {
  const normalizedId = normalizeUserId(userId);
  if (normalizedId) overrides.delete(normalizedId);
}

