import type { AuthUser } from "./authService";
import type { CanonicalPlanId } from "../lib/subscriptionSourceOfTruth";

export type LocalDevPlanId = Extract<CanonicalPlanId, "free" | "basic" | "growth">;

export const LOCAL_DEV_PLAN_OVERRIDE_EVENT = "mce-local-dev-plan-override";

/**
 * The product's current middle tier is named Basic internally. Keep the
 * developer-facing label as Pro because that is the three-plan test matrix
 * used while validating the app locally.
 */
export const LOCAL_DEV_PLAN_OPTIONS = [
  { id: "free", label: "Free", description: "Free-tier limits" },
  { id: "basic", label: "Pro", description: "Paid feature limits" },
  { id: "growth", label: "Growth", description: "Full Growth limits" },
] as const satisfies ReadonlyArray<{
  id: LocalDevPlanId;
  label: string;
  description: string;
}>;

const LOCAL_DEV_ADMIN_EMAIL = "admin@gmail.com";
const STORAGE_KEY_PREFIX = "mce-local-dev-plan-override";
const DOCK_AUTH_USER_ID_KEY = "mce-dock-auth-user-id";

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized.endsWith(".localhost");
}

/**
 * Local means both a Vite development build and a loopback/Tauri dev origin.
 * This keeps the switcher out of production builds and hosted previews.
 */
export function isLocalDevelopment(options: { dev?: boolean; hostname?: string } = {}): boolean {
  const isDevBuild = options.dev ?? import.meta.env.DEV;
  if (!isDevBuild) return false;

  const hostname = options.hostname
    ?? (typeof window !== "undefined" ? window.location.hostname : "");
  return isLocalHostname(hostname);
}

export function isLocalDevAdmin(
  user: Pick<AuthUser, "email"> | null | undefined,
  options?: { dev?: boolean; hostname?: string },
): boolean {
  const email = user?.email?.trim().toLowerCase();
  return email === LOCAL_DEV_ADMIN_EMAIL
    && isLocalDevelopment(options);
}

/** Normalize the UI value without treating the legacy "pro" alias as Growth. */
export function normalizeLocalDevPlan(value: unknown): LocalDevPlanId | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pro") return "basic";
  if (normalized === "free" || normalized === "basic" || normalized === "growth") {
    return normalized;
  }
  return null;
}

function getStorageKey(userId: string | null | undefined): string | null {
  const normalized = String(userId ?? "").trim();
  return normalized ? `${STORAGE_KEY_PREFIX}:${normalized}` : null;
}

function readOverrideForUserId(userId: string | null | undefined): LocalDevPlanId | null {
  const key = getStorageKey(userId);
  if (!key || typeof window === "undefined") return null;

  try {
    return normalizeLocalDevPlan(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

/** Read the override only for the exact local-development admin account. */
export function getLocalDevPlanOverride(
  user: Pick<AuthUser, "id" | "email"> | null | undefined,
  options?: { dev?: boolean; hostname?: string },
): LocalDevPlanId | null {
  if (!user || !isLocalDevAdmin(user, options)) return null;
  return readOverrideForUserId(user.id);
}

/**
 * Dock-only reader. The Dock has the authenticated user id but not the full
 * desktop AuthUser object, so it resolves the same user-scoped override.
 */
export function getStoredLocalDevPlanOverride(): LocalDevPlanId | null {
  if (!isLocalDevelopment() || typeof window === "undefined") return null;

  try {
    const userId = window.localStorage.getItem(DOCK_AUTH_USER_ID_KEY);
    return readOverrideForUserId(userId);
  } catch {
    return null;
  }
}

export function setLocalDevPlanOverride(
  user: Pick<AuthUser, "id" | "email"> | null | undefined,
  plan: LocalDevPlanId | null,
): boolean {
  if (!user || !isLocalDevAdmin(user)) return false;

  const key = getStorageKey(user.id);
  if (!key || typeof window === "undefined") return false;

  try {
    if (plan) {
      window.localStorage.setItem(key, plan);
    } else {
      window.localStorage.removeItem(key);
    }
    window.dispatchEvent(new CustomEvent(LOCAL_DEV_PLAN_OVERRIDE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalDevPlanOverride(
  user: Pick<AuthUser, "id" | "email"> | null | undefined,
): boolean {
  return setLocalDevPlanOverride(user, null);
}
