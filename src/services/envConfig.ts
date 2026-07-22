export type AppEnv = "development" | "production";

export interface EnvConfig {
  env: AppEnv;
  isTest: boolean;
  appName: string;
  authApiUrl: string;
  apiBaseUrl: string;
  wsUrl: string;
  analyticsEndpoint: string;
  analyticsToken: string;
  assemblyAiKeys: string[];
}

function requireEnv(name: string, value: string | undefined, env: AppEnv): string {
  if (value) return value;
  if (env === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return "";
}

function parseEnv(): EnvConfig {
  const raw = (import.meta.env.VITE_APP_ENV as string | undefined) || "development";
  const env: AppEnv = raw === "production" ? "production" : "development";
  const isTest = env === "development";

  return {
    env,
    isTest,
    appName: isTest ? "MakeChurchEasy Test" : "MakeChurchEasy",
    authApiUrl: requireEnv("VITE_AUTH_API_URL", import.meta.env.VITE_AUTH_API_URL as string | undefined, env) || "https://api.creatorstudioslabs.stream",
    apiBaseUrl: requireEnv("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL as string | undefined, env) || "https://api.creatorstudioslabs.stream",
    wsUrl: requireEnv("VITE_WS_URL", import.meta.env.VITE_WS_URL as string | undefined, env) || "wss://relay.makechurcheasy.com",
    analyticsEndpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined || "",
    analyticsToken: import.meta.env.VITE_ANALYTICS_TOKEN as string | undefined || "",
    assemblyAiKeys: requireEnv("VITE_ASSEMBLYAI_API_KEYS", import.meta.env.VITE_ASSEMBLYAI_API_KEYS as string | undefined, env).split(",").filter(Boolean),
  };
}

let cached: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!cached) cached = parseEnv();
  return cached;
}

export function getAppTitle(page?: string): string {
  const { appName } = getEnvConfig();
  if (page && page !== "MakeChurchEasy" && page !== appName) return `${page} - ${appName}`;
  if (page) return `${page} - ${appName}`;
  return appName;
}

export function getSplashImageSrc(): string {
  return getEnvConfig().isTest
    ? "/make_church_easy_onboarding-dev.png"
    : "/make_church_easy_onboarding.png";
}
