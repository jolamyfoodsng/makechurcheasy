import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DockBroadcastTab from "./DockBroadcastTab";

// Mock dockObsClient
vi.mock("../dockObsClient", () => ({
  dockObsClient: {
    isConnected: true,
    getStreamStatus: vi.fn().mockResolvedValue({ outputActive: false, outputTimecode: "00:00:00" }),
    setStreamServiceSettings: vi.fn().mockResolvedValue(undefined),
    startStream: vi.fn().mockResolvedValue(undefined),
    stopStream: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("DockBroadcastTab UI & Visual Leading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with Step 1 (Profile), Step 2 (Channels), and Step 3 (Broadcast action)", () => {
    const html = renderToStaticMarkup(<DockBroadcastTab />);

    // Step 1: Profile section
    expect(html).toContain("Profile");
    expect(html).toContain("New Profile");
    expect(html).toContain("Senior Pastor");

    // Step 2: Channels section
    expect(html).toContain("Channels");
    expect(html).toContain("Add Channel");
    expect(html).toContain("Church Main YouTube");
    expect(html).toContain("YouTube Live • Primary YouTube ingest server");

    // Step 3: Broadcast Master Action
    expect(html).toContain("OBS Connected");
    expect(html).toContain("Enter Stream Key to Start");
  });


  it("renders sleek multi-streaming quota badge in header instead of bulky card", () => {
    const html = renderToStaticMarkup(<DockBroadcastTab />);
    // Bulky card has been removed in favor of sleek header badge
    expect(html).not.toContain("OBS Multistream");
    // Free plan shows 1 channel badge
    expect(html).toContain("1 channel");
  });

  it("does not render ugly raw socket URLs or fraction counters", () => {
    const html = renderToStaticMarkup(<DockBroadcastTab />);
    // Fraction counters like (2/2) should be gone
    expect(html).not.toContain("(2/2)");
    expect(html).not.toContain("(1/1)");
    // Raw rtmp URLs should not appear in visible channel subtitle
    expect(html).not.toContain("rtmps://live-api-s.facebook.com:443/rtmp/");
  });
});
