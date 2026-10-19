import { describe, expect, it } from "vitest";
import { classifyRetention } from "./userRetention";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();

describe("classifyRetention", () => {
  it("calls a brand-new account new, not dormant", () => {
    expect(classifyRetention({ createdAt: daysAgo(0) }, NOW).status).toBe("new");
    expect(classifyRetention({ createdAt: daysAgo(7) }, NOW).status).toBe("new");
  });

  it("flags an old account that never used it", () => {
    expect(classifyRetention({ createdAt: daysAgo(30) }, NOW).status).toBe("never-started");
    expect(classifyRetention({}, NOW).status).toBe("never-started");
  });

  it("follows the days since the last real use", () => {
    const at = (d: number) => classifyRetention({ createdAt: daysAgo(100), lastUseAt: daysAgo(d) }, NOW);
    expect(at(0).status).toBe("active");
    expect(at(10).status).toBe("active");
    expect(at(11).status).toBe("slipping");
    expect(at(24).status).toBe("slipping");
    expect(at(25).status).toBe("at-risk");
    expect(at(44).status).toBe("at-risk");
    expect(at(45).status).toBe("lost");
    expect(at(10).needsAttention).toBe(false);
    expect(at(11).needsAttention).toBe(true);
    expect(at(60).needsAttention).toBe(false);
    expect(at(3).daysSinceUse).toBe(3);
  });

  it("treats a use that is a new account's first as active", () => {
    expect(classifyRetention({ createdAt: daysAgo(1), lastUseAt: daysAgo(0) }, NOW).status).toBe("active");
  });

  it("ignores a last use in the future and bad dates", () => {
    expect(classifyRetention({ createdAt: daysAgo(40), lastUseAt: new Date(NOW + 86400000).toISOString() }, NOW).daysSinceUse).toBe(0);
    expect(classifyRetention({ createdAt: "nonsense", lastUseAt: "nope" }, NOW).status).toBe("never-started");
  });
});
