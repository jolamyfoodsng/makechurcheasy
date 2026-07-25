import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Mock the module under test (import after stubbing fetch) ──

import {
  generateSummary,
  generateNotes,
  generatePoints,
} from "./aiService";

// ── Shared helpers ──

function okJson(data: unknown) {
  return {
    ok: true,
    json: async () => data,
  };
}

function errJson(message: string, status = 403) {
  return {
    ok: false,
    status,
    json: async () => ({ error: message }),
  };
}

const TRANSCRIPT = "In the beginning God created the heavens and the earth. " +
  "The earth was formless and void, and darkness was over the surface of the deep. " +
  "And the Spirit of God was hovering over the waters.";

// ── AI Summary ──

describe("aiService — generateSummary", () => {
  it("returns parsed summary on success", async () => {
    mockFetch.mockResolvedValueOnce(okJson({
      success: true,
      summary: {
        _id: "s1",
        title: "Creation",
        summary: "God created everything.",
        keyScriptures: ["Genesis 1:1"],
        mainTakeaways: ["God is Creator"],
      },
      creditsUsed: 5,
      creditsRemaining: 195,
    }));

    const result = await generateSummary(TRANSCRIPT, { title: "Creation" });
    expect(result.result.title).toBe("Creation");
    expect(result.result.keyScriptures).toContain("Genesis 1:1");
    expect(result.creditsUsed).toBe(5);
    expect(result.creditsRemaining).toBe(195);

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("/api/ai/summary");
    expect(call[1].method).toBe("POST");
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce(errJson("AI features require Growth plan or higher", 403));
    await expect(generateSummary(TRANSCRIPT)).rejects.toThrow("Growth plan");
  });

  it("throws on insufficient credits", async () => {
    mockFetch.mockResolvedValueOnce(errJson("Insufficient credits", 402));
    await expect(generateSummary(TRANSCRIPT)).rejects.toThrow("Insufficient credits");
  });
});

// ── AI Notes ──

describe("aiService — generateNotes", () => {
  it("returns parsed notes on success", async () => {
    mockFetch.mockResolvedValueOnce(okJson({
      success: true,
      notes: {
        _id: "n1",
        sections: [
          { heading: "Introduction", content: "Opening remarks" },
          { heading: "Main Point", content: "God created" },
        ],
      },
      creditsUsed: 10,
      creditsRemaining: 190,
    }));

    const result = await generateNotes(TRANSCRIPT);
    expect(result.result.sections).toHaveLength(2);
    expect(result.result.sections[0].heading).toBe("Introduction");
    expect(result.creditsUsed).toBe(10);
  });

  it("throws when no OpenAI key configured", async () => {
    mockFetch.mockResolvedValueOnce(errJson(
      "No OpenAI API key configured. Please add your key in Settings > API Keys.",
      400
    ));
    await expect(generateNotes(TRANSCRIPT)).rejects.toThrow("OpenAI API key");
  });
});

// ── AI Points ──

describe("aiService — generatePoints", () => {
  it("returns parsed points on success", async () => {
    mockFetch.mockResolvedValueOnce(okJson({
      success: true,
      points: {
        _id: "p1",
        points: [
          { title: "God is Creator", explanation: "He made everything", scriptures: ["Genesis 1:1"] },
        ],
      },
      creditsUsed: 10,
      creditsRemaining: 190,
    }));

    const result = await generatePoints(TRANSCRIPT);
    expect(result.result.points).toHaveLength(1);
    expect(result.result.points[0].scriptures).toContain("Genesis 1:1");
    expect(result.creditsUsed).toBe(10);
  });

  it("throws on 502 AI service error", async () => {
    mockFetch.mockResolvedValueOnce(errJson("AI service error", 502));
    await expect(generatePoints(TRANSCRIPT)).rejects.toThrow("AI service error");
  });
});
