/**
 * /api/user/api-keys
 *
 * CRUD for external MakeChurchEasy API keys.
 *
 * GET    — list all keys for the authenticated user (metadata only, no hashes)
 * POST   — create a new key when the plan includes API access. Returns the raw key ONCE.
 * DELETE — soft-revoke a key by ID
 *
 * Auth: fb-token cookie (web) OR X-Device-Id header (desktop app).
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { getAuthUserFromRequest } from "@/lib/auth";
import {
  listApiKeys,
  insertApiKey,
  revokeApiKey,
  getPlanConfig,
  getActiveSubscription,
} from "@/lib/db";
import type { ApiKeyDoc } from "@/lib/db";

const DAILY_REQUEST_LIMIT = 1000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const bytes = randomBytes(24).toString("base64url"); // 32 chars
  const raw = `mce_live_${bytes}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 12) + "…"; // "mce_live_xxx…"
  return { raw, hash, prefix };
}

function normalizePlanForLookup(plan?: string): string {
  return String(plan || "free").toLowerCase() === "pro" ? "growth" : String(plan || "free").toLowerCase();
}

async function hasApiAccess(userId: string, userPlan?: string): Promise<boolean> {
  const subscription = await getActiveSubscription(userId);
  const planTier = normalizePlanForLookup(subscription?.plan || userPlan || "free");

  // Check if the active plan includes API access in plan config entitlements.
  const planConfig = await getPlanConfig();
  const tierConfig = planConfig.plans[planTier] || planConfig.plans.free;
  return !!(tierConfig.entitlements as any).apiAccess;
}

// ─── GET — List API Keys ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const keys = await listApiKeys(userId);
    return NextResponse.json({ keys });
  } catch (error) {
    console.error("GET /api/user/api-keys error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST — Create API Key ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    // Enforce API access entitlement
    const canCreateApiKey = await hasApiAccess(userId, authUser.mongoUser.plan as string | undefined);
    if (!canCreateApiKey) {
      return NextResponse.json(
        { error: "API access requires Growth", upgradeRequired: true },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const name = (body.name as string)?.trim() || "Untitled Key";

    const { raw, hash, prefix } = generateApiKey();

    const doc: Omit<ApiKeyDoc, "_id"> = {
      userId,
      name,
      keyHash: hash,
      prefix,
      lastUsedAt: null,
      revoked: false,
      createdAt: new Date().toISOString(),
    };

    const created = await insertApiKey(doc);

    return NextResponse.json(
      {
        id: created._id?.toString(),
        name: created.name,
        prefix: created.prefix,
        key: raw, // shown only once
        createdAt: created.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/user/api-keys error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── DELETE — Revoke API Key ────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get("id");

    if (!keyId) {
      return NextResponse.json({ error: "Missing key id" }, { status: 400 });
    }

    const revoked = await revokeApiKey(userId, keyId);
    if (!revoked) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Key revoked" });
  } catch (error) {
    console.error("DELETE /api/user/api-keys error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
