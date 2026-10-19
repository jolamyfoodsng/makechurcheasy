import { describe, expect, it } from "vitest";
import { getMcePresentationVisibilityKeepSet, isMceTickerSourceName } from "./dockObsClient";
import obsClientSource from "./dockObsClient.ts?raw";

describe("ticker stays on when content goes live", () => {
  const items = [
    { sourceName: "Bible - MCE Presentation", sceneItemIndex: 0 },
    { sourceName: "Worship - MCE Presentation", sceneItemIndex: 1 },
    { sourceName: "MCE Ticker", sceneItemIndex: 2 },
    { sourceName: "Ticker - MCE Presentation", sceneItemIndex: 3 },
    { sourceName: "News ticker cam", sceneItemIndex: 4 },
  ];

  it("keeps every MCE ticker when a Bible verse is shown with active-only visibility", () => {
    const keep = getMcePresentationVisibilityKeepSet("Bible - MCE Presentation", items, "active-only");
    expect(keep.has("Bible - MCE Presentation")).toBe(true);
    expect(keep.has("MCE Ticker")).toBe(true);
    expect(keep.has("Ticker - MCE Presentation")).toBe(true);
    expect(keep.has("Worship - MCE Presentation")).toBe(false);
  });

  it("recognises the ticker under its MCE names only", () => {
    expect(isMceTickerSourceName("MCE Ticker")).toBe(true);
    expect(isMceTickerSourceName("Ticker - MCE Presentation")).toBe(true);
    expect(isMceTickerSourceName("News ticker cam")).toBe(false);
    expect(isMceTickerSourceName("Bible - MCE Presentation")).toBe(false);
  });

  it("never creates a ticker while only stacking sources", () => {
    const guards = obsClientSource.match(/isMcePresentationManagedSource\(sourceName\) && !isMceTickerSourceName\(sourceName\)/g) ?? [];
    expect(guards).toHaveLength(2);
    // A go-live leaves the ticker's visibility alone: never hides a running one, never shows a stopped one.
    expect(obsClientSource).toContain("if (isMceTickerSourceName(item.sourceName) && item.sourceName !== primary) continue;");
    // Stacking the ticker from projection settings must not switch a cleared ticker back on.
    expect(obsClientSource).toContain("ensureTickerAboveSource(sceneName, DOCK_TICKER_SOURCE, { leaveVisibility: true })");
  });
});
