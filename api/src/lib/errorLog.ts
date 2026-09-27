/**
 * errorLog.ts — Error logging & Telegram alerting utility.
 *
 * Persists user and runtime errors to the `error_logs` MongoDB collection
 * and pushes real-time Telegram alerts with user context and error details.
 */

import clientPromise from "./mongodb";
import { escapeTelegramHtml, sendTelegramMessage } from "./telegramNotifications";

export interface BreadcrumbItem {
  type: "click" | "navigation" | "input" | "error";
  target?: string;
  text?: string;
  url?: string;
  timestamp: string;
}

export interface ErrorLogEvent {
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  churchName?: string | null;
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  url: string;
  pathname?: string;
  action?: string; // What the user clicked on or did
  breadcrumbs?: BreadcrumbItem[];
  userAgent?: string;
  source?: "client" | "server";
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

// In-memory cooldown cache to prevent flooding Telegram with identical errors
const telegramCooldownMap = new Map<string, number>();
const TELEGRAM_ALERT_COOLDOWN_MS = 30_000; // 30 seconds per unique error fingerprint
const MAX_TELEGRAM_MESSAGE_LENGTH = 3_900;

function truncate(text: string, maxLength: number): string {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * Format and send a Telegram alert when a user encounters an error.
 */
export async function sendTelegramUserErrorAlert(
  event: ErrorLogEvent,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  try {
    // Generate an error fingerprint for cooldown
    const fingerprint = `${event.userEmail || event.userId || "anon"}:${event.message}:${event.pathname || event.url}`;
    const now = Date.now();
    const lastSent = telegramCooldownMap.get(fingerprint);

    if (lastSent && now - lastSent < TELEGRAM_ALERT_COOLDOWN_MS) {
      return false; // Suppressed by cooldown
    }
    telegramCooldownMap.set(fingerprint, now);

    // Clean up old cache entries periodically
    if (telegramCooldownMap.size > 500) {
      telegramCooldownMap.forEach((timestamp, key) => {
        if (now - timestamp > TELEGRAM_ALERT_COOLDOWN_MS * 2) {
          telegramCooldownMap.delete(key);
        }
      });
    }

    const lines: string[] = [
      "🚨 <b>MakeChurchEasy User Error Alert</b>",
      "",
      `<b>👤 User:</b> ${escapeTelegramHtml(event.userName || "Unknown")} (${escapeTelegramHtml(event.userEmail || "Unauthenticated")})`,
    ];

    if (event.churchName) {
      lines.push(`<b>⛪ Church:</b> ${escapeTelegramHtml(event.churchName)}`);
    }

    if (event.userId) {
      lines.push(`<b>🆔 User ID:</b> <code>${escapeTelegramHtml(event.userId)}</code>`);
    }

    lines.push(
      `<b>📍 Page:</b> <code>${escapeTelegramHtml(event.pathname || event.url)}</code>`,
    );

    if (event.action) {
      lines.push(`<b>🖱️ User Action:</b> ${escapeTelegramHtml(event.action)}`);
    }

    lines.push(
      `<b>⚠️ Error:</b> ${escapeTelegramHtml(event.message || "Unknown error")}`,
      `<b>⏰ Time:</b> ${escapeTelegramHtml(new Date().toISOString())}`,
    );

    if (event.breadcrumbs && event.breadcrumbs.length > 0) {
      const recent = event.breadcrumbs.slice(-4).map((b) => {
        const itemText = b.text ? ` "${truncate(b.text, 30)}"` : "";
        const itemTarget = b.target ? ` [${truncate(b.target, 35)}]` : "";
        return `• ${escapeTelegramHtml(b.type)}${itemTarget}${itemText}`;
      }).join("\n");
      lines.push("", `<b>🐾 Recent Actions:</b>\n${recent}`);
    }

    if (event.stack) {
      const truncatedStack = truncate(event.stack, 1_200);
      lines.push("", `<b>Stack Trace:</b>\n<pre>${escapeTelegramHtml(truncatedStack)}</pre>`);
    }

    const fullMessage = truncate(lines.join("\n"), MAX_TELEGRAM_MESSAGE_LENGTH);
    return await sendTelegramMessage(fullMessage, env);
  } catch (err) {
    console.error("[errorLog] Failed to send Telegram alert:", err);
    return false;
  }
}

/**
 * Persist an error event to the database and trigger notification.
 */
export async function logErrorEvent(event: ErrorLogEvent): Promise<string | null> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const doc = {
      userId: event.userId ? String(event.userId) : null,
      userEmail: event.userEmail ? event.userEmail.toLowerCase().trim() : null,
      userName: event.userName || null,
      churchName: event.churchName || null,
      message: event.message || "Unknown error",
      name: event.name || "Error",
      stack: event.stack || null,
      componentStack: event.componentStack || null,
      url: event.url,
      pathname: event.pathname || (event.url ? new URL(event.url, "http://mce.local").pathname : "/"),
      action: event.action || null,
      breadcrumbs: event.breadcrumbs || [],
      userAgent: event.userAgent || null,
      source: event.source || "client",
      metadata: event.metadata || {},
      createdAt: event.createdAt || new Date(),
    };

    const res = await db.collection("error_logs").insertOne(doc);

    // Trigger Telegram notification in the background
    sendTelegramUserErrorAlert(event).catch(() => {});

    return res.insertedId.toString();
  } catch (err) {
    console.error("[errorLog] Failed to write error log to MongoDB:", err);
    return null;
  }
}

/**
 * Query paginated error logs with optional filters and search.
 */
export async function getErrorLogs(opts: {
  page?: number;
  limit?: number;
  search?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{
  logs: Array<Record<string, unknown>>;
  total: number;
  todayCount: number;
  uniqueUsersCount: number;
}> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const skip = (page - 1) * limit;

  const client = await clientPromise;
  const db = client.db();
  const col = db.collection("error_logs");

  const filter: Record<string, unknown> = {};

  if (opts.userId) {
    filter.$or = [
      { userId: opts.userId },
      { userId: opts.userId.toString() },
    ];
  }

  if (opts.search && opts.search.trim()) {
    const q = opts.search.trim();
    const regex = { $regex: q, $options: "i" };
    filter.$or = [
      { message: regex },
      { userEmail: regex },
      { userName: regex },
      { churchName: regex },
      { pathname: regex },
      { action: regex },
      { stack: regex },
    ];
  }

  if (opts.startDate || opts.endDate) {
    const dateFilter: Record<string, unknown> = {};
    if (opts.startDate) dateFilter.$gte = new Date(opts.startDate);
    if (opts.endDate) dateFilter.$lte = new Date(opts.endDate);
    filter.createdAt = dateFilter;
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [total, rawLogs, todayCount, uniqueUsers] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments({ createdAt: { $gte: startOfToday } }),
    col.distinct("userId", { userId: { $ne: null } }),
  ]);

  const logs = rawLogs.map((item) => ({
    id: item._id.toString(),
    userId: item.userId,
    userEmail: item.userEmail,
    userName: item.userName,
    churchName: item.churchName,
    message: item.message,
    name: item.name,
    stack: item.stack,
    componentStack: item.componentStack,
    url: item.url,
    pathname: item.pathname,
    action: item.action,
    breadcrumbs: item.breadcrumbs,
    userAgent: item.userAgent,
    source: item.source,
    metadata: item.metadata,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
  }));

  return {
    logs,
    total,
    todayCount,
    uniqueUsersCount: uniqueUsers.length,
  };
}

/**
 * Fetch error logs for an individual user by userId or email.
 */
export async function getUserErrorLogs(
  userId: string,
  userEmail?: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{ logs: Array<Record<string, unknown>>; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const skip = (page - 1) * limit;

  const client = await clientPromise;
  const db = client.db();
  const col = db.collection("error_logs");

  const conditions: Array<Record<string, unknown>> = [
    { userId: userId },
    { userId: userId.toString() },
  ];

  if (userEmail && userEmail.trim()) {
    conditions.push({ userEmail: userEmail.toLowerCase().trim() });
  }

  const filter = { $or: conditions };

  const [total, rawLogs] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
  ]);

  const logs = rawLogs.map((item) => ({
    id: item._id.toString(),
    userId: item.userId,
    userEmail: item.userEmail,
    userName: item.userName,
    churchName: item.churchName,
    message: item.message,
    name: item.name,
    stack: item.stack,
    componentStack: item.componentStack,
    url: item.url,
    pathname: item.pathname,
    action: item.action,
    breadcrumbs: item.breadcrumbs,
    userAgent: item.userAgent,
    source: item.source,
    metadata: item.metadata,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
  }));

  return { logs, total };
}
