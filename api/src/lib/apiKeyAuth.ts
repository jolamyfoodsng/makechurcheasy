/**
 * apiKeyAuth.ts — Bearer-token authentication for external API keys
 *
 * Flow:
 *  1. Extract "Bearer mce_live_..." from Authorization header
 *  2. SHA-256 hash the raw key
 *  3. Look up the hash in the api_keys collection (revoked=false)
 *  4. Rate-limit check (1000 req/day per key)
 *  5. Update lastUsedAt
 *  6. Return the authenticated user + key metadata
 *
 * Used by all /api/v1/* routes.
 */

import { createHash } from "crypto";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import {
  findApiKeyByHash,
  getApiUsageCount,
  incrementApiUsage,
  insertApiLog,
} from "./db";
import clientPromise from "./mongodb";

const DAILY_RATE_LIMIT = 1000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ApiAuthContext {
  userId: string;
  apiKeyId: string;
  keyName: string;
  mongoUser: any;
}

export interface ApiAuthError {
  status: number;
  message: string;
}

// ─── Core Auth ──────────────────────────────────────────────────────────────

/**
 * Authenticate an incoming request using a Bearer API key.
 * Returns the auth context on success, or an error object on failure.
 */
export async function authenticateApiKey(
  req: NextRequest
): Promise<{ ok: true; ctx: ApiAuthContext } | { ok: false; error: ApiAuthError }> {
  const authHeader = req.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, error: { status: 401, message: "Missing or invalid Authorization header" } };
  }

  const token = authHeader.slice(7).trim();
  if (!token.startsWith("mce_live_")) {
    return { ok: false, error: { status: 401, message: "Invalid API key format" } };
  }

  // Hash and look up
  const keyHash = createHash("sha256").update(token).digest("hex");
  const keyDoc = await findApiKeyByHash(keyHash);

  if (!keyDoc) {
    return { ok: false, error: { status: 401, message: "Invalid or revoked API key" } };
  }

  // Rate limit check
  const today = new Date().toISOString().slice(0, 10);
  const usageCount = await getApiUsageCount(keyDoc._id!.toString(), today);

  if (usageCount >= DAILY_RATE_LIMIT) {
    return {
      ok: false,
      error: {
        status: 429,
        message: `Daily rate limit exceeded (${DAILY_RATE_LIMIT} requests/day). Resets at midnight UTC.`,
      },
    };
  }

  // Increment usage counter
  await incrementApiUsage(keyDoc._id!.toString(), today);

  // Update lastUsedAt (fire-and-forget, non-blocking)
  const client = await clientPromise;
  const db = client.db();
  db.collection("api_keys").updateOne(
    { _id: keyDoc._id },
    { $set: { lastUsedAt: new Date().toISOString() } }
  ).catch(() => { });

  // Fetch the MongoDB user
  let mongoUser: any = null;
  try {
    mongoUser = await db.collection("users").findOne({ _id: new ObjectId(keyDoc.userId) });
  } catch {
    return { ok: false, error: { status: 500, message: "Failed to resolve user" } };
  }

  if (!mongoUser) {
    return { ok: false, error: { status: 401, message: "User not found" } };
  }

  return {
    ok: true,
    ctx: {
      userId: keyDoc.userId,
      apiKeyId: keyDoc._id!.toString(),
      keyName: keyDoc.name,
      mongoUser,
    },
  };
}

// ─── Audit Logger ───────────────────────────────────────────────────────────

/**
 * Log an API request to the audit trail.
 * Call this after the request completes (success or failure).
 */
export async function logApiRequest(
  ctx: ApiAuthContext | null,
  req: NextRequest,
  statusCode: number
): Promise<void> {
  try {
    await insertApiLog({
      userId: ctx?.userId ?? "unknown",
      apiKeyId: ctx?.apiKeyId ?? "unknown",
      endpoint: req.nextUrl.pathname,
      method: req.method,
      statusCode,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Audit log failures must not break the request
  }
}
