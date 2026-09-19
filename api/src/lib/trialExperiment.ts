/**
 * Safe, server-assigned trial experiment controls.
 *
 * The experiment is disabled by default. Existing users and existing trial
 * records keep their current lifecycle; only a new eligible claim receives an
 * assignment when an admin enables the experiment.
 */

import crypto from "node:crypto";
import clientPromise from "./mongodb";
import { COLLECTIONS, ensureIndexes } from "./db";
import type {
  TrialExperimentAssignment,
  TrialExperimentSettings,
  TrialExperimentVariant,
} from "@/types/schemas";

export const TRIAL_EXPERIMENT_ID = "activated_trial_7d_v1";

export const DEFAULT_TRIAL_EXPERIMENT_SETTINGS: TrialExperimentSettings = {
  enabled: false,
  enabledAt: null,
  activatedTrialDurationDays: 7,
  controlTrialDurationDays: 14,
  betaTrialDurationDays: 30,
  activatedVariantAllocationPercent: 50,
  updatedAt: new Date().toISOString(),
};

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeSettings(raw: Partial<TrialExperimentSettings> | null | undefined): TrialExperimentSettings {
  return {
    enabled: raw?.enabled === true,
    enabledAt: typeof raw?.enabledAt === "string" ? raw.enabledAt : null,
    activatedTrialDurationDays: clampInteger(raw?.activatedTrialDurationDays, 7, 1, 90),
    controlTrialDurationDays: clampInteger(raw?.controlTrialDurationDays, 14, 1, 90),
    betaTrialDurationDays: clampInteger(raw?.betaTrialDurationDays, 30, 1, 180),
    activatedVariantAllocationPercent: clampInteger(raw?.activatedVariantAllocationPercent, 50, 0, 100),
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export async function getTrialExperimentSettings(): Promise<TrialExperimentSettings> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const existing = await db
    .collection(COLLECTIONS.TRIAL_EXPERIMENT_SETTINGS)
    .findOne({ _id: "default" as any });

  if (existing) return normalizeSettings(existing as Partial<TrialExperimentSettings>);

  const seeded = {
    ...DEFAULT_TRIAL_EXPERIMENT_SETTINGS,
    updatedAt: new Date().toISOString(),
  };
  await db.collection(COLLECTIONS.TRIAL_EXPERIMENT_SETTINGS).updateOne(
    { _id: "default" as any },
    { $set: seeded },
    { upsert: true },
  );
  return seeded;
}

export async function updateTrialExperimentSettings(
  updates: Partial<Omit<TrialExperimentSettings, "_id" | "updatedAt">>,
): Promise<TrialExperimentSettings> {
  const client = await clientPromise;
  const db = client.db();
  const current = await getTrialExperimentSettings();
  const now = new Date().toISOString();
  const enabling = updates.enabled === true && (!current.enabled || !current.enabledAt);
  const disabling = updates.enabled === false && current.enabled;
  const next = normalizeSettings({
    ...current,
    ...updates,
    enabledAt: enabling ? now : disabling ? null : current.enabledAt,
    updatedAt: now,
  });
  await db.collection(COLLECTIONS.TRIAL_EXPERIMENT_SETTINGS).updateOne(
    { _id: "default" as any },
    { $set: next },
    { upsert: true },
  );
  return next;
}

function stableBucket(userId: string): number {
  const digest = crypto.createHash("sha256").update(`${TRIAL_EXPERIMENT_ID}:${userId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

function isVariant(value: unknown): value is TrialExperimentVariant {
  return value === "control" || value === "activated_7d" || value === "beta";
}

/**
 * Return the sticky assignment for a user, creating it only for a new claim
 * while the experiment is enabled. A beta flag is an explicit admin override.
 */
export async function getOrAssignTrialExperiment(
  userId: string,
  email: string,
): Promise<TrialExperimentAssignment | null> {
  const client = await clientPromise;
  const db = client.db();
  const user = await db.collection("users").findOne(
    { _id: new (await import("mongodb")).ObjectId(userId) },
    { projection: { trialExperiment: 1, createdAt: 1, signupDate: 1 } },
  );

  const stored = user?.trialExperiment;
  if (stored && isVariant(stored.variant) && stored.experimentId === TRIAL_EXPERIMENT_ID) {
    return stored as TrialExperimentAssignment;
  }

  const settings = await getTrialExperimentSettings();
  if (!settings.enabled) return null;

  const betaCohort = stored?.betaCohort === true;
  if (!betaCohort) {
    // Fail closed if an enabled experiment has no rollout timestamp. This
    // prevents a settings migration from silently enrolling older accounts.
    if (!settings.enabledAt) return null;
    const createdAt = new Date(user?.createdAt || user?.signupDate || 0);
    const enabledAt = new Date(settings.enabledAt);
    if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(enabledAt.getTime()) || createdAt < enabledAt) {
      return null;
    }
  }
  const variant: TrialExperimentVariant = betaCohort
    ? "beta"
    : stableBucket(userId) < settings.activatedVariantAllocationPercent
      ? "activated_7d"
      : "control";
  const durationDays = variant === "activated_7d"
    ? settings.activatedTrialDurationDays
    : variant === "beta"
      ? settings.betaTrialDurationDays
      : settings.controlTrialDurationDays;
  const assignment: TrialExperimentAssignment = {
    experimentId: TRIAL_EXPERIMENT_ID,
    variant,
    durationDays,
    activationRequired: variant === "activated_7d",
    betaCohort,
    assignedAt: new Date().toISOString(),
    activatedAt: null,
  };

  await db.collection("users").updateOne(
    { _id: new (await import("mongodb")).ObjectId(userId) },
    { $set: { trialExperiment: assignment } },
  );

  // Keep the argument in the function signature explicit: the assignment is
  // intentionally keyed to the authenticated account, not to raw email data.
  void email;
  return assignment;
}

export function isActivatedTrialAssignment(
  assignment: TrialExperimentAssignment | null | undefined,
): boolean {
  return assignment?.experimentId === TRIAL_EXPERIMENT_ID && assignment.variant === "activated_7d";
}
