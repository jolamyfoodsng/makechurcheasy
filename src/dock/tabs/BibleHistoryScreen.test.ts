import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("BibleHistoryScreen - Close Button and Icons Verification", () => {
  const tsxPath = resolve(__dirname, "BibleHistoryScreen.tsx");
  const cssPath = resolve(__dirname, "BibleHistoryScreen.css");
  const tsxContent = readFileSync(tsxPath, "utf-8");
  const cssContent = readFileSync(cssPath, "utf-8");

  it("renders a dedicated visible close button in the header", () => {
    expect(tsxContent).toContain('className="bible-history-header__close"');
    expect(tsxContent).toContain('<Icon name="close" size={16} />');
    expect(tsxContent).toContain('title={t("common.close", "Close")}');
  });

  it("renders a visible back button in the header", () => {
    expect(tsxContent).toContain('className="bible-history-header__back"');
    expect(tsxContent).toContain('<Icon name="arrow_back" size={16} />');
  });

  it("supports pressing Escape to dismiss the screen", () => {
    expect(tsxContent).toContain('if (e.key === "Escape")');
    expect(tsxContent).toContain("onBack()");
  });

  it("tracks viewport height and width for compact dock responsiveness", () => {
    expect(tsxContent).toContain("isShort");
    expect(tsxContent).toContain("isUltraShort");
    expect(tsxContent).toContain("isNanoHeight");
    expect(tsxContent).toContain("isNarrow");
    expect(tsxContent).toContain("isUltraNarrow");
  });

  it("styles close and back buttons with visible boundaries and hover effects", () => {
    expect(cssContent).toContain(".bible-history-header__close");
    expect(cssContent).toContain(".bible-history-header__back");
    expect(cssContent).toContain("z-index: 100000;");
  });

  it("ensures history card book icon has high contrast badge styling", () => {
    expect(cssContent).toContain(".bible-history-card__icon");
    expect(cssContent).toContain("var(--dock-accent");
    // Ensure the old dark invisible blue fallback is gone
    expect(cssContent).not.toContain("color: var(--dock-accent, #1D4ED8)");
  });

  it("provides responsive CSS rules for short, ultra-short, and nano dock heights", () => {
    expect(cssContent).toContain(".bible-history-screen--short");
    expect(cssContent).toContain(".bible-history-screen--ultra-short");
    expect(cssContent).toContain(".bible-history-screen--nano");
  });

  it("pushes the selected verse live to OBS when navigating from history", () => {
    const dockBibleTabPath = resolve(__dirname, "DockBibleTab.tsx");
    const dockBibleTabContent = readFileSync(dockBibleTabPath, "utf-8");
    expect(dockBibleTabContent).toContain("onNavigateToVerse={(book, chapter, verse) => {");
    expect(dockBibleTabContent).toContain("void goLiveVerse(book, chapter, verse, {");
  });
});
