import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_THEME_SETTINGS } from "../bible/types";

const dockScheduleCssSource = readFileSync(
  fileURLToPath(new URL("./components/dock-schedule.css", import.meta.url)),
  "utf8",
);

const dockScheduleDrawerSource = readFileSync(
  fileURLToPath(new URL("./components/DockScheduleDrawer.tsx", import.meta.url)),
  "utf8",
);

const dockIconSource = readFileSync(
  fileURLToPath(new URL("./DockIcon.tsx", import.meta.url)),
  "utf8",
);

const dockBibleTabSource = readFileSync(
  fileURLToPath(new URL("./tabs/DockBibleTab.tsx", import.meta.url)),
  "utf8",
);

describe("Dock Schedule Shared Space & Card Redesign", () => {
  it("sets default theme line spacing to 1.5", () => {
    expect(DEFAULT_THEME_SETTINGS.lineHeight).toBe(1.5);
  });

  it("shares in-flow layout space with draggable resizer instead of floating overlay", () => {
    expect(dockScheduleCssSource).toContain(".dock-schedule-container--expanded");
    expect(dockScheduleCssSource).toContain("width: 30%;");
    expect(dockScheduleCssSource).toContain("flex: 0 0 30%;");
    expect(dockScheduleDrawerSource).toContain("className=\"dock-schedule-resizer\"");
    expect(dockScheduleCssSource).toContain(".dock-schedule-resizer");
    expect(dockScheduleCssSource).toContain("cursor: col-resize;");
    // Ensure old floating overlay is gone
    expect(dockScheduleCssSource).not.toContain(".dock-schedule-overlay-drawer");
  });

  it("maps push_pin and pin to the real Lucide Pin icon, not CheckSquare", () => {
    expect(dockIconSource).toContain("push_pin: { component: Pin },");
    expect(dockIconSource).toContain("pin: { component: Pin },");
    expect(dockIconSource).not.toContain("push_pin: { component: CheckSquare },");
  });

  it("renders media items with thumbnail on top and text cards without generic left icons", () => {
    expect(dockScheduleDrawerSource).toContain("className={`dock-schedule-card");
    expect(dockScheduleDrawerSource).toContain("dock-schedule-card--media");
    expect(dockScheduleDrawerSource).toContain("dock-schedule-card--text");
    expect(dockScheduleDrawerSource).toContain("dock-schedule-card__media-thumb-wrap");
    expect(dockScheduleDrawerSource).toContain("dock-schedule-card__project-btn");
    expect(dockScheduleDrawerSource).toContain("handlePresentItem(item)");
    expect(dockScheduleDrawerSource).not.toContain("dock-schedule-card__btn--goto");
    expect(dockScheduleDrawerSource).toContain("handleGoToItem(item)");
    expect(dockScheduleDrawerSource).toContain("getMediaThumbnailSrc");
    expect(dockScheduleDrawerSource).toContain("handleRemoveItem(e, item.id)");
    expect(dockScheduleCssSource).toContain(".dock-schedule-card--media");
    expect(dockScheduleCssSource).toContain(".dock-schedule-card--text");
    expect(dockScheduleCssSource).toContain(".dock-schedule-card__media-thumb-wrap");
    expect(dockScheduleCssSource).toContain(".dock-schedule-card__project-btn");
    expect(dockScheduleDrawerSource).toContain("dock-schedule-card__bottom-row");
    expect(dockScheduleDrawerSource).toContain("dock-schedule-card__inscribed-passage");
    expect(dockScheduleCssSource).toContain(".dock-schedule-card__bottom-row");
    expect(dockScheduleCssSource).toContain(".dock-schedule-card__inscribed-passage");
  });

  it("sets line-height 1.5 on schedule card titles and preview snippets", () => {
    expect(dockScheduleCssSource).toContain(".dock-schedule-card__title");
    expect(dockScheduleCssSource).toContain("line-height: 1.5;");
    expect(dockScheduleCssSource).toContain(".dock-schedule-card__snippet");
  });

  it("removes the unstyled quick-queue button from the Bible verse row", () => {
    expect(dockBibleTabSource).not.toContain("dock-bible-verse-row__quick-queue-btn");
  });

  it("ensures close buttons are clearly visible and high-contrast", () => {
    expect(dockScheduleCssSource).toContain(".dock-schedule-card__remove-btn");
    expect(dockScheduleCssSource).toContain("background: rgba(255, 255, 255, 0.12);");
    expect(dockScheduleDrawerSource).toContain("className=\"dock-schedule-panel__close-btn\"");
  });

  it("removes the Clear button and adds a bottom center placeholder", () => {
    expect(dockScheduleDrawerSource).not.toContain("dock-schedule-btn--clear");
    expect(dockScheduleDrawerSource).toContain("dock-schedule-panel__bottom-placeholder");
    expect(dockScheduleCssSource).toContain(".dock-schedule-panel__bottom-placeholder");
    expect(dockScheduleCssSource).toContain("margin-top: auto;");
  });

  it("supports dragging down to ~15-20% width with compact text scaling", () => {
    expect(dockScheduleCssSource).toContain("min-width: 140px;");
    expect(dockScheduleDrawerSource).toContain("const MIN_SCHEDULE_WIDTH = 140;");
    expect(dockScheduleDrawerSource).toContain("Math.floor(window.innerWidth * 0.15)");
    expect(dockScheduleDrawerSource).toContain("dock-schedule-panel--compact");
    expect(dockScheduleCssSource).toContain(".dock-schedule-panel--compact .dock-schedule-card");
    expect(dockScheduleCssSource).toContain(".dock-schedule-panel--compact .dock-schedule-card__title");
    expect(dockScheduleCssSource).toContain(".dock-schedule-panel--compact .dock-schedule-card__snippet");
  });
});
