/**
 * emailProvider.ts — Provider-agnostic transactional email delivery.
 *
 * Select the primary provider with EMAIL_PROVIDER=mailtrap|resend|console.
 * Optionally set EMAIL_FALLBACK_PROVIDER to a different provider. A fallback
 * is only attempted when the primary provider returns a confirmed failure.
 */

export type EmailProviderName = "mailtrap" | "resend" | "console";

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

function normalizeProvider(value: unknown): EmailProviderName | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "mailtrap" || normalized === "resend" || normalized === "console") {
    return normalized;
  }
  return null;
}

export function getEmailProviderChain(env: NodeJS.ProcessEnv = process.env): EmailProviderName[] {
  const explicitPrimary = normalizeProvider(env.EMAIL_PROVIDER);
  const detectedPrimary = env.MAILTRAP_API_TOKEN || env.MAILTRAP_TOKEN
    ? "mailtrap"
    : env.RESEND_API_KEY
      ? "resend"
      : "console";
  const primary = explicitPrimary || detectedPrimary;
  const fallback = normalizeProvider(env.EMAIL_FALLBACK_PROVIDER);

  return [primary, fallback]
    .filter((provider): provider is EmailProviderName => Boolean(provider))
    .filter((provider, index, providers) => providers.indexOf(provider) === index);
}

export function resolveTransactionalSender(
  sender: TransactionalEmailMessage["from"],
  env: NodeJS.ProcessEnv = process.env,
): TransactionalEmailMessage["from"] {
  if (getEmailProviderChain(env)[0] !== "mailtrap") return sender;

  return {
    email: env.MAILTRAP_FROM_EMAIL?.trim() || sender.email,
    name: env.MAILTRAP_FROM_NAME?.trim() || sender.name,
  };
}

function failure(provider: EmailProviderName, error: unknown): EmailDeliveryResult {
  return {
    sent: false,
    provider,
    error: error instanceof Error ? error.message : String(error || "Unknown delivery failure"),
  };
}

async function sendWithMailtrap(message: TransactionalEmailMessage): Promise<EmailDeliveryResult> {
  const token = process.env.MAILTRAP_API_TOKEN || process.env.MAILTRAP_TOKEN;
  if (!token) return failure("mailtrap", "MAILTRAP_API_TOKEN is not configured");

  try {
    const response = await fetch("https://send.api.mailtrap.io/api/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: message.from,
        to: message.to.map((email) => ({ email })),
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
        ...(message.category ? { category: message.category } : {}),
      }),
    });
    if (!response.ok) {
      return failure("mailtrap", `Mailtrap returned HTTP ${response.status}`);
    }

    const body = await response.json().catch(() => null) as { message_ids?: unknown } | null;
    const messageId = Array.isArray(body?.message_ids)
      ? String(body.message_ids[0] || "")
      : undefined;

    return { sent: true, provider: "mailtrap", messageId };
  } catch (error) {
    return failure("mailtrap", error);
  }
}

async function sendWithResend(message: TransactionalEmailMessage): Promise<EmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return failure("resend", "RESEND_API_KEY is not configured");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: message.from.name ? `${message.from.name} <${message.from.email}>` : message.from.email,
        to: message.to,
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
      }),
    });

    if (!response.ok) {
      return failure("resend", `Resend returned HTTP ${response.status}`);
    }

    const body = await response.json().catch(() => null) as { id?: string } | null;
    return { sent: true, provider: "resend", messageId: body?.id };
  } catch (error) {
    return failure("resend", error);
  }
}

async function sendWithProvider(
  provider: EmailProviderName,
  message: TransactionalEmailMessage,
): Promise<EmailDeliveryResult> {
  if (provider === "mailtrap") return sendWithMailtrap(message);
  if (provider === "resend") return sendWithResend(message);

  console.warn("[email] No transactional email provider is configured; email was not sent.");
  return failure("console", "No provider is configured");
}

export async function sendTransactionalEmail(
  message: TransactionalEmailMessage,
): Promise<EmailDeliveryResult> {
  let lastResult: EmailDeliveryResult | null = null;

  for (const provider of getEmailProviderChain()) {
    const result = await sendWithProvider(provider, message);
    if (result.sent) return result;

    lastResult = result;
    console.error(`[email] ${provider} delivery failed: ${result.error}`);
  }

  return lastResult || failure("console", "No provider is configured");
}
