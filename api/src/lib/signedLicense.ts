/**
 * signedLicense.ts — builds the tamper-proof license envelope.
 *
 * The signed string is JSON of the license plus:
 *   - deviceId / userId: the licence only works for this device and account
 *   - signedAt:          server time when it was signed (an unforgeable clock floor)
 *   - v:                 format version
 * The desktop verifies the signature over this exact string and then parses it.
 */

export interface SignedLicenseBinding {
  deviceId: string;
  userId: string;
}

export const SIGNED_LICENSE_VERSION = 1;

export function buildSignedLicense(
  license: Record<string, unknown>,
  binding: SignedLicenseBinding,
  sign: (value: string) => string | null,
  now: Date = new Date(),
): { licenseSigned: string | null; licenseSignature: string | null } {
  const licenseSigned = JSON.stringify({
    ...license,
    v: SIGNED_LICENSE_VERSION,
    deviceId: binding.deviceId,
    userId: binding.userId,
    signedAt: now.toISOString(),
  });
  const licenseSignature = sign(licenseSigned);
  if (!licenseSignature) return { licenseSigned: null, licenseSignature: null };
  return { licenseSigned, licenseSignature };
}
