import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GivingBankFields, { countShownBanks, hasGivingBankFields, isGivingBankFieldKey } from "./GivingBankFields";

describe("giving board bank rows", () => {
  it("recognises the graphic and its bank fields", () => {
    expect(hasGivingBankFields(["title", "bank1", "num1", "logo1", "logo"])).toBe(true);
    expect(hasGivingBankFields(["title", "logo"])).toBe(false);
    expect(isGivingBankFieldKey("bank3")).toBe(true);
    expect(isGivingBankFieldKey("logo")).toBe(false);
    expect(isGivingBankFieldKey("footer")).toBe(false);
  });

  it("counts the banks that have a name, at least one", () => {
    expect(countShownBanks({ bank1: "GTBank", bank2: "  ", bank3: "UBA" })).toBe(2);
    expect(countShownBanks({})).toBe(1);
    expect(countShownBanks({ bank1: "A", bank2: "B", bank3: "C", bank4: "D", bank5: "E", bank6: "F" })).toBe(6);
  });

  it("shows one row per bank that is on, with the selector and an upload box", () => {
    const html = renderToStaticMarkup(
      <GivingBankFields
        values={{ bank1: "GTBank", num1: "0123456789", logo1: "/uploads/gt.png", bank2: "UBA", num2: "", logo2: "", bank3: "", bank4: "", bank5: "", bank6: "" }}
        defaults={{}}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("How many bank accounts?");
    expect(html).toContain("<select");
    expect(html).toContain("6 bank accounts");
    expect(html).toContain('aria-label="Bank 1 name"');
    expect(html).toContain('aria-label="Bank 2 name"');
    expect(html).not.toContain('aria-label="Bank 3 name"');
    expect(html).toContain("/uploads/gt.png");
    expect(html).toContain("Remove logo");
    expect(html).toContain("No logo yet");
  });
});
