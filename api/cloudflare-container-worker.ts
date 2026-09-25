import { env as cloudflareEnv } from "cloudflare:workers";
import { Container, getContainer } from "@cloudflare/containers";

type WorkerEnv = Record<string, unknown> & {
  MCE_API_CONTAINER: DurableObjectNamespace;
};

const CONTAINER_ENV_NAMES = [
  "APP_ENV",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
  "CRON_SECRET",
  "EMAIL_FROM",
  "EMAIL_FROM_NAME",
  "EMAIL_FALLBACK_PROVIDER",
  "EMAIL_PROVIDER",
  "FLW_API_BASE_URL",
  "FLW_SECRET_KEY",
  "GITHUB_TOKEN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "JWT_SECRET",
  "MAILTRAP_API_TOKEN",
  "MAILTRAP_FROM_EMAIL",
  "MAILTRAP_FROM_NAME",
  "MAILTRAP_TOKEN",
  "MONGODB_URI",
  "MTN_MOMO_ALLOWED_COUNTRIES",
  "MTN_MOMO_API_KEY",
  "MTN_MOMO_API_USER",
  "MTN_MOMO_BASE_URL",
  "MTN_MOMO_CALLBACK_URL",
  "MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY",
  "MTN_MOMO_COUNTRY_CODE",
  "MTN_MOMO_CURRENCY",
  "MTN_MOMO_ENABLED",
  "MTN_MOMO_REQUEST_TIMEOUT_MS",
  "MTN_MOMO_TARGET_ENVIRONMENT",
  "NEXTAUTH_SECRET",
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_APP_ENV",
  "NEXT_PUBLIC_APP_URL",
  "NODE_ENV",
  "NOWPAYMENTS_API_BASE_URL",
  "NOWPAYMENTS_API_KEY",
  "NOWPAYMENTS_DEFAULT_PAY_CURRENCY",
  "NOWPAYMENTS_FEE_PAID_BY_USER",
  "NOWPAYMENTS_FIXED_RATE",
  "NOWPAYMENTS_IPN_CALLBACK_URL",
  "NOWPAYMENTS_IPN_SECRET",
  "NOWPAYMENTS_SUPPORTED_PRICE_CURRENCIES",
  "PAYSTACK_SECRET_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "R2_PREFIX",
  "R2_PUBLIC_BASE_URL",
  "R2_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SUBSCRIPTION_PRIVATE_KEY",
  "SUPPORT_EMAIL",
  "TELEGRAM_API_ERROR_ALERTS_ENABLED",
  "TELEGRAM_API_ERROR_COOLDOWN_MS",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_NOTIFICATION_TIMEZONE",
  "TELEGRAM_NOTIFICATIONS_ENABLED",
  "TRIAL_ABUSE_SALT",
  "TRIAL_BLOCK_IP_UA",
  "TRIAL_REQUIRE_DEVICE_FINGERPRINT",
] as const;

function buildContainerEnv(source: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};

  for (const name of CONTAINER_ENV_NAMES) {
    const value = source[name];
    if (typeof value === "string" && value.length > 0) {
      values[name] = value;
    }
  }

  return values;
}

export class MceApiContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "30m";
  pingEndpoint = "/api/health";
  enableInternet = true;
  envVars = buildContainerEnv(cloudflareEnv as unknown as Record<string, unknown>);
}

export default {
  async fetch(request: Request, workerEnv: WorkerEnv): Promise<Response> {
    const container = getContainer(workerEnv.MCE_API_CONTAINER, "staging");
    return container.fetch(request);
  },
};
