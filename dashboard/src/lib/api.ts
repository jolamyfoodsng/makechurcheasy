/**
 * API client for the MakeChurchEasy backend.
 *
 * All requests use relative paths so they go through Next.js rewrites
 * (proxying to the backend), keeping cookies same-origin.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error || `Request failed: ${res.status}`, res.status);
  }

  return res.json();
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface User {
  _id: string;
  name: string;
  email: string;
  avatar: string;
  churchName: string;
  churchProfileId?: string;
  devices?: string[];
  country: string;
  phone: string;
  jobTitle: string;
  language: string;
  timezone: string;
  role: string;
  plan: string;
  credits: number;
  appId: string;
  loginMethods: {
    email: boolean;
    google: boolean;
    microsoft: boolean;
  };
  passwordLastChanged: string | null;
  emailHistory?: { email: string; changedAt: string }[];
  createdAt: string;
  lastLogin: string;
}

export async function getUser(userId: string): Promise<User | null> {
  return request(`/api/user?userId=${userId}`);
}

export async function updateUser(
  userId: string,
  updates: Partial<Pick<User, "name" | "churchName" | "avatar" | "churchProfileId" | "devices" | "country" | "phone" | "jobTitle" | "language" | "timezone" | "loginMethods" | "passwordLastChanged">>
): Promise<void> {
  await request("/api/user", {
    method: "PATCH",
    body: JSON.stringify({ userId, ...updates }),
  });
}

export async function deleteUserAccount(userId: string): Promise<void> {
  await request(`/api/user?userId=${userId}`, { method: "DELETE" });
}

// ─── Devices ─────────────────────────────────────────────────────────────────

export interface Device {
  id: string;
  deviceId: string;
  deviceName: string;
  lastSeen: string;
  createdAt: string;
}

export async function getDevices(): Promise<Device[]> {
  return request("/api/devices");
}

export async function deleteDevice(deviceId: string): Promise<void> {
  return request("/api/devices", {
    method: "DELETE",
    body: JSON.stringify({ deviceId }),
  });
}

// ─── Church Profile ──────────────────────────────────────────────────────────

export interface ChurchBranding {
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  faviconUrl: string;
}

export interface ChurchPresentationDefaults {
  defaultTranslation: string;
  lowerThirdStyle: string;
  theme: string;
  language: string;
}

export interface ChurchSpeaker {
  name: string;
  role: string;
  imageUrl?: string;
  isMain?: boolean;
}

export interface ChurchSocialMedia {
  facebook: string;
  instagram: string;
  youtube: string;
  twitter: string;
  tiktok: string;
}

export interface ChurchProfile {
  _id?: string;
  userId: string;
  churchName: string;
  tagline: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  timezone: string;
  churchSize: string;
  branding: ChurchBranding;
  presentationDefaults: ChurchPresentationDefaults;
  speakers: ChurchSpeaker[];
  socialMedia: ChurchSocialMedia;
  createdAt: string;
  updatedAt: string;
}

export async function getChurchProfile(userId: string): Promise<ChurchProfile | null> {
  return request(`/api/church-profile?userId=${userId}`);
}

export async function updateChurchProfile(
  userId: string,
  updates: Partial<ChurchProfile>
): Promise<ChurchProfile> {
  return request("/api/church-profile", {
    method: "PUT",
    body: JSON.stringify({ userId, ...updates }),
  });
}

// ─── Countries ──────────────────────────────────────────────────────────────

export interface Country {
  _id?: string;
  name: string;
  iso2: string;
  iso3: string;
  flag: string;
  region: string;
  subregion: string;
}

export async function getCountries(): Promise<Country[]> {
  return request("/api/countries");
}

// ─── Subscription ────────────────────────────────────────────────────────────

export interface Subscription {
  _id?: string;
  userId: string;
  plan: string;
  status: string;
  billingCycle: string;
  price: number;
  currency: string;
  startDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
  autoRenew: boolean;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getSubscription(userId: string): Promise<Subscription | null> {
  return request(`/api/subscriptions?userId=${userId}`);
}

// ─── User Usage ──────────────────────────────────────────────────────────────

export interface UserUsage {
  userId: string;
  songs: number;
  images: number;
  videos: number;
  themes: number;
  lowerThirds: number;
  devices: number;
  bibleVersions: number;
  lastSyncedAt: string | null;
}

export async function getUserUsage(userId: string): Promise<UserUsage> {
  return request(`/api/user/usage?userId=${userId}`);
}

// ─── Credit Transactions ─────────────────────────────────────────────────────

export interface CreditTransaction {
  _id?: string;
  userId: string;
  type: string;
  source: string;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface CreditTransactionsResponse {
  transactions: CreditTransaction[];
  total: number;
  limit: number;
  skip: number;
}

export async function getCreditTransactions(
  userId: string,
  options: { limit?: number; skip?: number; type?: string } = {}
): Promise<CreditTransactionsResponse> {
  const params = new URLSearchParams({ userId });
  if (options.limit) params.set("limit", String(options.limit));
  if (options.skip) params.set("skip", String(options.skip));
  if (options.type) params.set("type", options.type);
  return request(`/api/credit-transactions?${params}`);
}

export async function getCreditUsageByDay(
  userId: string,
  days: number = 7
): Promise<{ usage: { date: string; amount: number }[] }> {
  return request(`/api/credit-transactions/stats?userId=${userId}&days=${days}`);
}

export async function deductCredits(
  userId: string,
  amount: number,
  source: string,
  description: string,
  metadata?: Record<string, unknown>
): Promise<{ credits: number; deducted: number }> {
  return request("/api/credit-transactions/deduct", {
    method: "POST",
    body: JSON.stringify({ userId, amount, source, description, metadata }),
  });
}

// ─── Billing Transactions (Paystack payments) ────────────────────────────────

export interface BillingTransaction {
  _id?: string;
  userId: string;
  plan: string;
  amount: number;
  currency: string;
  paymentProvider: "paystack";
  paystackReference: string;
  type: "subscription_purchase" | "subscription_renewal" | "plan_upgrade" | "credit_purchase" | "refund";
  status: "pending" | "success" | "failed" | "refunded";
  receiptUrl?: string;
  paidAt: string;
  createdAt: string;
  billingCycle?: "monthly" | "yearly" | "lifetime" | "one_time";
}

export interface BillingTransactionsResponse {
  transactions: BillingTransaction[];
  total: number;
  limit: number;
  skip: number;
}

export async function getBillingTransactions(
  userId: string,
  options: { limit?: number; skip?: number } = {}
): Promise<BillingTransactionsResponse> {
  const params = new URLSearchParams({ userId });
  if (options.limit) params.set("limit", String(options.limit));
  if (options.skip) params.set("skip", String(options.skip));
  return request(`/api/billing-transactions?${params}`);
}

// ─── Security Sessions ───────────────────────────────────────────────────────

export interface SecuritySession {
  _id?: string;
  userId: string;
  sessionId: string;
  deviceName: string;
  devicePlatform: string;
  deviceOs: string;
  browser: string;
  ipAddress: string;
  location: string;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

export async function getSecuritySessions(userId: string): Promise<SecuritySession[]> {
  return request(`/api/sessions?userId=${userId}`);
}

export async function terminateOtherSessions(
  userId: string,
  currentSessionId: string
): Promise<{ deletedCount: number }> {
  return request("/api/sessions/terminate-others", {
    method: "POST",
    body: JSON.stringify({ userId, currentSessionId }),
  });
}

export async function deleteSecuritySession(sessionId: string): Promise<{ success: boolean }> {
  return request("/api/sessions", {
    method: "DELETE",
    body: JSON.stringify({ sessionId }),
  });
}

export async function registerSession(session: {
  sessionId: string;
  deviceName: string;
  devicePlatform: string;
  deviceOs: string;
  browser?: string;
  ipAddress?: string;
  location?: string;
}): Promise<SecuritySession> {
  return request("/api/sessions", {
    method: "POST",
    body: JSON.stringify(session),
  });
}

// ─── Email Change ───────────────────────────────────────────────────────────

export interface EmailCooldownStatus {
  email: string;
  emailChangedAt: string | null;
  nextEmailChangeAt: string | null;
  pendingEmail: string | null;
  emailChangeTokenExpires: string | null;
  inCooldown: boolean;
}

export async function getEmailCooldownStatus(): Promise<EmailCooldownStatus> {
  return request("/api/auth/change-email");
}

export async function requestEmailChange(
  newEmail: string
): Promise<{ success: boolean; message: string }> {
  return request("/api/auth/change-email", {
    method: "POST",
    body: JSON.stringify({ newEmail }),
  });
}

export async function confirmEmailChange(
  token: string
): Promise<{ success: boolean; message: string; nextEmailChangeAt: string }> {
  return request("/api/auth/confirm-email-change", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function sendVerificationEmail(email?: string): Promise<{ success: boolean; message: string }> {
  return request("/api/auth/send-verification", {
    method: "POST",
    body: email ? JSON.stringify({ email }) : undefined,
  });
}

export async function verifyEmailCode(
  email: string,
  code: string
): Promise<{ success: boolean; message: string }> {
  return request("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export async function sendPasswordResetEmail(
  email: string
): Promise<{ success: boolean; message: string }> {
  return request("/api/auth/send-password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function changePassword(
  newPassword: string
): Promise<{ success: boolean }> {
  return request("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
}

// ─── Pairing ─────────────────────────────────────────────────────────────────

export async function createPairingCode(
  deviceName: string = "MakeChurchEasy",
  ttlSeconds?: number,
): Promise<{ code: string; expiresAt: string }> {
  return request("/api/pairing/create", {
    method: "POST",
    body: JSON.stringify({ deviceName, ttlSeconds }),
  });
}

export async function authorizePairingCode(
  code: string
): Promise<{ success: boolean }> {
  return request("/api/pairing/authorize", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function rejectPairingCode(
  code: string
): Promise<{ success: boolean }> {
  return request("/api/pairing/reject", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function resendVerificationEmail(): Promise<{ success: boolean; alreadyVerified?: boolean; message?: string }> {
  return request("/api/pairing/resend-verification", {
    method: "POST",
  });
}

export async function checkVerificationStatus(
  code: string
): Promise<{ verified: boolean }> {
  return request("/api/pairing/check-verification", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

// ─── Downloads ───────────────────────────────────────────────────────────────

export async function recordDownload(
  userId: string,
  downloadedVersion: string
): Promise<void> {
  await request("/api/downloads", {
    method: "POST",
    body: JSON.stringify({ userId, downloadedVersion }),
  });
}

// ─── Two-Factor Authentication ──────────────────────────────────────────────

export async function setup2FA(): Promise<{ secret: string; otpauthUrl: string }> {
  return request("/api/auth/2fa/setup", { method: "POST" });
}

export async function verify2FA(
  token: string,
  secret?: string
): Promise<{ success: boolean; recoveryCodes?: string[] }> {
  return request("/api/auth/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ token, secret }),
  });
}

export async function get2FAStatus(): Promise<{ enabled: boolean }> {
  return request("/api/auth/2fa/status");
}

export async function disable2FA(token: string): Promise<{ success: boolean }> {
  return request("/api/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

// ─── Transcripts ─────────────────────────────────────────────────────────────

export interface TranscriptRecord {
  id: string;
  title: string;
  church: string;
  language: string;
  durationSeconds: number;
  transcriptText: string;
  sourceType: string;
  scriptures: { id: string; transcriptId: string; reference: string; verseText: string; confidence: number }[];
  translations: { id: string; transcriptId: string; language: string; translatedText: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

export async function getTranscripts(): Promise<TranscriptRecord[]> {
  const data = await request<{ transcripts: TranscriptRecord[] }>("/api/transcripts");
  return data.transcripts || [];
}

export async function saveTranscript(transcript: TranscriptRecord): Promise<{ success: boolean }> {
  return request("/api/transcripts", {
    method: "POST",
    body: JSON.stringify({ transcript }),
  });
}

export async function deleteTranscript(id: string): Promise<{ success: boolean }> {
  return request(`/api/transcripts?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ─── Custom Themes ───────────────────────────────────────────────────────────

export interface CustomThemeRecord {
  themeId: string;
  name: string;
  description?: string;
  source: string;
  templateType: string;
  category?: string;
  categories?: string[];
  settings: Record<string, unknown>;
  preview?: string;
  hidden?: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getCustomThemes(): Promise<CustomThemeRecord[]> {
  const data = await request<{ themes: CustomThemeRecord[] }>("/api/themes");
  return data.themes || [];
}

export async function saveCustomTheme(theme: CustomThemeRecord): Promise<{ success: boolean }> {
  return request("/api/themes", {
    method: "POST",
    body: JSON.stringify({ theme }),
  });
}

export async function deleteCustomTheme(themeId: string): Promise<{ success: boolean }> {
  return request(`/api/themes?themeId=${encodeURIComponent(themeId)}`, {
    method: "DELETE",
  });
}
