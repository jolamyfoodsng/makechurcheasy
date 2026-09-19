import crypto from "node:crypto";
import { getFlutterwaveSupportedCurrencies } from "./flutterwaveMarkets";

const DEFAULT_API_BASE = "https://api.flutterwave.com/v3";
export class FlutterwaveError extends Error {
  constructor(message: string, public statusCode = 502) {
    super(message);
    this.name = "FlutterwaveError";
  }
}

export interface FlutterwavePaymentLink {
  status?: string;
  message?: string;
  data?: {
    link?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface FlutterwaveTransaction {
  status?: string;
  message?: string;
  data?: {
    id?: string | number;
    tx_ref?: string;
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    customer?: { email?: string; name?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

export function getFlutterwaveSecretKey() {
  return env("FLW_SECRET_KEY", "FLUTTERWAVE_SECRET_KEY");
}

export function getFlutterwavePublicKey() {
  return env("FLW_PUBLIC_KEY", "FLUTTERWAVE_PUBLIC_KEY");
}

export function getFlutterwaveEncryptionKey() {
  return env("FLW_ENCRYPTION_KEY", "FLUTTERWAVE_ENCRYPTION_KEY");
}

export function getFlutterwaveSecretHash() {
  return env("FLW_SECRET_HASH", "FLUTTERWAVE_SECRET_HASH");
}

export function isFlutterwaveConfigured() {
  return Boolean(getFlutterwaveSecretKey());
}

export function isFlutterwaveCurrencySupported(currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase();
  // The explicit market map is the source of truth. This prevents a stale
  // environment variable from accidentally disabling a configured local
  // market or enabling a currency that has no configured checkout pricing.
  return getFlutterwaveSupportedCurrencies().has(normalizedCurrency);
}

function apiBase() {
  return (process.env.FLW_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, "");
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return { message: raw.slice(0, 500) };
  }
}

async function flutterwaveRequest<T extends Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const secretKey = getFlutterwaveSecretKey();
  if (!secretKey) throw new FlutterwaveError("Flutterwave is not configured", 500);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const data = await parseResponse(response);
    if (!response.ok || String(data.status || "").toLowerCase() === "error") {
      const message = String(data.message || data.error || `Flutterwave request failed (${response.status})`);
      throw new FlutterwaveError(message, response.status >= 400 && response.status < 500 ? response.status : 502);
    }
    return data as T;
  } catch (error) {
    if (error instanceof FlutterwaveError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new FlutterwaveError("Flutterwave request timed out", 504);
    }
    throw new FlutterwaveError("Could not reach Flutterwave", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function buildPayloadHash(input: {
  amount: number;
  currency: string;
  email: string;
  txRef: string;
}) {
  const hashedSecret = crypto.createHash("sha256").update(getFlutterwaveSecretKey(), "utf8").digest("hex");
  const immutableValues = `${input.amount}${input.currency}${input.email}${input.txRef}${hashedSecret}`;
  return crypto.createHash("sha256").update(immutableValues, "utf8").digest("hex");
}

export async function createFlutterwavePayment(input: {
  amount: number;
  currency: string;
  txRef: string;
  email: string;
  name?: string;
  redirectUrl: string;
  description: string;
  metadata: Record<string, unknown>;
}) {
  const currency = input.currency.trim().toUpperCase();
  const amount = Number(input.amount.toFixed(2));
  const body = {
    tx_ref: input.txRef,
    amount,
    currency,
    redirect_url: input.redirectUrl,
    customer: {
      email: input.email,
      ...(input.name ? { name: input.name } : {}),
    },
    customizations: {
      title: "MakeChurchEasy",
      description: input.description,
    },
    meta: input.metadata,
    payload_hash: buildPayloadHash({
      amount,
      currency,
      email: input.email,
      txRef: input.txRef,
    }),
  };

  return flutterwaveRequest<FlutterwavePaymentLink>("/payments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function verifyFlutterwaveTransaction(transactionId: string) {
  const normalizedId = transactionId.trim();
  if (!normalizedId || normalizedId.length > 120) {
    throw new FlutterwaveError("Flutterwave transaction ID is required", 400);
  }
  return flutterwaveRequest<FlutterwaveTransaction>(
    `/transactions/${encodeURIComponent(normalizedId)}/verify`,
    { method: "GET" },
  );
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Flutterwave has used both `verif-hash` (V3) and the newer
 * `flutterwave-signature` HMAC header. Accept either, but never accept an
 * unsigned webhook.
 */
export function verifyFlutterwaveWebhookSignature(input: {
  rawBody: string;
  flutterwaveSignature?: string | null;
  verifHash?: string | null;
}) {
  const secretHash = getFlutterwaveSecretHash();
  if (!secretHash) return false;

  const modernSignature = input.flutterwaveSignature?.trim();
  if (modernSignature) {
    const expected = crypto.createHmac("sha256", secretHash).update(input.rawBody, "utf8").digest("base64");
    return timingSafeEqual(expected, modernSignature);
  }

  const legacySignature = input.verifHash?.trim();
  return Boolean(legacySignature && timingSafeEqual(secretHash, legacySignature));
}
