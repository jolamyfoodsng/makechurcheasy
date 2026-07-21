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

function parseEnv(): EnvConfig {
  const raw = (import.meta.env.VITE_APP_ENV as string | undefined) || "development";
  const env: AppEnv = raw === "production" ? "production" : "development";
  const isTest = env === "development";

  return {
    env,
    isTest,
    appName: isTest ? "Test MCE" : "MakeChurchEasy",
    authApiUrl: (import.meta.env.VITE_AUTH_API_URL as string) || "https://api.creatorstudioslabs.stream",
    apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string) || "https://api.creatorstudioslabs.stream",
    wsUrl: (import.meta.env.VITE_WS_URL as string) || "wss://relay.makechurcheasy.com",
    analyticsEndpoint: (import.meta.env.VITE_ANALYTICS_ENDPOINT as string) || "",
    analyticsToken: (import.meta.env.VITE_ANALYTICS_TOKEN as string) || "",
    assemblyAiKeys: ((import.meta.env.VITE_ASSEMBLYAI_API_KEYS as string) || "").split(",").filter(Boolean),
  };
}

let cached: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!cached) cached = parseEnv();
  return cached;
}

export function getAppTitle(page?: string): string {
  const { isTest, appName } = getEnvConfig();
  if (isTest) {
    if (page) return `[TEST] ${page} - ${appName}`;
    return `[TEST] ${appName}`;
  }
  if (page) return `${page} - ${appName}`;
  return appName;
}
