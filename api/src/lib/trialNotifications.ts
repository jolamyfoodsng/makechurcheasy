/**
 * trialNotifications.ts — Tracks trial email notifications.
 *
 * Records every notification sent/queued so the admin can review
 * which users received which trial emails and when.
 */

import clientPromise from "./mongodb";
import type { TrialNotification } from "@/types/schemas";

const COLLECTION = "trial_notifications";

export type TrialNotificationType = TrialNotification["type"];

/**
 * Create a trial notification record.
 */
export async function createTrialNotification(
  userId: string,
  type: TrialNotificationType
): Promise<void> {
  const client = await clientPromise;
  const db = client.db();

  const entry: TrialNotification = {
    userId,
    type,
    sent: false,
    createdAt: new Date().toISOString(),
  };

  await db.collection<TrialNotification>(COLLECTION).insertOne(entry);
}

/**
 * Mark a notification as sent.
 */
export async function markNotificationSent(
  notificationId: string
): Promise<void> {
  const client = await clientPromise;
  const db = client.db();

  await db
    .collection<TrialNotification>(COLLECTION)
    .updateOne(
      { _id: new (await import("mongodb")).ObjectId(notificationId) },
      { $set: { sent: true, sentAt: new Date().toISOString() } }
    );
}

/**
 * Get pending (unsent) notifications.
 */
export async function getPendingTrialNotifications(): Promise<TrialNotification[]> {
  const client = await clientPromise;
  const db = client.db();

  return db
    .collection<TrialNotification>(COLLECTION)
    .find({ sent: false })
    .sort({ createdAt: 1 })
    .toArray();
}
