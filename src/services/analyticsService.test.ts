import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

import {
  trackEvent,
  getEvents,
  getDashboard,
} from "./analyticsService";

function okJson(data: unknown) {
  return { ok: true, json: async () => data };
}

function errJson(message: string, status = 403) {
  return { ok: false, status, json: async () => ({ error: message }) };
}

// ── trackEvent ──

describe("analyticsService — trackEvent", () => {
  it("logs an event successfully", async () => {
    mockFetch.mockResolvedValueOnce(okJson({
      success: true,
      eventId: "evt1",
    }));

    const result = await trackEvent("sermon_created", { topic: "Faith" });
    expect(result.eventId).toBe("evt1");

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("/api/user/analytics");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body);
    expect(body.event).toBe("sermon_created");
    expect(body.metadata.topic).toBe("Faith");
  });

  it("silently ignores 403 (non-Growth users)", async () => {
    mockFetch.mockResolvedValueOnce(errJson("Advanced analytics requires Growth plan", 403));
    const result = await trackEvent("test_event");
    expect(result.eventId).toBe("");
  });

  it("throws on non-403 errors", async () => {
    mockFetch.mockResolvedValueOnce(errJson("Internal server error", 500));
    await expect(trackEvent("test")).rejects.toThrow("Internal server error");
  });
});

// ── getEvents ──

describe("analyticsService — getEvents", () => {
  it("fetches events with default params", async () => {
    mockFetch.mockResolvedValueOnce(okJson({
      events: [{ event: "song_created", createdAt: "2025-01-01" }],
    }));

    const events = await getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("song_created");
  });

  it("passes query params for filtering", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ events: [] }));

    await getEvents({ limit: 10, event: "song_created", since: "2025-01-01" });
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("limit=10");
    expect(url).toContain("event=song_created");
    expect(url).toContain("since=2025-01-01");
  });
});

// ── getDashboard ──

describe("analyticsService — getDashboard", () => {
  it("fetches aggregated dashboard data", async () => {
    mockFetch.mockResolvedValueOnce(okJson({
      aggregation: [
        { event: "song_created", count: 15 },
        { event: "media_uploaded", count: 8 },
      ],
      days: 30,
    }));

    const dashboard = await getDashboard(30);
    expect(dashboard.aggregation).toHaveLength(2);
    expect(dashboard.aggregation[0].count).toBe(15);

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("mode=dashboard");
    expect(url).toContain("days=30");
  });
});
