/**
 * trialSettings.ts — Dedicated trial settings collection.
 *
 * Independent from PlanConfig. Admin-controlled enable/disable toggles
 * for new and existing users, configurable duration, email preferences.
 */

import clientPromise from "./mongodb";
import type { TrialSettings } from "@/types/schemas";

const COLLECTION = "trial_settings";

export const DEFAULT_TRIAL_SETTINGS: TrialSettings = {
  enableForNewUsers: true,
  enableForExistingUsers: false,
  defaultDurationDays: 14,
  sendExtensionEmails: true,
  sendRestartEmails: true,
  sendStopEmails: true,
  updatedAt: new Date().toISOString(),
};

/**
 * Get the current trial settings.
 * Seeds defaults if the document does not exist yet.
 */
export async function getTrialSettings(): Promise<TrialSettings> {
  const client = await clientPromise;
  const db = client.db();

  let doc = await db
    .collection<TrialSettings>(COLLECTION)
    .findOne({ _id: "default" as any }) as TrialSettings | null;

  if (!doc) {
    const seed: TrialSettings = {
      ...DEFAULT_TRIAL_SETTINGS,
      updatedAt: new Date().toISOString(),
    };
    await db
      .collection<TrialSettings>(COLLECTION)
      .updateOne({ _id: "default" as any }, { $set: seed }, { upsert: true });
    doc = seed;
  }

  return doc;
}

/**
 * Update trial settings (admin only).
 */
export async function upsertTrialSettings(
  updates: Partial<Omit<TrialSettings, "_id" | "updatedAt">>
): Promise<TrialSettings> {
  const client = await clientPromise;
  const db = client.db();

  const now = new Date().toISOString();
  await db
    .collection<TrialSettings>(COLLECTION)
    .updateOne(
      { _id: "default" as any },
      { $set: { ...updates, updatedAt: now } },
      { upsert: true }
    );

  return getTrialSettings();
}
