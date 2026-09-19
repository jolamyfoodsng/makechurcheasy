import crypto from "node:crypto";

const DEFAULT_API_BASE = "https://api.nowpayments.io";
const DEFAULT_SUPPORTED_PRICE_CURRENCIES = new Set([
  "ARS", "AUD", "BRL", "CAD", "CHF", "CLP", "CNY", "EUR", "GBP", "IDR",
  "ILS", "INR", "JPY", "KRW", "MXN", "MYR", "NGN", "NOK", "NZD", "PEN",
  "PHP", "PLN", "RON", "RUB", "SEK", "SGD", "THB", "TRY", "UAH", "USD",
  "VND", "ZAR",
]);

export class NowPaymentsError extends Error {
  constructor(
    message: string,
    public statusCode = 502,
  ) {
    super(message);
    this.name = "NowPaymentsError";
  }
}

export interface NowPaymentsInvoice {
  id?: string | number;
  invoice_url?: string;
  created_at?: string;
  order_id?: string;
  order_description?: string;
  price_amount?: number;
  price_currency?: string;
  [key: string]: unknown;
}

export interface NowPaymentsPaymentStatus {
  payment_id?: string | number;
  invoice_id?: string | number | null;
  payment_status?: string;
  price_amount?: number;
  price_currency?: string;
  order_id?: string | null;
  order_description?: string | null;
  actually_paid?: number;
  pay_amount?: number;
  pay_currency?: string;
  outcome_amount?: number;
  outcome_currency?: string;
  [key: string]: unknown;
}

export function isNowPaymentsConfigured(): boolean {
  return Boolean(process.env.NOWPAYMENTS_API_KEY?.trim() && process.env.NOWPAYMENTS_IPN_SECRET?.trim());
}

export function getNowPaymentsIpnCallbackUrl(): string {
  const configured = process.env.NOWPAYMENTS_IPN_CALLBACK_URL?.trim();
  if (configured) return configured;

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return `${apiUrl}/api/webhooks/nowpayments`;
}

export function hasExplicitNowPaymentsCallbackUrl(): boolean {
  return Boolean(process.env.NOWPAYMENTS_IPN_CALLBACK_URL?.trim());
}

export function isNowPaymentsPriceCurrencySupported(currency: string): boolean {
  const configured = process.env.NOWPAYMENTS_SUPPORTED_PRICE_CURRENCIES
    ?.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const supported = configured?.length ? new Set(configured) : DEFAULT_SUPPORTED_PRICE_CURRENCIES;
  return supported.has(currency.trim().toUpperCase());
}

function apiBase(): string {
  return (process.env.NOWPAYMENTS_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, "");
}

function apiKey(): string {
  return process.env.NOWPAYMENTS_API_KEY?.trim() || "";
}

function ipnSecret(): string {
  return process.env.NOWPAYMENTS_IPN_SECRET?.trim() || "";
}

async function parseResponse(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return { message: raw.slice(0, 500) };
  }
}

async function nowPaymentsRequest<T extends Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!apiKey()) {
    throw new NowPaymentsError("NOWPayments is not configured", 500);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "x-api-key": apiKey(),
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const data = await parseResponse(res);
    if (!res.ok) {
      const message = String(data.message || data.error || `NOWPayments request failed (${res.status})`);
      throw new NowPaymentsError(message, res.status >= 400 && res.status < 500 ? res.status : 502);
    }
    return data as T;
  } catch (error) {
    if (error instanceof NowPaymentsError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new NowPaymentsError("NOWPayments request timed out", 504);
    }
    throw new NowPaymentsError("Could not reach NOWPayments", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function createNowPaymentsInvoice(input: {
  amount: number;
  currency: string;
  orderId: string;
  description: string;
  ipnCallbackUrl: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<NowPaymentsInvoice> {
  const body: Record<string, unknown> = {
    price_amount: Number(input.amount.toFixed(2)),
    price_currency: input.currency.trim().toLowerCase(),
    order_id: input.orderId,
    order_description: input.description,
    ipn_callback_url: input.ipnCallbackUrl,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };

  const defaultPayCurrency = process.env.NOWPAYMENTS_DEFAULT_PAY_CURRENCY?.trim();
  if (defaultPayCurrency) body.pay_currency = defaultPayCurrency.toLowerCase();
  if (process.env.NOWPAYMENTS_FEE_PAID_BY_USER === "true") body.is_fee_paid_by_user = true;
  if (process.env.NOWPAYMENTS_FIXED_RATE === "true") body.is_fixed_rate = true;

  return nowPaymentsRequest<NowPaymentsInvoice>("/v1/invoice", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getNowPaymentsPaymentStatus(paymentId: string): Promise<NowPaymentsPaymentStatus> {
  return nowPaymentsRequest<NowPaymentsPaymentStatus>(`/v1/payment/${encodeURIComponent(paymentId)}`, {
    method: "GET",
  });
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = sortObject((value as Record<string, unknown>)[key]);
      return result;
    }, {});
}

export function getNowPaymentsSignaturePayload(payload: unknown): string {
  return JSON.stringify(sortObject(payload));
}

export function verifyNowPaymentsSignature(payload: unknown, signature: string | null): boolean {
  const secret = ipnSecret();
  if (!secret || !signature) return false;

  const digest = crypto
    .createHmac("sha512", secret)
    .update(getNowPaymentsSignaturePayload(payload))
    .digest("hex");

  const received = signature.trim().toLowerCase();
  if (received.length !== digest.length) return false;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(received));
}
