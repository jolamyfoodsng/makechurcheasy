import { ObjectId } from "mongodb";
import clientPromise from "./mongodb";
import { COLLECTIONS, ensureIndexes, getPlanConfig } from "./db";
import { getTrialForUser, type TrialRecord } from "./trialRecords";
import { createTrialForUser } from "./trial";
import { recordActivationEvent } from "./activation";
import type { TrialExperimentAssignment } from "@/types/schemas";

export type TrialActivationEligibilityStatus = "pending" | "activating" | "activated";

export interface TrialActivationEligibility {
  _id?: ObjectId;
  userId: string;
  experimentId: string;
  variant: "activated_7d";
  durationDays: number;
  claimSignalKeys: string[];
  source: string;
  status: TrialActivationEligibilityStatus;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string | null;
  trialId?: string | null;
}

export async function getTrialActivationEligibility(
  userId: string,
): Promise<TrialActivationEligibility | null> {
  await ensureIndexes();
  const client = await clientPromise;
  return client
    .db()
    .collection<TrialActivationEligibility>(COLLECTIONS.TRIAL_ACTIVATION_ELIGIBILITY)
    .findOne({ userId });
}

export async function deferTrialActivation(params: {
  userId: string;
  assignment: TrialExperimentAssignment;
  claimSignalKeys: string[];
  source: string;
}): Promise<TrialActivationEligibility> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const now = new Date().toISOString();
  const filter = { userId: params.userId };
  const update = {
    $set: {
      experimentId: params.assignment.experimentId,
      variant: "activated_7d" as const,
      durationDays: params.assignment.durationDays,
      claimSignalKeys: params.claimSignalKeys,
      source: params.source,
      status: "pending" as const,
      updatedAt: now,
    },
    $setOnInsert: {
      userId: params.userId,
      createdAt: now,
      activatedAt: null,
      trialId: null,
    },
  };
  await db
    .collection<TrialActivationEligibility>(COLLECTIONS.TRIAL_ACTIVATION_ELIGIBILITY)
    .updateOne(filter, update, { upsert: true });
  return (await getTrialActivationEligibility(params.userId))!;
}

export async function activateDeferredTrial(
  userId: string,
  source: string,
): Promise<{
  activated: boolean;
  reason: string;
  trialRecord: TrialRecord | null;
}> {
  const existingTrial = await getTrialForUser(userId);
  if (existingTrial) {
    return {
      activated: existingTrial.status === "active",
      reason: "trial_already_exists",
      trialRecord: existingTrial,
    };
  }

  const client = await clientPromise;
  const db = client.db();
  const now = new Date().toISOString();
  const collection = db.collection<TrialActivationEligibility>(COLLECTIONS.TRIAL_ACTIVATION_ELIGIBILITY);
  const lock = await collection.updateOne(
    { userId, status: "pending" },
    { $set: { status: "activating", updatedAt: now } },
  );

  if (lock.modifiedCount === 0) {
    const current = await getTrialActivationEligibility(userId);
    if (current?.status === "activated" && current.trialId) {
      const activatedTrial = await getTrialForUser(userId);
      return { activated: Boolean(activatedTrial), reason: "already_activated", trialRecord: activatedTrial };
    }
    return { activated: false, reason: current ? "activation_in_progress" : "no_activation_required", trialRecord: null };
  }

  const eligibility = await getTrialActivationEligibility(userId);
  if (!eligibility) return { activated: false, reason: "no_activation_required", trialRecord: null };

  try {
    const trialRecord = await createTrialForUser(userId, `activation:${source}`, eligibility.durationDays);
    const planConfig = await getPlanConfig();
    await collection.updateOne(
      { userId },
      {
        $set: {
          status: "activated",
          activatedAt: now,
          trialId: trialRecord._id?.toString() || null,
          updatedAt: now,
        },
      },
    );
    if (eligibility.claimSignalKeys.length > 0) {
      await db.collection(COLLECTIONS.TRIAL_CLAIM_SIGNALS).updateMany(
        { signalKey: { $in: eligibility.claimSignalKeys }, userId },
        {
          $set: {
            status: "granted",
            trialId: trialRecord._id?.toString() || null,
            grantedAt: now,
            updatedAt: now,
          },
        },
      );
    }

    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          credits: planConfig.plans.trial.credits,
          "trialExperiment.activatedAt": now,
          "activationMilestones.trialActivated": true,
          "activationMilestones.trialActivatedAt": now,
        },
      },
    );
    await recordActivationEvent(userId, "trial_activated", { source, variant: eligibility.variant }, new Date(now));

    return { activated: true, reason: "trial_started", trialRecord };
  } catch (error) {
    await collection.updateOne(
      { userId, status: "activating" },
      { $set: { status: "pending", updatedAt: new Date().toISOString() } },
    );
    throw error;
  }
}
