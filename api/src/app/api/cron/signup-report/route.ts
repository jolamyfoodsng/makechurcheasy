/**
 * GET /api/cron/signup-report
 *
 * Sends the daily signup count to the configured Telegram chat at 11:00 p.m.
 * Africa/Lagos time. On the last local day of each month, the same message
 * labels the month-to-date count as the final month total.
 */

import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { buildSignupReport, DEFAULT_SIGNUP_REPORT_TIMEZONE } from "@/lib/signupReports";
import { notifyTelegramSignupReport } from "@/lib/telegramNotifications";

const CRON_SECRET = process.env.CRON_SECRET || "";
const REPORT_COLLECTION = "telegram_signup_reports";
const STALE_CLAIM_MS = 15 * 60 * 1000;

type SignupReportDelivery = {
  reportKey: string;
  status: "sending" | "sent" | "failed";
  claimToken?: string;
  sendingAt?: Date;
  sentAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt?: Date;
};

let reportIndexPromise: Promise<string> | null = null;

function verifyAuth(req: NextRequest): boolean {
  if (!CRON_SECRET) {
    console.error("[Signup Report] FATAL: CRON_SECRET not configured");
    return false;
  }
  return req.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === 11000,
  );
}

async function ensureReportIndex(db: Db): Promise<void> {
  if (!reportIndexPromise) {
    reportIndexPromise = db
      .collection(REPORT_COLLECTION)
      .createIndex({ reportKey: 1 }, { unique: true });
  }
  await reportIndexPromise;
}

async function claimReport(
  db: Db,
  reportKey: string,
): Promise<string | null> {
  const claimToken = randomUUID();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
  const reports = db.collection<SignupReportDelivery>(REPORT_COLLECTION);

  try {
    const claimed = await reports.findOneAndUpdate(
      {
        reportKey,
        $or: [
          { status: { $nin: ["sent", "sending"] } },
          { status: "sending", sendingAt: { $lt: staleBefore } },
        ],
      },
      {
        $set: {
          status: "sending",
          claimToken,
          sendingAt: now,
          updatedAt: now,
        },
        $setOnInsert: {
          reportKey,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    return claimed?.claimToken === claimToken ? claimToken : null;
  } catch (error) {
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
}

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await clientPromise;
    const db = client.db();
    await ensureReportIndex(db);

    const timeZone = process.env.TELEGRAM_NOTIFICATION_TIMEZONE?.trim()
      || DEFAULT_SIGNUP_REPORT_TIMEZONE;
    const report = await buildSignupReport(db, new Date(), timeZone);
    const claimToken = await claimReport(db, report.reportKey);

    if (!claimToken) {
      return NextResponse.json({
        success: true,
        sent: false,
        skipped: true,
        reportKey: report.reportKey,
      });
    }

    const sent = await notifyTelegramSignupReport(report);
    const reports = db.collection<SignupReportDelivery>(REPORT_COLLECTION);

    if (sent) {
      await reports.updateOne(
        { reportKey: report.reportKey, claimToken },
        {
          $set: {
            status: "sent",
            sentAt: new Date(),
            updatedAt: new Date(),
          },
          $unset: { error: "" },
        },
      );
      return NextResponse.json({
        success: true,
        sent: true,
        reportKey: report.reportKey,
        dailySignups: report.dailySignups,
        monthlySignups: report.monthlySignups,
        totalUsers: report.totalUsers,
        isMonthEnd: report.isMonthEnd,
      });
    }

    await reports.updateOne(
      { reportKey: report.reportKey, claimToken },
      {
        $set: {
          status: "failed",
          error: "Telegram notification was not delivered",
          updatedAt: new Date(),
        },
      },
    );
    return NextResponse.json(
      { success: false, sent: false, error: "Telegram notification was not delivered" },
      { status: 503 },
    );
  } catch (error) {
    console.error("[Signup Report] Cron failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
