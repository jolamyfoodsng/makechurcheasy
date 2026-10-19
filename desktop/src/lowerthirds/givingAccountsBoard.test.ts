import { describe, expect, it } from "vitest";
import { BUNDLED_GRAPHIC_PACKAGES } from "./bundledGraphicPackages";

const board = BUNDLED_GRAPHIC_PACKAGES.find((p) => p.id === "giving-accounts-board")!;

describe("Giving Accounts Board", () => {
  it("centres a single account with no divider", () => {
    const css = String(board.css);
    expect(css).toContain(".gb-e:only-of-type{grid-column:1/-1;align-self:center}");
    expect(css).toContain(".gb-e:only-of-type~.gb-div{display:none}");
  });

  it("keeps the divider after every account so the sibling rule can reach it", () => {
    const html = String(board.html);
    const grid = html.slice(html.indexOf('<div class="gb-grid">'), html.indexOf("{{#footer}}"));
    expect(grid.indexOf('<i class="gb-div"></i>')).toBeGreaterThan(grid.indexOf("{{/bank6}}"));
    // Entries are the only <div> children of the grid; the divider is an <i>.
    expect(grid.match(/<div class="gb-e">/g)).toHaveLength(6);
  });
});
