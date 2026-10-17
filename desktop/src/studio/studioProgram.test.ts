import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/overlayUrl", () => ({ getOverlayBaseUrl: async () => "http://127.0.0.1:45678" }));
vi.mock("../services/productionSettings", () => ({ buildDockProductionSettingsPayload: async () => ({}) }));
vi.mock("../dock/dockOverlayBridge", () => ({ overlayBridge: { publish: vi.fn() } }));
vi.mock("../dock/dockObsClient", () => ({
  dockObsClient: {
    buildStudioOverlayPacket: ({ text, reference, mode }: { text: string; reference: string; mode: string }) => ({
      data: { slide: { text, reference }, mode, live: true, blanked: false },
      css: "",
    }),
  },
}));

import { clearProgram, getProgramState, goLive, setAltOutputMode, setProgramMix, setProgramScreen, type StudioSlide } from "./studioEngine";
import { isBackdrop, type StudioMixLayer } from "./studioMix";

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

  it("Screen Mix layers are kept in the state and survive Go live and Clear", () => {
    const banner: StudioMixLayer = { id: "b1", kind: "banner", name: "Subscribe", shown: true, text: "Subscribe", corner: "bottom-left" };
    const video: StudioMixLayer = { id: "v1", kind: "video", name: "Loop", shown: true, url: "/uploads/loop.mp4" };
    setProgramMix([video, banner]);
    expect(getProgramState().mix).toHaveLength(2);
    goLive(verse, null, "fullscreen", "fade");
    clearProgram("fullscreen");
    expect(getProgramState().mix?.map((l) => l.id)).toEqual(["v1", "b1"]);
    expect(isBackdrop(video)).toBe(true);
    expect(isBackdrop(banner)).toBe(false);
  });

  it("the alternate output shows the same item in its own look, and only while it is on", () => {
    goLive(verse, null, "fullscreen", "fade");
    expect(getProgramState().alt).toBeUndefined();
    setAltOutputMode("lower-third");
    const alt = getProgramState().alt;
    expect(alt?.mode).toBe("lower-third");
    expect((alt?.packets.bible as { mode: string; slide: { text: string } }).mode).toBe("lower-third");
    expect((alt?.packets.bible as { slide: { text: string } }).slide.text).toBe("For God so loved");
    goLive(chorus, null, "fullscreen", "fade");
    const next = getProgramState();
    expect((next.packets.worship as { mode: string }).mode).toBe("fullscreen");
    expect((next.alt?.packets.worship as { mode: string }).mode).toBe("lower-third");
    expect((next.alt?.packets.bible as { blanked: boolean }).blanked).toBe(true);
    clearProgram("fullscreen");
    expect((getProgramState().alt?.packets.worship as { blanked: boolean }).blanked).toBe(true);
    setAltOutputMode(null);
    expect(getProgramState().alt).toBeUndefined();
  });

  it("keeps the alternate look independent while the main output changes looks", async () => {
    await goLive(verse, null, "fullscreen", "fade");
    await setAltOutputMode("fullscreen");
    const alternateBefore = getProgramState().alt;

    await clearProgram("fullscreen", { preserveAlternate: true });
    expect(getProgramState().alt).toEqual(alternateBefore);
    expect(getProgramState().active).toBeNull();
    expect(getProgramState().alt?.active).toBe("bible");

    await goLive(verse, null, "lower-third", "fade");
    const state = getProgramState();
    expect((state.packets.bible as { mode: string }).mode).toBe("lower-third");
    expect(state.alt?.mode).toBe("fullscreen");
    expect((state.alt?.packets.bible as { mode: string }).mode).toBe("fullscreen");

    await setAltOutputMode(null);
  });
});
