/**
 * trialAudit.ts — Audit log for every trial action.
 *
 * Records who did what, when, and what changed (previous/new expiry).
 * Enables admin review of all trial modifications.
 */

import clientPromise from "./mongodb";
import type { TrialAuditLog, TrialStatus } from "@/types/schemas";

const COLLECTION = "trial_audit_logs";

export type TrialAction = TrialAuditLog["action"];

/**
 * Log a trial action to the audit collection.
 */
export async function logTrialAction(params: {
  userId: string;
  action: TrialAction;
  performedBy: string;
  previousExpiry?: string;
  newExpiry?: string;
  notes?: string;
}): Promise<void> {
  const client = await clientPromise;
  const db = client.db();

  const entry: TrialAuditLog = {
    userId: params.userId,
    action: params.action,
    performedBy: params.performedBy,
    previousExpiry: params.previousExpiry,
    newExpiry: params.newExpiry,
    notes: params.notes,
    createdAt: new Date().toISOString(),
  };

  await db.collection<TrialAuditLog>(COLLECTION).insertOne(entry);
}

/**
 * Get audit log entries, optionally filtered by userId.
 */
export async function getTrialAuditLog(
  userId?: string,
  limit = 50
): Promise<TrialAuditLog[]> {
  const client = await clientPromise;
  const db = client.db();

  const filter = userId ? { userId } : {};
  return db
    .collection<TrialAuditLog>(COLLECTION)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}
