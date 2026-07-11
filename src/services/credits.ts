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
 *
 * Credits are calculated dynamically:
 *   remaining = planAllocation + adminGranted − totalConsumed
 *   -1 = unlimited (admin or plan with -1)
 */

import { isProUnlocked } from "./proLicense";
export { isProUnlocked };

import { getPlanConfig } from "./planConfig";
import { getUserScopedKey } from "./userScopedStorage";
import type { PlanConfig } from "./planConfig";
import { getDeviceId } from "./authService";
import { requestJsonWithRetry } from "./requestDedup";
import {
  queueDeduction,
  getPendingTransactions,
  removeTransaction,
  getPendingCount as getPendingCount,
  getOfflineCreditBalance,
} from "./offlineCreditQueue";

export { getPendingCount, getOfflineCreditBalance };

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
const FETCHED_AT_KEY = "ocs-credits-fetched-at";
const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";
const REMOTE_CACHE_TTL_MS = 5 * 60 * 1000;

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
      if (typeof parsed === "number" && (parsed === -1 || parsed >= 0)) return parsed;
    }
  } catch { /* ignore */ }
  return 0;
}

/** Write balance to localStorage cache (called after backend sync). */
function setCreditsBalance(amount: number): void {
  try {
    const normalized =
      amount === -1 ? -1 : Math.max(0, Math.round(amount));
    localStorage.setItem(getUserScopedKey(STORAGE_KEY), JSON.stringify(normalized));
    localStorage.setItem(getUserScopedKey(FETCHED_AT_KEY), JSON.stringify(Date.now()));
  } catch { /* ignore */ }
}

function getLastFetchedAt(): number | null {
  try {
    const raw = localStorage.getItem(getUserScopedKey(FETCHED_AT_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasFreshRemoteCache(): boolean {
  const lastFetchedAt = getLastFetchedAt();
  return lastFetchedAt !== null && (Date.now() - lastFetchedAt) < REMOTE_CACHE_TTL_MS;
}

export function applyCreditSnapshotFromServer(balance: number): void {
  if (balance !== -1 && balance < 0) return;
  setCreditsBalance(balance);
  emitCreditChange(balance);
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
 *
 * When offline or the backend is unreachable, the transaction is queued
 * locally and synced automatically when connectivity is restored.
 * Returns true if the deduction succeeded (online) or was queued (offline).
 * Returns false only on 402 (insufficient credits).
 */
export async function deductCreditsWithSync(
  _userId: string,
  amount: number,
  source: string,
  description: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  if (amount <= 0) return true;

  try {
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

    // Server error — queue for later
    const tx = queueDeduction(source, amount, description);
    console.warn(`[Credits] Server error (${res.status}) — queued transaction ${tx.id}`);
    const offlineBalance = getOfflineCreditBalance(getCreditsBalance());
    setCreditsBalance(offlineBalance);
    emitCreditChange(offlineBalance);
    return true;
  } catch {
    // Network failure — queue for later
    const tx = queueDeduction(source, amount, description);
    console.warn(`[Credits] Offline — queued transaction ${tx.id}`);
    const offlineBalance = getOfflineCreditBalance(getCreditsBalance());
    setCreditsBalance(offlineBalance);
    emitCreditChange(offlineBalance);
    return true;
  }
}

// ── Backend fetch ────────────────────────────────────────────────────────────

/** Full credit breakdown from the backend. */
export interface CreditDetails {
  credits: number;
  totalConsumed: number;
  planAllocation: number;
  adminGranted: number;
  isAdmin: boolean;
}

/**
 * Fetch full credit details from the backend API.
 * Returns the complete breakdown or null on failure.
 */
export async function fetchCreditDetails(): Promise<CreditDetails | null> {
  try {
    const { response, data } = await requestJsonWithRetry<CreditDetails>(
      `${API_BASE}/api/user/credits`,
      {
        dedupeKey: `credits:details:${getDeviceId() || "anonymous"}`,
        headers: authHeaders(),
        retryDelaysMs: [1000, 3000],
      },
    );
    if (!response.ok || !data) return null;
    if (typeof data.credits === "number") {
      return {
        credits: data.credits,
        totalConsumed: data.totalConsumed ?? 0,
        planAllocation: data.planAllocation ?? 0,
        adminGranted: data.adminGranted ?? 0,
        isAdmin: data.isAdmin ?? false,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch credits from the backend API. Returns the dynamically-calculated
 * balance, or -1 on failure.
 * This is the ONLY way to read credits — never use localStorage for feature gating.
 * Auth is via X-Device-Id header — no userId param needed.
 */
export async function fetchCreditsFromBackend(): Promise<number> {
  const details = await fetchCreditDetails();
  return details?.credits ?? -1;
}

/**
 * Sync credits with the backend. The backend is the single source of truth.
 * Local localStorage cache is updated to match what the backend reports.
 */
export async function syncCreditsWithBackend(options?: { force?: boolean }): Promise<number> {
  if (!options?.force && hasFreshRemoteCache()) {
    return getCreditsBalance();
  }

  const backendCredits = await fetchCreditsFromBackend();
  if (backendCredits < 0) return -1;

  applyCreditSnapshotFromServer(backendCredits);
  return backendCredits;
}

// ── Offline queue sync ─────────────────────────────────────────────────────

let _syncing = false;

/**
 * Sync all pending offline credit transactions to the backend.
 * Called on app startup and when the browser comes back online.
 * Each transaction is sent to POST /api/credit-transactions/sync-offline
 * which handles deduplication via transactionId.
 *
 * Returns true if all transactions synced successfully.
 */
export async function syncPendingTransactions(): Promise<boolean> {
  if (_syncing) return false;
  _syncing = true;

  try {
    const pending = getPendingTransactions();
    if (pending.length === 0) return true;

    console.log(`[Credits] Syncing ${pending.length} pending offline transaction(s)...`);

    let failed = 0;
    for (const tx of pending) {
      try {
        const res = await fetch(`${API_BASE}/api/credit-transactions/sync-offline`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            transactionId: tx.id,
            feature: tx.feature,
            amount: tx.amount,
            description: tx.description,
          }),
        });

        if (res.ok || res.status === 402) {
          // Success or insufficient credits — remove from queue either way
          removeTransaction(tx.id);
        } else {
          // Server error — leave in queue for next retry
          console.warn(`[Credits] Failed to sync transaction ${tx.id}: HTTP ${res.status}`);
          failed++;
        }
      } catch {
        // Network error — leave in queue for next retry
        console.warn(`[Credits] Failed to sync transaction ${tx.id}: network error`);
        failed++;
      }
    }

    // Sync final balance from backend
    await syncCreditsWithBackend({ force: true });

    if (failed === 0) {
      console.log("[Credits] All pending transactions synced successfully");
    } else {
      console.warn(`[Credits] ${failed} transaction(s) failed to sync — will retry`);
    }

    return failed === 0;
  } finally {
    _syncing = false;
  }
}

// ── Transaction History ─────────────────────────────────────────────────────

export interface CreditTransaction {
  _id?: string;
  userId: string;
  type: string;
  source: string;
  amount: number;
  balanceAfter?: number;
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
  isAdmin?: boolean;
}

/**
 * Get credit summary. Balance must be provided (fetched from backend by caller).
 * Never reads localStorage for feature decisions.
 */
export function getCreditSummary(balance: number, extra?: { isAdmin?: boolean }): CreditSummary {
  return {
    balance,
    isPro: isProUnlocked(),
    isAdmin: extra?.isAdmin,
  };
}

// ── Reserve / Commit / Refund flow ──────────────────────────────────────────

export interface ReserveResult {
  credits: number;
  deducted: number;
  reservationId: string;
}

/**
 * Reserve credits for a translation before it starts.
 * Returns reservationId + remaining balance, or null on failure.
 */
export async function reserveTranslationCredits(
  amount: number,
  source: string,
  description: string,
  metadata?: Record<string, unknown>
): Promise<ReserveResult | null> {
  try {
    const res = await fetch(`${API_BASE}/api/credit-transactions/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ amount, source, description, metadata }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    setCreditsBalance(data.credits);
    emitCreditChange(data.credits);
    return { credits: data.credits, deducted: data.deducted, reservationId: data.reservationId };
  } catch {
    return null;
  }
}

/**
 * Commit a previously reserved translation — marks credits as permanently used.
 */
export async function commitTranslationCredits(reservationId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/credit-transactions/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ reservationId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Refund a previously reserved translation — restores credits on failure.
 */
export async function refundTranslationCredits(reservationId: string): Promise<{ refunded: boolean; credits: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/credit-transactions/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ reservationId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.credits === "number") {
      setCreditsBalance(data.credits);
      emitCreditChange(data.credits);
    }
    return { refunded: data.refunded, credits: data.credits };
  } catch {
    return null;
  }
}
