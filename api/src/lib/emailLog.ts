/**
 * emailLog.ts — Persistent email logging and audit trail.
 *
 * Records all emails dispatched by the system (transactional, notifications,
 * receipts, lifecycle) in the `email_logs` collection.
 */

import clientPromise from "./mongodb";

export interface EmailLogEvent {
  to: string;
  userId?: string | null;
  subject: string;
  html: string;
  previewText?: string;
  status: "sent" | "failed";
  provider?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

/**
 * Extract plain text preview snippet from HTML content.
 */
function extractPlainText(html: string, maxLength = 160): string {
  try {
    const stripped = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return stripped.slice(0, maxLength);
  } catch {
    return "";
  }
}

/**
 * Log an email event to MongoDB.
 * Never throws — email delivery flow is never disrupted by logging failures.
 */
export async function logEmailEvent(event: EmailLogEvent): Promise<string | null> {
  try {
    const client = await clientPromise;
    const db = client.db();

    const normalizedTo = event.to.toLowerCase().trim();
    let resolvedUserId = event.userId ? String(event.userId) : null;

    // If userId wasn't provided, attempt to look up user by email
    if (!resolvedUserId) {
      const user = await db
        .collection("users")
        .findOne({ email: normalizedTo }, { projection: { _id: 1 } });
      if (user?._id) {
        resolvedUserId = user._id.toString();
      }
    }

    const emailKey =
      (event.metadata?.emailKey as string) ||
      `email:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

    const doc = {
      emailKey,
      to: normalizedTo,
      recipientEmail: normalizedTo,
      userId: resolvedUserId,
      subject: event.subject || "(No Subject)",
      html: event.html || "",
      previewText: event.previewText || extractPlainText(event.html || ""),
      status: event.status,
      deliveryStatus: event.status === "sent" ? "delivered" : "failed",
      provider: event.provider || "default",
      error: event.error || null,
      metadata: event.metadata || {},
      createdAt: event.createdAt || new Date(),
    };

    const res = await db.collection("email_logs").insertOne(doc);
    return res.insertedId.toString();
  } catch (err) {
    console.error("[emailLog] Failed to record email log to MongoDB:", err);
    return null;
  }
}

/**
 * Fetch paginated emails sent to a specific user (by userId or recipient email).
 */
export async function getUserEmailLogs(
  userId: string,
  userEmail?: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{ emails: Array<Record<string, unknown>>; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const skip = (page - 1) * limit;

  const client = await clientPromise;
  const db = client.db();
  const col = db.collection("email_logs");

  const conditions: Array<Record<string, unknown>> = [
    { userId: userId },
    { userId: userId.toString() },
  ];

  if (userEmail && userEmail.trim()) {
    const normalized = userEmail.toLowerCase().trim();
    conditions.push({ to: normalized });
    conditions.push({ recipientEmail: normalized });
  }

  const filter = { $or: conditions };

  const [total, rawEmails] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
  ]);

  const emails = rawEmails.map((item) => ({
    id: item._id.toString(),
    to: item.to || item.recipientEmail || "",
    userId: item.userId,
    subject: item.subject || "(No Subject)",
    previewText: item.previewText || extractPlainText(item.html || ""),
    html: item.html || "",
    status: item.status || (item.deliveryStatus === "delivered" ? "sent" : item.deliveryStatus) || "sent",
    provider: item.provider || "system",
    error: item.error || null,
    metadata: item.metadata || {},
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
  }));

  return { emails, total };
}
