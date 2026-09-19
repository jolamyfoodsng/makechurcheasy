/**
 * subscriptionSigner.ts — Ed25519 signing for subscription state payloads
 *
 * Signs subscription payloads so the desktop app can verify
 * the state came from the server and wasn't tampered with.
 *
 * Key management:
 * - Private key: stored in SUBSCRIPTION_PRIVATE_KEY env var (base64 PEM)
 * - Public key: derived from private key, embedded in desktop app as constant
 *
 * First-time setup: run `npx tsx web/scripts/generate-subscription-keys.ts`
 */

import { createPrivateKey, createPublicKey, sign as ed25519Sign, type KeyObject } from "node:crypto";

// ── Key Loading ──────────────────────────────────────────────────────────────

let _privateKey: KeyObject | null = null;

export class SubscriptionSigningConfigurationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SubscriptionSigningConfigurationError";
  }
}

function normalizePrivateKeyEnv(raw: string): string {
  let value = raw.trim();

  // Vercel/CI values are often stored as a JSON-quoted string. Parse it when
  // possible so escaped quotes and newlines are handled consistently.
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === "string") value = parsed;
    } catch {
      value = value.slice(1, -1);
    }
  } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  }

  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\r\n/g, "\n")
    .trim();
}

function parsePrivateKey(raw: string): KeyObject {
  const normalized = normalizePrivateKeyEnv(raw);

  if (normalized.includes("-----BEGIN")) {
    return createPrivateKey({ key: normalized, format: "pem", type: "pkcs8" });
  }

  // Also accept base64-encoded PKCS#8 DER, which is convenient for secret
  // managers that do not preserve multiline PEM values.
  const base64 = normalized
    .replace(/^base64:/i, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (/^[A-Za-z0-9+/=]+$/.test(base64) && base64.length >= 80) {
    return createPrivateKey({ key: Buffer.from(base64, "base64"), format: "der", type: "pkcs8" });
  }

  throw new Error("value is neither a PKCS#8 PEM key nor a base64-encoded PKCS#8 DER key");
}

function getPrivateKey(): KeyObject {
  if (_privateKey) return _privateKey;

  const raw = process.env.SUBSCRIPTION_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      "SUBSCRIPTION_PRIVATE_KEY env var is not set. " +
      "Run `npx tsx web/scripts/generate-subscription-keys.ts` to generate keys."
    );
  }

  try {
    _privateKey = parsePrivateKey(raw);
    return _privateKey;
  } catch (cause) {
    throw new SubscriptionSigningConfigurationError(
      "SUBSCRIPTION_PRIVATE_KEY must be a valid Ed25519 PKCS#8 private key. " +
      "Use the escaped PEM output from scripts/generate-subscription-keys.ts.",
      { cause },
    );
  }
}

// ── Payload Types ────────────────────────────────────────────────────────────

export interface SubscriptionPayload {
  userId: string;
  plan: string;
  subscriptionStatus: "active" | "expired" | "none";
  creditsRemaining: number;
  expiresAt: string | null;
  lastVerifiedAt: string;
  offlineExpiresAt: string; // lastVerifiedAt + 14 days
}

// ── Signing ──────────────────────────────────────────────────────────────────

/**
 * Sign a subscription payload. Returns base64-encoded Ed25519 signature.
 * The payload is canonicalized (sorted keys) before signing for consistency.
 */
export function signPayload(payload: SubscriptionPayload): string {
  const privateKey = getPrivateKey();
  const canonical = canonicalize(payload);
  const sig = ed25519Sign(null, Buffer.from(canonical), privateKey);
  return sig.toString("base64");
}

/**
 * Get the Ed25519 public key as base64-encoded DER (for embedding in the desktop app).
 */
export function getPublicKeyBase64(): string {
  const privateKey = getPrivateKey();
  const publicKey = createPublicKey(privateKey);
  const der = publicKey.export({ type: "spki", format: "der" });
  return der.toString("base64");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function canonicalize(payload: SubscriptionPayload): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(payload).sort()) {
    sorted[key] = (payload as unknown as Record<string, unknown>)[key];
  }
  return JSON.stringify(sorted);
}
