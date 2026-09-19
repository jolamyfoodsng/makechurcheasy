import crypto from "node:crypto";

const DEFAULT_SANDBOX_URL = "https://sandbox.momodeveloper.mtn.com";
const DEFAULT_PRODUCTION_URL = "https://proxy.momoapi.mtn.com";

const COUNTRY_DIAL_CODES: Record<string, string> = {
  NG: "234",
  GH: "233",
  UG: "256",
  ZA: "27",
  ZM: "260",
  CM: "237",
  CI: "225",
  BJ: "229",
  CG: "242",
  SZ: "268",
  GN: "224",
  LR: "231",
};

export type MtnMomoPaymentStatus = "PENDING" | "SUCCESSFUL" | "FAILED";

export interface MtnMomoPublicConfig {
  enabled: boolean;
  countryCode: string;
  currency: string;
  targetEnvironment: string;
  displayName: string;
}

export interface MtnMomoRequestStatus {
  status: MtnMomoPaymentStatus;
  reason?: string;
  financialTransactionId?: string;
  amount?: string;
  currency?: string;
  externalId?: string;
  payer?: { partyIdType?: string; partyId?: string };
}

export class MtnMomoError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
    public readonly providerCode?: string,
  ) {
    super(message);
    this.name = "MtnMomoError";
  }
}

interface MtnMomoPrivateConfig extends MtnMomoPublicConfig {
  baseUrl: string;
  collectionSubscriptionKey: string;
  apiUser: string;
  apiKey: string;
  callbackUrl: string;
}

let accessTokenCache: { token: string; expiresAt: number } | null = null;

function isEnabledFlag(value: string | undefined): boolean {
  return value !== "false" && value !== "0";
}

function splitCountries(value: string | undefined): string[] {
  return String(value || "GH")
    .split(",")
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean);
}

function getPrivateConfig(): MtnMomoPrivateConfig {
  const targetEnvironment = String(
    process.env.MTN_MOMO_TARGET_ENVIRONMENT || "sandbox",
  ).trim();
  const baseUrl = String(
    process.env.MTN_MOMO_BASE_URL ||
      (targetEnvironment === "sandbox" ? DEFAULT_SANDBOX_URL : DEFAULT_PRODUCTION_URL),
  ).replace(/\/$/, "");
  const countryCode = String(
    process.env.MTN_MOMO_COUNTRY_CODE || splitCountries(process.env.MTN_MOMO_ALLOWED_COUNTRIES)[0] || "GH",
  ).trim().toUpperCase();
  // MTN's shared sandbox accepts EUR; production uses the configured local
  // currency for the selected target environment/country.
  const currency = String(
    process.env.MTN_MOMO_CURRENCY || (targetEnvironment === "sandbox" ? "EUR" : "GHS"),
  ).trim().toUpperCase();
  const collectionSubscriptionKey = String(
    process.env.MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY || "",
  ).trim();
  const apiUser = String(process.env.MTN_MOMO_API_USER || "").trim();
  const apiKey = String(process.env.MTN_MOMO_API_KEY || "").trim();

  return {
    enabled:
      isEnabledFlag(process.env.MTN_MOMO_ENABLED) &&
      Boolean(collectionSubscriptionKey && apiUser && apiKey),
    countryCode,
    currency,
    targetEnvironment,
    displayName: "MTN MoMo",
    baseUrl,
    collectionSubscriptionKey,
    apiUser,
    apiKey,
    callbackUrl: String(process.env.MTN_MOMO_CALLBACK_URL || "").trim(),
  };
}

export function getMtnMomoPublicConfig(countryCode?: string): MtnMomoPublicConfig {
  const config = getPrivateConfig();
  const requestedCountry = String(countryCode || config.countryCode).trim().toUpperCase();
  const allowedCountries = splitCountries(process.env.MTN_MOMO_ALLOWED_COUNTRIES);
  const countryAllowed = allowedCountries.includes(requestedCountry);

  return {
    enabled: config.enabled && countryAllowed,
    countryCode: requestedCountry,
    currency: config.currency,
    targetEnvironment: config.targetEnvironment,
    displayName: config.displayName,
  };
}

export function isMtnMomoAvailable(countryCode: string, currency?: string): boolean {
  const publicConfig = getMtnMomoPublicConfig(countryCode);
  return publicConfig.enabled && (!currency || currency.toUpperCase() === publicConfig.currency);
}

export function normalizeMtnMsisdn(value: string, countryCode: string): string {
  const raw = String(value || "").trim();
  if (!raw) throw new MtnMomoError("Enter the MTN MoMo phone number.", 400);

  const digits = raw.replace(/\D/g, "");
  const dialCode = COUNTRY_DIAL_CODES[countryCode.toUpperCase()];
  if (!dialCode) {
    throw new MtnMomoError(
      `MTN MoMo phone formatting is not configured for ${countryCode.toUpperCase()}.`,
      400,
    );
  }

  const international = digits.startsWith(dialCode)
    ? digits
    : digits.startsWith("0")
      ? `${dialCode}${digits.slice(1)}`
      : `${dialCode}${digits}`;

  if (international.length < 9 || international.length > 15) {
    throw new MtnMomoError("Enter a valid MTN MoMo phone number.", 400);
  }

  return international;
}

function requestTimeoutMs(): number {
  const configured = Number(process.env.MTN_MOMO_REQUEST_TIMEOUT_MS || 10_000);
  return Number.isFinite(configured) && configured >= 1_000
    ? Math.min(configured, 30_000)
    : 10_000;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new MtnMomoError("MTN MoMo timed out. Please try again.", 504);
    }
    throw new MtnMomoError("MTN MoMo is temporarily unavailable.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function readProviderBody(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return { message: text.slice(0, 300) };
  }
}

async function getAccessToken(config: MtnMomoPrivateConfig): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 30_000) {
    return accessTokenCache.token;
  }

  const basic = Buffer.from(`${config.apiUser}:${config.apiKey}`).toString("base64");
  const response = await fetchWithTimeout(`${config.baseUrl}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Ocp-Apim-Subscription-Key": config.collectionSubscriptionKey,
      "X-Target-Environment": config.targetEnvironment,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });
  const body = await readProviderBody(response);

  if (!response.ok || !body.access_token) {
    throw new MtnMomoError(
      body.message || "MTN MoMo authentication failed.",
      response.status >= 400 ? response.status : 502,
      body.code,
    );
  }

  const expiresIn = Number(body.expires_in) || 3_600;
  accessTokenCache = {
    token: String(body.access_token),
    expiresAt: Date.now() + Math.max(60, expiresIn - 30) * 1_000,
  };
  return accessTokenCache.token;
}

function providerErrorMessage(body: Record<string, any>, fallback: string): string {
  return String(body.message || body.error || body.reason || fallback).slice(0, 300);
}

export async function createMtnMomoRequest(input: {
  providerReference?: string;
  amount: number;
  currency: string;
  countryCode: string;
  phone: string;
  externalId: string;
  payerMessage: string;
  payeeNote: string;
}): Promise<{ providerReference: string }> {
  const config = getPrivateConfig();
  if (!isMtnMomoAvailable(input.countryCode, input.currency)) {
    throw new MtnMomoError("MTN MoMo is not available for this account.", 403);
  }

  const providerReference = input.providerReference || crypto.randomUUID();
  const token = await getAccessToken(config);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-Reference-Id": providerReference,
    "X-Target-Environment": config.targetEnvironment,
    "Ocp-Apim-Subscription-Key": config.collectionSubscriptionKey,
    "Content-Type": "application/json",
  };
  if (config.callbackUrl) headers["X-Callback-Url"] = config.callbackUrl;

  const response = await fetchWithTimeout(`${config.baseUrl}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      amount: String(input.amount),
      currency: input.currency,
      externalId: input.externalId,
      payer: {
        partyIdType: "MSISDN",
        partyId: normalizeMtnMsisdn(input.phone, input.countryCode),
      },
      payerMessage: input.payerMessage,
      payeeNote: input.payeeNote,
    }),
  });
  const body = await readProviderBody(response);

  if (response.status !== 202) {
    throw new MtnMomoError(
      providerErrorMessage(body, "MTN MoMo could not start the payment."),
      response.status >= 400 ? response.status : 502,
      body.code,
    );
  }

  return { providerReference };
}

export async function getMtnMomoRequestStatus(
  providerReference: string,
): Promise<MtnMomoRequestStatus> {
  const config = getPrivateConfig();
  const token = await getAccessToken(config);
  const response = await fetchWithTimeout(
    `${config.baseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(providerReference)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Target-Environment": config.targetEnvironment,
        "Ocp-Apim-Subscription-Key": config.collectionSubscriptionKey,
      },
    },
  );
  const body = await readProviderBody(response);

  if (!response.ok) {
    throw new MtnMomoError(
      providerErrorMessage(body, "MTN MoMo payment status is unavailable."),
      response.status >= 400 ? response.status : 502,
      body.code,
    );
  }

  const normalized = String(body.status || "PENDING").toUpperCase();
  const status: MtnMomoPaymentStatus =
    normalized === "SUCCESSFUL" ? "SUCCESSFUL" : normalized === "FAILED" ? "FAILED" : "PENDING";

  return {
    status,
    reason: body.reason,
    financialTransactionId: body.financialTransactionId,
    amount: body.amount,
    currency: body.currency,
    externalId: body.externalId,
    payer: body.payer,
  };
}
