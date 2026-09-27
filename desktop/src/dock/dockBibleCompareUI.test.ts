import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import bibleDockUiSource from "./components/BibleDockUI.tsx?raw";
import dockBibleTabSource from "./tabs/DockBibleTab.tsx?raw";

const dockCssSource = readFileSync(fileURLToPath(new URL("./dock.css", import.meta.url)), "utf8");

describe("Bible Dock Compare Mode UI & Text Resolution", () => {
  it("removes KJV dropdown and renders the Compare ON button when compareEnabled is true", () => {
    expect(bibleDockUiSource).toContain("compareEnabled ? (");
    expect(bibleDockUiSource).toContain('className="bible-version-library__trigger dock-bible-compare-on-btn"');
    expect(bibleDockUiSource).toContain("onClick={() => onToggleCompare?.(false)}");
    expect(bibleDockUiSource).toContain('<Icon name="compare_arrows" size={11} className="dock-bible-compare-on-btn__icon-on" />');
    expect(bibleDockUiSource).toContain('<Icon name="close" size={11} className="dock-bible-compare-on-btn__icon-off" />');
    expect(bibleDockUiSource).toContain('className="dock-bible-compare-on-btn__label">CMP</span>');
    expect(bibleDockUiSource).toContain('className="dock-bible-compare-on-btn__badge"');
    expect(bibleDockUiSource).toContain(": (");
    expect(bibleDockUiSource).toContain("<BibleVersionLibrary");
  });

  it("passes onToggleCompare to BibleDockContainer and BibleSearchRow", () => {
    expect(bibleDockUiSource).toContain("onToggleCompare?: (enabled: boolean) => void;");
    expect(bibleDockUiSource).toContain("onToggleCompare={onToggleCompare}");
    expect(dockBibleTabSource).toContain("onToggleCompare={handleCompareEnabledChange}");
  });

  it("defines styles for .dock-bible-compare-on-btn in dock.css", () => {
    expect(dockCssSource).toContain(".dock-bible-search-row__translation .dock-bible-compare-on-btn {");
    expect(dockCssSource).toContain(".dock-bible-search-row__translation .dock-bible-compare-on-btn:hover {");
    expect(dockCssSource).toContain(".dock-bible-search-row__translation .dock-bible-compare-on-btn__badge {");
  });

  it("ensures fetchVerseText never returns the reference string as verse text", () => {
    expect(dockBibleTabSource).not.toContain("return `${book} ${chapter}:${verse}`");
    expect(dockBibleTabSource).toContain("const fallbackResult = await getVerse(book, chapter, verse, \"KJV\");");
  });

  it("ensures resolveVerseSelection passes empty fallback text to avoid formatting reference as body", () => {
    expect(dockBibleTabSource).toContain('const text = formatBibleOutputText(selection, "", targetVerse);');
    expect(dockBibleTabSource).not.toContain('formatBibleOutputText(selection, `${book} ${chapter}:${targetVerse}`, targetVerse)');
  });
});
