import type { Db } from "mongodb";
import {
  displayCountry,
  getCountryFlag,
  type CountryCount,
  type PlanCount,
  type TelegramSignupReportDetails,
  type TodaySignupItem,
} from "./telegramNotifications";

export const DEFAULT_SIGNUP_REPORT_TIMEZONE = "Africa/Lagos";

const MINUTE_MS = 60 * 1000;

export interface LocalCalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface SignupReportWindow {
  dateKey: string;
  dateLabel: string;
  monthKey: string;
  monthLabel: string;
  timezone: string;
  dayStart: Date;
  dayEnd: Date;
  weekStart: Date;
  monthStart: Date;
  monthEnd: Date;
  isMonthEnd: boolean;
}

export interface SignupReport extends TelegramSignupReportDetails {
  reportKey: string;
}

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((part) => part.type === type)?.value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getLocalCalendarDate(
  date: Date,
  timeZone = DEFAULT_SIGNUP_REPORT_TIMEZONE,
): LocalCalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: getPart(parts, "year"),
    month: getPart(parts, "month"),
    day: getPart(parts, "day"),
  };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offsetLabel = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = /^GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/.exec(offsetLabel);
  if (!match?.[1] || !match[2]) return 0;

  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  const totalMinutes = hours * 60 + minutes;
  return match[1] === "+" ? totalMinutes : -totalMinutes;
}

function localMidnightToUtc(localDate: LocalCalendarDate, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * MINUTE_MS);
}

function addCalendarDays(date: LocalCalendarDate, days: number): LocalCalendarDate {
  const utcDate = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate(),
  };
}

function getNextMonth(date: LocalCalendarDate): LocalCalendarDate {
  if (date.month === 12) return { year: date.year + 1, month: 1, day: 1 };
  return { year: date.year, month: date.month + 1, day: 1 };
}

function dateKey(date: LocalCalendarDate): string {
  return [date.year, date.month, date.day]
    .map((value, index) => index === 0 ? String(value).padStart(4, "0") : String(value).padStart(2, "0"))
    .join("-");
}

function monthKey(date: LocalCalendarDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}`;
}

export function buildSignupReportWindow(
  now: Date,
  timeZone = DEFAULT_SIGNUP_REPORT_TIMEZONE,
): SignupReportWindow {
  const localDate = getLocalCalendarDate(now, timeZone);
  const nextDay = addCalendarDays(localDate, 1);
  const weekStartDate = addCalendarDays(localDate, -6);
  const monthStartDate = { ...localDate, day: 1 };
  const nextMonth = getNextMonth(localDate);
  const monthEndDay = new Date(Date.UTC(localDate.year, localDate.month, 0)).getUTCDate();
  const isMonthEnd = localDate.day === monthEndDay;

  return {
    dateKey: dateKey(localDate),
    dateLabel: new Intl.DateTimeFormat("en-US", {
      timeZone,
      dateStyle: "full",
    }).format(now),
    monthKey: monthKey(localDate),
    monthLabel: new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "long",
      year: "numeric",
    }).format(now),
    timezone: timeZone,
    dayStart: localMidnightToUtc(localDate, timeZone),
    dayEnd: localMidnightToUtc(nextDay, timeZone),
    weekStart: localMidnightToUtc(weekStartDate, timeZone),
    monthStart: localMidnightToUtc(monthStartDate, timeZone),
    monthEnd: localMidnightToUtc(nextMonth, timeZone),
    isMonthEnd,
  };
}

async function countUsersCreatedBetween(db: Db, start: Date, end: Date): Promise<number> {
  const createdAt = {
    $convert: {
      input: { $ifNull: ["$createdAt", "$signupDate"] },
      to: "date",
      onError: null,
      onNull: null,
    },
  };

  return db.collection("users").countDocuments({
    $expr: {
      $and: [
        { $gte: [createdAt, start] },
        { $lt: [createdAt, end] },
      ],
    },
  });
}

async function countActiveUsersBetween(db: Db, start: Date, end: Date): Promise<number> {
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const activeIds = new Set<string>();

  try {
    const userDocs = await db.collection("users").find({
      $or: [
        { lastActive: { $gte: start, $lt: end } },
        { lastActive: { $gte: startIso, $lt: endIso } },
        { lastLogin: { $gte: start, $lt: end } },
        { lastLogin: { $gte: startIso, $lt: endIso } },
      ],
    }, { projection: { _id: 1 } }).toArray();

    for (const doc of userDocs) {
      if (doc?._id) activeIds.add(String(doc._id));
    }
  } catch {
    // continue
  }

  try {
    const sessionIds = await db.collection("security_sessions").distinct("userId", {
      $or: [
        { lastActive: { $gte: start, $lt: end } },
        { lastActive: { $gte: startIso, $lt: endIso } },
      ],
    });
    for (const id of sessionIds) {
      if (id) activeIds.add(String(id));
    }
  } catch {
    // collection might not exist in some environments
  }

  try {
    const deviceIds = await db.collection("devices").distinct("userId", {
      $or: [
        { lastSeen: { $gte: start, $lt: end } },
        { lastSeen: { $gte: startIso, $lt: endIso } },
      ],
    });
    for (const id of deviceIds) {
      if (id) activeIds.add(String(id));
    }
  } catch {
    // collection might not exist
  }

  try {
    const activityIds = await db.collection("activity_events").distinct("userId", {
      $or: [
        { timestamp: { $gte: start, $lt: end } },
        { timestamp: { $gte: startIso, $lt: endIso } },
        { createdAt: { $gte: start, $lt: end } },
        { createdAt: { $gte: startIso, $lt: endIso } },
      ],
    });
    for (const id of activityIds) {
      if (id) activeIds.add(String(id));
    }
  } catch {
    // collection might not exist
  }

  return activeIds.size;
}

async function getPlanBreakdown(db: Db, totalUsers: number): Promise<PlanCount[]> {
  try {
    const agg = await db.collection("users").aggregate<{ _id: string; count: number }>([
      {
        $group: {
          _id: { $toLower: { $ifNull: ["$plan", "free"] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]).toArray();

    return agg.map((item) => {
      const plan = String(item._id || "free").trim().toLowerCase() || "free";
      const count = Number(item.count) || 0;
      const percentage = totalUsers > 0 ? Number(((count / totalUsers) * 100).toFixed(1)) : 0;
      return { plan, count, percentage };
    });
  } catch {
    return [];
  }
}

async function getCountryBreakdown(db: Db, totalUsers: number): Promise<CountryCount[]> {
  try {
    const agg = await db.collection("users").aggregate<{ _id: string; count: number }>([
      {
        $group: {
          _id: {
            $trim: {
              input: {
                $toUpper: { $ifNull: ["$country", ""] },
              },
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]).toArray();

    const result: CountryCount[] = [];
    let otherCount = 0;

    for (const item of agg) {
      const rawCode = String(item._id || "").trim().toUpperCase();
      const count = Number(item.count) || 0;

      if (!rawCode || rawCode === "UNKNOWN") {
        otherCount += count;
        continue;
      }

      if (result.length < 6) {
        const countryName = displayCountry(rawCode);
        const flag = getCountryFlag(rawCode);
        const percentage = totalUsers > 0 ? Number(((count / totalUsers) * 100).toFixed(1)) : 0;
        result.push({
          countryCode: rawCode,
          countryName,
          flag,
          count,
          percentage,
        });
      } else {
        otherCount += count;
      }
    }

    if (otherCount > 0) {
      const percentage = totalUsers > 0 ? Number(((otherCount / totalUsers) * 100).toFixed(1)) : 0;
      result.push({
        countryCode: "OTHER",
        countryName: "Others / Unknown",
        flag: "🌐",
        count: otherCount,
        percentage,
      });
    }

    return result;
  } catch {
    return [];
  }
}

async function getTodaySignupsList(db: Db, start: Date, end: Date): Promise<TodaySignupItem[]> {
  try {
    const createdAt = {
      $convert: {
        input: { $ifNull: ["$createdAt", "$signupDate"] },
        to: "date",
        onError: null,
        onNull: null,
      },
    };

    const users = await db.collection("users").find({
      $expr: {
        $and: [
          { $gte: [createdAt, start] },
          { $lt: [createdAt, end] },
        ],
      },
    }, {
      projection: {
        name: 1,
        firstName: 1,
        churchName: 1,
        country: 1,
        plan: 1,
      },
      limit: 10,
    }).toArray();

    return users.map((u) => {
      const name = String(u.churchName || u.name || u.firstName || "").trim() || "New User";
      const country = String(u.country || "").trim().toUpperCase();
      const plan = String(u.plan || "free").trim().toLowerCase();
      return { name, country, plan };
    });
  } catch {
    return [];
  }
}

export async function buildSignupReport(
  db: Db,
  now = new Date(),
  timeZone = DEFAULT_SIGNUP_REPORT_TIMEZONE,
): Promise<SignupReport> {
  const window = buildSignupReportWindow(now, timeZone);
  const [dailySignups, weeklySignups, monthlySignups, totalUsers] = await Promise.all([
    countUsersCreatedBetween(db, window.dayStart, window.dayEnd),
    countUsersCreatedBetween(db, window.weekStart, window.dayEnd),
    countUsersCreatedBetween(db, window.monthStart, window.monthEnd),
    db.collection("users").countDocuments({}),
  ]);

  const [activeUsersToday, activeUsersWeek, planBreakdown, countryBreakdown, todaySignupsList] = await Promise.all([
    countActiveUsersBetween(db, window.dayStart, window.dayEnd),
    countActiveUsersBetween(db, window.weekStart, window.dayEnd),
    getPlanBreakdown(db, totalUsers),
    getCountryBreakdown(db, totalUsers),
    dailySignups > 0 ? getTodaySignupsList(db, window.dayStart, window.dayEnd) : Promise.resolve([]),
  ]);

  return {
    reportKey: window.dateKey,
    dateLabel: window.dateLabel,
    monthLabel: window.monthLabel,
    timezone: window.timezone,
    dailySignups,
    weeklySignups,
    monthlySignups,
    totalUsers,
    isMonthEnd: window.isMonthEnd,
    activeUsersToday,
    activeUsersWeek,
    planBreakdown,
    countryBreakdown,
    todaySignupsList,
  };
}
