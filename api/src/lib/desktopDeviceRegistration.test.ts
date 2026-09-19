import assert from "node:assert/strict";
import { test } from "node:test";

import { findMatchingDesktopDevice } from "./desktopDeviceRegistration";

function fakeDb(devices: Array<Record<string, unknown>>) {
  return {
    collection() {
      return {
        findOne: async (filter: Record<string, any>) => {
          const candidate = devices.find((device) =>
            Object.entries(filter).every(([key, value]) => {
              if (key === "status" && value?.$ne !== undefined) {
                return device.status !== value.$ne;
              }
              return device[key] === value;
            }),
          );
          return candidate || null;
        },
      };
    },
  };
}

test("matches a device by installation or hardware fingerprint", async () => {
  const existing = {
    deviceId: "device-1",
    userId: "user-1",
    status: "active",
    installationId: "installation-1",
    fingerprintHash: "fingerprint-1",
  };
  const db = fakeDb([existing]);

  assert.equal(
    (await findMatchingDesktopDevice(db as never, "user-1", "installation-1"))?.deviceId,
    "device-1",
  );
  assert.equal(
    (await findMatchingDesktopDevice(db as never, "user-1", null, "fingerprint-1"))?.deviceId,
    "device-1",
  );
});

test("does not fall back to an unrelated device for a new machine", async () => {
  const db = fakeDb([
    {
      deviceId: "old-device",
      userId: "user-1",
      status: "active",
      installationId: "old-installation",
      fingerprintHash: "old-fingerprint",
    },
  ]);

  const match = await findMatchingDesktopDevice(
    db as never,
    "user-1",
    "new-installation",
    "new-fingerprint",
  );

  assert.equal(match, null);
});
