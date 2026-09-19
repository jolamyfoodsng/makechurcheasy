import crypto from "node:crypto";

/** Generate the secret stored with a paired desktop device. */
export function generateDeviceSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}
