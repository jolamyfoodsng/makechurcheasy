import { headers as getRequestHeaders } from "next/headers";
import { escapeTelegramHtml, sendTelegramMessage } from "./telegramNotifications";

const DEFAULT_ERROR_COOLDOWN_MS = 60_000;
const MAX_TELEGRAM_MESSAGE_LENGTH = 3_900;

type HeaderValue = string | string[] | undefined;
export type ApiErrorHeaders = Headers | Readonly<Record<string, HeaderValue>>;

export interface ApiErrorRequestSnapshot {
  path?: string;
  method?: string;
  headers?: ApiErrorHeaders;
}

export interface ApiErrorAlertContext {
  error: unknown;
  statusCode?: number;
  routePath?: string;
  method?: string;
  requestId?: string;
  request?: ApiErrorRequestSnapshot;
  category?: "response" | "exception";
}

export interface TelegramApiErrorMessageDetails {
  alertId: string;
  requestId: string;
  statusCode: number;
  routePath: string;
  method: string;
  errorName: string;
  errorMessage: string;
  stack?: string;
  identity: string;
  appVersion: string;
  userAgent: string;
  category: "response" | "exception";
  repeatedCount?: number;
  environment: string;
  occurredAt: string;
}

const recentAlerts = new Map<string, { sentAt: number; suppressedCount: number }>();

function getHeader(source: ApiErrorHeaders | undefined, name: string): string {
  if (!source) return "";

  if (typeof (source as Headers).get === "function") {
    return (source as Headers).get(name) || "";
  }

  const expectedName = name.toLowerCase();
  for (const [key, value] of Object.entries(source)) {
    if (key.toLowerCase() !== expectedName) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }

  return "";
}

function trimValue(value: unknown, fallback = "Unknown"): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/(bot\d{5,}:[A-Za-z0-9_-]+)/gi, "[REDACTED_TELEGRAM_TOKEN]")
    .replace(/([?&](?:token|key|secret|password|signature|sig)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/((?:password|passwd|secret|token|api[_-]?key|authorization|cookie)\s*[:=]\s*)[^,;\s]+/gi, "$1[REDACTED]");
}

function safeText(value: unknown, fallback: string, maxLength: number): string {
  return truncate(redactSensitiveText(trimValue(value, fallback)), maxLength);
}

function describeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: safeText(error.name, "Error", 120),
      message: safeText(error.message, "Unknown error", 900),
      stack: error.stack ? safeText(error.stack, "", 1_100) : undefined,
    };
  }

  if (typeof error === "string") {
    return { name: "Error", message: safeText(error, "Unknown error", 900) };
  }

  try {
    return {
      name: "Error",
      message: safeText(JSON.stringify(error), "Unknown error", 900),
    };
  } catch {
    return { name: "Error", message: "Unknown error" };
  }
}

function shortIdentifier(value: string): string {
  const normalized = trimValue(value, "");
  if (!normalized) return "Unknown";
  if (normalized.length <= 18) return normalized;
  return `${normalized.slice(0, 6)}…${normalized.slice(-6)}`;
}

async function hashIdentifier(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

async function getIdentity(headers: ApiErrorHeaders | undefined): Promise<string> {
  const parts: string[] = [];
  const userId = getHeader(headers, "x-user-id");
  const deviceId = getHeader(headers, "x-mce-device-id") || getHeader(headers, "x-device-id");
  const authorization = getHeader(headers, "authorization");
  const cookie = getHeader(headers, "cookie");

  if (userId) parts.push(`user ${shortIdentifier(userId)}`);
  if (deviceId) parts.push(`device ${shortIdentifier(deviceId)}`);
  if (authorization) parts.push(`api-key ${await hashIdentifier(authorization)}`);
  if (!authorization && /(?:^|;\s*)session-token=/i.test(cookie)) parts.push("web session");

  return parts.join(" · ") || "Unauthenticated/unknown";
}

function getCooldownMs(env: NodeJS.ProcessEnv): number {
  const configured = Number(env.TELEGRAM_API_ERROR_COOLDOWN_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_ERROR_COOLDOWN_MS;
}

function isDisabled(value: string | undefined): boolean {
  return ["0", "false", "off"].includes(value?.trim().toLowerCase() || "");
}

function requestPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Unknown API route";
  try {
    return new URL(trimmed, "http://mce.local").pathname;
  } catch {
    return trimmed.split("?", 1)[0] || "Unknown API route";
  }
}

function getResponseErrorMessage(body: unknown, statusCode: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["error", "message", "detail", "description"]) {
      if (typeof record[key] === "string" && record[key].trim()) return record[key] as string;
    }
  }
  if (typeof body === "string" && body.trim()) return body;
  return `HTTP ${statusCode}`;
}

export function buildTelegramApiErrorMessage(
  details: TelegramApiErrorMessageDetails,
): string {
  const repeated = details.repeatedCount
    ? `\n<b>Repeated:</b> ${details.repeatedCount} similar alert(s) since the last notification`
    : "";
  const stack = details.stack ? `\n<b>Stack:</b>\n<pre>${escapeTelegramHtml(details.stack)}</pre>` : "";

  const message = [
    `🚨 <b>MakeChurchEasy API ${details.category === "response" ? "error response" : "exception"}</b>`,
    `<b>Alert ID:</b> ${escapeTelegramHtml(details.alertId)}`,
    `<b>Request ID:</b> ${escapeTelegramHtml(details.requestId)}`,
    `<b>Status:</b> ${details.statusCode}`,
    `<b>Request:</b> ${escapeTelegramHtml(`${details.method} ${details.routePath}`)}`,
    `<b>Identity:</b> ${escapeTelegramHtml(details.identity)}`,
    `<b>App:</b> ${escapeTelegramHtml(details.appVersion)}`,
    `<b>Environment:</b> ${escapeTelegramHtml(details.environment)}`,
    `<b>Error:</b> ${escapeTelegramHtml(`${details.errorName}: ${details.errorMessage}`)}`,
    `<b>Time:</b> ${escapeTelegramHtml(details.occurredAt)}`,
    details.userAgent ? `<b>User agent:</b> ${escapeTelegramHtml(details.userAgent)}` : "",
    repeated,
    stack,
  ].filter(Boolean).join("\n");

  return truncate(message, MAX_TELEGRAM_MESSAGE_LENGTH);
}

export async function notifyTelegramApiError(
  context: ApiErrorAlertContext,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (isDisabled(env.TELEGRAM_API_ERROR_ALERTS_ENABLED)) return false;

  const requestHeaders = context.request?.headers;
  const routePath = requestPath(
    context.routePath
      || context.request?.path
      || getHeader(requestHeaders, "x-mce-api-path"),
  );
  if (!routePath.startsWith("/api/")) return false;

  const details = describeError(context.error);
  const statusCode = context.statusCode || 500;
  const method = trimValue(
    context.method || context.request?.method || getHeader(requestHeaders, "x-mce-api-method"),
    "UNKNOWN",
  ).toUpperCase();
  const requestId = trimValue(
    context.requestId || getHeader(requestHeaders, "x-request-id"),
    `mce-${globalThis.crypto.randomUUID()}`,
  );
  const fingerprint = await hashIdentifier(`${statusCode}|${method}|${routePath}|${details.name}|${details.message}`);
  const now = Date.now();
  const previous = recentAlerts.get(fingerprint);
  const cooldownMs = getCooldownMs(env);

  if (previous && now - previous.sentAt < cooldownMs) {
    previous.suppressedCount += 1;
    return false;
  }

  const repeatedCount = previous?.suppressedCount || 0;
  recentAlerts.set(fingerprint, { sentAt: now, suppressedCount: 0 });

  return sendTelegramMessage(
    buildTelegramApiErrorMessage({
      alertId: `mce-api-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      requestId,
      statusCode,
      routePath,
      method,
      errorName: details.name,
      errorMessage: details.message,
      stack: details.stack,
      identity: await getIdentity(requestHeaders),
      appVersion: safeText(getHeader(requestHeaders, "x-app-version"), "Unknown", 120),
      userAgent: safeText(getHeader(requestHeaders, "user-agent"), "", 180),
      category: context.category || "exception",
      repeatedCount,
      environment: safeText(env.APP_ENV || env.VERCEL_ENV || env.NODE_ENV, "unknown", 80),
      occurredAt: new Date(now).toISOString(),
    }),
    env,
    { ignoreNotificationsToggle: true },
  );
}

export async function notifyCurrentApiError(
  error: unknown,
  options: Omit<ApiErrorAlertContext, "error" | "request"> = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  let requestHeaders: Headers | undefined;
  try {
    requestHeaders = await getRequestHeaders();
  } catch {
    // This can be called outside a request; the instrumentation hook still has a snapshot.
  }

  return notifyTelegramApiError({
    ...options,
    error,
    request: {
      path: getHeader(requestHeaders, "x-mce-api-path"),
      method: getHeader(requestHeaders, "x-mce-api-method"),
      headers: requestHeaders,
    },
  }, env);
}

export function observeApiResponseError(
  statusCode: number,
  body: unknown,
): void {
  if (statusCode < 400) return;
  void notifyCurrentApiError(
    new Error(getResponseErrorMessage(body, statusCode)),
    { statusCode, category: "response" },
  ).catch((error) => {
    console.warn("[api-error-alert] failed to notify Telegram:", error instanceof Error ? error.message : error);
  });
}

export function resetApiErrorAlertStateForTests(): void {
  recentAlerts.clear();
}
