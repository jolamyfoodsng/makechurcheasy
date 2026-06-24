/**
 * credits.ts — Universal credit system for MakeChurchEasy
 *
 * Credit costs:
 *   Voice → Transcript:  1 credit = 1 minute of processed audio
 *   Transcript → Translation: 1 credit = 150 words
 *
 * Pro users bypass all credit checks.
 * Credits are deducted only on successful completion.
 *
 * RULE: The backend (MongoDB) is the single source of truth.
 *       localStorage is a write-only cache — NEVER read for gating features.
 *       Every credit check must fetch from the backend.
 */

import { isProUnlocked } from "./proLicense";
export { isProUnlocked };

import { getPlanConfig } from "./planConfig";
import { getUserScopedKey } from "./userScopedStorage";
import type { PlanConfig } from "./planConfig";
import { getDeviceId } from "./authService";

async function config(): Promise<PlanConfig> {
  return getPlanConfig();
}

/** Resolved at call time from DB-backed plan config. */
export async function getSTARTING_CREDITS(): Promise<number> {
  const c = await config();
  return c.plans.free?.credits ?? 25;
}

export async function getTRANSCRIPTION_CREDITS_PER_MINUTE(): Promise<number> {
  const c = await config();
  return c.creditCosts.find((x) => x.name === "Speech-to-Scripture")?.cost ?? 1;
}

export async function getTRANSLATION_WORDS_PER_CREDIT(): Promise<number> {
  const c = await config();
  return c.translationWordsPerCredit ?? 150;
}

const STORAGE_KEY = "ocs-credits-balance";
const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";

/** Build headers with device auth for desktop app API calls. */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const deviceId = getDeviceId();
  if (deviceId) headers["X-Device-Id"] = deviceId;
  return headers;
}

// ── Balance cache (write-only — read only for UI display after sync) ─────────

/**
 * Read cached balance from localStorage. Returns 0 if nothing cached.
 * This is a display cache only — never use to gate features.
 * Features must fetch from the backend via fetchCreditsFromBackend().
 */
export function getCreditsBalance(): number {
  try {
    const raw = localStorage.getItem(getUserScopedKey(STORAGE_KEY));
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "number" && parsed >= 0) return parsed;
    }
  } catch { /* ignore */ }
  return 0;
}

/** Write balance to localStorage cache (called after backend sync). */
function setCreditsBalance(amount: number): void {
  try {
    localStorage.setItem(getUserScopedKey(STORAGE_KEY), JSON.stringify(Math.max(0, Math.round(amount))));
  } catch { /* ignore */ }
}

// ── Credit change event bus ──────────────────────────────────────────────────

type CreditChangeCallback = (newBalance: number) => void;
const _creditListeners = new Set<CreditChangeCallback>();

/** Subscribe to credit balance changes. Returns an unsubscribe function. */
export function onCreditChange(cb: CreditChangeCallback): () => void {
  _creditListeners.add(cb);
  return () => { _creditListeners.delete(cb); };
}

function emitCreditChange(balance: number): void {
  for (const cb of _creditListeners) {
    try { cb(balance); } catch { /* listener error — ignore */ }
  }
}

/**
 * Deduct credits with backend sync. Atomically decrements in MongoDB,
 * logs a transaction, and updates the local cache.
 * This is the ONLY way to deduct credits — no local-only deductions.
 * Throws if the server is unreachable — credits must always be server-verified.
 */
export async function deductCreditsWithSync(
  _userId: string,
  amount: number,
  source: string,
  description: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  if (amount <= 0) return true;

  const res = await fetch(`${API_BASE}/api/credit-transactions/deduct`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ amount, source, description, metadata }),
  });

  if (res.ok) {
    const data = await res.json();
    setCreditsBalance(data.credits);
    emitCreditChange(data.credits);
    return true;
  }

  if (res.status === 402) {
    const err = await res.json();
    if (typeof err.currentBalance === "number") {
      setCreditsBalance(err.currentBalance);
      emitCreditChange(err.currentBalance);
    }
    return false;
  }

  throw new Error("Unable to verify credits with server. Please check your connection.");
}

// ── Backend fetch ────────────────────────────────────────────────────────────

/**
 * Fetch credits from the backend API. Returns the backend balance, or -1 on failure.
 * This is the ONLY way to read credits — never use localStorage for feature gating.
 */
export async function fetchCreditsFromBackend(userId: string): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/api/user/credits?userId=${encodeURIComponent(userId)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return -1;
    const data = await res.json();
    if (typeof data.credits === "number") return data.credits;
    return -1;
  } catch {
    return -1;
  }
}

/**
 * Push credits to the backend API. Returns true on success.
 */
export async function pushCreditsToBackend(userId: string, credits: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/user/credits`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ userId, credits: Math.max(0, Math.round(credits)) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sync credits with the backend. The backend is the single source of truth.
 * Local localStorage cache is updated to match what the backend reports.
 * Local values are NEVER pushed to the backend during sync.
 */
export async function syncCreditsWithBackend(userId: string): Promise<number> {
  const backendCredits = await fetchCreditsFromBackend(userId);
  if (backendCredits < 0) return -1;

  setCreditsBalance(backendCredits);
  emitCreditChange(backendCredits);
  return backendCredits;
}

// ── Transaction History ─────────────────────────────────────────────────────

export interface CreditTransaction {
  _id?: string;
  userId: string;
  type: string;
  source: string;
  amount: number;
  balanceAfter: number;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Fetch recent credit transactions from the backend.
 * Returns an array of transactions, most recent first.
 */
export async function fetchCreditTransactions(limit = 10): Promise<CreditTransaction[]> {
  try {
    const res = await fetch(`${API_BASE}/api/credit-transactions?limit=${limit}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.transactions) ? data.transactions : [];
  } catch {
    return [];
  }
}

// ── Cost calculators ─────────────────────────────────────────────────────────

/** Transcription cost: 1 credit per minute of audio. */
export async function calculateTranscriptionCredits(durationSeconds: number): Promise<number> {
  const creditsPerMinute = await getTRANSCRIPTION_CREDITS_PER_MINUTE();
  return Math.ceil(durationSeconds / 60) * creditsPerMinute;
}

/** Translation cost: 1 credit per 150 words. */
export async function calculateTranslationCredits(wordCount: number): Promise<number> {
  const wordsPerCredit = await getTRANSLATION_WORDS_PER_CREDIT();
  return Math.ceil(wordCount / wordsPerCredit);
}

/** Count words in a text string (whitespace-delimited). */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ── Summary (for UI) ─────────────────────────────────────────────────────────

export interface CreditSummary {
  balance: number;
  isPro: boolean;
}

/**
 * Get credit summary. Balance must be provided (fetched from backend by caller).
 * Never reads localStorage for feature decisions.
 */
export function getCreditSummary(balance: number): CreditSummary {
  return {
    balance,
    isPro: isProUnlocked(),
  };
}
