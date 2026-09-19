/**
 * adminAuth.ts — Shared admin authentication for API routes.
 *
 * Supports two auth methods:
 * 1. Session cookie JWT (web admin dashboard)
 * 2. Device-based auth via X-Device-Id header (desktop app)
 *
 * Returns the admin userId on success, or a NextResponse error on failure.
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "./auth";
import clientPromise from "./mongodb";

type AdminAuthResult =
  | { ok: true; adminUserId: string }
  | { ok: false; response: NextResponse };

/**
 * Verify the caller is an admin. Tries session cookie first, then device header.
 * For device-based auth, verifies the device exists AND the linked user has role "admin".
 */
export async function requireAdmin(req?: Request): Promise<AdminAuthResult> {
  // Try session cookie JWT (web admin dashboard)
  try {
    const authUser = await getAuthUser();
    if (authUser?.mongoUser?._id && authUser.mongoUser.role === "admin") {
      return { ok: true, adminUserId: authUser.mongoUser._id.toString() };
    }
  } catch {
    // No valid session — fall through to device auth
  }

  // Fallback: device-based auth via X-Device-Id header (desktop app)
  const deviceId = req?.headers?.get("x-device-id") ?? null;

  if (!deviceId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    // Look up the device to find the linked userId (exclude soft-deleted)
    const device = await db.collection("devices").findOne({ deviceId, status: { $ne: "deleted" } });
    if (!device?.userId) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized — admin role required" }, { status: 403 }),
      };
    }

    const { ObjectId } = await import("mongodb");

    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(device.userId) }, { projection: { role: 1, isActive: 1 } });

    if (!user || user.role !== "admin" || user.isActive === false) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized — admin role required" }, { status: 403 }),
      };
    }

    return { ok: true, adminUserId: device.userId };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Internal server error" }, { status: 500 }),
    };
  }
}
