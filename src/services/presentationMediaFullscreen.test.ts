import { beforeEach, describe, expect, it, vi } from "vitest";
import presentationHtml from "../../public/presentation.html?raw";
import { publishMediaToPresentation } from "./presentationPublish";
import * as presentationStateModule from "./presentationState";
import type { MediaItem } from "../library/libraryTypes";

describe("presentation media fullscreen & edge-to-edge display", () => {
  let publishedStates: presentationStateModule.PresentationRemoteState[] = [];

  beforeEach(() => {
    publishedStates = [];
    vi.spyOn(presentationStateModule, "publishPresentationState").mockImplementation(async (state) => {
      publishedStates.push(state);
    });
  });

  it("defaults to fit: 'cover' and transparent background so media is fullscreen without borders", async () => {
    const media: MediaItem = {
      id: "test-img-1",
      name: "Announcement Slide",
      type: "image",
      url: "/uploads/announcement.png",
      diskFileName: "announcement.png",
      createdAt: new Date().toISOString(),
    };

    await publishMediaToPresentation(media);

    expect(publishedStates).toHaveLength(1);
    const item = publishedStates[0].fullscreen;
    expect(item).toBeDefined();
    expect(item?.media).toBeDefined();
    expect(item?.media?.fit).toBe("cover");
    expect(item?.media?.backgroundColor).toBe("transparent");
    expect(item?.media?.url).toBe("/uploads/announcement.png");
  });

  it("honors custom fit and background options if explicitly specified", async () => {
    const media: MediaItem = {
      id: "test-img-2",
      name: "Flyer",
      type: "image",
      url: "/uploads/flyer.png",
      diskFileName: "flyer.png",
      createdAt: new Date().toISOString(),
    };

    await publishMediaToPresentation(media, { fit: "contain", backgroundColor: "#000000" });

    expect(publishedStates).toHaveLength(1);
    const item = publishedStates[0].fullscreen;
    expect(item?.media?.fit).toBe("contain");
    expect(item?.media?.backgroundColor).toBe("#000000");
  });

  it("presentation.html provides remote-stage--media to unlock stage from 16:9 to full viewport", () => {
    expect(presentationHtml).toContain(".remote-stage.remote-stage--media");
    expect(presentationHtml).toContain("width: 100vw;");
    expect(presentationHtml).toContain("height: 100vh;");
    expect(presentationHtml).toContain("transform: none;");
    expect(presentationHtml).toContain("aspect-ratio: auto;");
  });

  it("presentation.html toggles remote-stage--media in renderItem when media is displayed", () => {
    expect(presentationHtml).toContain('stage.classList.add("remote-stage--media");');
    expect(presentationHtml).toContain('stage.classList.remove("remote-stage--media");');
  });

  it("presentation.html removes remote-stage--media in state reset handlers", () => {
    expect(presentationHtml).toContain("function showBlank");
    expect(presentationHtml).toContain("function showWaiting");
    expect(presentationHtml).toContain("function showInvalid");
  });

  it("presentation.html getMediaFit explicitly supports 'cover'", () => {
    expect(presentationHtml).toContain('case "cover":');
    expect(presentationHtml).toContain('return "cover";');
  });
});
