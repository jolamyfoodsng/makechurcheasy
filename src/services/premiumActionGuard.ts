/**
 * premiumActionGuard.ts — Centralized premium action validation.
 *
 * Every premium action in the desktop app MUST call checkPremiumAccess()
 * before executing. The backend is the single source of truth.
 *
 * On network failure, falls back to the cached license from licenseGuard
 * within the offline verification window.
 */

import { getDeviceId } from "./authService";
import { getLicensePayload, isUnlocked } from "./licenseGuard";

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://api.makechurcheasy.creatorstudioslabs.stream";

const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

// ── Types ──────────────────────────────────────────────────────────────────

export type PremiumFeature =
  | "translation"
  | "transcriptExport"
  | "translationExport"
  | "speechToScripture"
  | "aiSummary"
  | "sermonNotes";

export interface AccessCheckResult {
  allowed: boolean;
  reason?:
    | "feature_not_available"
    | "insufficient_credits"
    | "subscription_expired"
    | "trial_expired"
    | "account_suspended"
    | "device_revoked"
    | "maintenance"
    | "internet_required"
    | "server_error"
    | "device_not_found";
  credits?: number;
  plan?: string;
  requiredPlan?: string;
  requiredCredits?: number;
  trialActive?: boolean;
  trialEndsAt?: string | null;
}

export interface AccessDeniedMessage {
  title: string;
  description: string;
  action: "upgrade" | "reconnect" | "contact";
}

// ── Core check ─────────────────────────────────────────────────────────────

/**
 * Verify with the backend that the user is allowed to perform a premium
 * action. MUST be called before every premium operation.
 *
 * On network failure, falls back to the locally cached license state.
 * If the offline window has also expired, returns denied.
 */
export async function checkPremiumAccess(
  feature: PremiumFeature,
  options?: { requiredCredits?: number },
): Promise<AccessCheckResult> {
  const deviceId = getDeviceId();
  if (!deviceId) {
    return { allowed: false, reason: "device_not_found" };
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/device/check-access?deviceId=${encodeURIComponent(deviceId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-App-Version": APP_VERSION,
        },
        body: JSON.stringify({
          feature,
          requiredCredits: options?.requiredCredits,
        }),
      },
    );

    if (!res.ok) {
      // Server returned an error — treat as denied but not expired
      const data = await res.json().catch(() => ({}));
      return {
        allowed: false,
        reason: data.reason || "server_error",
      };
    }

    return (await res.json()) as AccessCheckResult;
  } catch (err) {
    // Network failure — fall back to cached license
    console.warn(
      `[premiumActionGuard] Network error checking ${feature}:`,
      err,
    );
    return fallbackToCachedLicense();
  }
}

/**
 * When the backend is unreachable, check if the locally cached license
 * is still within the offline verification window. If so, allow the
 * action. If not, deny with internet_required.
 */
function fallbackToCachedLicense(): AccessCheckResult {
  // If the app-level license guard still considers us unlocked,
  // the cached license is within the offline grace period.
  if (isUnlocked()) {
    const payload = getLicensePayload();
    return {
      allowed: true,
      plan: payload?.plan || undefined,
      trialActive: payload?.trialActive || undefined,
      trialEndsAt: payload?.trialEndsAt || undefined,
    };
  }

  // License guard says we're locked — determine the specific reason
  const payload = getLicensePayload();
  const lockReason = payload?.lockReason;

  if (lockReason === "maintenance") {
    return { allowed: false, reason: "maintenance" };
  }
  if (lockReason === "subscription_expired") {
    return { allowed: false, reason: "subscription_expired" };
  }
  if (lockReason === "trial_expired") {
    return { allowed: false, reason: "trial_expired" };
  }
  if (lockReason === "account_suspended") {
    return { allowed: false, reason: "account_suspended" };
  }
  if (lockReason === "license_revoked" || lockReason === "device_removed") {
    return { allowed: false, reason: "device_revoked" };
  }

  return { allowed: false, reason: "internet_required" };
}

// ── UI message helper ──────────────────────────────────────────────────────

/**
 * Map a denial reason to a user-friendly message for the AccessDeniedDialog.
 */
export function getPremiumAccessDeniedMessage(
  reason: string,
): AccessDeniedMessage {
  switch (reason) {
    case "subscription_expired":
      return {
        title: "Subscription Required",
        description:
          "Your subscription has expired. Renew your plan to continue using premium features.",
        action: "upgrade",
      };
    case "trial_expired":
      return {
        title: "Free Trial Ended",
        description:
          "Your free trial has ended. Upgrade to a paid plan to unlock all features.",
        action: "upgrade",
      };
    case "feature_not_available":
      return {
        title: "Upgrade Required",
        description:
          "This feature requires a higher plan. Upgrade to access premium capabilities.",
        action: "upgrade",
      };
    case "insufficient_credits":
      return {
        title: "Not Enough Credits",
        description:
          "You don't have enough credits for this action. Purchase more credits or upgrade your plan.",
        action: "upgrade",
      };
    case "account_suspended":
      return {
        title: "Account Suspended",
        description:
          "Your account has been suspended. Please contact support to resolve this.",
        action: "contact",
      };
    case "device_revoked":
      return {
        title: "Device Removed",
        description:
          "This device has been removed from your account. Contact support for assistance.",
        action: "contact",
      };
    case "maintenance":
      return {
        title: "System Maintenance",
        description:
          "The platform is currently under maintenance. Please try again later.",
        action: "reconnect",
      };
    case "internet_required":
    case "device_not_found":
    case "server_error":
      return {
        title: "Connection Required",
        description:
          "An internet connection is needed to verify your access. Please check your connection and try again.",
        action: "reconnect",
      };
    default:
      return {
        title: "Access Denied",
        description: "You don't have permission to perform this action.",
        action: "upgrade",
      };
  }
}
