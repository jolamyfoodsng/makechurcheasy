import { describe, expect, it, vi } from "vitest";
import { clientIpFromHeaders, recordSecurityEvent } from "./securityEvents";

function fakeDb(existing: unknown = null) {
  const insertOne = vi.fn(async (_doc: unknown) => ({}));
  const findOne = vi.fn(async () => existing);
  return { db: { collection: () => ({ findOne, insertOne }) } as never, insertOne, findOne };
}

describe("recordSecurityEvent", () => {
  it("stores a new event", async () => {
    const { db, insertOne } = fakeDb(null);
    const stored = await recordSecurityEvent(db, { type: "license_tamper", userId: "u1", deviceId: "d1", reason: "bad_signature" });
    expect(stored).toBe(true);
    expect(insertOne).toHaveBeenCalledOnce();
    expect(insertOne.mock.calls[0][0]).toMatchObject({ type: "license_tamper", userId: "u1", deviceId: "d1", reason: "bad_signature" });
  });

  it("skips a duplicate inside the window", async () => {
    const { db, insertOne } = fakeDb({ _id: 1 });
    expect(await recordSecurityEvent(db, { type: "device_limit", userId: "u1" })).toBe(false);
    expect(insertOne).not.toHaveBeenCalled();
  });

  it("never throws when the database fails", async () => {
    const db = { collection: () => ({ findOne: async () => { throw new Error("down"); }, insertOne: vi.fn() }) } as never;
    expect(await recordSecurityEvent(db, { type: "license_unsigned" })).toBe(false);
  });
});

describe("clientIpFromHeaders", () => {
  it("uses the first forwarded address", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    expect(clientIpFromHeaders(h)).toBe("1.2.3.4");
  });
});
