import { describe, expect, it } from "vitest";
import dockMediaTabSource from "./tabs/DockMediaTab.tsx?raw";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dockCssSource = readFileSync(fileURLToPath(new URL("./dock.css", import.meta.url)), "utf8");

describe("Dock Media responsive layout", () => {
  it("keeps the left rail exclusive to short-height docks", () => {
    expect(dockMediaTabSource).toContain('isCompactHeight ? " dock-media-console--short-height" : ""');
    expect(dockMediaTabSource).not.toContain('isNarrowWidth || isCompactHeight ? " dock-media-console--narrow"');
    expect(dockMediaTabSource).toContain('aria-orientation={isCompactHeight ? "vertical" : "horizontal"}');
    expect(dockCssSource).toContain(".dock-media-console--short-height .dock-media-tabs-column");
    expect(dockCssSource).not.toContain(".dock-media-console--narrow .dock-media-tabs-column");
  });

  it("includes ultra-compact height rules and shortened labels for docks <= 400px", () => {
    expect(dockMediaTabSource).toContain('isUltraCompactHeight ? " dock-media-console--ultra-compact" : ""');
    expect(dockMediaTabSource).toContain("isUltraCompactHeight ? t('media.recentShort', 'Recent') : t('media.recentlyUsed')");
    expect(dockMediaTabSource).toContain("isUltraCompactHeight ? t('media.uploadedShort', 'Uploaded') : t('media.newlyUploaded')");
    expect(dockCssSource).toContain(".dock-media-console--ultra-compact .dock-media-list");
    expect(dockCssSource).toContain(".dock-media-console--ultra-compact .dock-media-pill");
    expect(dockCssSource).toContain("@media (max-height: 400px)");
  });
});
