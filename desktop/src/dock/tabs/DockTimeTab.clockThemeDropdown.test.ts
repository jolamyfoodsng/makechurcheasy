import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import timeTabSource from "./DockTimeTab.tsx?raw";
import ministryTabSource from "./DockMinistryTab.tsx?raw";
import enLocale from "../../locales/dock-en-US.json";

const dockCssSource = fs.readFileSync(path.resolve(__dirname, "../dock.css"), "utf8");

describe("Dock Time Tab & Ministry Tab Refinements", () => {
  it("renders Clock Theme as a select dropdown with active theme hint", () => {
    expect(timeTabSource).toContain('<select');
    expect(timeTabSource).toContain('id="dock-clock-theme-select"');
    expect(timeTabSource).toContain('className="dock-time-select"');
    expect(timeTabSource).toContain('CLOCK_THEMES.map((theme) => (');
    expect(timeTabSource).toContain('activeTheme?.desc');
    // Button cards should be replaced with the select dropdown
    expect(timeTabSource).not.toContain('dock-time-theme-card');
  });

  it("displays the full 'Lower-Third' label in Ministry sub-tabs", () => {
    expect(ministryTabSource).toContain('t("ministry.lowerThirdsShort", "Lower-Third")');
    expect(enLocale["ministry.lowerThirdsShort"]).toBe("Lower-Third");
  });

  it("includes styling for dock-time-select and no-wrap dock-ministry-tab", () => {
    expect(dockCssSource).toContain(".dock-time-select {");
    expect(dockCssSource).toContain(".dock-time-field__header {");
    expect(dockCssSource).toContain(".dock-time-field__hint {");
    expect(dockCssSource).toContain(".dock-ministry-tab {");
    expect(dockCssSource).toContain("white-space: nowrap;");
  });
});
