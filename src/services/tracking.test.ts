import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  trackEvent,
  trackBiblePresent,
  trackWorshipSongPresented,
  trackMediaPresented,
  trackOverlayModeSwitched,
  trackFirstAppOpen,
} from "./tracking";

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const storage = {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    }),
  };
  vi.stubGlobal("localStorage", storage);
  return storage;
}

describe("Tracking Service", () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });

  beforeEach(() => {
    vi.unstubAllGlobals();
    installLocalStorageMock();
    localStorage.setItem("mce-device-id", "dev-test-1");
    localStorage.setItem("mce_auth_user_id", "user-test-1");
    vi.clearAllMocks();
    global.fetch = fetchMock;
  });

  it("trackEvent sends event payload to backend", () => {
    trackEvent("test_event", { foo: "bar" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/tracking/event");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string);
    expect(body.event).toBe("test_event");
    expect(body.properties).toEqual({ foo: "bar" });
  });

  it("trackOverlayModeSwitched sends mode switch event", () => {
    trackOverlayModeSwitched("bible", "lower-third");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.event).toBe("overlay_mode_switched");
    expect(body.properties).toEqual({ module: "bible", mode: "lower-third" });
  });

  it("trackFirstAppOpen only fires once", () => {
    trackFirstAppOpen({ platform: "mac" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).event).toBe("first_app_open");

    // Calling a second time should not dispatch
    trackFirstAppOpen({ platform: "mac" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("trackBiblePresent tracks rich properties and triggers trial activation on first presentation only", () => {
    trackBiblePresent({
      ref: "John 3:16",
      translation: "KJV",
      overlayMode: "fullscreen",
      book: "John",
      chapter: 3,
      verse: 16,
    });

    const events = fetchMock.mock.calls.map((call) => {
      const url = call[0] as string;
      const body = JSON.parse(call[1].body as string);
      return { url, body };
    });

    const biblePresentCall = events.find((e) => e.body?.event === "bible_present");
    expect(biblePresentCall).toBeDefined();
    expect(biblePresentCall?.body.properties).toMatchObject({
      hasRef: true,
      ref: "John 3:16",
      translation: "KJV",
      overlayMode: "fullscreen",
      book: "John",
      chapter: 3,
      verse: 16,
    });

    // Verify trial activation was called
    const trialCall = events.find((e) => e.url.includes("/api/trial/activate"));
    expect(trialCall).toBeDefined();

    fetchMock.mockClear();

    // Second presentation: should NOT trigger trial activation again
    trackBiblePresent({
      ref: "Genesis 1:1",
      translation: "ESV",
      overlayMode: "lower-third",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const secondCall = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(secondCall.event).toBe("bible_present");
    expect(secondCall.properties.ref).toBe("Genesis 1:1");
  });

  it("trackWorshipSongPresented tracks song properties", () => {
    trackWorshipSongPresented({
      songTitle: "Amazing Grace",
      overlayMode: "lower-third",
      hasLyrics: true,
    });

    const call = fetchMock.mock.calls.find((c) => {
      const body = JSON.parse(c[1].body as string);
      return body?.event === "worship_song_presented";
    });

    expect(call).toBeDefined();
    const body = JSON.parse(call![1].body as string);
    expect(body.properties).toMatchObject({
      songTitle: "Amazing Grace",
      overlayMode: "lower-third",
      hasLyrics: true,
    });
  });

  it("trackMediaPresented tracks media type and name", () => {
    trackMediaPresented({
      type: "video",
      mediaName: "intro.mp4",
    });

    const call = fetchMock.mock.calls.find((c) => {
      const body = JSON.parse(c[1].body as string);
      return body?.event === "media_presented";
    });

    expect(call).toBeDefined();
    const body = JSON.parse(call![1].body as string);
    expect(body.properties).toMatchObject({
      type: "video",
      mediaName: "intro.mp4",
    });
  });
});
