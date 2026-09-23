import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dockMediaTabSource = readFileSync(
  fileURLToPath(new URL("./tabs/DockMediaTab.tsx", import.meta.url)),
  "utf8",
);

const templateVideosSource = readFileSync(
  fileURLToPath(new URL("../services/templateVideos.ts", import.meta.url)),
  "utf8",
);

const dockCssSource = readFileSync(
  fileURLToPath(new URL("./dock.css", import.meta.url)),
  "utf8",
);

describe("Dock Animation Download Speed and UX", () => {
  it("makes un-downloaded animation tiles directly clickable to trigger download", () => {
    // Thumbnail container has clickable class and keyboard accessibility
    expect(dockMediaTabSource).toContain("dock-animation-tile__thumb--clickable");
    expect(dockMediaTabSource).toContain("handleDownloadTemplateVideo(asset)");
    expect(dockMediaTabSource).toContain('event.key === "Enter" || event.key === " "');

    // Shows hover download hint
    expect(dockMediaTabSource).toContain("dock-animation-tile__download-hint");
    expect(dockMediaTabSource).toContain("dock-animation-tile__download-hint-badge");
  });

  it("provides instant state feedback on download click", () => {
    // Progress is set to 0 synchronously on click before network awaits
    expect(dockMediaTabSource).toContain("setTemplateVideoProgress((current) => ({ ...current, [asset.id]: 0 }))");
    expect(dockMediaTabSource).toContain("setTemplatePictureProgress((current) => ({ ...current, [asset.id]: 0 }))");
  });

  it("renders rich download overlay with progress ring and status text", () => {
    // Tile gets downloading class
    expect(dockMediaTabSource).toContain('dock-animation-tile--downloading');

    // Renders download overlay with SVG progress ring and live percentage
    expect(dockMediaTabSource).toContain("dock-animation-tile__download-overlay");
    expect(dockMediaTabSource).toContain("dock-animation-tile__progress-ring");
    expect(dockMediaTabSource).toContain("dock-animation-tile__progress-ring-bar");
    expect(dockMediaTabSource).toContain("dock-animation-tile__progress-ring-text");
    expect(dockMediaTabSource).toContain("dock-animation-tile__download-status");
    expect(dockMediaTabSource).toContain("dock-animation-tile__progress-track");
    expect(dockMediaTabSource).toContain("dock-animation-tile__progress-fill");

    // Prevents event bubbling on corner button
    expect(dockMediaTabSource).toContain("e.stopPropagation()");
  });

  it("throttles stream progress in templateVideos to eliminate React re-render starvation", () => {
    // Throttle check in readResponseBytes
    expect(templateVideosSource).toContain("currentFraction - lastReportedFraction >= 0.01");
    expect(templateVideosSource).toContain("now - lastReportedTime >= 80");
  });

  it("implements fast non-blocking duration and thumbnail resolution", () => {
    // Timeouts on duration and thumbnail extraction
    expect(templateVideosSource).toContain("getVideoDuration(overlayUrl, 1500)");
    expect(templateVideosSource).toContain("generateVideoThumbnail(overlayUrl, 1500)");

    // Background generation fallback if initial extraction times out
    expect(templateVideosSource).toContain("generateVideoThumbnail(overlayUrl, 6000)");
  });

  it("includes CSS styling for downloading state, overlay, and animations", () => {
    // Downloading state keeps download button visible even without mouse hover
    expect(dockCssSource).toContain(".dock-animation-tile--downloading .dock-animation-tile__dl-btn");
    expect(dockCssSource).toContain(".dock-animation-tile__download-overlay");
    expect(dockCssSource).toContain(".dock-animation-tile__progress-ring");
    expect(dockCssSource).toContain("@keyframes dock-progress-spin");
    expect(dockCssSource).toContain("@keyframes dock-progress-indeterminate");
  });
});
