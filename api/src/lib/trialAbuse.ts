import crypto from "crypto";
import type { NextRequest } from "next/server";
import { ObjectId, type Collection } from "mongodb";
import clientPromise from "./mongodb";
import { COLLECTIONS } from "@/lib/db";
import { isTrialEnabled, createTrialForUser } from "@/lib/trial";
import { getTrialForUser, type TrialRecord } from "@/lib/trialRecords";
import {
  getOrAssignTrialExperiment,
  isActivatedTrialAssignment,
} from "./trialExperiment";
import {
  deferTrialActivation,
  getTrialActivationEligibility,
} from "./trialActivation";

export type TrialClaimSource =
  | "signup"
  | "email_confirmed"
  | "verify_email"
  | "google_callback"
  | "verify_login_code"
  | "email_login"
  | "pairing_authorize"
  | "pairing_redeem"
  | "migration"
  | "auth_existing_user";

export type TrialSignalType =
  | "email"
  | "device_fingerprint"
  | "installation"
  | "device"
  | "ip_ua";

type TrialSignal = {
  type: TrialSignalType;
  key: string;
};

export type TrialClaimResult = {
  eligible: boolean;
  created: boolean;
  trialRecord: TrialRecord | null;
  reason?: string;
  matchedSignalTypes?: string[];
  assignment?: Awaited<ReturnType<typeof getOrAssignTrialExperiment>>;
};

export const TRIAL_ALREADY_CLAIMED_MESSAGE =
  "This device has already used its free trial. Please subscribe to continue.";

type TrialClaimParams = {
  userId: string;
  email: string;
  req?: NextRequest;
  source: TrialClaimSource;
  deviceId?: string | null;
  deviceFingerprintHash?: string | null;
  installationId?: string | null;
};

const CLAIM_RESERVATION_MS = 15 * 60 * 1000;

let warnedAboutTrialSalt = false;

/**
 * The salt must never change once trials have been claimed: every stored
 * signal key is derived from it, so a new salt makes every computer look
 * new and lets it start another trial. TRIAL_ABUSE_SALT pins it; the
 * JWT_SECRET fallback only exists for deployments that predate it.
 */
function getTrialSalt(): string {
  const pinned = process.env.TRIAL_ABUSE_SALT?.trim();
  if (pinned) return pinned;

  // Keep this fallback order exactly as it was: existing claim records were
  // hashed with whichever value it resolved to, and changing it would let
  // every computer start a new trial.
  const source = process.env.JWT_SECRET
    ? "JWT_SECRET"
    : process.env.NEXTAUTH_SECRET
      ? "NEXTAUTH_SECRET"
      : "the built-in default";

  if (!warnedAboutTrialSalt && process.env.NODE_ENV === "production") {
    warnedAboutTrialSalt = true;
    console.warn(
      `[trialAbuse] TRIAL_ABUSE_SALT is not set; using ${source}. ` +
      "Set TRIAL_ABUSE_SALT to that exact value and never change it, " +
      "otherwise every one-trial-per-computer record is lost.",
    );
  }

  return (
    process.env.JWT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "makechurcheasy-trial-abuse-v1"
  );
}

function hashTrialValue(value: string): string {
  return crypto.createHmac("sha256", getTrialSalt()).update(value).digest("hex");
}

// ── Why a user has no trial (shown in the desktop app and dashboard) ────────

export type TrialEligibilityStatus = "used_on_device" | "desktop_required";

export type ClientTrialEligibility = {
  status: TrialEligibilityStatus;
  message: string;
};

export const TRIAL_USED_ON_DEVICE_MESSAGE =
  "The free trial has already been used on this computer. You're on the Free plan.";
export const TRIAL_DESKTOP_REQUIRED_MESSAGE =
  "Your free trial starts when you sign in on the MakeChurchEasy desktop app.";

function toClientTrialEligibility(status: unknown): ClientTrialEligibility | null {
  if (status === "used_on_device") {
    return { status, message: TRIAL_USED_ON_DEVICE_MESSAGE };
  }
  if (status === "desktop_required") {
    return { status, message: TRIAL_DESKTOP_REQUIRED_MESSAGE };
  }
  return null;
}

/**
 * Persist (or clear) the reason a user has no trial so every client can
 * explain it. Failures are logged and never block sign-in.
 */
async function recordTrialEligibility(
  userId: string,
  status: TrialEligibilityStatus | null,
): Promise<void> {
  if (!ObjectId.isValid(userId)) return;
  try {
    const client = await clientPromise;
    const users = client.db().collection("users");
    if (status) {
      // A login without a fingerprint must not hide the stronger
      // "already used on this computer" finding.
      const filter: Record<string, any> = { _id: new ObjectId(userId) };
      if (status === "desktop_required") {
        filter["trialEligibility.status"] = { $ne: "used_on_device" };
      }
      await users.updateOne(
        filter,
        { $set: { trialEligibility: { status, updatedAt: new Date().toISOString() } } },
      );
    } else {
      await users.updateOne(
        { _id: new ObjectId(userId), trialEligibility: { $exists: true } },
        { $unset: { trialEligibility: "" } },
      );
    }
  } catch (error) {
    console.error("[trialAbuse] Failed to record trial eligibility:", error);
  }
}

/**
 * Trial-unavailable reason for API responses. Returns null whenever the
 * user has (or had) a trial, so the notice never contradicts a trial.
 */
export async function getClientTrialEligibility(
  userId: string,
  hasTrial: boolean,
): Promise<ClientTrialEligibility | null> {
  if (hasTrial || !ObjectId.isValid(userId)) return null;
  try {
    const client = await clientPromise;
    const user = await client
      .db()
      .collection("users")
      .findOne(
        { _id: new ObjectId(userId) },
        { projection: { trialEligibility: 1, plan: 1 } },
      );
    const plan = String(user?.plan || "free").toLowerCase();
    if (plan !== "free") return null;
    return toClientTrialEligibility(user?.trialEligibility?.status);
  } catch (error) {
    console.error("[trialAbuse] Failed to read trial eligibility:", error);
    return null;
  }
}

export function normalizeEmailForTrial(email: string): string {
  const normalized = email.trim().toLowerCase();
  const [rawLocal, rawDomain] = normalized.split("@");
  if (!rawLocal || !rawDomain) return normalized;

  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  let local = rawLocal;

  if (domain === "gmail.com") {
    local = local.split("+")[0].replace(/\./g, "");
  }

  return `${local}@${domain}`;
}

function getClientIp(req?: NextRequest): string | null {
  if (!req) return null;
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || null;
}

/**
 * Return the irreversible key used to store a trial signal.
 * Raw emails, hardware identifiers, and IP addresses are never stored.
 */
export function getTrialSignalKey(type: TrialSignalType, value: string): string {
  return `${type}:${hashTrialValue(`${type}:${value}`)}`;
}

/**
 * The desktop fingerprint is a SHA-256 hash generated from stable platform
 * identifiers. It is deliberately required for a first trial claim so that
 * deleting the app or creating another email cannot reset the trial.
 */
export function isUsableDeviceFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value.trim()) && !/^0{64}$/i.test(value.trim());
}

function hasRequiredDeviceIdentity(params: TrialClaimParams): boolean {
  if (isUsableDeviceFingerprint(params.deviceFingerprintHash)) return true;

  // Installation IDs are useful for older builds, but are resettable by an
  // uninstall. Keep them as an emergency compatibility fallback only when
  // explicitly enabled in the environment.
  return process.env.TRIAL_REQUIRE_DEVICE_FINGERPRINT === "false"
    && Boolean(params.installationId?.trim());
}

async function bindSignalsToExistingTrial(
  claims: Collection<Record<string, any>>,
  signals: TrialSignal[],
  params: TrialClaimParams,
  trialRecord: TrialRecord,
  now: string,
  reservationCutoff: string,
): Promise<string[]> {
  const matchedSignalTypes: string[] = [];

  for (const signal of signals) {
    const existing = await claims.findOne({ signalKey: signal.key });
    if (existing && existing.userId !== params.userId) {
      if (
        existing.status === "granted" ||
        (existing.status === "reserved" && existing.createdAt >= reservationCutoff)
      ) {
        matchedSignalTypes.push(signal.type);
      }
      continue;
    }

    if (existing) {
      await claims.updateOne(
        { signalKey: signal.key, userId: params.userId },
        {
          $set: {
            signalType: signal.type,
            status: "granted",
            trialId: trialRecord._id?.toString() || null,
            grantedAt: existing.grantedAt || now,
            source: existing.source || params.source,
            updatedAt: now,
          },
        },
      );
      continue;
    }

    try {
      await claims.insertOne({
        signalKey: signal.key,
        signalType: signal.type,
        userId: params.userId,
        source: params.source,
        status: "granted",
        trialId: trialRecord._id?.toString() || null,
        grantedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error: any) {
      // A concurrent claim may have inserted the same unique signal. Never
      // overwrite the other user's ownership; just report the match.
      if (error?.code !== 11000) throw error;
      const concurrent = await claims.findOne({ signalKey: signal.key });
      if (concurrent?.userId !== params.userId) matchedSignalTypes.push(signal.type);
    }
  }

  return Array.from(new Set(matchedSignalTypes));
}

function buildTrialSignals(params: TrialClaimParams): TrialSignal[] {
  const signals: TrialSignal[] = [
    {
      type: "email",
      key: getTrialSignalKey("email", normalizeEmailForTrial(params.email)),
    },
  ];

  const deviceFingerprintHash = params.deviceFingerprintHash?.trim();
  if (deviceFingerprintHash) {
    signals.push({
      type: "device_fingerprint",
      key: getTrialSignalKey("device_fingerprint", deviceFingerprintHash),
    });
  }

  const installationId = params.installationId?.trim();
  if (installationId) {
    signals.push({
      type: "installation",
      key: getTrialSignalKey("installation", installationId),
    });
  }

  const deviceId = params.deviceId?.trim();
  if (deviceId) {
    signals.push({
      type: "device",
      key: getTrialSignalKey("device", deviceId),
    });
  }

  const ip = getClientIp(params.req);
  const userAgent = params.req?.headers.get("user-agent")?.trim();
  // IP + user-agent is intentionally opt-in. A church, school, or office
  // often shares one public IP, so it must not consume another person's
  // trial when a stable desktop fingerprint is available.
  if (ip && userAgent && process.env.TRIAL_BLOCK_IP_UA === "true") {
    signals.push({
      type: "ip_ua",
      key: getTrialSignalKey("ip_ua", `${ip}|${userAgent}`),
    });
  }

  return signals;
}

let trialClaimIndexesPromise: Promise<void> | null = null;

async function ensureTrialClaimIndexes() {
  if (!trialClaimIndexesPromise) {
    trialClaimIndexesPromise = (async () => {
      const client = await clientPromise;
      const db = client.db();
      await Promise.all([
        db.collection(COLLECTIONS.TRIAL_CLAIM_SIGNALS).createIndex(
          { signalKey: 1 },
          { unique: true }
        ),
        db.collection(COLLECTIONS.TRIAL_CLAIM_SIGNALS).createIndex({ userId: 1, createdAt: -1 }),
        db.collection(COLLECTIONS.TRIAL_CLAIM_SIGNALS).createIndex({ status: 1, createdAt: -1 }),
      ]);
    })().catch((error) => {
      // Allow a later request to retry if MongoDB was temporarily unavailable.
      trialClaimIndexesPromise = null;
      throw error;
    });
  }

  return trialClaimIndexesPromise;
}

export async function claimTrialForUserIfEligible(
  params: TrialClaimParams
): Promise<TrialClaimResult> {
  const result = await claimTrialForUserInternal(params);

  if (result.trialRecord || result.reason === "activation_required") {
    await recordTrialEligibility(params.userId, null);
  } else if (result.reason === "trial_already_claimed") {
    await recordTrialEligibility(params.userId, "used_on_device");
  } else if (result.reason === "device_identity_required") {
    await recordTrialEligibility(params.userId, "desktop_required");
  }

  return result;
}

async function claimTrialForUserInternal(
  params: TrialClaimParams
): Promise<TrialClaimResult> {
  const existingTrial = await getTrialForUser(params.userId);

  // Existing trials remain valid forever as a historical claim. When the
  // user next connects the desktop, bind the stable machine signals so a
  // second account cannot restart the trial on that same machine.
  if (existingTrial) {
    await ensureTrialClaimIndexes();
    const client = await clientPromise;
    const db = client.db();
    const claims = db.collection(COLLECTIONS.TRIAL_CLAIM_SIGNALS);
    const signals = buildTrialSignals(params);
    const signalKeys = signals.map((signal) => signal.key);
    const now = new Date().toISOString();
    const reservationCutoff = new Date(Date.now() - CLAIM_RESERVATION_MS).toISOString();

    await claims.deleteMany({
      signalKey: { $in: signalKeys },
      status: "reserved",
      createdAt: { $lt: reservationCutoff },
    });

    const matchedSignalTypes = await bindSignalsToExistingTrial(
      claims,
      signals,
      params,
      existingTrial,
      now,
      reservationCutoff,
    );

    return {
      eligible: true,
      created: false,
      trialRecord: existingTrial,
      reason: "already_has_trial",
      matchedSignalTypes,
    };
  }

  if (!(await isTrialEnabled())) {
    return {
      eligible: false,
      created: false,
      trialRecord: null,
      reason: "trial_disabled",
    };
  }

  const assignment = await getOrAssignTrialExperiment(params.userId, params.email);
  if (isActivatedTrialAssignment(assignment)) {
    const pendingEligibility = await getTrialActivationEligibility(params.userId);
    if (pendingEligibility?.status === "pending" || pendingEligibility?.status === "activating") {
      return {
        eligible: true,
        created: false,
        trialRecord: null,
        reason: "activation_required",
        assignment,
      };
    }
  }

  if (!hasRequiredDeviceIdentity(params)) {
    return {
      eligible: false,
      created: false,
      trialRecord: null,
      reason: "device_identity_required",
    };
  }

  await ensureTrialClaimIndexes();

  const client = await clientPromise;
  const db = client.db();
  const claims = db.collection(COLLECTIONS.TRIAL_CLAIM_SIGNALS);
  const signals = buildTrialSignals(params);
  const signalKeys = signals.map((signal) => signal.key);
  const reservationCutoff = new Date(Date.now() - CLAIM_RESERVATION_MS).toISOString();

  await claims.deleteMany({
    signalKey: { $in: signalKeys },
    status: "reserved",
    createdAt: { $lt: reservationCutoff },
  });

  const conflict = await claims.findOne({
    signalKey: { $in: signalKeys },
    userId: { $ne: params.userId },
    $or: [
      { status: "granted" },
      { status: "deferred" },
      { status: "reserved", createdAt: { $gte: reservationCutoff } },
    ],
  });

  if (conflict) {
    return {
      eligible: false,
      created: false,
      trialRecord: null,
      reason: "trial_already_claimed",
      matchedSignalTypes: [conflict.signalType].filter(Boolean),
    };
  }

  const now = new Date().toISOString();
  for (const signal of signals) {
    const ownReservation = await claims.updateOne(
      { signalKey: signal.key, userId: params.userId },
      {
        $set: {
          signalType: signal.type,
          source: params.source,
          status: "reserved",
          updatedAt: now,
        },
      },
    );

    if (ownReservation.matchedCount > 0) continue;

    try {
      await claims.insertOne({
        signalKey: signal.key,
        signalType: signal.type,
        userId: params.userId,
        source: params.source,
        status: "reserved",
        createdAt: now,
        updatedAt: now,
      });
    } catch (error: any) {
      // Another request owns this unique signal. The post-reservation check
      // below decides eligibility without modifying that owner's record.
      if (error?.code !== 11000) throw error;
    }
  }

  const postReservationConflict = await claims.findOne({
    signalKey: { $in: signalKeys },
    userId: { $ne: params.userId },
    $or: [
      { status: "granted" },
      { status: "deferred" },
      { status: "reserved", createdAt: { $gte: reservationCutoff } },
    ],
  });

  if (postReservationConflict) {
    await claims.deleteMany({
      signalKey: { $in: signalKeys },
      userId: params.userId,
      status: "reserved",
    });
    return {
      eligible: false,
      created: false,
      trialRecord: null,
      reason: "trial_already_claimed",
      matchedSignalTypes: [postReservationConflict.signalType].filter(Boolean),
    };
  }

  try {
    if (isActivatedTrialAssignment(assignment)) {
      const eligibility = await deferTrialActivation({
        userId: params.userId,
        assignment: assignment!,
        claimSignalKeys: signalKeys,
        source: params.source,
      });
      await claims.updateMany(
        { signalKey: { $in: signalKeys }, userId: params.userId },
        { $set: { status: "deferred", eligibilityId: eligibility._id?.toString() || null, updatedAt: now } },
      );
      return {
        eligible: true,
        created: false,
        trialRecord: null,
        reason: "activation_required",
        assignment,
      };
    }

    const trialRecord = await createTrialForUser(
      params.userId,
      undefined,
      assignment?.durationDays,
    );
    await claims.updateMany(
      { signalKey: { $in: signalKeys }, userId: params.userId },
      {
        $set: {
          status: "granted",
          trialId: trialRecord._id?.toString() || null,
          grantedAt: new Date().toISOString(),
          source: params.source,
        },
      }
    );

    return {
      eligible: true,
      created: true,
      trialRecord,
      assignment,
    };
  } catch (err) {
    await claims.deleteMany({
      signalKey: { $in: signalKeys },
      userId: params.userId,
      status: "reserved",
    });
    throw err;
  }
}
