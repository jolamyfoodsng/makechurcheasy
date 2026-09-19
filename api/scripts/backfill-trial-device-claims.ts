/**
 * Backfill durable trial claims for existing trial users.
 *
 * Run with:
 *   npx tsx scripts/backfill-trial-device-claims.ts --dry-run
 *   npx tsx scripts/backfill-trial-device-claims.ts
 *
 * The script stores only HMACs of emails, installation IDs, and hardware
 * fingerprints. It never prints or persists the raw values.
 */

import crypto from "node:crypto";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = process.argv.includes("--dry-run");

type SignalType = "email" | "device_fingerprint" | "installation";

function hashTrialValue(value: string): string {
  const salt =
    process.env.TRIAL_ABUSE_SALT ||
    process.env.JWT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "makechurcheasy-trial-abuse-v1";
  return crypto.createHmac("sha256", salt).update(value).digest("hex");
}

function signalKey(type: SignalType, value: string): string {
  return `${type}:${hashTrialValue(`${type}:${value}`)}`;
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const [rawLocal, rawDomain] = normalized.split("@");
  if (!rawLocal || !rawDomain) return normalized;

  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  const local = domain === "gmail.com"
    ? rawLocal.split("+")[0].replace(/\./g, "")
    : rawLocal;
  return `${local}@${domain}`;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function main() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is required");
  }

  if (DRY_RUN) console.log("DRY RUN: no changes will be made");

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const db = client.db();
    const users = db.collection("users");
    const trials = db.collection("trials");
    const devices = db.collection("devices");
    const claims = db.collection("trial_claim_signals");

    if (!DRY_RUN) {
      await claims.createIndex({ signalKey: 1 }, { unique: true });
      await claims.createIndex({ userId: 1, createdAt: -1 });
      await claims.createIndex({ status: 1, createdAt: -1 });
    }

    const trialRecords = await trials.find({ userId: { $type: "string" } }).sort({ createdAt: 1 }).toArray();
    const trialByUser = new Map<string, any>();
    for (const trial of trialRecords) {
      const userId = nonEmptyString(trial.userId);
      if (userId && !trialByUser.has(userId)) trialByUser.set(userId, trial);
    }

    const trialUsers = await users.find(
      {
        $or: [
          { trialId: { $exists: true, $nin: [null, ""] } },
          { trial: { $exists: true, $ne: null } },
        ],
      },
      { projection: { email: 1, trialId: 1, trial: 1, createdAt: 1 } },
    ).toArray();

    // Legacy accounts can have only the embedded trial object. Keep them in
    // the same lookup so their historic device records are also protected.
    for (const user of trialUsers) {
      const userId = user._id.toString();
      if (!trialByUser.has(userId)) {
        trialByUser.set(userId, {
          _id: user.trialId || null,
          startedAt: user.trial?.startedAt || user.createdAt || new Date().toISOString(),
        });
      }
    }

    let emailCreated = 0;
    let emailSkipped = 0;
    let deviceFingerprintCreated = 0;
    let deviceFingerprintSkipped = 0;
    let installationCreated = 0;
    let installationSkipped = 0;
    let usersProcessed = 0;

    async function claim(
      type: SignalType,
      value: string,
      userId: string,
      trial: any,
      sourceDate: string,
    ): Promise<boolean> {
      const key = signalKey(type, value);
      const doc = {
        signalKey: key,
        signalType: type,
        userId,
        status: "granted",
        trialId: trial?._id?.toString?.() || null,
        source: "migration",
        grantedAt: trial?.startedAt || sourceDate,
        createdAt: sourceDate,
        updatedAt: new Date().toISOString(),
      };

      if (DRY_RUN) return true;

      try {
        const result = await claims.updateOne(
          { signalKey: key },
          { $setOnInsert: doc },
          { upsert: true },
        );
        return result.upsertedCount > 0;
      } catch (error: any) {
        if (error?.code === 11000) return false;
        throw error;
      }
    }

    for (const user of trialUsers) {
      const userId = user._id.toString();
      const trial = trialByUser.get(userId) || {
        _id: user.trialId || null,
        startedAt: user.trial?.startedAt || user.createdAt || new Date().toISOString(),
      };
      const sourceDate = nonEmptyString(user.createdAt) || new Date().toISOString();

      if (nonEmptyString(user.email)) {
        const inserted = await claim("email", normalizeEmail(user.email), userId, trial, sourceDate);
        if (inserted) emailCreated++;
        else emailSkipped++;
      }

      usersProcessed++;
    }

    // Include soft-deleted device records. Their identifiers must continue to
    // block a fresh account after an uninstall or account deletion.
    const deviceCursor = devices.find({
      $or: [
        { fingerprintHash: { $exists: true, $nin: [null, ""] } },
        { installationId: { $exists: true, $nin: [null, ""] } },
      ],
    }).sort({ createdAt: 1 });

    for await (const device of deviceCursor) {
      const userId = nonEmptyString(device.userId);
      if (!userId || !trialByUser.has(userId)) continue;

      const trial = trialByUser.get(userId);
      const sourceDate = device.createdAt instanceof Date
        ? device.createdAt.toISOString()
        : nonEmptyString(device.createdAt) || trial?.startedAt || new Date().toISOString();

      const fingerprint = nonEmptyString(device.fingerprintHash);
      if (fingerprint) {
        const inserted = await claim("device_fingerprint", fingerprint, userId, trial, sourceDate);
        if (inserted) deviceFingerprintCreated++;
        else deviceFingerprintSkipped++;
      }

      const installation = nonEmptyString(device.installationId);
      if (installation) {
        const inserted = await claim("installation", installation, userId, trial, sourceDate);
        if (inserted) installationCreated++;
        else installationSkipped++;
      }
    }

    console.log(JSON.stringify({
      usersProcessed,
      emailCreated,
      emailSkipped,
      deviceFingerprintCreated,
      deviceFingerprintSkipped,
      installationCreated,
      installationSkipped,
      dryRun: DRY_RUN,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Trial device claim backfill failed:", error?.message || error);
  process.exit(1);
});
