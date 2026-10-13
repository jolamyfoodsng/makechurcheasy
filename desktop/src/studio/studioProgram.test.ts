import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/overlayUrl", () => ({ getOverlayBaseUrl: async () => "http://127.0.0.1:45678" }));
vi.mock("../services/productionSettings", () => ({ buildDockProductionSettingsPayload: async () => ({}) }));
vi.mock("../dock/dockOverlayBridge", () => ({ overlayBridge: { publish: vi.fn() } }));
vi.mock("../dock/dockObsClient", () => ({
  dockObsClient: {
    buildStudioOverlayPacket: ({ text, reference }: { text: string; reference: string }) => ({
      data: { slide: { text, reference }, live: true, blanked: false },
      css: "",
    }),
  },
}));

import { clearProgram, getProgramState, goLive, setProgramScreen, type StudioSlide } from "./studioEngine";

const verse: StudioSlide = { key: "bible:John:3:16:KJV", module: "bible", label: "16", verse: 16, text: "For God so loved", reference: "John 3:16 (KJV)", itemTitle: "John 3" };
const chorus: StudioSlide = { key: "song:1:0", module: "worship", label: "Chorus", text: "Amazing grace", reference: "", itemTitle: "Song" };
const picture: StudioSlide = { key: "media:1", module: "media", label: "Welcome", text: "", reference: "", itemTitle: "Welcome", media: { kind: "image", url: "/uploads/w.png", fit: "contain", loop: true, muted: false } };

describe("studio program", () => {
  const fetchMock = vi.fn(async () => new Response("{}"));
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("Go live puts the Preview slide on Program and posts it to the output", async () => {
    goLive(verse, null, "fullscreen", "fade");
    const state = getProgramState();
    expect(state.active).toBe("bible");
    expect((state.packets.bible as { slide: { text: string } }).slide.text).toBe("For God so loved");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:45678/api/studio-state");
    expect(JSON.parse(String(init.body)).revision).toBe(state.revision);
  });

  it("switching module blanks the old one; revisions always go up", () => {
    const before = getProgramState().revision;
    goLive(chorus, null, "fullscreen", "fade");
    const state = getProgramState();
    expect(state.revision).toBeGreaterThan(before);
    expect(state.active).toBe("worship");
    expect((state.packets.bible as { blanked: boolean }).blanked).toBe(true);
  });

  it("media goes live, black lifts on the next Go live, clear empties everything", () => {
    goLive(picture, null, "fullscreen", "fade");
    expect(getProgramState().media?.url).toBe("/uploads/w.png");
    setProgramScreen("black");
    expect(getProgramState().screen).toBe("black");
    goLive(verse, null, "fullscreen", "cut");
    expect(getProgramState().screen).toBe("live");
    expect(getProgramState().media).toBeNull();
    clearProgram("fullscreen");
    expect(getProgramState().active).toBeNull();
    expect((getProgramState().packets.worship as { blanked: boolean }).blanked).toBe(true);
  });
});
