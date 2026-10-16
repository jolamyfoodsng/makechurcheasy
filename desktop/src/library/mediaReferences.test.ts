import { describe, expect, it } from "vitest";
import { isReferenceUploadName } from "./libraryDb";
import { isReferenceMediaItem, mediaKindForPath } from "./mediaReferences";

const REF_NAME = "ref_0123456789abcdef0123456789abcdef.mp4";

describe("referenced media", () => {
  it("recognises virtual reference upload names only", () => {
    expect(isReferenceUploadName(REF_NAME)).toBe(true);
    expect(isReferenceUploadName("ref_123.mp4")).toBe(false);
    expect(isReferenceUploadName("media_1787647609533_intro.mp4")).toBe(false);
    expect(isReferenceUploadName("ref_0123456789abcdef0123456789abcdef")).toBe(false);
    expect(isReferenceUploadName(undefined)).toBe(false);
  });

  it("treats items with a reference source or name as referenced", () => {
    expect(isReferenceMediaItem({ source: "reference", diskFileName: REF_NAME })).toBe(true);
    expect(isReferenceMediaItem({ source: undefined, diskFileName: REF_NAME })).toBe(true);
    expect(isReferenceMediaItem({ source: "local", diskFileName: "media_1_intro.mp4" })).toBe(false);
  });

  it("detects the media kind from Windows and macOS paths", () => {
    expect(mediaKindForPath("C:\\Users\\pc\\Videos\\Sunday Intro.MP4")).toBe("video");
    expect(mediaKindForPath("/Users/pc/Pictures/welcome.jpeg")).toBe("image");
    expect(mediaKindForPath("D:\\Music\\hymn.flac")).toBe("audio");
    expect(mediaKindForPath("C:\\Docs\\sermon.pdf")).toBeNull();
    expect(mediaKindForPath("C:\\folder.v2\\noextension")).toBeNull();
  });
});
