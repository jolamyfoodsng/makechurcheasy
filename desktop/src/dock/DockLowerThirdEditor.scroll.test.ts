import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dockCssSource = readFileSync(fileURLToPath(new URL("./dock.css", import.meta.url)), "utf8");

/** The declaration block of the first rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const start = dockCssSource.indexOf(`\n${selector} {`);
  expect(start, `rule ${selector} exists`).toBeGreaterThanOrEqual(0);
  const open = dockCssSource.indexOf("{", start);
  const close = dockCssSource.indexOf("}", open);
  return dockCssSource.slice(open + 1, close);
}

describe("Dock Ministry > Lower thirds: the fields can be scrolled to the end", () => {
  it("does not cap the open form with a fixed pixel max-height", () => {
    const body = ruleBody(".dock-lt-hidable--open");
    // A px cap (it used to be 600px) clipped long forms (Quote, Scripture...), so the
    // last fields were cut off and could not be reached by scrolling.
    expect(body).not.toMatch(/max-height:\s*\d+px/);
    expect(body).toMatch(/max-height:\s*none/);
    expect(body).toMatch(/overflow:\s*visible/);
  });

  it("still scrolls the Ministry list itself", () => {
    expect(ruleBody(".dock-mv-tab__list")).toMatch(/overflow-y:\s*auto/);
  });
});
