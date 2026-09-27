/**
 * emailProvider.ts — Dedicated Cloudflare transactional email delivery.
 *
 * Cloudflare Email Service is the sole transactional email provider.
 * Falls back to console in local environments where Cloudflare credentials
 * are not present.
 */

export type EmailProviderName = "cloudflare" | "console";

export interface TransactionalEmailMessage {
  from: {
    email: string;
    name?: string;
  };
  to: string[];
  subject: string;
  html: string;
  text?: string;
  category?: string;
}

export interface EmailDeliveryResult {
  sent: boolean;
  provider: EmailProviderName;
  messageId?: string;
  error?: string;
}

export function getEmailProviderChain(env: NodeJS.ProcessEnv = process.env): EmailProviderName[] {
  if (env.CLOUDFLARE_EMAIL_ACCOUNT_ID && env.CLOUDFLARE_EMAIL_API_TOKEN) {
    return ["cloudflare"];
  }
  return ["console"];
}

export function resolveTransactionalSender(
  sender: TransactionalEmailMessage["from"],
  _env: NodeJS.ProcessEnv = process.env,
): TransactionalEmailMessage["from"] {
  return sender;
}

function failure(provider: EmailProviderName, error: unknown): EmailDeliveryResult {
  return {
    sent: false,
    provider,
    error: error instanceof Error ? error.message : String(error || "Unknown delivery failure"),
  };
}

async function sendWithCloudflare(message: TransactionalEmailMessage): Promise<EmailDeliveryResult> {
  const accountId = process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim();
  if (!accountId) return failure("cloudflare", "CLOUDFLARE_EMAIL_ACCOUNT_ID is not configured");
  if (!apiToken) return failure("cloudflare", "CLOUDFLARE_EMAIL_API_TOKEN is not configured");

  try {
    const payload = {
      from: message.from.name
        ? { address: message.from.email, name: message.from.name }
        : message.from.email,
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(message.text ? { text: message.text } : {}),
    };

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const body = await response.json().catch(() => null) as {
      success?: boolean;
      errors?: Array<{ code?: number; message?: string }>;
      messages?: Array<{ code?: number; message?: string }>;
      result?: {
        delivered?: string[];
        queued?: string[];
        message_id?: string;
        permanent_bounces?: string[];
        suppressed_recipients?: string[];
      } | null;
    } | null;

    if (!response.ok || body?.success !== true) {
      const errorDetails = body?.errors
        ?.map((entry) => entry.message || (entry.code ? `Cloudflare error ${entry.code}` : ""))
        .filter(Boolean)
        .join("; ");
      const msg = errorDetails || `Cloudflare Email Service returned HTTP ${response.status}`;
      console.error(`[email] Cloudflare send rejected (HTTP ${response.status}):`, msg, JSON.stringify(body));
      return failure("cloudflare", msg);
    }

    const accepted = new Set([
      ...(body.result?.delivered || []),
      ...(body.result?.queued || []),
    ].map((email) => email.toLowerCase()));

    if (message.to.some((email) => !accepted.has(email.toLowerCase()))) {
      const details = [
        body.result?.permanent_bounces?.length ? `Bounced: ${body.result.permanent_bounces.join(", ")}` : "",
        body.result?.suppressed_recipients?.length ? `Suppressed: ${body.result.suppressed_recipients.join(", ")}` : "",
      ].filter(Boolean).join("; ");
      return failure("cloudflare", `Cloudflare did not accept all recipients. ${details}`.trim());
    }

    return { sent: true, provider: "cloudflare", messageId: body.result?.message_id };
  } catch (error) {
    console.error("[email] Cloudflare network error:", error);
    return failure("cloudflare", error);
  }
}

async function sendWithProvider(
  provider: EmailProviderName,
  message: TransactionalEmailMessage,
): Promise<EmailDeliveryResult> {
  if (provider === "cloudflare") return sendWithCloudflare(message);

  console.warn("[email] Cloudflare email credentials not configured; email logged to console.");
  return failure("console", "Cloudflare email credentials not configured");
}

export async function sendTransactionalEmail(
  message: TransactionalEmailMessage,
): Promise<EmailDeliveryResult> {
  const providers = getEmailProviderChain();
  const primaryProvider = providers[0] || "console";
  const result = await sendWithProvider(primaryProvider, message);
  if (!result.sent) {
    console.error(`[email] ${primaryProvider} delivery failed: ${result.error}`);
  }
  return result;
}
