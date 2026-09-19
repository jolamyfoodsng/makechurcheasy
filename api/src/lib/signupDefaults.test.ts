import assert from "node:assert/strict";
import { test } from "node:test";

import { detectRequestCountry, resolveSignupLanguage } from "./signupDefaults";

test("detects the country supplied by the hosting edge", () => {
  const headers = new Headers({
    "cf-ipcountry": "gh",
    "x-vercel-ip-country": "US",
  });

  assert.equal(detectRequestCountry(headers), "GH");
});

test("prefers the dashboard country over hosting proxy headers", () => {
  const headers = new Headers({
    "x-mce-geo-country": "GH",
    "cf-ipcountry": "US",
    "x-vercel-ip-country": "US",
  });

  assert.equal(detectRequestCountry(headers), "GH");
});

test("ignores unavailable edge country values", () => {
  assert.equal(detectRequestCountry(new Headers({ "cf-ipcountry": "XX" })), null);
  assert.equal(detectRequestCountry(new Headers({})), null);
});

test("chooses a supported browser language without prompting", () => {
  const headers = new Headers({ "accept-language": "fr-CA,fr;q=0.9,en;q=0.8" });
  assert.equal(resolveSignupLanguage(headers, "CA"), "fr-CA");
});

test("uses the country language default when the browser language is unsupported", () => {
  const headers = new Headers({ "accept-language": "de-DE,de;q=0.9" });
  assert.equal(resolveSignupLanguage(headers, "GH"), "en-GH");
});
