import { describe, expect, it, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MultistreamStatusPanel } from "./MultistreamStatusPanel";
import { destinationsFingerprint, setMultistreamTarget } from "../services/multistreamState";
import type { BroadcastPersonProfile } from "../services/broadcastSettingsService";
import type { MultistreamUsageInfo } from "../services/broadcastUsageService";

const profile: BroadcastPersonProfile = {
  id: "p1",
  name: "Pastor David",
  nickname: "Pastor David",
  color: "#6366F1",
  channels: [
    { id: "yt", name: "Main YouTube", platform: "youtube", streamKey: "a", serverUrl: "auto", enabled: true },
    { id: "fb", name: "Church Facebook", platform: "facebook", streamKey: "b", serverUrl: "", enabled: true },
  ],
};

const usage: MultistreamUsageInfo = {
  totalHours: 20, usedSeconds: 3600, usedHours: 1, remainingSeconds: 68400, remainingHours: 19,
  formattedRemaining: "19h", formattedUsed: "1h", isExhausted: false, percentageUsed: 5,
};

describe("MultistreamStatusPanel", () => {
  beforeEach(() => {
    setMultistreamTarget({ mode: "direct", profileId: "someone-else", profileName: "x", channelIds: [], destinations: [], syncedAt: 0 });
  });

  it("asks to send the profile to OBS when it was never synced", () => {
    const html = renderToStaticMarkup(
      <MultistreamStatusPanel profile={profile} isStreaming={false} allowed usage={usage} onApply={() => undefined} />,
    );
    expect(html).toContain("Not sent to OBS yet");
    expect(html).toContain("Send to OBS");
    expect(html).toContain("19h of 20h multi-stream time left this month");
  });

  it("shows each destination's result after a cloud sync", () => {
    setMultistreamTarget({
      mode: "cloud",
      profileId: "p1",
      profileName: "Pastor David",
      channelIds: ["yt"],
      destinations: [
        { id: "yt", name: "Main YouTube", platform: "youtube", ok: true },
        { id: "fb", name: "Church Facebook", platform: "facebook", ok: false, reason: "Rejected: Invalid stream key" },
      ],
      fingerprint: destinationsFingerprint(profile.channels),
      syncedAt: Date.now(),
    });
    const html = renderToStaticMarkup(
      <MultistreamStatusPanel profile={profile} isStreaming allowed usage={usage} onApply={() => undefined} />,
    );
    expect(html).toContain("Live on 1 destination");
    expect(html).toContain("Receiving the stream");
    expect(html).toContain("Rejected: Invalid stream key");
    expect(html).not.toContain("Apply changes");
  });

  it("flags edits made after the last sync", () => {
    setMultistreamTarget({
      mode: "cloud", profileId: "p1", profileName: "Pastor David", channelIds: ["yt", "fb"],
      destinations: [], fingerprint: "stale", syncedAt: Date.now(),
    });
    const html = renderToStaticMarkup(
      <MultistreamStatusPanel profile={profile} isStreaming={false} allowed usage={usage} onApply={() => undefined} />,
    );
    expect(html).toContain("Apply changes");
  });
});
