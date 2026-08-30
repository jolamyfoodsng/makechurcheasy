import { describe, expect, it } from "vitest";

import {
  isLocalDevAdmin,
  isLocalDevelopment,
  normalizeLocalDevPlan,
} from "./localDevPlanOverride";

describe("local development plan override", () => {
  it("is available only for the designated admin on a local dev origin", () => {
    const admin = { email: "ADMIN@gmail.com" };
    const user = { email: "user@gmail.com" };

    expect(isLocalDevAdmin(admin, { dev: true, hostname: "localhost" })).toBe(true);
    expect(isLocalDevAdmin(user, { dev: true, hostname: "localhost" })).toBe(false);
    expect(isLocalDevAdmin(admin, { dev: false, hostname: "localhost" })).toBe(false);
    expect(isLocalDevAdmin(admin, { dev: true, hostname: "makechurcheazy.com" })).toBe(false);
  });

  it("recognizes loopback and Tauri localhost origins", () => {
    expect(isLocalDevelopment({ dev: true, hostname: "127.0.0.1" })).toBe(true);
    expect(isLocalDevelopment({ dev: true, hostname: "tauri.localhost" })).toBe(true);
    expect(isLocalDevelopment({ dev: true, hostname: "app.makechurcheazy.com" })).toBe(false);
  });

  it("maps the Pro test label to the existing basic entitlement tier", () => {
    expect(normalizeLocalDevPlan("free")).toBe("free");
    expect(normalizeLocalDevPlan("pro")).toBe("basic");
    expect(normalizeLocalDevPlan("growth")).toBe("growth");
    expect(normalizeLocalDevPlan("unknown")).toBeNull();
  });
});
