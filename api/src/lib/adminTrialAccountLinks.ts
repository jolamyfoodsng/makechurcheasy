import { ObjectId, type Db } from "mongodb";
import { COLLECTIONS } from "./db";
import {
  getTrialSignalKey,
  isUsableDeviceFingerprint,
  normalizeEmailForTrial,
  type TrialSignalType,
} from "./trialAbuse";

const SIGNAL_LABELS: Record<TrialSignalType | "signup_device", string> = {
  email: "Matching normalized email",
  device_fingerprint: "Same device fingerprint",
  installation: "Same installation ID",
  device: "Same device ID",
  ip_ua: "Same network and browser",
  signup_device: "Same signup device ID",
};

function asIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Finds other accounts with trial history that share a recorded signup or
 * desktop identity. Raw identifiers and IP addresses are never returned.
 */
export async function findPossibleTrialAccounts(
  db: Db,
  currentUserId: string,
  currentUser: Record<string, any>,
) {
  const currentUserIds: Array<string | ObjectId> = [currentUserId];
  if (ObjectId.isValid(currentUserId)) currentUserIds.push(new ObjectId(currentUserId));

  const ownDevices = await db.collection("devices").find(
    { userId: { $in: currentUserIds } },
    { projection: { deviceId: 1, installationId: 1, fingerprintHash: 1 } },
  ).limit(200).toArray();

  const fingerprints = new Set<string>();
  const installations = new Set<string>();
  const deviceIds = new Set<string>();
  const signupDeviceIds = new Set<string>();

  const signupDeviceId = String(currentUser.signupDeviceId || "").trim();
  if (signupDeviceId) signupDeviceIds.add(signupDeviceId);

  for (const device of ownDevices) {
    const fingerprint = String(device.fingerprintHash || "").trim();
    const installation = String(device.installationId || "").trim();
    const deviceId = String(device.deviceId || "").trim();
    if (isUsableDeviceFingerprint(fingerprint)) fingerprints.add(fingerprint);
    if (installation) installations.add(installation);
    if (deviceId) deviceIds.add(deviceId);
  }

  const candidateReasons = new Map<string, Set<string>>();
  const addCandidate = (candidateId: unknown, reason: string) => {
    const id = String(candidateId || "").trim();
    if (!id || id === currentUserId) return;
    const reasons = candidateReasons.get(id) || new Set<string>();
    reasons.add(reason);
    candidateReasons.set(id, reasons);
  };

  const deviceConditions: Record<string, unknown>[] = [];
  if (fingerprints.size) deviceConditions.push({ fingerprintHash: { $in: [...fingerprints] } });
  if (installations.size) deviceConditions.push({ installationId: { $in: [...installations] } });
  if (deviceIds.size) deviceConditions.push({ deviceId: { $in: [...deviceIds] } });

  if (deviceConditions.length) {
    const matchingDevices = await db.collection("devices").find(
      { $or: deviceConditions },
      { projection: { userId: 1, deviceId: 1, installationId: 1, fingerprintHash: 1 } },
    ).limit(1000).toArray();

    for (const device of matchingDevices) {
      const candidateId = String(device.userId || "");
      if (fingerprints.has(String(device.fingerprintHash || ""))) {
        addCandidate(candidateId, SIGNAL_LABELS.device_fingerprint);
      }
      if (installations.has(String(device.installationId || ""))) {
        addCandidate(candidateId, SIGNAL_LABELS.installation);
      }
      if (deviceIds.has(String(device.deviceId || ""))) {
        addCandidate(candidateId, SIGNAL_LABELS.device);
      }
    }
  }

  if (signupDeviceIds.size) {
    const signupMatches = await db.collection("users").find(
      { signupDeviceId: { $in: [...signupDeviceIds] } },
      { projection: { _id: 1 } },
    ).limit(200).toArray();
    for (const match of signupMatches) {
      addCandidate(match._id, SIGNAL_LABELS.signup_device);
    }
  }

  const signalKeys = new Map<string, TrialSignalType>();
  const addSignalKey = (type: TrialSignalType, value: string) => {
    const normalized = value.trim();
    if (normalized) signalKeys.set(getTrialSignalKey(type, normalized), type);
  };

  const email = String(currentUser.email || "").trim();
  if (email) addSignalKey("email", normalizeEmailForTrial(email));
  for (const fingerprint of fingerprints) addSignalKey("device_fingerprint", fingerprint);
  for (const installation of installations) addSignalKey("installation", installation);
  for (const deviceId of deviceIds) addSignalKey("device", deviceId);
  for (const signupId of signupDeviceIds) {
    // Older signup builds used one field for either value.
    addSignalKey("installation", signupId);
    addSignalKey("device", signupId);
  }

  const claimStatusByUser = new Map<string, string>();
  const claimDateByUser = new Map<string, string | null>();
  if (signalKeys.size) {
    const matchingClaims = await db.collection(COLLECTIONS.TRIAL_CLAIM_SIGNALS).find(
      {
        signalKey: { $in: [...signalKeys.keys()] },
        status: { $in: ["granted", "deferred"] },
      },
      { projection: { userId: 1, signalType: 1, status: 1, grantedAt: 1, createdAt: 1 } },
    ).limit(500).toArray();

    for (const claim of matchingClaims) {
      const candidateId = String(claim.userId || "");
      const type = (claim.signalType || signalKeys.get(String(claim.signalKey))) as TrialSignalType | undefined;
      if (type && SIGNAL_LABELS[type]) addCandidate(candidateId, SIGNAL_LABELS[type]);
      if (claim.status) claimStatusByUser.set(candidateId, String(claim.status));
      claimDateByUser.set(candidateId, asIso(claim.grantedAt || claim.createdAt));
    }
  }

  const candidateIds = [...candidateReasons.keys()]
    .sort((a, b) => (candidateReasons.get(b)?.size || 0) - (candidateReasons.get(a)?.size || 0))
    .slice(0, 100);
  if (!candidateIds.length) return [];

  const relatedObjectIds = candidateIds
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (!relatedObjectIds.length) return [];

  const relatedUsers = await db.collection("users").find(
    { _id: { $in: relatedObjectIds } },
    { projection: { name: 1, email: 1, plan: 1, createdAt: 1, lastLogin: 1, trialId: 1, trial: 1, trialEligibility: 1 } },
  ).limit(100).toArray();

  const trials = await db.collection("trials").find(
    { userId: { $in: candidateIds } },
    { projection: { userId: 1, status: 1, startedAt: 1, createdAt: 1 } },
  ).sort({ createdAt: -1 }).limit(500).toArray();
  const trialByUser = new Map<string, Record<string, any>>();
  for (const trial of trials) {
    const id = String(trial.userId || "");
    if (id && !trialByUser.has(id)) trialByUser.set(id, trial);
  }

  return relatedUsers
    .map((relatedUser) => {
      const id = String(relatedUser._id);
      const trial = trialByUser.get(id);
      const claimStatus = claimStatusByUser.get(id) || "";
      const hasTrialHistory = Boolean(trial || relatedUser.trialId || relatedUser.trial || claimStatus);
      const trialUnavailableOnDevice = relatedUser.trialEligibility?.status === "used_on_device";
      if (!hasTrialHistory && !trialUnavailableOnDevice) return null;

      const trialStatus = String(
        trial?.status || relatedUser.trial?.status ||
        (claimStatus === "granted" ? "claimed" : claimStatus === "deferred" ? "pending activation" : ""),
      );

      return {
        id,
        name: String(relatedUser.name || ""),
        email: String(relatedUser.email || ""),
        plan: String(relatedUser.plan || "free"),
        trialStatus: trialStatus || (trialUnavailableOnDevice ? "not granted on this device" : "trial record found"),
        createdAt: asIso(relatedUser.createdAt),
        lastLogin: asIso(relatedUser.lastLogin),
        trialStartedAt: asIso(trial?.startedAt || claimDateByUser.get(id)),
        matchSignals: [...(candidateReasons.get(id) || [])],
      };
    })
    .filter((account): account is NonNullable<typeof account> => Boolean(account))
    .sort((a, b) => (b.createdAt ? Date.parse(b.createdAt) : 0) - (a.createdAt ? Date.parse(a.createdAt) : 0))
    .slice(0, 25);
}
