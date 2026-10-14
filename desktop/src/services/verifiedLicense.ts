/**
 * verifiedLicense.ts — in-memory result of the signed-licence check.
 *
 * Kept free of imports so licenseGuard, licenseService and offlineEntitlement
 * can all read it without circular dependencies.
 *
 * Nothing here is read from localStorage: it is filled only after the native
 * code (or Web Crypto in a browser) has verified the server's signature.
 */

/** Production builds require a valid signed licence. Dev builds don't. */
export function isSealEnforced(): boolean {
  const flag = (import.meta as { env?: Record<string, unknown> }).env?.VITE_ENFORCE_SIGNED_LICENSE;
  return Boolean(import.meta.env.PROD) && flag !== "false";
}

export interface VerifiedLicenseView {
  plan: string;
  isAdmin: boolean;
  entitledUntil: string | null | undefined;
  lastVerifiedAt: string | undefined;
  serverTime: string | undefined;
  signedAtMs: number;
  /** The whole verified licence. */
  raw: Record<string, unknown>;
}

let verified: VerifiedLicenseView | null = null;
let initDone = false;
let clockFloorMs = 0;

export function setVerifiedLicense(license: Record<string, unknown> | null, signedAtMs: number | null): void {
  if (!license) {
    verified = null;
    return;
  }
  verified = {
    plan: String(license.plan ?? "free"),
    isAdmin: license.isAdmin === true,
    entitledUntil: (license.entitledUntil as string | null | undefined) ?? null,
    lastVerifiedAt: typeof license.lastVerifiedAt === "string" ? license.lastVerifiedAt : undefined,
    serverTime: typeof license.serverTime === "string" ? license.serverTime : undefined,
    signedAtMs: signedAtMs ?? 0,
    raw: license,
  };
  if (signedAtMs) raiseClockFloor(signedAtMs);
}

export function clearVerifiedLicense(): void {
  verified = null;
}

export function getVerifiedLicense(): VerifiedLicenseView | null {
  return verified;
}

/** The first signed-licence check has finished (successfully or not). */
export function markVerificationInitDone(): void {
  initDone = true;
}

/** Latest server-confirmed time: the system clock can't be wound back past it. */
export function raiseClockFloor(ms: number): void {
  if (Number.isFinite(ms) && ms > clockFloorMs) clockFloorMs = ms;
}

export function getClockFloor(): number {
  return clockFloorMs;
}

export interface VerifiedPlanCap {
  /** Enforcement is on and the first check is finished: local values must not be trusted over it. */
  active: boolean;
  /** A verified licence exists. */
  known: boolean;
  plan: string;
  isAdmin: boolean;
}

export function getVerifiedPlanCap(): VerifiedPlanCap {
  const active = isSealEnforced() && initDone;
  return {
    active,
    known: verified !== null,
    plan: verified?.plan ?? "free",
    isAdmin: verified?.isAdmin ?? false,
  };
}

/**
 * Whether the signed-in account is an admin.
 * Production: only a verified licence can say so (the stored user object is editable).
 * Development: the stored role is used, as before.
 */
export function resolveIsAdmin(storedRole: string | null | undefined): boolean {
  if (!isSealEnforced()) return String(storedRole || "").toLowerCase() === "admin";
  return verified?.isAdmin === true;
}

/** Test helper. */
export function __resetVerifiedLicenseForTests(): void {
  verified = null;
  initDone = false;
  clockFloorMs = 0;
}
