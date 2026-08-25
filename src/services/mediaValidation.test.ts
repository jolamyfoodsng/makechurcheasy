import { describe, expect, it } from "vitest";
import { getMediaKind } from "./mediaValidation";

describe("media kind detection", () => {
  it("falls back to the extension when the native picker provides no MIME type", () => {
    expect(getMediaKind({ name: "service-video.mp4", type: "" } as File)).toBe("video");
    expect(getMediaKind({ name: "service-slide.png", type: "" } as File)).toBe("image");
  });
});
