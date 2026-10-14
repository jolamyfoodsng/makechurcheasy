import { generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSignedLicense, SIGNED_LICENSE_VERSION } from "./signedLicense";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const signWith = (v: string) => sign(null, Buffer.from(v, "utf8"), privateKey).toString("base64");

describe("buildSignedLicense", () => {
  const license = { plan: "growth", entitledUntil: "2026-12-01T00:00:00.000Z", lockReason: null };
  const binding = { deviceId: "dev-1", userId: "user-1" };

  it("signs the exact string it returns and binds device, user and time", () => {
    const now = new Date("2026-10-13T10:00:00Z");
    const { licenseSigned, licenseSignature } = buildSignedLicense(license, binding, signWith, now);
    expect(licenseSigned).toBeTruthy();
    expect(verify(null, Buffer.from(licenseSigned!, "utf8"), publicKey, Buffer.from(licenseSignature!, "base64"))).toBe(true);
    const parsed = JSON.parse(licenseSigned!);
    expect(parsed).toMatchObject({
      plan: "growth", deviceId: "dev-1", userId: "user-1", v: SIGNED_LICENSE_VERSION,
      signedAt: "2026-10-13T10:00:00.000Z",
    });
  });

  it("a changed plan no longer verifies", () => {
    const { licenseSigned, licenseSignature } = buildSignedLicense(license, binding, signWith);
    const forged = licenseSigned!.replace('"growth"', '"basic"').replace("basic", "growth");
    const tampered = licenseSigned!.replace('"plan":"growth"', '"plan":"growth "');
    expect(forged).toBe(licenseSigned);
    expect(verify(null, Buffer.from(tampered, "utf8"), publicKey, Buffer.from(licenseSignature!, "base64"))).toBe(false);
  });

  it("returns nulls when signing is unavailable", () => {
    expect(buildSignedLicense(license, binding, () => null)).toEqual({ licenseSigned: null, licenseSignature: null });
  });
});
