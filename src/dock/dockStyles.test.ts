import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const dockCss = readFileSync(new URL("./dock.css", import.meta.url), "utf8");
const dockLayerManager = readFileSync(new URL("./dockLayerManager.ts", import.meta.url), "utf8");

function cssBlock(selector: string): string {
  const start = dockCss.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = dockCss.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return dockCss.slice(start, end + 2);
}

describe("dock shared styles", () => {
  it("keeps the zoomed dock inside the viewport so trailing controls stay visible", () => {
    const root = cssBlock(".dock-root {");

    expect(root).toContain("width: 100%");
    expect(root).toContain("height: 100%");
    expect(root).toContain("zoom: var(--dock-font-scale, 1)");
    expect(root).not.toContain("calc(100% / var(--dock-font-scale, 1))");
    expect(root).not.toContain("calc(100dvh / var(--dock-font-scale, 1))");
  });

  it("keeps the lyrics toolbar controls readable in light mode", () => {
    const toolbar = cssBlock(".dock-lyrics-toolbar {");
    const button = cssBlock(".dock-lyrics-toolbar__btn {");
    const accent = cssBlock(".dock-lyrics-toolbar__btn--accent {");
    const caseButton = cssBlock(".dock-lyrics-toolbar__btn--case {");

    expect(toolbar).toContain("background: var(--dock-surface-alt");
    expect(toolbar).toContain("border: 1px solid var(--dock-border-soft");
    expect(toolbar).toContain("align-items: flex-start");
    expect(toolbar).toContain("justify-content: flex-start");
    expect(button).toContain("background: var(--dock-surface");
    expect(button).toContain("color: var(--dock-text-secondary");
    expect(accent).toContain("color: var(--dock-accent");
    expect(caseButton).toContain("color: var(--dock-text-secondary");
    expect(cssBlock(".dock-lyrics-toolbar__group {")).toContain("margin-left: 0");
    expect(button).not.toContain("--dock-secondary-text");
    expect(button).not.toContain("--dock-primary");
  });

  it("keeps Bible comparison rows aligned and wrapped", () => {
    expect(dockCss).toContain(".dock-bible-verse-row--compare {\n  display: grid;");
    expect(dockCss).toContain("grid-template-columns: minmax(18px, auto) minmax(0, 1fr);");
    expect(dockCss).toContain(".dock-bible-verse-row--compare .dock-bible-compare-stack");
    expect(dockCss).toContain("overflow-wrap: anywhere;");
  });

  it("wraps long Notes previews and translated slide text", () => {
    expect(cssBlock(".dock-notes-card .dock-card__subtitle {")).toContain("overflow-wrap: anywhere;");
    expect(cssBlock(".dock-worship-slide-card__text,")).toContain("overflow-wrap: anywhere;");
    expect(cssBlock(".dock-worship-slide-card__translation {")).toContain("word-break: break-word;");
  });

  it("compresses the Worship/Notes controls in a micro dock", () => {
    expect(dockCss).toContain("@media screen and (max-width: 300px)");
    expect(dockCss).toContain(".dock-root--vertical-tabs .dock-module--worship .dock-worship-subtab {\n  position: relative;");
    expect(dockCss).toContain(".dock-module--worship .dock-worship-summary__header {\n    grid-template-columns: 28px minmax(0, 1fr) auto;");
    expect(dockCss).toContain(".dock-module--worship .dock-worship-lyrics-search .dock-media-search__input {");
  });

  it("keeps selected song controls behind the overflow menu", () => {
    expect(cssBlock(".dock-worship-summary__primary-actions {")).toContain("display: none;");
    expect(cssBlock(".dock-worship-summary__overflow-wrap {")).toContain("display: inline-flex;");
    expect(dockCss).toContain("@media screen and (max-height: 600px)");
    expect(dockCss).toContain(".dock-module--worship .dock-worship-summary__compact-search");
    expect(dockCss).toContain(".dock-module--worship .dock-worship-summary__overflow-wrap");
  });

  it("keeps cards out of the transient overlay layer", () => {
    expect(dockCss).toContain('[data-dock-scroll-surface="true"]');
    expect(dockCss).toContain("overflow-y: auto;");
    expect(dockCss).toContain('[data-dock-layer-active="true"]');
    expect(dockCss).toContain("z-index: var(--dock-layer-z-index, 10000) !important;");
    expect(dockCss).not.toContain('[data-dock-scroll-surface="true"][data-dock-layer-kind="card"]');
    expect(dockLayerManager).toContain('if (layer.kind !== "owner" && layer.kind !== "overlay" && layer.kind !== "surface") continue;');
    expect(dockLayerManager).toContain("Main cards and their structural owners are not transient layers");
  });

  it("promotes the Bible search stacking context with its open popovers", () => {
    expect(dockLayerManager).toContain('"dock-bible-search-row"');
    expect(dockLayerManager).toContain("DOCK_PROMOTABLE_OWNER_CLASS_NAMES");
    expect(dockCss).toContain("z-index: 10003;");
  });

  it("anchors Worship/Notes tabs to the left instead of stretching them", () => {
    const tabs = cssBlock(".dock-worship-subtab-bar {");
    const tab = cssBlock(".dock-worship-subtab {");

    expect(tabs).toContain("flex: 0 0 auto;");
    expect(tabs).toContain("width: max-content;");
    expect(tabs).toContain("max-width: calc(100% - 16px);");
    expect(tabs).toContain("margin: 12px 8px 6px;");
    expect(tabs).toContain("justify-content: flex-start;");
    expect(tab).toContain("flex: 0 0 auto;");
    expect(tab).toContain("justify-content: flex-start;");
    expect(tab).not.toContain("flex: 1 1 0");
  });
});
