import { describe, expect, it } from "vitest";
import {
  isPresentationLinkTarget,
  resolveDockPresentationOutputTarget,
} from "./dockPresentationTarget";

describe("Dock presentation output target", () => {
  it("routes free plans through the presentation link", () => {
    expect(resolveDockPresentationOutputTarget("obs", "free")).toBe("link");
    expect(resolveDockPresentationOutputTarget(undefined, "FREE")).toBe("link");
    expect(isPresentationLinkTarget(resolveDockPresentationOutputTarget("obs", "free"))).toBe(true);
  });

  it("keeps paid plans on the requested or default output", () => {
    expect(resolveDockPresentationOutputTarget("obs", "growth")).toBe("obs");
    expect(resolveDockPresentationOutputTarget("link", "growth")).toBe("link");
    expect(resolveDockPresentationOutputTarget(undefined, "basic")).toBe("obs");
  });
});
