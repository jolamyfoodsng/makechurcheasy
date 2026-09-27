import type { Db } from "mongodb";
import { getPlatformSettings } from "./platformSettings";

/** Defaults are only a migration fallback; admins control the live values. */
export const DEFAULT_FREE_SPEECH_TO_SCRIPTURE_DAILY_MINUTES = 15;
export const DEFAULT_FREE_SPEECH_TO_SCRIPTURE_WEEKLY_MINUTES = 60;

export interface FreeSpeechToScriptureAllowance {
  dailyLimitMinutes: number;
  weeklyLimitMinutes: number;
}

export async function getFreeSpeechToScriptureAllowance(): Promise<FreeSpeechToScriptureAllowance> {
  try {
    const pricing = (await getPlatformSettings()).transcriptionPricing;
    return {
      dailyLimitMinutes: Math.max(
        0,
        Number.isFinite(pricing.freeDailyMinutes)
          ? pricing.freeDailyMinutes
          : DEFAULT_FREE_SPEECH_TO_SCRIPTURE_DAILY_MINUTES,
      ),
      weeklyLimitMinutes: Math.max(
        0,
        Number.isFinite(pricing.freeWeeklyMinutes)
          ? pricing.freeWeeklyMinutes
          : DEFAULT_FREE_SPEECH_TO_SCRIPTURE_WEEKLY_MINUTES,
      ),
    };
  } catch {
    return {
      dailyLimitMinutes: DEFAULT_FREE_SPEECH_TO_SCRIPTURE_DAILY_MINUTES,
      weeklyLimitMinutes: DEFAULT_FREE_SPEECH_TO_SCRIPTURE_WEEKLY_MINUTES,
    };
  }
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Monday 00:00 UTC is the start of the seven-day free allowance window. */
function startOfUtcWeek(now: Date): Date {
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const start = startOfUtcDay(now);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

async function sumCreditTransactions(
  db: Db,
  userId: string,
  start: Date,
  end: Date,
  creditsPerMinute: number,
): Promise<{ credits: number; minutes: number }> {
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const result = await db.collection("credit_transactions").aggregate([
    {
      $match: {
        userId,
        type: "usage",
        source: { $in: ["transcription", "speech_to_scripture"] },
        // Legacy requests also write a transcription_transactions row. Those
        // rows are counted below, so exclude them here to avoid double-charging.
        "metadata.durationSec": { $exists: false },
        $or: [
          { createdAt: { $gte: startIso, $lt: endIso } },
          { createdAt: { $gte: start, $lt: end } },
        ],
      },
    },
    {
      $group: {
        _id: null,
        usedCredits: {
          $sum: {
            $abs: {
              $convert: { input: "$amount", to: "double", onError: 0, onNull: 0 },
            },
          },
        },
      },
    },
  ]).toArray();

  const credits = Number(result[0]?.usedCredits) || 0;
  return { credits, minutes: credits / creditsPerMinute };
}

async function sumTranscriptionTransactions(
  db: Db,
  userId: string,
  start: Date,
  end: Date,
): Promise<{ seconds: number; minutes: number }> {
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const result = await db.collection("transcription_transactions").aggregate([
    {
      $match: {
        userId,
        type: "transcription_usage",
        $or: [
          { createdAt: { $gte: startIso, $lt: endIso } },
          { createdAt: { $gte: start, $lt: end } },
        ],
      },
    },
    {
      $group: {
        _id: null,
        usedSeconds: {
          $sum: {
            $abs: {
              $convert: { input: "$seconds", to: "double", onError: 0, onNull: 0 },
            },
          },
        },
      },
    },
  ]).toArray();

  const seconds = Number(result[0]?.usedSeconds) || 0;
  return { seconds, minutes: seconds / 60 };
}

/**
 * Credit transactions are the authoritative usage ledger for live sessions.
 * Speech-to-Scripture costs one credit per minute by default, so usage is
 * converted with the configured per-minute cost instead of assuming a fixed
 * credit price.
 */
export async function getFreeSpeechToScriptureUsage(
  db: Db,
  userId: string,
  creditsPerMinute = 1,
  now = new Date(),
): Promise<{
  usedMinutes: number;
  usedCredits: number;
  dailyUsedMinutes: number;
  weeklyUsedMinutes: number;
  dailyUsedCredits: number;
  weeklyUsedCredits: number;
  dailyLimitMinutes: number;
  weeklyLimitMinutes: number;
  dailyRemainingSeconds: number;
  weeklyRemainingSeconds: number;
}> {
  const safeCost = Number.isFinite(creditsPerMinute) && creditsPerMinute > 0 ? creditsPerMinute : 1;
  const [allowance, dailyCredits, weeklyCredits, dailySeconds, weeklySeconds] = await Promise.all([
    getFreeSpeechToScriptureAllowance(),
    sumCreditTransactions(db, userId, startOfUtcDay(now), now, safeCost),
    sumCreditTransactions(db, userId, startOfUtcWeek(now), now, safeCost),
    sumTranscriptionTransactions(db, userId, startOfUtcDay(now), now),
    sumTranscriptionTransactions(db, userId, startOfUtcWeek(now), now),
  ]);

  const dailyUsedCredits = dailyCredits.credits + dailySeconds.seconds / 60 * safeCost;
  const weeklyUsedCredits = weeklyCredits.credits + weeklySeconds.seconds / 60 * safeCost;
  const dailyUsedMinutes = dailyCredits.minutes + dailySeconds.minutes;
  const weeklyUsedMinutes = weeklyCredits.minutes + weeklySeconds.minutes;

  return {
    usedMinutes: dailyUsedMinutes,
    usedCredits: dailyUsedCredits,
    dailyUsedMinutes,
    weeklyUsedMinutes,
    dailyUsedCredits,
    weeklyUsedCredits,
    dailyLimitMinutes: allowance.dailyLimitMinutes,
    weeklyLimitMinutes: allowance.weeklyLimitMinutes,
    dailyRemainingSeconds: Math.max(0, Math.floor((allowance.dailyLimitMinutes - dailyUsedMinutes) * 60)),
    weeklyRemainingSeconds: Math.max(0, Math.floor((allowance.weeklyLimitMinutes - weeklyUsedMinutes) * 60)),
  };
}
