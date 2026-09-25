import type { Db, Document, ObjectId } from "mongodb";
import { generateDeviceSecret } from "./deviceSecret";

interface RegisterDesktopDeviceParams {
  db: Db;
  userId: string;
  userObjectId?: ObjectId;
  deviceName: string;
  appVersion: string;
  appPlatform: string;
  fingerprintHash?: string | null;
  installationId?: string | null;
}

export interface RegisteredDesktopDevice {
  deviceId: string;
  deviceSecret: string;
}

function createDeviceId(): string {
  return `vc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

let deviceIndexesReady: Promise<void> | null = null;

/**
 * Older deployments accidentally created userId_1 as a unique index. A user
 * can have more than one device, so keep this index non-unique and repair the
 * old constraint the first time a device is registered after deployment.
 */
async function ensureDeviceIndexes(db: Db): Promise<void> {
  if (!deviceIndexesReady) {
    deviceIndexesReady = (async () => {
      await db.createCollection("devices").catch(() => {});
      const devices = db.collection("devices");
      let indexes: Array<Record<string, unknown>> = [];
      try {
        indexes = await devices.listIndexes().toArray() as Array<Record<string, unknown>>;
      } catch (error: any) {
        if (error?.code === 26 || error?.codeName === "NamespaceNotFound") {
          indexes = [];
        } else {
          throw error;
        }
      }
      const userIdIndex = indexes.find((index) => {
        const key = index.key as Record<string, unknown> | undefined;
        return index.name === "userId_1" || (
          key && Object.keys(key).length === 1 && key.userId === 1
        );
      });

      if (userIdIndex?.unique && typeof userIdIndex.name === "string") {
        await devices.dropIndex(userIdIndex.name);
      }

      if (!userIdIndex || userIdIndex.unique) {
        await devices.createIndex({ userId: 1 }, { name: "userId_1" });
      }

      const deviceIdIndex = indexes.find((index) => {
        const key = index.key as Record<string, unknown> | undefined;
        return key && Object.keys(key).length === 1 && key.deviceId === 1;
      });
      if (!deviceIdIndex) {
        await devices.createIndex({ deviceId: 1 }, { unique: true });
      }
    })().catch((error) => {
      deviceIndexesReady = null;
      throw error;
    });
  }

  await deviceIndexesReady;
}

/**
 * Find the user's existing registration for this same installation or
 * hardware fingerprint. A pairing request for a different machine must not
 * silently take over the most recently used device slot.
 */
export async function findMatchingDesktopDevice(
  db: Db,
  userId: string,
  installationId?: string | null,
  fingerprintHash?: string | null,
) {
  const baseFilter = { userId, status: { $ne: "deleted" } };

  const normalizedInstallationId = installationId?.trim();
  if (normalizedInstallationId) {
    const device = await db.collection("devices").findOne(
      { ...baseFilter, installationId: normalizedInstallationId },
      { sort: { lastSeen: -1, updatedAt: -1, createdAt: -1 } },
    );
    if (device) return device;
  }

  const normalizedFingerprintHash = fingerprintHash?.trim();
  if (normalizedFingerprintHash) {
    const device = await db.collection("devices").findOne(
      { ...baseFilter, fingerprintHash: normalizedFingerprintHash },
      { sort: { lastSeen: -1, updatedAt: -1, createdAt: -1 } },
    );
    if (device) return device;
  }

  return null;
}

export async function registerDesktopDeviceForPairing({
  db,
  userId,
  userObjectId,
  deviceName,
  appVersion,
  appPlatform,
  fingerprintHash,
  installationId,
}: RegisterDesktopDeviceParams): Promise<RegisteredDesktopDevice> {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  if (!normalizedUserId) {
    throw new Error("Cannot register a desktop device without an authenticated userId");
  }

  await ensureDeviceIndexes(db);

  const now = new Date();
  const existingDevice = await findMatchingDesktopDevice(
    db,
    normalizedUserId,
    installationId,
    fingerprintHash,
  ) as Document | null;
  const deviceId = String(existingDevice?.deviceId || createDeviceId());
  const deviceSecret = String(existingDevice?.deviceSecret || generateDeviceSecret());

  const update = {
    $set: {
      userId: normalizedUserId,
      deviceId,
      deviceName,
      deviceSecret,
      lastSeen: now,
      updatedAt: now,
      appVersion,
      appPlatform,
      fingerprintHash: fingerprintHash ?? existingDevice?.fingerprintHash ?? null,
      installationId: installationId ?? existingDevice?.installationId ?? null,
      status: "active",
    },
    $setOnInsert: { createdAt: now },
    $unset: { deletedAt: "" },
  };

  const upsertResult = existingDevice?._id
    ? await db.collection("devices").updateOne({ _id: existingDevice._id }, update)
    : await db.collection("devices").updateOne({ deviceId }, update, { upsert: true });

  if (upsertResult.upsertedId && userObjectId) {
    await db.collection("users").updateOne(
      { _id: userObjectId },
      { $addToSet: { devices: upsertResult.upsertedId.toString() } },
    );
  }

  return { deviceId, deviceSecret };
}
