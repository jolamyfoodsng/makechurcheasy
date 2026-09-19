/**
 * Read-only payment reporting from Flutterwave and Paystack.
 * Amounts stay in their transaction currency and only successful live
 * transactions are included.
 */

type PaymentProvider = "flutterwave" | "paystack";
type ProviderStatus =
  | "connected"
  | "partial"
  | "not_configured"
  | "test_mode"
  | "unauthorized"
  | "unavailable";

interface NormalizedTransaction {
  provider: PaymentProvider;
  currency: string;
  amount: number;
  settledAmount: number | null;
  paidAt: string;
}

interface ProviderRead {
  status: ProviderStatus;
  successfulTransactions: number;
  transactions: NormalizedTransaction[];
}

export interface PaymentCurrencySummary {
  currency: string;
  transactionCount: number;
  amount: number;
  settledTransactionCount: number;
  settledAmount: number | null;
  byProvider: Record<PaymentProvider, { transactionCount: number; amount: number }>;
  settlementByProvider: Record<PaymentProvider, { transactionCount: number; amount: number | null }>;
  monthly: Array<{ month: string; transactionCount: number; amount: number; settledTransactionCount: number; settledAmount: number | null }>;
}

export interface GatewayPaymentAnalytics {
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  historyStart: string;
  updatedAt: string;
  providers: Record<PaymentProvider, { status: ProviderStatus; successfulTransactions: number }>;
  currencies: PaymentCurrencySummary[];
}

type JsonRecord = Record<string, unknown>;

const PAGE_LIMIT = 50;
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 60_000;
const cache = new Map<number, { expiresAt: number; promise: Promise<GatewayPaymentAnalytics> }>();

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asFiniteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function roundAmount(value: number, currency: string): number {
  const digits = currencyDigits(currency);
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function roundSettlementAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function transactionDate(row: JsonRecord): Date | null {
  for (const value of [row.paid_at, row.created_at, row.transaction_date, row.createdAt]) {
    if (typeof value !== "string" && !(value instanceof Date)) continue;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return null;
}

function isTestSecret(secret: string, provider: PaymentProvider): boolean {
  return provider === "paystack"
    ? /(?:^|[_-])test(?:[_-]|$)/i.test(secret)
    : /test|sandbox/i.test(secret);
}

function fetchErrorStatus(status: number): ProviderStatus {
  return status === 401 || status === 403 ? "unauthorized" : "unavailable";
}

function readPageCount(body: JsonRecord, provider: PaymentProvider): number | null {
  const meta = asRecord(body.meta);
  if (provider === "paystack") {
    const count = asFiniteNumber(meta.pageCount ?? meta.page_count ?? meta.total_pages);
    return count != null && count > 0 ? Math.ceil(count) : null;
  }
  const pageInfo = asRecord(meta.page_info ?? meta.pagination);
  const count = asFiniteNumber(pageInfo.total_pages ?? pageInfo.totalPages ?? meta.total_pages);
  return count != null && count > 0 ? Math.ceil(count) : null;
}

function mapFlutterwaveTransaction(row: JsonRecord): NormalizedTransaction | null {
  const status = String(row.status ?? "").toLowerCase();
  const currency = String(row.currency ?? "").trim().toUpperCase();
  const amount = asFiniteNumber(row.amount);
  const settledAmount = asFiniteNumber(row.amount_settled);
  const paidAt = transactionDate(row);
  if (!["successful", "success"].includes(status) || !/^[A-Z]{3}$/.test(currency) || amount == null || amount <= 0 || !paidAt) {
    return null;
  }
  return {
    provider: "flutterwave",
    currency,
    amount: roundAmount(amount, currency),
    settledAmount: settledAmount != null && settledAmount >= 0 ? roundSettlementAmount(settledAmount) : null,
    paidAt: paidAt.toISOString(),
  };
}

function mapPaystackTransaction(row: JsonRecord): NormalizedTransaction | null {
  const status = String(row.status ?? "").toLowerCase();
  const domain = String(row.domain ?? "").toLowerCase();
  const currency = String(row.currency ?? "").trim().toUpperCase();
  const minorAmount = asFiniteNumber(row.amount);
  const paidAt = transactionDate(row);
  if (status !== "success" || domain === "test" || !/^[A-Z]{3}$/.test(currency) || minorAmount == null || minorAmount <= 0 || !paidAt) {
    return null;
  }
  const amount = minorAmount / 10 ** currencyDigits(currency);
  return { provider: "paystack", currency, amount: roundAmount(amount, currency), settledAmount: null, paidAt: paidAt.toISOString() };
}

async function readFlutterwave(from: string, to: string): Promise<ProviderRead> {
  const secret = process.env.FLW_SECRET_KEY?.trim();
  if (!secret) return { status: "not_configured", successfulTransactions: 0, transactions: [] };
  if (isTestSecret(secret, "flutterwave")) return { status: "test_mode", successfulTransactions: 0, transactions: [] };

  const transactions: NormalizedTransaction[] = [];
  let expectedPages: number | null = null;
  for (let page = 1; page <= PAGE_LIMIT; page++) {
    const query = new URLSearchParams({ from, to, page: String(page), status: "successful" });
    let response: Response;
    try {
      response = await fetch(`https://api.flutterwave.com/v3/transactions?${query}`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      } as RequestInit & { cache: "no-store" });
    } catch {
      return { status: "unavailable", successfulTransactions: 0, transactions: [] };
    }
    if (!response.ok) return { status: fetchErrorStatus(response.status), successfulTransactions: 0, transactions: [] };

    let body: JsonRecord;
    try {
      body = asRecord(await response.json());
    } catch {
      return { status: "unavailable", successfulTransactions: 0, transactions: [] };
    }
    if (String(body.status ?? "").toLowerCase() !== "success") {
      return { status: "unavailable", successfulTransactions: 0, transactions: [] };
    }

    const rows = asArray(body.data);
    transactions.push(...rows.map(mapFlutterwaveTransaction).filter((row): row is NormalizedTransaction => row != null));
    expectedPages ??= readPageCount(body, "flutterwave");
    if (expectedPages != null ? page >= expectedPages : rows.length === 0 || rows.length < 10) {
      return { status: "connected", successfulTransactions: transactions.length, transactions };
    }
  }
  return { status: "partial", successfulTransactions: transactions.length, transactions };
}

async function readPaystack(from: string, to: string): Promise<ProviderRead> {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return { status: "not_configured", successfulTransactions: 0, transactions: [] };
  if (isTestSecret(secret, "paystack")) return { status: "test_mode", successfulTransactions: 0, transactions: [] };

  const transactions: NormalizedTransaction[] = [];
  let expectedPages: number | null = null;
  for (let page = 1; page <= PAGE_LIMIT; page++) {
    const query = new URLSearchParams({ from, to, status: "success", perPage: "100", page: String(page) });
    let response: Response;
    try {
      response = await fetch(`https://api.paystack.co/transaction?${query}`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      } as RequestInit & { cache: "no-store" });
    } catch {
      return { status: "unavailable", successfulTransactions: 0, transactions: [] };
    }
    if (!response.ok) return { status: fetchErrorStatus(response.status), successfulTransactions: 0, transactions: [] };

    let body: JsonRecord;
    try {
      body = asRecord(await response.json());
    } catch {
      return { status: "unavailable", successfulTransactions: 0, transactions: [] };
    }
    if (body.status !== true) return { status: "unavailable", successfulTransactions: 0, transactions: [] };

    const rows = asArray(body.data);
    transactions.push(...rows.map(mapPaystackTransaction).filter((row): row is NormalizedTransaction => row != null));
    expectedPages ??= readPageCount(body, "paystack");
    if (expectedPages != null ? page >= expectedPages : rows.length < 100) {
      return { status: "connected", successfulTransactions: transactions.length, transactions };
    }
  }
  return { status: "partial", successfulTransactions: transactions.length, transactions };
}

function buildAnalytics(
  periodDays: number,
  now: Date,
  flutterwave: ProviderRead,
  paystack: ProviderRead,
): GatewayPaymentAnalytics {
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const historyStart = new Date(monthStart);
  const monthKeys: string[] = [];
  for (let offset = 0; offset < 12; offset++) {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth() + offset, 1);
    monthKeys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  const allTransactions = [...flutterwave.transactions, ...paystack.transactions].filter((transaction) => {
    const paidAt = new Date(transaction.paidAt);
    return paidAt >= historyStart && paidAt <= now;
  });
  const periodTransactions = allTransactions.filter((transaction) => new Date(transaction.paidAt) >= periodStart);
  const currencies = new Map<string, PaymentCurrencySummary>();

  const ensureCurrency = (currency: string): PaymentCurrencySummary => {
    let summary = currencies.get(currency);
    if (!summary) {
      summary = {
        currency,
        transactionCount: 0,
        amount: 0,
        settledTransactionCount: 0,
        settledAmount: null,
        byProvider: {
          flutterwave: { transactionCount: 0, amount: 0 },
          paystack: { transactionCount: 0, amount: 0 },
        },
        settlementByProvider: {
          flutterwave: { transactionCount: 0, amount: null },
          paystack: { transactionCount: 0, amount: null },
        },
        monthly: monthKeys.map((month) => ({ month, transactionCount: 0, amount: 0, settledTransactionCount: 0, settledAmount: null })),
      };
      currencies.set(currency, summary);
    }
    return summary;
  };

  for (const transaction of periodTransactions) {
    const summary = ensureCurrency(transaction.currency);
    summary.transactionCount++;
    summary.amount += transaction.amount;
    summary.byProvider[transaction.provider].transactionCount++;
    summary.byProvider[transaction.provider].amount += transaction.amount;
    if (transaction.settledAmount != null) {
      summary.settledTransactionCount++;
      summary.settledAmount = (summary.settledAmount ?? 0) + transaction.settledAmount;
      const settledProvider = summary.settlementByProvider[transaction.provider];
      settledProvider.transactionCount++;
      settledProvider.amount = (settledProvider.amount ?? 0) + transaction.settledAmount;
    }
  }
  for (const transaction of allTransactions) {
    const summary = ensureCurrency(transaction.currency);
    const month = transaction.paidAt.slice(0, 7);
    const monthSummary = summary.monthly.find((item) => item.month === month);
    if (!monthSummary) continue;
    monthSummary.transactionCount++;
    monthSummary.amount += transaction.amount;
    if (transaction.settledAmount != null) {
      monthSummary.settledTransactionCount++;
      monthSummary.settledAmount = (monthSummary.settledAmount ?? 0) + transaction.settledAmount;
    }
  }

  for (const summary of currencies.values()) {
    summary.amount = roundAmount(summary.amount, summary.currency);
    if (summary.settledAmount != null) summary.settledAmount = roundSettlementAmount(summary.settledAmount);
    for (const provider of ["flutterwave", "paystack"] as const) {
      summary.byProvider[provider].amount = roundAmount(summary.byProvider[provider].amount, summary.currency);
      const settled = summary.settlementByProvider[provider];
      if (settled.amount != null) settled.amount = roundSettlementAmount(settled.amount);
    }
    for (const month of summary.monthly) {
      month.amount = roundAmount(month.amount, summary.currency);
      if (month.settledAmount != null) month.settledAmount = roundSettlementAmount(month.settledAmount);
    }
  }

  return {
    periodDays,
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    historyStart: historyStart.toISOString(),
    updatedAt: now.toISOString(),
    providers: {
      flutterwave: { status: flutterwave.status, successfulTransactions: flutterwave.successfulTransactions },
      paystack: { status: paystack.status, successfulTransactions: paystack.successfulTransactions },
    },
    currencies: [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

async function loadAnalytics(periodDays: number): Promise<GatewayPaymentAnalytics> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const from = dateString(monthStart);
  const to = dateString(now);
  const [flutterwave, paystack] = await Promise.all([
    readFlutterwave(from, to),
    readPaystack(from, to),
  ]);
  return buildAnalytics(periodDays, now, flutterwave, paystack);
}

/** Fetches live gateway records with a short in-process cache; all requests are GET-only. */
export function getGatewayPaymentAnalytics(periodDays = 30): Promise<GatewayPaymentAnalytics> {
  const boundedDays = Math.max(1, Math.min(90, Math.floor(periodDays)));
  const now = Date.now();
  const cached = cache.get(boundedDays);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = loadAnalytics(boundedDays).catch((error) => {
    cache.delete(boundedDays);
    throw error;
  });
  cache.set(boundedDays, { expiresAt: now + CACHE_TTL_MS, promise });
  return promise;
}
