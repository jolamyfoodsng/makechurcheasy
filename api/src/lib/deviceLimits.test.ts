import test from "node:test";
import assert from "node:assert/strict";
import { evictOtherActiveDevices } from "./deviceLimits";

test("evictOtherActiveDevices soft-deletes other active devices and keeps current device", async () => {
  const devices = [
    { _id: "m_1", deviceId: "dev_older", userId: "usr_1", status: "active" },
    { _id: "m_2", deviceId: "dev_current", userId: "usr_1", status: "active" },
    { _id: "m_3", deviceId: "dev_deleted", userId: "usr_1", status: "deleted" },
  ];
  let updateManyPayload: any = null;
  let pullPayload: any = null;
  let deletedLoginCodesPayload: any = null;

  const mockDb = {
    collection: (name: string) => {
      if (name === "devices") {
        return {
          find: (filter: any) => ({
            toArray: async () => {
              return devices.filter((d) => {
                if (d.userId !== filter.userId) return false;
                if (filter.status?.$ne && d.status === filter.status.$ne) return false;
                if (filter.deviceId?.$ne && d.deviceId === filter.deviceId.$ne) return false;
                return true;
              });
            },
          }),
          updateMany: async (filter: any, update: any) => {
            updateManyPayload = { filter, update };
            return { modifiedCount: 1 };
          },
        };
      }
      if (name === "users") {
        return {
          updateOne: async (filter: any, update: any) => {
            pullPayload = { filter, update };
            return { modifiedCount: 1 };
          },
        };
      }
      if (name === "loginCodes") {
        return {
          deleteMany: async (filter: any) => {
            deletedLoginCodesPayload = filter;
            return { deletedCount: 1 };
          },
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  };

  const count = await evictOtherActiveDevices(
    "usr_1",
    { keepDeviceId: "dev_current" },
    mockDb
  );

  assert.equal(count, 1);
  assert.deepEqual(updateManyPayload.filter, { deviceId: { $in: ["dev_older"] } });
  assert.equal(updateManyPayload.update.$set.status, "deleted");
  assert.equal(updateManyPayload.update.$set.deletedReason, "evicted_by_other_device");
  assert.equal(updateManyPayload.update.$set.evictedByDeviceId, "dev_current");
  assert.deepEqual(deletedLoginCodesPayload, { deviceId: { $in: ["dev_older"] } });
});
