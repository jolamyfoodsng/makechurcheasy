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
  assert.equal(window.weekStart.toISOString(), "2026-08-08T23:00:00.000Z");
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
  assert.equal(window.weekStart.toISOString(), "2026-08-24T23:00:00.000Z");
});

test("builds comprehensive signup report including active users and breakdowns", async () => {
  const { buildSignupReport } = await import("./signupReports");

  const mockDb = {
    collection: (name: string) => ({
      countDocuments: async () => {
        if (name === "users") return 250;
        return 0;
      },
      find: () => ({
        toArray: async () => {
          if (name === "users") {
            return [
              { _id: "user1", lastActive: new Date() },
              { _id: "user2", lastActive: new Date() },
            ];
          }
          return [];
        },
      }),
      distinct: async () => {
        if (name === "security_sessions") return ["user1", "user3"];
        if (name === "devices") return ["user4"];
        if (name === "activity_events") return ["user2"];
        return [];
      },
      aggregate: () => ({
        toArray: async () => {
          if (name === "users") {
            return [
              { _id: "free", count: 200 },
              { _id: "basic", count: 35 },
              { _id: "growth", count: 15 },
            ];
          }
          return [];
        },
      }),
    }),
  } as unknown as import("mongodb").Db;

  const report = await buildSignupReport(mockDb, new Date("2026-08-15T22:00:00.000Z"), "Africa/Lagos");

  assert.equal(report.reportKey, "2026-08-15");
  assert.equal(report.totalUsers, 250);
  assert.equal(typeof report.activeUsersToday, "number");
  assert.equal(report.activeUsersToday, 4); // user1, user2, user3, user4
  assert.equal(typeof report.activeUsersWeek, "number");
  assert.equal(report.activeUsersWeek, 4);
  assert.ok(Array.isArray(report.planBreakdown));
  assert.equal(report.planBreakdown?.length, 3);
  assert.equal(report.planBreakdown?.[0].plan, "free");
  assert.equal(report.planBreakdown?.[0].count, 200);
});
