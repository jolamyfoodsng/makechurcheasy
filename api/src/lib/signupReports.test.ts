import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSignupReportWindow,
  getLocalCalendarDate,
} from "./signupReports";

test("uses Africa/Lagos local day boundaries for the signup report", () => {
  const window = buildSignupReportWindow(
    new Date("2026-08-15T22:00:00.000Z"),
    "Africa/Lagos",
  );

  assert.deepEqual(getLocalCalendarDate(new Date("2026-08-15T22:00:00.000Z"), "Africa/Lagos"), {
    year: 2026,
    month: 8,
    day: 15,
  });
  assert.equal(window.dateKey, "2026-08-15");
  assert.equal(window.monthKey, "2026-08");
  assert.equal(window.dayStart.toISOString(), "2026-08-14T23:00:00.000Z");
  assert.equal(window.dayEnd.toISOString(), "2026-08-15T23:00:00.000Z");
  assert.equal(window.isMonthEnd, false);
});

test("marks the last local day of the month for the month total", () => {
  const window = buildSignupReportWindow(
    new Date("2026-08-31T22:00:00.000Z"),
    "Africa/Lagos",
  );

  assert.equal(window.dateKey, "2026-08-31");
  assert.equal(window.isMonthEnd, true);
  assert.equal(window.monthStart.toISOString(), "2026-07-31T23:00:00.000Z");
  assert.equal(window.monthEnd.toISOString(), "2026-08-31T23:00:00.000Z");
});
