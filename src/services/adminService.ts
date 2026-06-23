/**
 * adminService.ts — Real API service for the Admin Dashboard.
 *
 * Fetches live data from the web backend.
 * Auth: passes X-Device-Id header for device-based auth.
 */

import { getDeviceId } from "./authService";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://web-tayo-akosiles-projects.vercel.app";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  churchName: string;
  plan: "free" | "starter" | "growth" | "pro";
  signupDate: string;
  lastActive: string;
  isActive: boolean;
  avatar: string;
  credits: number;
  role: string;
  usage: UserUsage;
}

export interface UserUsage {
  bibleSearches: number;
  songsCreated: number;
  mediaUploaded: number;
  aiHoursUsed: number;
  transcriptCount: number;
}

export interface Church {
  id: string;
  name: string;
  country: string;
  userCount: number;
  plan: string;
  lastActive: string;
  aiUsage: number;
}

export interface ActivityEvent {
  id: string;
  message: string;
  timestamp: string;
  type: "signup" | "upgrade" | "usage" | "export" | "theme" | "song" | "transcript";
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface KPIData {
  totalUsers: number;
  activeUsers: number;
  churches: number;
  paidSubscribers: number;
  monthlyRevenue: number;
  aiHoursUsed: number;
}

export interface PaymentData {
  totalRevenue: number;
  monthlyRevenue: number;
  activeSubscriptions: number;
  cancelledSubscriptions: number;
  conversionRate: number;
  revenueByPlan: { plan: string; count: number; revenue: number }[];
}

export interface AIData {
  totalSessions: number;
  minutesConsumed: number;
  hoursConsumed: number;
  avgSessionLength: number;
  assemblyAI: {
    monthlyCredits: number;
    usedCredits: number;
    remainingCredits: number;
    estimatedCost: number;
    projectedMonthlyCost: number;
  };
}

export interface FeatureUsage {
  bibleSearches: number;
  worshipPresentations: number;
  mediaPresentations: number;
  voiceSessions: number;
  transcriptViews: number;
  themesCreated: number;
}

export interface BibleAnalytics {
  mostUsedVersions: { name: string; count: number }[];
  mostSearchedBooks: { name: string; count: number }[];
  totalBibleSessions: number;
}

export interface WorshipAnalytics {
  songsCreated: number;
  songsImported: number;
  totalWorshipSlides: number;
  mostUsedThemes: { name: string; count: number }[];
}

export interface MediaAnalytics {
  imagesUploaded: number;
  videosUploaded: number;
  backgroundsUploaded: number;
  storageConsumed: string;
}

export interface TranscriptAnalytics {
  totalTranscripts: number;
  transcriptHours: number;
  translationsGenerated: number;
  exportsGenerated: number;
}

export interface SignupDataPoint {
  date: string;
  signups: number;
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
}

// ── Auth helper ────────────────────────────────────────────────────────────

function adminHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const deviceId = getDeviceId();
  if (deviceId) headers["X-Device-Id"] = deviceId;
  return headers;
}

// ── Real API functions ─────────────────────────────────────────────────────

/**
 * Fetch all users from the backend. Returns empty array on error.
 */
export async function fetchUsers(): Promise<AdminUser[]> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/users`, { headers: adminHeaders() });
    if (!res.ok) {
      console.error("[Admin] Failed to fetch users:", res.status);
      return [];
    }
    const data = await res.json();
    const users = (data.users || []).map((u: Record<string, unknown>) => ({
      id: u.id || "",
      name: u.name || "",
      email: u.email || "",
      churchName: u.churchName || "",
      plan: u.plan || "free",
      signupDate: u.createdAt || new Date().toISOString(),
      lastActive: u.lastLogin || u.createdAt || new Date().toISOString(),
      isActive: !!u.lastLogin,
      avatar: u.avatar || "",
      credits: typeof u.credits === "number" ? u.credits : 25,
      role: u.role || "user",
      usage: {
        bibleSearches: 0,
        songsCreated: 0,
        mediaUploaded: 0,
        aiHoursUsed: 0,
        transcriptCount: 0,
      },
    }));
    return users;
  } catch (err) {
    console.error("[Admin] fetchUsers error:", err);
    return [];
  }
}

/**
 * Fetch a single user by ID from the backend.
 */
export async function fetchUserById(id: string): Promise<AdminUser | null> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(id)}`, { headers: adminHeaders() });
    if (!res.ok) return null;
    const u = await res.json();
    return {
      id: u.id || "",
      name: u.name || "",
      email: u.email || "",
      churchName: u.churchName || "",
      plan: u.plan || "free",
      signupDate: u.createdAt || new Date().toISOString(),
      lastActive: u.lastLogin || u.createdAt || new Date().toISOString(),
      isActive: !!u.lastLogin,
      avatar: u.avatar || "",
      credits: typeof u.credits === "number" ? u.credits : 25,
      role: u.role || "user",
      usage: {
        bibleSearches: 0,
        songsCreated: 0,
        mediaUploaded: 0,
        aiHoursUsed: 0,
        transcriptCount: 0,
      },
    };
  } catch (err) {
    console.error("[Admin] fetchUserById error:", err);
    return null;
  }
}

/**
 * Add credits to a user. Returns the new balance on success, -1 on failure.
 */
export async function addCreditsToUser(userId: string, amount: number): Promise<number> {
  try {
    const res = await fetch(
      `${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/credits`,
      {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ amount }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[Admin] Failed to add credits:", err.error || res.status);
      return -1;
    }
    const data = await res.json();
    return typeof data.credits === "number" ? data.credits : -1;
  } catch (err) {
    console.error("[Admin] addCreditsToUser error:", err);
    return -1;
  }
}

/**
 * Initialize credits for all users that don't have a credits field yet.
 */
export async function initCredits(): Promise<{ modifiedCount: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/init-credits`, {
      method: "POST",
      headers: adminHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Overview ───────────────────────────────────────────────────────────────

export async function fetchOverview(): Promise<{
  kpis: KPIData;
  signupChart: SignupDataPoint[];
  activity: ActivityEvent[];
} | null> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/overview`, { headers: adminHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Churches ───────────────────────────────────────────────────────────────

export async function fetchChurches(): Promise<Church[]> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/churches`, { headers: adminHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.churches || []).map((c: Record<string, unknown>) => ({
      id: c.id || c.name || "",
      name: c.name || "",
      country: c.country || "",
      userCount: c.userCount || 0,
      plan: c.plan || "free",
      lastActive: c.lastActive || "",
      aiUsage: 0,
    }));
  } catch {
    return [];
  }
}

// ── Analytics ──────────────────────────────────────────────────────────────

export async function fetchAnalytics(period: number = 30): Promise<{
  featureUsage: FeatureUsage;
  signupChart: SignupDataPoint[];
  revenueChart: RevenueDataPoint[];
  retentionData: TimeSeriesPoint[];
  bibleAnalytics: BibleAnalytics;
  worshipAnalytics: WorshipAnalytics;
  mediaAnalytics: { imagesUploaded: number; mediaPresentations: number };
  transcriptAnalytics: TranscriptAnalytics;
} | null> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/analytics?period=${period}`, { headers: adminHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Payments ───────────────────────────────────────────────────────────────

export async function fetchPaymentData(): Promise<PaymentData | null> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/payments`, { headers: adminHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── AI Usage (placeholder — AssemblyAI tracking not yet in backend) ───────

export async function fetchAIData(): Promise<AIData> {
  // TODO: Wire to real AssemblyAI usage tracking when available
  return {
    totalSessions: 0,
    minutesConsumed: 0,
    hoursConsumed: 0,
    avgSessionLength: 0,
    assemblyAI: {
      monthlyCredits: 300,
      usedCredits: 0,
      remainingCredits: 300,
      estimatedCost: 0,
      projectedMonthlyCost: 0,
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function formatCurrency(amount: number): string {
  return `₦${(amount / 1_000_000).toFixed(1)}M`;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
