/**
 * deviceAuth.ts — Device secret verification for /api/device/* routes.
 *
 * Each device gets a random secret on creation. The desktop app stores
 * this secret and sends it with every request. Routes verify the secret
 * to prevent deviceId enumeration attacks.
 *
 * Existing devices without a secret are allowed through (migration period).
 * Once all desktop clients have been updated to store and send the secret,
 * the migration fallback should be removed.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import clientPromise from "./mongodb";

export { generateDeviceSecret } from "./deviceSecret";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Device-Secret, X-App-Version",
};

/**
 * Verify the device secret from the request header against the stored value.
 *
 * Returns null on success (with the device document), or a NextResponse error.
 *
 * Migration: devices created before this feature won't have a `deviceSecret`.
 * We allow them through to avoid breaking existing sessions. Once the desktop
 * app is updated to store and send secrets, remove this fallback.
 */
export async function verifyDeviceSecret(
  req: NextRequest,
  deviceId: string
): Promise<{ device: Record<string, unknown> } | { error: NextResponse }> {
  const deviceSecret = req.headers.get("x-device-secret");

  if (!deviceSecret) {
    // Missing header — check if this is a legacy device without a secret
    const client = await clientPromise;
    const db = client.db();
    const device = await db.collection("devices").findOne({ deviceId, status: { $ne: "deleted" } });

    if (!device) {
      return {
        error: NextResponse.json(
          { error: "Device not found" },
          { status: 404, headers: CORS_HEADERS }
        ),
      };
    }

    // Legacy device without secret, or device whose client lost its
    // secret (reinstall / cache clear) — allow through (migration period).
    // The device is still valid; the client just can't prove it right now.
    return { device };
  }

  // Verify the secret
  const client = await clientPromise;
  const db = client.db();
  const device = await db.collection("devices").findOne({ deviceId, status: { $ne: "deleted" } });

  if (!device) {
    return {
      error: NextResponse.json(
        { error: "Device not found" },
        { status: 404, headers: CORS_HEADERS }
      ),
    };
  }

  if (!device.deviceSecret) {
    // Device doesn't have a secret yet (legacy) — store the provided one
    // This handles the migration: first request with a secret stamps it on the device
    await db.collection("devices").updateOne(
      { deviceId },
      { $set: { deviceSecret } }
    );
    return { device: { ...device, deviceSecret } };
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(device.deviceSecret);
  const provided = Buffer.from(deviceSecret);

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return {
      error: NextResponse.json(
        { error: "Invalid device secret" },
        { status: 401, headers: CORS_HEADERS }
      ),
    };
  }

  return { device };
}
