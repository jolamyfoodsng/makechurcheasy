import { describe, expect, it } from "vitest";
import { applyCompareToLayout, compareColumnsOf, compareContent, compareLayoutOf } from "./compare";
import { THEME_LAYOUT_VERSION, type ThemeLayer, type ThemeLayout } from "./types";

const anim = { in: { preset: "none", duration: 0, delay: 0, easing: "linear" }, out: { preset: "none", duration: 0, delay: 0, easing: "linear" } } as const;
const verse = (over: Partial<ThemeLayer> = {}): ThemeLayer => ({
  id: "verse", name: "Verse", type: "text", content: "{text}", anchor: "top-left", x: 100, y: 200, w: 1000, h: 500, style: { fontSize: 60 }, ...anim, ...over,
}) as ThemeLayer;
const layout = (layers: ThemeLayer[]): ThemeLayout => ({ version: THEME_LAYOUT_VERSION, format: "fullscreen", layers });

describe("side-by-side compare for layer themes", () => {
  it("only a two-translation compare slide counts", () => {
    const cols = [{ translation: "KJV", text: "a" }, { translation: "2B", text: "b" }];
    expect(compareColumnsOf({ layout: "compare", columns: cols })).not.toBeNull();
    expect(compareColumnsOf({ layout: "compare", compareMode: "passages", columns: cols })).not.toBeNull();
    expect(compareColumnsOf({ layout: "compare", compareMode: "other", columns: cols })).toBeNull();
    expect(compareColumnsOf({ layout: "compare", columns: [cols[0]] })).toBeNull();
    expect(compareColumnsOf({ columns: cols })).toBeNull();
    expect(compareColumnsOf(null)).toBeNull();
  });

  it("splits the verse layer into two columns that fit the original box", () => {
    const out = applyCompareToLayout(layout([verse()]));
    expect(out.layers).toHaveLength(2);
    const [a, b] = out.layers;
    expect(a.content).toBe("{text}");
    expect(b.content).toBe("{text2}");
    expect(a.w).toBe(b.w);
    expect(a.x).toBe(100);
    expect(b.x).toBeGreaterThan(a.x + a.w);
    expect(b.x + b.w).toBeLessThanOrEqual(100 + 1000);
    expect(a.style.fontSize).toBeLessThan(60);
  });

  it("keeps a centred verse layer centred", () => {
    const out = applyCompareToLayout(layout([verse({ anchor: "center", x: 960 })]));
    const [a, b] = out.layers;
    expect((a.x + b.x) / 2).toBe(960);
  });

  it("leaves a theme with no verse layer alone", () => {
    const only = layout([verse({ content: "{reference}" })]);
    expect(applyCompareToLayout(only)).toBe(only);
  });

  it("fills column one, column two and the combined reference", () => {
    const c = compareContent([
      { translation: "KJV", reference: "Lamentations 1:9", text: "Her filthiness" },
      { translation: "2B", reference: "Lamentations 1:9", text: "Idoti wa" },
    ], 1);
    expect(c.text).toBe("Her filthiness\n— KJV");
    expect(c.extra?.text2).toBe("Idoti wa\n— 2B");
    expect(c.reference).toBe("Lamentations 1:9 (KJV · 2B)");
  });

  it("line by line is the default; only side-by-side asks for columns", () => {
    expect(compareLayoutOf({ layout: "compare" })).toBe("line-by-line");
    expect(compareLayoutOf({ compareLayout: "side-by-side" })).toBe("side-by-side");
    expect(compareLayoutOf(null)).toBe("line-by-line");
  });

  it("line by line keeps one verse layer, a little smaller, with both translations stacked", () => {
    const out = applyCompareToLayout(layout([verse()]), "line-by-line");
    expect(out.layers).toHaveLength(1);
    expect(out.layers[0].content).toBe("{text}");
    expect(out.layers[0].style.fontSize).toBeLessThan(60);
    const c = compareContent([
      { translation: "KJV", reference: "Lamentations 1:9", text: "Her filthiness" },
      { translation: "2B", reference: "Lamentations 1:9", text: "Idoti wa" },
    ], 1, "line-by-line");
    expect(c.text).toBe("Her filthiness — KJV\nIdoti wa — 2B");
    expect(c.extra).toBeUndefined();
  });
  it("two passages are always columns, each ending with its own reference", () => {
    const cols: [{ translation: string; reference: string; text: string }, { translation: string; reference: string; text: string }] = [
      { translation: "KJV", reference: "John 3:16", text: "For God so loved" },
      { translation: "NIV", reference: "Psalm 23:1", text: "The Lord is my shepherd" },
    ];
    expect(compareLayoutOf({ layout: "compare", compareMode: "passages", compareLayout: "line-by-line", columns: cols })).toBe("side-by-side");
    const c = compareContent(cols, 1, "side-by-side", "passages");
    expect(c.text).toBe("For God so loved\n— John 3:16 (KJV)");
    expect(c.extra?.text2).toBe("The Lord is my shepherd\n— Psalm 23:1 (NIV)");
    expect(c.reference).toBe("John 3:16 · Psalm 23:1");
  });
});
