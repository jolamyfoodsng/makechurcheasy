import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock authService
vi.mock("../services/authService", () => ({
  getDeviceId: () => "test-device-123",
  getDeviceSecret: () => "test-secret-456",
}));

beforeEach(() => {
  mockFetch.mockReset();
});

import { processDocumentViaApi } from "./bulkImportAiService";

function makeApiResponse(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    provider: "opencode",
    processingTimeMs: 1234,
    chunksProcessed: 1,
    fallbackChunks: 0,
    needsReview: false,
    songs: [
      {
        title: "Amazing Grace",
        hymnNumber: "42",
        sections: [
          { type: "verse", label: "Verse 1", number: "1", content: "Amazing grace how sweet the sound" },
          { type: "chorus", content: "I once was lost but now am found" },
        ],
      },
    ],
    warnings: [],
    ...overrides,
  };
}

describe("processDocumentViaApi", () => {
  it("calls the API with correct URL and headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeApiResponse()),
    });

    await processDocumentViaApi("test text", "test.txt");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/worship/import/structure");
    expect(url).toContain("deviceId=test-device-123");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["X-Device-Secret"]).toBe("test-secret-456");
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(options.body as string);
    expect(body.text).toBe("test text");
    expect(body.fileName).toBe("test.txt");
  });

  it("maps API response songs to SmartImportSongDraft format", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeApiResponse()),
    });

    const result = await processDocumentViaApi("test text", "test.txt");
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].title).toBe("Amazing Grace");
    expect(result.songs[0].hymnNumber).toBe("42");
    expect(result.songs[0].method).toBe("ai");
    expect(result.songs[0].id).toBeTruthy();
    expect(result.songs[0].sections).toHaveLength(2);
    expect(result.songs[0].sections[0].type).toBe("verse");
    expect(result.songs[0].sections[1].type).toBe("chorus");
  });

  it("preserves metadata from API response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          makeApiResponse({
            provider: "claude",
            processingTimeMs: 5678,
            chunksProcessed: 3,
            fallbackChunks: 1,
            needsReview: true,
            warnings: ["1 section requires manual review"],
          }),
        ),
    });

    const result = await processDocumentViaApi("test text", "file.pdf");
    expect(result.stats.provider).toBe("claude");
    expect(result.stats.durationMs).toBe(5678);
    expect(result.stats.totalChunks).toBe(3);
    expect(result.stats.fallbackChunks).toBe(1);
    expect(result.stats.aiChunks).toBe(2);
    expect(result.needsReview).toBe(true);
    expect(result.warnings).toEqual(["1 section requires manual review"]);
  });

  it("handles empty text", async () => {
    const result = await processDocumentViaApi("", "empty.txt");
    expect(result.songs).toHaveLength(0);
    expect(result.stats.totalChunks).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Device not found" }),
    });

    await expect(processDocumentViaApi("text", "file.txt")).rejects.toThrow("Device not found");
  });

  it("throws on HTTP error with no error body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("parse error")),
    });

    await expect(processDocumentViaApi("text", "file.txt")).rejects.toThrow("API returned 500");
  });

  it("normalizes section types from API", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          makeApiResponse({
            songs: [
              {
                title: "Test",
                sections: [
                  { type: "c", content: "chorus" },
                  { type: "v", content: "verse" },
                  { type: "stanza", content: "stanza" },
                  { type: "solo", content: "solo" },
                  { type: "leader", content: "leader" },
                ],
              },
            ],
          }),
        ),
    });

    const result = await processDocumentViaApi("text", "file.txt");
    expect(result.songs[0].sections[0].type).toBe("chorus");
    expect(result.songs[0].sections[1].type).toBe("verse");
    expect(result.songs[0].sections[2].type).toBe("stanza");
    expect(result.songs[0].sections[3].type).toBe("solo");
    expect(result.songs[0].sections[4].type).toBe("leader");
  });

  it("generates unique IDs for each song", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          makeApiResponse({
            songs: [
              { title: "Song A", sections: [{ type: "verse", content: "a" }] },
              { title: "Song B", sections: [{ type: "verse", content: "b" }] },
            ],
          }),
        ),
    });

    const result = await processDocumentViaApi("text", "file.txt");
    expect(result.songs[0].id).not.toBe(result.songs[1].id);
  });
});
