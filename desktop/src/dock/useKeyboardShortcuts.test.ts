import { describe, it, expect, vi } from "vitest";
import { type ShortcutDefinition } from "./useKeyboardShortcuts";

describe("useKeyboardShortcuts definitions", () => {
  it("supports primary modifier and allowInInputs for conventional search", () => {
    const handler = vi.fn();
    const searchDef: ShortcutDefinition = {
      key: "f",
      modifier: "primary",
      allowInInputs: true,
      label: "Search in Tab",
      category: "Utility",
      handler,
    };

    expect(searchDef.key).toBe("f");
    expect(searchDef.modifier).toBe("primary");
    expect(searchDef.allowInInputs).toBe(true);
  });

  it("distinguishes regular navigation shortcuts from search shortcuts", () => {
    const navDef: ShortcutDefinition = {
      key: "1",
      modifier: "primary",
      label: "Bible",
      category: "Navigation",
      handler: vi.fn(),
    };

    expect(navDef.allowInInputs).toBeUndefined();
  });
});
