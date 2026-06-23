/**
 * offlineCreditQueue.ts — Offline credit deduction queue
 *
 * When the backend is unreachable, credit deductions are queued locally.
 * On reconnect, each transaction is synced individually to the server.
 *
 * The queue uses localStorage for persistence across app restarts.
 */

import { getUserScopedKey } from "./userScopedStorage";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PendingCreditTransaction {
  id: string;
  feature: string;
  amount: number;
  description: string;
  createdAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ocs-pending-credits";

// ── Storage ──────────────────────────────────────────────────────────────────

function readQueueRaw(): PendingCreditTransaction[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingCreditTransaction[]): void {
  try {
    localStorage.setItem(getUserScopedKey(STORAGE_KEY), JSON.stringify(queue));
  } catch {
    // Storage full or unavailable
  }
}

// ── Operations ───────────────────────────────────────────────────────────────

/**
 * Add a credit deduction to the offline queue.
 */
export function queueDeduction(
  feature: string,
  amount: number,
  description: string
): PendingCreditTransaction {
  const tx: PendingCreditTransaction = {
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    feature,
    amount,
    description,
    createdAt: new Date().toISOString(),
  };

  const queue = readQueueRaw();
  queue.push(tx);
  writeQueue(queue);
  return tx;
}

/**
 * Get all pending transactions.
 */
export function getPendingTransactions(): PendingCreditTransaction[] {
  return readQueueRaw();
}

/**
 * Remove a single transaction after successful sync.
 */
export function removeTransaction(id: string): void {
  const queue = readQueueRaw();
  const filtered = queue.filter((tx) => tx.id !== id);
  writeQueue(filtered);
}

/**
 * Remove multiple transactions after successful batch sync.
 */
export function removeTransactions(ids: string[]): void {
  const queue = readQueueRaw();
  const idSet = new Set(ids);
  const filtered = queue.filter((tx) => !idSet.has(tx.id));
  writeQueue(filtered);
}

/**
 * Clear all pending transactions (e.g. after full sync).
 */
export function clearAllPending(): void {
  writeQueue([]);
}

/**
 * Total credits in the pending queue.
 */
export function getPendingTotal(): number {
  const queue = readQueueRaw();
  return queue.reduce((sum, tx) => sum + tx.amount, 0);
}

/**
 * Number of pending transactions.
 */
export function getPendingCount(): number {
  return readQueueRaw().length;
}

/**
 * Get the offline credit balance (cached balance minus pending deductions).
 */
export function getOfflineCreditBalance(cachedBalance: number): number {
  return Math.max(0, cachedBalance - getPendingTotal());
}
