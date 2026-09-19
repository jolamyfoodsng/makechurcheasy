/**
 * Product activation events shared by desktop tracking and admin analytics.
 *
 * The funnel deliberately measures distinct users, not raw event volume:
 * signup -> onboarding -> OBS -> first useful result -> return -> payment.
 */

import { ObjectId } from "mongodb";
import clientPromise from "./mongodb";
import { COLLECTIONS, ensureIndexes } from "./db";

export const ACTIVATION_EVENT_NAMES = [
  "user_signup",
  "user_login",
  "user_logout",
  "app_installed",
  "first_app_open",
  "app_started",
  "device_paired",
  "onboarding_started",
  "onboarding_step_completed",
  "onboarding_completed",
  "onboarding_skipped",
  "obs_connected",
  "first_use_started",
  "first_use",
  "first_presentation",
  "overlay_mode_switched",
  "bible_present",
  "worship_song_presented",
  "song_presented",
  "media_presented",
  "translation_generated",
  "sts_push_to_live",
  "paywall_viewed",
  "trial_paywall_viewed",
  "upgrade_modal_viewed",
  "trial_expired_upgrade_viewed",
  "checkout_started",
  "payment_completed",
  "payment_failed",
  "trial_activated",
] as const;

export type ActivationEventName = (typeof ACTIVATION_EVENT_NAMES)[number] | string;

export const CORE_USE_EVENTS = new Set([
  "first_use",
  "first_presentation",
  "bible_present",
  "worship_song_presented",
  "song_presented",
  "media_presented",
  "translation_generated",
  "sts_push_to_live",
]);

export const PAYWALL_EVENTS = new Set([
  "paywall_viewed",
  "trial_paywall_viewed",
  "upgrade_modal_viewed",
  "trial_expired_upgrade_viewed",
]);

export const RETURN_EVENTS = new Set([
  "app_started",
  "user_login",
  "obs_connected",
  ...CORE_USE_EVENTS,
]);

function validObjectId(value: string): ObjectId | null {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

/**
 * Insert a backend activity event and update the small user-level milestone
 * projection used by onboarding, email personalization, and the funnel.
 */
export async function recordActivationEvent(
  userId: string | null | undefined,
  event: ActivationEventName,
  properties: Record<string, unknown> = {},
  timestamp = new Date(),
): Promise<void> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const timestampDate = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const timestampIso = Number.isFinite(timestampDate.getTime())
    ? timestampDate.toISOString()
    : new Date().toISOString();

  const objectId = userId ? validObjectId(userId) : null;
  let existingUser: any = null;
  if (objectId) {
    existingUser = await db.collection("users").findOne(
      { _id: objectId },
      { projection: { activationMilestones: 1, onboarding: 1 } },
    );
  }

  const milestones = existingUser?.activationMilestones || {};
  const alreadyFirstPresented = Boolean(milestones.firstPresentation);

  // If event is "first_presentation" and user has already recorded one, skip duplicate activity row
  if (event === "first_presentation" && alreadyFirstPresented) {
    if (objectId) {
      await db.collection("users").updateOne(
        { _id: objectId },
        { $set: { lastActive: timestampIso } },
      );
    }
    return;
  }

  // Insert the primary activity event
  await db.collection(COLLECTIONS.ACTIVITY_EVENTS).insertOne({
    event,
    userId: userId || null,
    properties,
    timestamp: timestampDate,
    createdAt: timestampIso,
  });

  if (!userId || !objectId) return;

  const set: Record<string, unknown> = { lastActive: timestampIso };
  const unset: Record<string, ""> = {};

  if (event === "app_installed" && !milestones.appDownloaded) {
    set["activationMilestones.appDownloaded"] = true;
    set["activationMilestones.appDownloadedAt"] = timestampIso;
  }
  if (event === "device_paired" && !milestones.devicePaired) {
    set["activationMilestones.devicePaired"] = true;
    set["activationMilestones.devicePairedAt"] = timestampIso;
  }
  if (event === "onboarding_started" && !existingUser?.onboarding?.activationStartedAt) {
    set["onboarding.activationStartedAt"] = timestampIso;
  }
  if (event === "onboarding_completed" && !existingUser?.onboarding?.activationCompletedAt) {
    set["onboarding.activationCompletedAt"] = timestampIso;
  }
  if (event === "obs_connected" && !milestones.obsConnected) {
    set["activationMilestones.obsConnected"] = true;
    set["activationMilestones.obsConnectedAt"] = timestampIso;
  }
  if (CORE_USE_EVENTS.has(event)) {
    if (!milestones.firstUse) {
      set["activationMilestones.firstUse"] = true;
      set["activationMilestones.firstUseAt"] = timestampIso;
    }
    const isPresentationTrigger =
      event === "first_presentation" ||
      event.endsWith("presented") ||
      event === "bible_present" ||
      event === "sts_push_to_live";

    if (isPresentationTrigger && !alreadyFirstPresented) {
      set["activationMilestones.firstPresentation"] = true;
      set["activationMilestones.firstPresentationAt"] = timestampIso;
      if (properties?.screenshotUrl && typeof properties.screenshotUrl === "string") {
        set["activationMilestones.firstPresentationScreenshotUrl"] = properties.screenshotUrl;
      }
      if (event !== "first_presentation") {
        // Also insert the dedicated first_presentation event once
        await db.collection(COLLECTIONS.ACTIVITY_EVENTS).insertOne({
          event: "first_presentation",
          userId: userId || null,
          properties: {
            source: "first_presentation_trigger",
            triggerEvent: event,
            ...properties,
          },
          timestamp: timestampDate,
          createdAt: timestampIso,
        });
      }
    }
  }
  if (event === "trial_activated") {
    set["trialExperiment.activatedAt"] = timestampIso;
    unset["trialExperiment.activationRequired"] = "";
  }

  if (Object.keys(set).length > 1 || Object.keys(unset).length > 0) {
    const update: Record<string, Record<string, unknown>> = { $set: set };
    if (Object.keys(unset).length > 0) update.$unset = unset;
    await db.collection("users").updateOne({ _id: objectId }, update);
  }
}
