import { afterEach, describe, expect, it, vi } from "vitest";
import { postWorshipDockSongSaveCommand, type WorshipDockSongSaveCommand } from "./worshipDockInterop";

const command: WorshipDockSongSaveCommand = {
  commandId: "worship-song-save-test",
  timestamp: 1,
  payload: {
    id: "song-1",
    title: "Test song",
    artist: "",
    lyrics: "Test lyrics",
  },
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("worship dock song save fallback", () => {
  it("retries transient overlay-server failures until the save is accepted", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => '{"error":"overlay still starting"}',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{"ok":true}',
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const save = postWorshipDockSongSaveCommand(command, "http://127.0.0.1:45678");
    await vi.runAllTimersAsync();
    await save;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a bad request payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"name is required"}',
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postWorshipDockSongSaveCommand(command, "http://127.0.0.1:45678"),
    ).rejects.toThrow("failed with 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
