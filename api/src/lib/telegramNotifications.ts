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

export interface PlanCount {
  plan: string;
  count: number;
  percentage?: number;
}

export interface CountryCount {
  countryCode: string;
  countryName: string;
  count: number;
  flag?: string;
  percentage?: number;
}

export interface TodaySignupItem {
  name?: string;
  country?: string;
  plan?: string;
}

export interface TelegramSignupReportDetails {
  dateLabel: string;
  monthLabel: string;
  timezone: string;
  dailySignups: number;
  weeklySignups?: number;
  monthlySignups: number;
  totalUsers: number;
  isMonthEnd: boolean;
  activeUsersToday?: number;
  activeUsersWeek?: number;
  planBreakdown?: PlanCount[];
  countryBreakdown?: CountryCount[];
  todaySignupsList?: TodaySignupItem[];
}

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function getCountryFlag(code: string): string {
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "🌐";
  const codePoints = normalized.split("").map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function formatPlanName(plan: string): string {
  const normalized = String(plan ?? "").trim().toLowerCase();
  if (!normalized || normalized === "free") return "Free";
  if (normalized === "basic") return "Basic";
  if (normalized === "growth") return "Growth";
  if (normalized === "pro") return "Pro";
  if (normalized === "trial") return "Trial";
  if (normalized === "enterprise") return "Enterprise";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function displayCountry(value: unknown): string {
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

export type NotificationEnv = Record<string, string | undefined>;

function displayDate(value: string | Date | undefined, env: NotificationEnv = process.env): string {
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
  env: NotificationEnv = process.env,
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
  env: NotificationEnv = process.env,
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
  const isDetailed = Boolean(
    typeof details.weeklySignups === "number"
    || typeof details.activeUsersToday === "number"
    || typeof details.activeUsersWeek === "number"
    || (details.planBreakdown && details.planBreakdown.length > 0)
    || (details.countryBreakdown && details.countryBreakdown.length > 0),
  );

  const monthLine = details.isMonthEnd
    ? `<b>Month total (${escapeTelegramHtml(details.monthLabel)}):</b> ${escapeTelegramHtml(formatSignupCount(details.monthlySignups))}`
    : `<b>Month to date (${escapeTelegramHtml(details.monthLabel)}):</b> ${escapeTelegramHtml(formatSignupCount(details.monthlySignups))}`;

  // If not in detailed mode (e.g. basic mock call without the extra metrics), preserve classic compact output
  if (!isDetailed) {
    return [
      "📈 <b>MakeChurchEasy signup report</b>",
      `<b>Date:</b> ${escapeTelegramHtml(details.dateLabel)}`,
      `<b>Timezone:</b> ${escapeTelegramHtml(details.timezone)}`,
      `<b>Today:</b> ${escapeTelegramHtml(formatSignupCount(details.dailySignups))}`,
      monthLine,
      `<b>All-time users:</b> ${escapeTelegramHtml(details.totalUsers.toLocaleString("en-US"))}`,
    ].join("\n");
  }

  // Full descriptive executive report
  const lines: string[] = [
    "📊 <b>MakeChurchEasy Daily Executive Report</b>",
    `<b>Date:</b> ${escapeTelegramHtml(details.dateLabel)}`,
    `<b>Timezone:</b> ${escapeTelegramHtml(details.timezone)} (11:00 PM update)`,
    "",
    "👥 <b>USERS & SIGNUPS</b>",
    `• <b>Total Users:</b> ${escapeTelegramHtml(details.totalUsers.toLocaleString("en-US"))}`,
    `• <b>Today:</b> ${escapeTelegramHtml(formatSignupCount(details.dailySignups))}`,
  ];

  if (typeof details.weeklySignups === "number") {
    lines.push(`• <b>Past 7 Days:</b> ${escapeTelegramHtml(formatSignupCount(details.weeklySignups))}`);
  }

  lines.push(`• ${monthLine}`);
  lines.push(`• <b>All-time users:</b> ${escapeTelegramHtml(details.totalUsers.toLocaleString("en-US"))}`);

  // Active Users section (DAU & WAU)
  if (typeof details.activeUsersToday === "number" || typeof details.activeUsersWeek === "number") {
    lines.push("", "⚡ <b>ACTIVE USERS</b>");
    if (typeof details.activeUsersToday === "number") {
      const dauPct = details.totalUsers > 0
        ? ` (${((details.activeUsersToday / details.totalUsers) * 100).toFixed(1)}% of users)`
        : "";
      lines.push(`• <b>Active Today (DAU):</b> ${details.activeUsersToday.toLocaleString("en-US")} users${dauPct}`);
    }
    if (typeof details.activeUsersWeek === "number") {
      const wauPct = details.totalUsers > 0
        ? ` (${((details.activeUsersWeek / details.totalUsers) * 100).toFixed(1)}% of users)`
        : "";
      lines.push(`• <b>Active This Week (WAU):</b> ${details.activeUsersWeek.toLocaleString("en-US")} users${wauPct}`);
    }
  }

  // Plan Breakdown section (Free, Basic, Growth, etc.)
  if (details.planBreakdown && details.planBreakdown.length > 0) {
    lines.push("", "💳 <b>PLAN BREAKDOWN</b>");
    for (const item of details.planBreakdown) {
      const planName = formatPlanName(item.plan);
      const pct = typeof item.percentage === "number" ? ` (${item.percentage}%)` : "";
      lines.push(`• <b>${escapeTelegramHtml(planName)}:</b> ${item.count.toLocaleString("en-US")}${pct}`);
    }
  }

  // Country Breakdown section
  if (details.countryBreakdown && details.countryBreakdown.length > 0) {
    lines.push("", "🌍 <b>TOP COUNTRIES</b>");
    for (const item of details.countryBreakdown) {
      const flag = item.flag || getCountryFlag(item.countryCode);
      const countryName = escapeTelegramHtml(item.countryName);
      const pct = typeof item.percentage === "number" ? ` (${item.percentage}%)` : "";
      lines.push(`• ${flag} <b>${countryName}:</b> ${item.count.toLocaleString("en-US")}${pct}`);
    }
  }

  // Today's New Signups (if any)
  if (details.todaySignupsList && details.todaySignupsList.length > 0) {
    lines.push("", "🆕 <b>Today's New Signups:</b>");
    for (const s of details.todaySignupsList) {
      const flag = s.country ? getCountryFlag(s.country) : "🌐";
      const cName = s.country ? displayCountry(s.country) : "Unknown";
      const planStr = s.plan ? ` (${formatPlanName(s.plan)})` : "";
      const nameStr = s.name ? escapeTelegramHtml(s.name) : "New User";
      lines.push(`• ${nameStr} — ${flag} ${escapeTelegramHtml(cName)}${escapeTelegramHtml(planStr)}`);
    }
  }

  return lines.join("\n");
}

export async function sendTelegramMessage(
  text: string,
  env: NotificationEnv = process.env,
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
  env: NotificationEnv = process.env,
): Promise<boolean> {
  return sendTelegramMessage(buildTelegramSignupMessage(details, env), env);
}

export function notifyTelegramCheckoutStarted(
  details: TelegramCheckoutDetails,
  env: NotificationEnv = process.env,
): Promise<boolean> {
  return sendTelegramMessage(buildTelegramCheckoutMessage(details, env), env);
}

export function notifyTelegramSignupReport(
  details: TelegramSignupReportDetails,
  env: NotificationEnv = process.env,
): Promise<boolean> {
  return sendTelegramMessage(buildTelegramSignupReportMessage(details), env);
}
