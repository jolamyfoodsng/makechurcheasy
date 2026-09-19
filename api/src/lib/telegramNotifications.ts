const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const TELEGRAM_REQUEST_TIMEOUT_MS = 4_000;
const DEFAULT_NOTIFICATION_TIME_ZONE = "Africa/Lagos";

export interface TelegramSignupDetails {
  name?: unknown;
  country?: unknown;
  createdAt?: string | Date;
  source?: string;
}

export interface TelegramCheckoutDetails {
  name?: unknown;
  country?: unknown;
  plan: string;
  billingCycle: string;
  paymentMethod: string;
  createdAt?: string | Date;
  amount?: number;
  currency?: string;
}

export interface TelegramSignupReportDetails {
  dateLabel: string;
  monthLabel: string;
  timezone: string;
  dailySignups: number;
  monthlySignups: number;
  totalUsers: number;
  isMonthEnd: boolean;
}

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayCountry(value: unknown): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return "Unknown";

  if (/^[A-Z]{2}$/.test(normalized)) {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) || normalized;
    } catch {
      return normalized;
    }
  }

  return String(value).trim();
}

function displayDate(value: string | Date | undefined, env: NodeJS.ProcessEnv): string {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) return "Unknown";

  try {
    return new Intl.DateTimeFormat("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: env.TELEGRAM_NOTIFICATION_TIMEZONE?.trim() || DEFAULT_NOTIFICATION_TIME_ZONE,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function displayValue(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

export function buildTelegramSignupMessage(
  details: TelegramSignupDetails,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const source = details.source ? `\n<b>Source:</b> ${escapeTelegramHtml(details.source)}` : "";
  return [
    "🆕 <b>New MakeChurchEasy signup</b>",
    `<b>Name:</b> ${escapeTelegramHtml(displayValue(details.name, "Unknown"))}`,
    `<b>Country:</b> ${escapeTelegramHtml(displayCountry(details.country))}`,
    `<b>Signed up:</b> ${escapeTelegramHtml(displayDate(details.createdAt, env))}${source}`,
  ].join("\n");
}

export function buildTelegramCheckoutMessage(
  details: TelegramCheckoutDetails,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const amount = typeof details.amount === "number" && Number.isFinite(details.amount)
    ? `\n<b>Amount:</b> ${escapeTelegramHtml(`${details.currency || ""} ${details.amount}`.trim())}`
    : "";

  return [
    "💳 <b>Checkout started</b>",
    `<b>Name:</b> ${escapeTelegramHtml(displayValue(details.name, "Unknown"))}`,
    `<b>Country:</b> ${escapeTelegramHtml(displayCountry(details.country))}`,
    `<b>Plan:</b> ${escapeTelegramHtml(displayValue(details.plan, "Unknown"))}`,
    `<b>Billing:</b> ${escapeTelegramHtml(displayValue(details.billingCycle, "Unknown"))}`,
    `<b>Payment:</b> ${escapeTelegramHtml(displayValue(details.paymentMethod, "Unknown"))}${amount}`,
    `<b>Started:</b> ${escapeTelegramHtml(displayDate(details.createdAt, env))}`,
  ].join("\n");
}

function formatSignupCount(value: number): string {
  const count = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return `${count.toLocaleString("en-US")} ${count === 1 ? "signup" : "signups"}`;
}

export function buildTelegramSignupReportMessage(
  details: TelegramSignupReportDetails,
): string {
  const monthLine = details.isMonthEnd
    ? `<b>Month total (${escapeTelegramHtml(details.monthLabel)}):</b> ${escapeTelegramHtml(formatSignupCount(details.monthlySignups))}`
    : `<b>Month to date (${escapeTelegramHtml(details.monthLabel)}):</b> ${escapeTelegramHtml(formatSignupCount(details.monthlySignups))}`;

  return [
    "📈 <b>MakeChurchEasy signup report</b>",
    `<b>Date:</b> ${escapeTelegramHtml(details.dateLabel)}`,
    `<b>Timezone:</b> ${escapeTelegramHtml(details.timezone)}`,
    `<b>Today:</b> ${escapeTelegramHtml(formatSignupCount(details.dailySignups))}`,
    monthLine,
    `<b>All-time users:</b> ${escapeTelegramHtml(details.totalUsers.toLocaleString("en-US"))}`,
  ].join("\n");
}

export async function sendTelegramMessage(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { ignoreNotificationsToggle?: boolean } = {},
): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  const disabled = !options.ignoreNotificationsToggle
    && ["0", "false", "off"].includes(env.TELEGRAM_NOTIFICATIONS_ENABLED?.trim().toLowerCase() || "");

  if (disabled || !token || !chatId) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as { ok?: unknown; description?: unknown } | null;

    if (!response.ok || payload?.ok !== true) {
      console.warn("[telegram] sendMessage failed:", payload?.description || `HTTP ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[telegram] notification failed:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function notifyTelegramNewSignup(
  details: TelegramSignupDetails,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  return sendTelegramMessage(buildTelegramSignupMessage(details, env), env);
}

export function notifyTelegramCheckoutStarted(
  details: TelegramCheckoutDetails,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  return sendTelegramMessage(buildTelegramCheckoutMessage(details, env), env);
}

export function notifyTelegramSignupReport(
  details: TelegramSignupReportDetails,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  return sendTelegramMessage(buildTelegramSignupReportMessage(details), env);
}
