import { beforeEach, describe, expect, it, vi } from "vitest";
import presentationHtml from "../../public/presentation.html?raw";
import { publishDockStagedItemToPresentation } from "./presentationDockBridge";
import * as presentationPublishModule from "./presentationPublish";
import * as presentationStateModule from "./presentationState";

describe("presentation overlay mode (fullscreen vs lower-third)", () => {
  let publishedStates: presentationStateModule.PresentationRemoteState[] = [];

  beforeEach(() => {
    publishedStates = [];
    vi.spyOn(presentationStateModule, "publishPresentationState").mockImplementation(async (state) => {
      publishedStates.push(state);
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  it("publishes bible item to fullscreen layer when overlayMode is fullscreen", async () => {
    await publishDockStagedItemToPresentation({
      type: "bible",
      label: "Genesis 1:1",
      subtitle: "In the beginning God created the heaven and the earth.",
      data: {
        book: "Genesis",
        chapter: 1,
        verse: 1,
        translation: "KJV",
        verseText: "In the beginning God created the heaven and the earth.",
        overlayMode: "fullscreen",
      },
    });

    expect(publishedStates).toHaveLength(1);
    expect(publishedStates[0].fullscreen).toBeDefined();
    expect(publishedStates[0].lowerThird).toBeNull();
    expect(publishedStates[0].fullscreen?.body).toBe("In the beginning God created the heaven and the earth.");
  });

  it("publishes bible item to lowerThird layer when overlayMode is lower-third", async () => {
    await publishDockStagedItemToPresentation({
      type: "bible",
      label: "Genesis 1:1",
      subtitle: "In the beginning God created the heaven and the earth.",
      data: {
        book: "Genesis",
        chapter: 1,
        verse: 1,
        translation: "KJV",
        verseText: "In the beginning God created the heaven and the earth.",
        overlayMode: "lower-third",
      },
    });

    expect(publishedStates).toHaveLength(1);
    expect(publishedStates[0].fullscreen).toBeNull();
    expect(publishedStates[0].lowerThird).toBeDefined();
    expect(publishedStates[0].lowerThird?.body).toBe("In the beginning God created the heaven and the earth.");
  });

  it("publishes worship item to lowerThird layer when overlayMode is lower-third", async () => {
    await publishDockStagedItemToPresentation({
      type: "worship",
      label: "Amazing Grace - Verse 1",
      subtitle: "Amazing Grace",
      data: {
        song: { title: "Amazing Grace", artist: "John Newton" },
        sectionIdx: 0,
        slideCount: 4,
        sectionLabel: "Verse 1",
        sectionText: "Amazing grace! How sweet the sound",
        overlayMode: "lower-third",
      },
    });

    expect(publishedStates).toHaveLength(1);
    expect(publishedStates[0].fullscreen).toBeNull();
    expect(publishedStates[0].lowerThird).toBeDefined();
    expect(publishedStates[0].lowerThird?.body).toBe("Amazing grace! How sweet the sound");
  });

  it("clears presentation screen when item is null", async () => {
    const clearSpy = vi.spyOn(presentationPublishModule, "clearPresentationScreen").mockResolvedValue();
    await publishDockStagedItemToPresentation(null);

    expect(clearSpy).toHaveBeenCalled();
  });

  it("presentation.html provides .stage-content--lower-third and transparent background for lower-third", () => {
    expect(presentationHtml).toContain(".stage-content--lower-third");
    expect(presentationHtml).toContain("align-items: flex-end;");
    expect(presentationHtml).toContain("body.style.background = isMedia || isLowerThird ? \"transparent\"");
    expect(presentationHtml).toContain("stage.style.background = isMedia || isLowerThird ? \"transparent\"");
  });

  it("presentation.html listens to BroadcastChannel and storage events for instant updates", () => {
    expect(presentationHtml).toContain("BroadcastChannel");
    expect(presentationHtml).toContain("mce-presentation:");
    expect(presentationHtml).toContain("mce-presentation-state:");
  });
});
