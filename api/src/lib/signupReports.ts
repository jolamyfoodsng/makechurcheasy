import type { Db } from "mongodb";
import type { TelegramSignupReportDetails } from "./telegramNotifications";

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

export async function buildSignupReport(
  db: Db,
  now = new Date(),
  timeZone = DEFAULT_SIGNUP_REPORT_TIMEZONE,
): Promise<SignupReport> {
  const window = buildSignupReportWindow(now, timeZone);
  const [dailySignups, monthlySignups, totalUsers] = await Promise.all([
    countUsersCreatedBetween(db, window.dayStart, window.dayEnd),
    countUsersCreatedBetween(db, window.monthStart, window.monthEnd),
    db.collection("users").countDocuments({}),
  ]);

  return {
    reportKey: window.dateKey,
    dateLabel: window.dateLabel,
    monthLabel: window.monthLabel,
    timezone: window.timezone,
    dailySignups,
    monthlySignups,
    totalUsers,
    isMonthEnd: window.isMonthEnd,
  };
}
