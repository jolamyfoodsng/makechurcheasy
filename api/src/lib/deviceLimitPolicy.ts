/**
 * Returns whether a device count is beyond the user's plan allowance.
 * Infinity represents an unlimited plan entitlement.
 */
export function isDeviceLimitExceeded(deviceCount: number, maxDevices: number): boolean {
  if (!Number.isFinite(maxDevices)) return false;
  return deviceCount > maxDevices;
}
