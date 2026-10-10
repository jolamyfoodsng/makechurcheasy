import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BroadcastSettingsPanel } from "./BroadcastSettingsPanel";

// Mock dockObsClient
vi.mock("../dock/dockObsClient", () => ({
  dockObsClient: {
    isConnected: true,
    connect: vi.fn().mockResolvedValue(undefined),
    getStreamStatus: vi.fn().mockResolvedValue({ outputActive: false }),
    setStreamServiceSettings: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("BroadcastSettingsPanel for MVSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders profiles, channels, pulsing dots, quota badge, info button, and Sync with OBS action", () => {
    const html = renderToStaticMarkup(<BroadcastSettingsPanel />);

    // Pulsing dots
    expect(html).toContain("broadcast-pulse-dot");

    // Clear title without jargon
    expect(html).toContain("Multi-Platform Live Streaming &amp; OBS Control");

    // Quota badge and info button behind icon
    expect(html).toContain("Free Plan (No Access)");
    expect(html).toContain("How it works");
    expect(html).toContain("broadcast-info-btn");

    // Profiles and channels
    expect(html).toContain("Senior Pastor");
    expect(html).toContain("Destinations for Senior Pastor");
    expect(html).toContain("Church Main YouTube");
    expect(html).toContain("Sync with OBS");
  });

});
