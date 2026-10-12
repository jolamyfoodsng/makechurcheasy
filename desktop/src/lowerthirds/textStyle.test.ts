import { describe, expect, it } from "vitest";
import {
  applyTextCase,
  parseTextStyle,
  serializeTextStyle,
  substituteStyledVariables,
  textStyleCapabilityFor,
} from "./textStyle";

describe("textStyle", () => {
  it("changes letter case", () => {
    expect(applyTextCase("we declare THAT", "upper")).toBe("WE DECLARE THAT");
    expect(applyTextCase("WE DECLARE that", "lower")).toBe("we declare that");
    expect(applyTextCase("WHAT IS faith? it is trust", "title")).toBe("What Is Faith? It Is Trust");
    expect(applyTextCase("WHAT IS FAITH? IT IS TRUST.", "sentence")).toBe("What is faith? It is trust.");
    expect(applyTextCase("As Typed", "none")).toBe("As Typed");
  });

  it("round-trips and clamps the style string", () => {
    const s = parseTextStyle("case=upper;size=500;weight=bold;italic=1;spacing=wide");
    expect(s).toEqual({ case: "upper", size: 180, weight: "bold", italic: true, spacing: "wide" });
    expect(serializeTextStyle(parseTextStyle(""))).toBe("");
    expect(parseTextStyle("{{title__style}}").case).toBe("none");
  });

  it("styles text but only changes the case inside attributes", () => {
    const html = '<div data-v-title="{{title}}"><b>{{title}}</b><i>{{other}}</i></div>';
    const out = substituteStyledVariables(html, { title: "grace & peace", title__style: "case=upper;size=120", other: "x" });
    expect(out).toContain('data-v-title="GRACE &amp; PEACE"');
    expect(out).toContain('<b><span class="lt-ts" style="text-transform:none!important;font-size:120%!important">GRACE &amp; PEACE</span></b>');
    expect(out).toContain("<i>x</i>");
  });

  it("knows which graphics take the full style", () => {
    expect(textStyleCapabilityFor({ html: '<div class="kx-root" data-kx-pkg="abc">' })).toBe("full");
    expect(textStyleCapabilityFor({ html: '<div class="kx-root" data-kx="x">' })).toBe("case");
    expect(textStyleCapabilityFor({ html: "<div>{{name}}</div>" })).toBe("full");
  });
});
