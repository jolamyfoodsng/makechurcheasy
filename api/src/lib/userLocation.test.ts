import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLoginLocationUpdates, extractRequestLocation } from "./userLocation";

test("extractRequestLocation extracts country, city, timezone, and ip", async () => {
  const headers = new Headers({
    "cf-ipcountry": "GH",
    "x-mce-geo-city": "Accra",
    "x-mce-geo-timezone": "Africa/Accra",
    "cf-connecting-ip": "102.176.65.1",
  });

  const location = await extractRequestLocation(headers);
  assert.equal(location.country, "GH");
  assert.equal(location.city, "Accra");
  assert.equal(location.timezone, "Africa/Accra");
  assert.equal(location.ip, "102.176.65.1");
});

test("buildLoginLocationUpdates preserves signupCountry and does not overwrite permanent country", () => {
  const existingUser = {
    _id: "user123",
    country: "NG",
    signupCountry: "NG",
    signupCity: "Lagos",
  };

  const newLocation = {
    country: "US",
    city: "New York",
    timezone: "America/New_York",
    ip: "104.28.1.1",
  };

  const timestamp = "2026-10-03T18:00:00.000Z";
  const { set, push } = buildLoginLocationUpdates(existingUser, newLocation, timestamp);

  // Must NOT change permanent country or signupCountry
  assert.equal(set.country, undefined);
  assert.equal(set.signupCountry, undefined);

  // Must update lastLogin location
  assert.equal(set.lastLoginCountry, "US");
  assert.equal(set.lastLoginCity, "New York");
  assert.equal(set.lastLoginIp, "104.28.1.1");
  assert.equal(set.lastLoginTimezone, "America/New_York");

  // Must record into locationHistory
  assert.ok(push?.locationHistory);
  assert.equal(push.locationHistory.$each[0].country, "US");
  assert.equal(push.locationHistory.$each[0].city, "New York");
});

test("buildLoginLocationUpdates backfills signupCountry if missing", () => {
  const legacyUser = {
    _id: "user456",
    country: "NG",
  };

  const newLocation = {
    country: "GB",
    city: "London",
    timezone: "Europe/London",
    ip: "82.165.1.1",
  };

  const timestamp = "2026-10-03T18:00:00.000Z";
  const { set } = buildLoginLocationUpdates(legacyUser, newLocation, timestamp);

  // Locks in existing country as permanent signupCountry
  assert.equal(set.signupCountry, "NG");
  assert.equal(set.country, undefined);
  assert.equal(set.lastLoginCountry, "GB");
});
