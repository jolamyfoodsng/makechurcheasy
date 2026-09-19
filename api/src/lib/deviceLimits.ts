/**
 * Server-side device limit enforcement.
 *
 * Reads device limits from plan_config in MongoDB.
 * Falls back to hardcoded defaults if the DB read fails.
 */

import clientPromise from "./mongodb";
import { getPlanConfig } from "./db";
import {
  FALLBACK_TRIAL_DEVICE_LIMIT,
  getFallbackDeviceLimitForPlan,
  normalizeDeviceLimitPlan,
} from "./deviceLimitDefaults";

export { FALLBACK_DEVICE_LIMITS, getFallbackDeviceLimitForPlan, normalizeDeviceLimitPlan } from "./deviceLimitDefaults";

export interface DeviceLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
}

/**
 * Get the device limit for a plan tier.
 * Reads from DB plan_config → plan entitlements.devices.
 * Falls back to hardcoded defaults on DB failure.
 */
export async function getDeviceLimitForPlan(plan: string): Promise<number> {
  const key = normalizeDeviceLimitPlan(plan);
  try {
    const config = await getPlanConfig();
    const tierCfg = config.plans?.[key];
    if (tierCfg?.entitlements?.devices != null) {
      const val = tierCfg.entitlements.devices;
      return val === -1 ? Infinity : val;
    }
  } catch {
    // DB unavailable — fall through to hardcoded
  }
  return getFallbackDeviceLimitForPlan(key);
}

/**
 * Check whether a user can register a new device.
 *
 * During an active trial, uses trial entitlements from DB.
 * When the trial expires, the free plan's limit applies.
 */
export async function checkDeviceLimit(
  userId: string,
  deviceId: string | null,
  userPlan: string = "free",
  isOnTrial: boolean = false
): Promise<DeviceLimitResult> {
  const plan = normalizeDeviceLimitPlan(userPlan);
  let baseLimit: number;

  try {
    const config = await getPlanConfig();
    if (isOnTrial) {
      const trialTier = config.plans?.trial;
      const val = trialTier?.entitlements?.devices;
      baseLimit = val != null ? (val === -1 ? Infinity : val) : FALLBACK_TRIAL_DEVICE_LIMIT;
    } else {
      const tierCfg = config.plans?.[plan];
      const val = tierCfg?.entitlements?.devices;
      baseLimit = val != null ? (val === -1 ? Infinity : val) : getFallbackDeviceLimitForPlan(plan);
    }
  } catch {
    baseLimit = isOnTrial ? FALLBACK_TRIAL_DEVICE_LIMIT : getFallbackDeviceLimitForPlan(plan);
  }

  // Unlimited plan — skip counting
  if (baseLimit === Infinity) {
    return { allowed: true, currentCount: 0, limit: Infinity };
  }

  const client = await clientPromise;
  const db = client.db();

  const currentCount = await db.collection("devices").countDocuments({
    userId,
    status: { $ne: "deleted" },
  });

  if (deviceId) {
    const alreadyRegistered = await db.collection("devices").findOne({
      deviceId,
      userId,
      status: { $ne: "deleted" },
    });
    if (alreadyRegistered) {
      return { allowed: true, currentCount, limit: baseLimit };
    }
  }

  return {
    allowed: currentCount < baseLimit,
    currentCount,
    limit: baseLimit,
  };
}
