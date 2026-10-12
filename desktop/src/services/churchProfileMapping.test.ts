import { describe, expect, it } from "vitest";
import {
  SOCIAL_ICON_ORDER,
  contactFromProfile,
  displayWebsite,
  fullWebsiteUrl,
  socialsFromProfile,
} from "./churchProfileMapping";

describe("socialsFromProfile", () => {
  it("maps the profile's twitter link to the X icon and keeps the graphics' icon order", () => {
    const out = socialsFromProfile({
      tiktok: "https://tiktok.com/@grace",
      twitter: "https://x.com/grace",
      facebook: "https://facebook.com/grace",
      whatsapp: "https://wa.me/2348000000000",
    });
    expect(Object.keys(out)).toEqual(["facebook", "x", "tiktok", "whatsapp"]);
    expect(out.x).toBe("https://x.com/grace");
  });

  it("leaves out empty and blank links, and tolerates missing data", () => {
    expect(socialsFromProfile({ facebook: "  ", instagram: "" })).toEqual({});
    expect(socialsFromProfile(null)).toEqual({});
    expect(socialsFromProfile(undefined)).toEqual({});
  });

  it("only produces icons the graphics can draw", () => {
    const out = socialsFromProfile({ facebook: "a", instagram: "b", youtube: "c", twitter: "d", tiktok: "e", whatsapp: "f", telegram: "g", threads: "h", myspace: "i" });
    expect(Object.keys(out)).toEqual([...SOCIAL_ICON_ORDER]);
  });
});

describe("contactFromProfile", () => {
  it("returns empty strings for everything that is missing", () => {
    expect(contactFromProfile(null)).toEqual({
      website: "", phone: "", email: "", tagline: "", address: "", city: "", country: "", socials: {},
    });
  });

  it("trims the saved values", () => {
    const c = contactFromProfile({ website: " https://grace.org ", phone: " 0800 ", city: " Lagos " });
    expect(c.website).toBe("https://grace.org");
    expect(c.phone).toBe("0800");
    expect(c.city).toBe("Lagos");
  });
});

describe("website helpers", () => {
  it("shows a website without the protocol or trailing slash", () => {
    expect(displayWebsite("https://www.grace.org/")).toBe("www.grace.org");
    expect(displayWebsite("grace.org/")).toBe("grace.org");
    expect(displayWebsite("http://grace.org/about")).toBe("grace.org/about");
  });

  it("adds https:// when a link needs to be opened", () => {
    expect(fullWebsiteUrl("grace.org")).toBe("https://grace.org");
    expect(fullWebsiteUrl("http://grace.org")).toBe("http://grace.org");
    expect(fullWebsiteUrl("")).toBe("");
  });
});
