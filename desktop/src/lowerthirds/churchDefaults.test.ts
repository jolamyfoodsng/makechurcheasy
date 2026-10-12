import { describe, expect, it } from "vitest";
import type { MinistryData } from "../services/ministryStore";
import {
  applyChurchDefaults,
  churchAwareDefaults,
  churchValueFor,
  type ChurchThemeLike,
  type ChurchVariableLike,
} from "./churchDefaults";

const ALL_ICONS = ["facebook", "instagram", "youtube", "x", "tiktok", "whatsapp", "telegram", "threads", "twitch"].map(
  (value) => ({ value, label: value }),
);

function ministry(over: Partial<MinistryData> = {}): MinistryData {
  return {
    churchName: "Grace Chapel",
    mainPastorName: "Pastor John Smith",
    mainPastorRole: "Senior Pastor",
    speakers: [],
    logoPath: "",
    brandColor: "#6A34DE",
    website: "https://www.gracechapel.org/",
    phone: "+234 800 000 0000",
    email: "hello@gracechapel.org",
    address: "12 Main Street",
    city: "Lagos",
    tagline: "",
    socials: { facebook: "f", instagram: "i", youtube: "y", x: "t", whatsapp: "w" },
    ...over,
  };
}

const theme: ChurchThemeLike = { variables: [] };
const text = (key: string, defaultValue: string, label = key): ChurchVariableLike =>
  ({ key, label, type: "text", defaultValue });
const socials: ChurchVariableLike = {
  key: "socials", label: "Social icons (comma list)", type: "list", defaultValue: "facebook,x,instagram,youtube",
  options: ALL_ICONS, separator: ",",
};

describe("churchValueFor: contact details", () => {
  it("fills the website without the protocol and keeps a shouting design shouting", () => {
    expect(churchValueFor(text("web", "WWW.YOURWEBSITEHERE.COM", "Website"), theme, ministry()))
      .toBe("WWW.GRACECHAPEL.ORG");
    expect(churchValueFor(text("website", "www.yoursite.com"), theme, ministry())).toBe("www.gracechapel.org");
  });

  it("fills phone, email and address", () => {
    expect(churchValueFor(text("phone", "1234 5678", "Phone"), theme, ministry())).toBe("+234 800 000 0000");
    expect(churchValueFor(text("email", "you@church.com"), theme, ministry())).toBe("hello@gracechapel.org");
    expect(churchValueFor(text("address", "Your address"), theme, ministry())).toBe("12 Main Street, Lagos");
  });

  it("leaves boxes alone when the church has not filled that detail in", () => {
    const empty = ministry({ website: "", phone: "", email: "", address: "", city: "", socials: {} });
    expect(churchValueFor(text("web", "WWW.X.COM"), theme, empty)).toBeNull();
    expect(churchValueFor(text("phone", "1234"), theme, empty)).toBeNull();
    expect(churchValueFor(text("email", "a@b.c"), theme, empty)).toBeNull();
    expect(churchValueFor(socials, theme, empty)).toBeNull();
  });

  it("does not turn a link to a specific page into the home page", () => {
    expect(churchValueFor(text("link", "www.yourchurchname.com/prayer", "Link text"), theme, ministry())).toBeNull();
    expect(churchValueFor(text("scanLink", "https://yourchurchname.com/partner"), theme, ministry())).toBeNull();
  });

  it("fills a link box that only shows the home page", () => {
    expect(churchValueFor(text("scanLink", "https://yourchurchname.com"), theme, ministry()))
      .toBe("https://www.gracechapel.org/");
  });

  it("uses the church name for the channel name and the organisation box", () => {
    expect(churchValueFor(text("channelName", "YOUR CHANNEL NAME"), theme, ministry())).toBe("GRACE CHAPEL");
    expect(churchValueFor(text("organization", "Your church"), theme, ministry())).toBe("Grace Chapel");
  });

  it("does not use the church tagline for unrelated tagline boxes", () => {
    const m = ministry({ tagline: "A place to belong" });
    expect(churchValueFor(text("tagline", "Share Your Memories On Social Media"), theme, m)).toBeNull();
    expect(churchValueFor(text("slogan", "Your slogan"), theme, m)).toBe("A place to belong");
  });
});

describe("churchValueFor: social icons", () => {
  it("lists the icons for the links the church filled in, in the graphics' order", () => {
    expect(churchValueFor(socials, theme, ministry())).toBe("facebook,instagram,youtube,x,whatsapp");
  });

  it("keeps to five icons so the design is not crowded", () => {
    const all = ministry({ socials: { facebook: "a", instagram: "b", youtube: "c", x: "d", tiktok: "e", whatsapp: "f", telegram: "g" } });
    expect(churchValueFor(socials, theme, all)).toBe("facebook,instagram,youtube,x,tiktok");
  });

  it("only lists icons the box accepts", () => {
    const picky: ChurchVariableLike = { ...socials, options: [{ value: "facebook" }, { value: "youtube" }] };
    expect(churchValueFor(picky, theme, ministry())).toBe("facebook,youtube");
  });

  it("ignores list boxes that are not social icons", () => {
    expect(churchValueFor({ key: "items", label: "Menu items", type: "list" }, theme, ministry())).toBeNull();
  });
});

describe("applyChurchDefaults", () => {
  const t: ChurchThemeLike = {
    variables: [text("organization", "YOUR CHURCH", "Church"), text("web", "WWW.YOURWEBSITEHERE.COM", "Website"), socials],
  };

  it("fills boxes that still show the placeholder and leaves typed text alone", () => {
    const out = applyChurchDefaults(t, { organization: "YOUR CHURCH", web: "my own text", socials: "facebook,x,instagram,youtube" }, ministry());
    expect(out.organization).toBe("GRACE CHAPEL");
    expect(out.web).toBe("my own text");
    expect(out.socials).toBe("facebook,instagram,youtube,x,whatsapp");
  });

  it("makes a box follow the profile when it still holds what the old profile put there", () => {
    const older = ministry({ churchName: "Old Name Church", website: "https://old.org" });
    const values = { organization: "OLD NAME CHURCH", web: "OLD.ORG", socials: "" };
    const out = applyChurchDefaults(t, values, ministry(), { history: [older] });
    expect(out.organization).toBe("GRACE CHAPEL");
    expect(out.web).toBe("WWW.GRACECHAPEL.ORG");
  });

  it("does not touch a value that matches no earlier profile", () => {
    const older = ministry({ churchName: "Old Name Church" });
    const out = applyChurchDefaults(t, { organization: "THE ASSEMBLY", web: "", socials: "" }, ministry(), { history: [older], keepCleared: true });
    expect(out.organization).toBe("THE ASSEMBLY");
  });

  it("keeps a box that was cleared on purpose empty when asked to", () => {
    const out = applyChurchDefaults(t, { organization: "", web: "WWW.YOURWEBSITEHERE.COM" }, ministry(), { keepCleared: true });
    expect(out.organization).toBe("");
    expect(out.web).toBe("WWW.GRACECHAPEL.ORG");
    // A box that is missing altogether is still filled.
    expect(applyChurchDefaults(t, {}, ministry(), { keepCleared: true }).organization).toBe("GRACE CHAPEL");
  });

  it("fills empty boxes by default and overwrites everything with onlyUntouched: false", () => {
    expect(applyChurchDefaults(t, { organization: "" }, ministry()).organization).toBe("GRACE CHAPEL");
    expect(applyChurchDefaults(t, { organization: "typed" }, ministry(), { onlyUntouched: false }).organization).toBe("GRACE CHAPEL");
  });
});

describe("churchAwareDefaults", () => {
  it("resets boxes to the church's own details where known, otherwise the placeholder", () => {
    const t: ChurchThemeLike = { variables: [text("web", "WWW.YOURWEBSITEHERE.COM"), text("mark", "LOGO|HERE")] };
    expect(churchAwareDefaults(t, ministry())).toEqual({ web: "WWW.GRACECHAPEL.ORG", mark: "LOGO|HERE" });
  });
});
