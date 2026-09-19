/**
 * auth.ts — JWT session auth + MongoDB user management
 *
 * Server-side: verifies JWT session tokens and manages user records.
 * Supports two auth mechanisms:
 *  1. session-token cookie — used by the web dashboard (JWT-based)
 *  2. X-Device-Id header  — used by the Tauri desktop app (pairing flow)
 *
 * Callers should use `getAuthUser()` for cookie-based auth or
 * `getAuthUserFromRequest(req)` which tries cookie first, then device header.
 */

import clientPromise from "./mongodb";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { verifySessionToken, SESSION_MAX_AGE } from "./jwt";
import { claimTrialForUserIfEligible } from "@/lib/trialAbuse";
import { getTrialForUser, migrateEmbeddedTrial } from "@/lib/trialRecords";
import { migrateLegacyCredits } from "@/lib/credits";
import { checkAndExpireAdminTemporaryPlan } from "@/lib/adminTemporaryPlan";

const COOKIE_NAME = "session-token";

// ---------------------------------------------------------------------------
// Trial provisioning
// ---------------------------------------------------------------------------

/**
 * If an existing user has no trial record and is on the free plan,
 * grant them a trial automatically. This handles pre-trial-system users
 * who were created before the trial feature existed.
 *
 * Returns the (possibly updated) user document.
 */
type TrialDeviceIdentity = {
  deviceId?: string | null;
  deviceFingerprintHash?: string | null;
  installationId?: string | null;
};

async function ensureTrialForExistingUser(
  user: any,
  identity?: TrialDeviceIdentity,
): Promise<any> {
  if (user.adminTemporaryPlan?.active || user.adminTemporaryPlan?.endedAt) return user;
  if (user.adminManagedSubscription?.active || user.adminManagedSubscription?.endedAt) return user;
  if (user.trialId) return user;
  if (user.trial && !user.trialId) {
    try {
      const trialId = await migrateEmbeddedTrial(user);
      if (trialId) return { ...user, trialId };
    } catch (err) {
      console.error("[auth] Failed to migrate embedded trial:", err);
    }
    return user;
  }
  if (user.plan && user.plan !== "free") return user;
  if (user.emailVerified === false) return user;

  // Web sessions do not have a durable machine identity. Do not start a
  // trial from a dashboard request; the desktop pairing/login flow supplies
  // the hardware fingerprint that makes the one-trial rule enforceable.
  if (!identity?.deviceFingerprintHash && !identity?.installationId) return user;

  try {
    const trialClaim = await claimTrialForUserIfEligible({
      userId: user._id.toString(),
      email: user.email,
      source: "auth_existing_user",
      deviceId: identity.deviceId,
      deviceFingerprintHash: identity.deviceFingerprintHash,
      installationId: identity.installationId,
    });
    if (trialClaim.trialRecord) {
      return { ...user, trialId: trialClaim.trialRecord._id?.toString() };
    }
    if (!trialClaim.eligible) {
      console.warn("[auth] Trial not granted:", {
        userId: user._id.toString(),
        reason: trialClaim.reason,
        matchedSignalTypes: trialClaim.matchedSignalTypes,
      });
    }
    return user;
  } catch (err) {
    console.error("[auth] Failed to auto-provision trial for existing user:", err);
    return user;
  }
}

// ---------------------------------------------------------------------------
// JWT session → MongoDB user
// ---------------------------------------------------------------------------

/**
 * Verify the session JWT from the cookie and return the MongoDB user.
 */
export async function getAuthUser(): Promise<{
  mongoUser: any;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload?.sub) return null;

  const client = await clientPromise;
  const db = client.db();

  const { ObjectId } = await import("mongodb");
  let user;
  try {
    user = await db.collection("users").findOne({ _id: new ObjectId(payload.sub) });
  } catch {
    return null;
  }
  if (!user || user.isActive === false) return null;

  // Token version check — invalidated by logout-all
  if (user.tokenVersion !== undefined && user.tokenVersion !== payload.tokenVersion) {
    return null;
  }

  let ensured = await ensureTrialForExistingUser(user);
  ensured = await checkAndExpireAdminTemporaryPlan(ensured._id.toString(), ensured);
  migrateLegacyCredits(ensured); // fire-and-forget
  return { mongoUser: ensured };
}

// ---------------------------------------------------------------------------
// Session cookie helpers
// ---------------------------------------------------------------------------

/**
 * Set the session JWT cookie.
 */
export function setAuthCookie(jwt: string): NextResponse {
  const response = NextResponse.next();
  response.cookies.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

/**
 * Set the session JWT cookie on a custom response.
 */
export function setAuthCookieOnResponse(response: NextResponse, jwt: string): NextResponse {
  response.cookies.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

/**
 * Clear the session cookie.
 */
export function clearAuthCookie(): NextResponse {
  const response = NextResponse.next();
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/**
 * Require authentication — returns mongoUser or throws 401.
 */
export async function requireAuth(): Promise<string> {
  const authUser = await getAuthUser();
  if (!authUser?.mongoUser?._id) {
    throw new AuthError("Unauthorized");
  }
  return authUser.mongoUser._id.toString();
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Get user ID from request — session cookie only.
 */
export async function getUserIdFromRequest(_req?: Request): Promise<string | null> {
  const authUser = await getAuthUser();
  if (authUser?.mongoUser?._id) {
    return authUser.mongoUser._id.toString();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Device-based auth (Tauri desktop app)
// ---------------------------------------------------------------------------

const DEVICE_ID_HEADER = "x-device-id";

/**
 * Look up a device by deviceId and return the associated MongoDB user.
 * Returns null if the device is not found.
 */
function secretsMatch(expectedSecret: unknown, providedSecret: string | null): boolean {
  if (!expectedSecret) return true; // Legacy device migration path.
  if (!providedSecret) return true; // Backward compatible with existing paired desktop sessions.
  const expected = Buffer.from(String(expectedSecret));
  const provided = Buffer.from(providedSecret);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

async function getUserFromDeviceId(deviceId: string, deviceSecret: string | null = null): Promise<{ mongoUser: any } | null> {
  const client = await clientPromise;
  const db = client.db();
  const device = await db.collection("devices").findOne({ deviceId, status: { $ne: "deleted" } });
  if (!device?.userId) return null;
  if (!secretsMatch(device.deviceSecret, deviceSecret)) return null;

  const { ObjectId } = await import("mongodb");
  let user;
  try {
    user = await db.collection("users").findOne({ _id: new ObjectId(device.userId) });
  } catch {
    return null;
  }
  if (!user || user.isActive === false) return null;
  let ensured = await ensureTrialForExistingUser(user, {
    deviceId: device.deviceId,
    deviceFingerprintHash: device.fingerprintHash,
    installationId: device.installationId,
  });
  ensured = await checkAndExpireAdminTemporaryPlan(ensured._id.toString(), ensured);
  migrateLegacyCredits(ensured); // fire-and-forget
  return { mongoUser: ensured };
}

async function getUserFromDeviceSecret(deviceSecret: string): Promise<{ mongoUser: any } | null> {
  const client = await clientPromise;
  const db = client.db();
  const device = await db.collection("devices").findOne({
    deviceSecret,
    status: { $ne: "deleted" },
  });
  if (!device?.userId) return null;

  const { ObjectId } = await import("mongodb");
  let user;
  try {
    user = await db.collection("users").findOne({ _id: new ObjectId(device.userId) });
  } catch {
    return null;
  }
  if (!user || user.isActive === false) return null;
  let ensured = await ensureTrialForExistingUser(user, {
    deviceId: device.deviceId,
    deviceFingerprintHash: device.fingerprintHash,
    installationId: device.installationId,
  });
  ensured = await checkAndExpireAdminTemporaryPlan(ensured._id.toString(), ensured);
  migrateLegacyCredits(ensured); // fire-and-forget
  return { mongoUser: ensured };
}

/**
 * Authenticate from request — tries session cookie first, then X-Device-Id header.
 * Returns { mongoUser } if either method succeeds, or null.
 */
export async function getAuthUserFromRequest(req: NextRequest): Promise<{ mongoUser: any } | null> {
  // 1. Try session cookie (web dashboard)
  const cookieUser = await getAuthUser().catch(() => null);
  if (cookieUser?.mongoUser?._id) return cookieUser;

  // 2. Try X-Device-Id header (Tauri desktop app)
  const deviceId = req.headers.get(DEVICE_ID_HEADER) || req.nextUrl.searchParams.get("deviceId");
  if (deviceId) {
    const deviceSecret = req.headers.get("x-device-secret") || req.nextUrl.searchParams.get("deviceSecret");
    const deviceUser = await getUserFromDeviceId(deviceId, deviceSecret);
    if (deviceUser) return deviceUser;
  }

  // Recovery path for clients that still have the random device secret but
  // missed attaching the deviceId during startup or cross-origin retries.
  const deviceSecret = req.headers.get("x-device-secret") || req.nextUrl.searchParams.get("deviceSecret");
  if (deviceSecret) {
    const deviceUser = await getUserFromDeviceSecret(deviceSecret);
    if (deviceUser) return deviceUser;
  }

  return null;
}
