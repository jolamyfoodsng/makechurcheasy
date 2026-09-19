import type { Db } from "mongodb";

/** Free Speech to Scripture allowance, measured in minutes per UTC calendar day. */
export const FREE_SPEECH_TO_SCRIPTURE_MINUTES = 15;
export const FREE_SPEECH_TO_SCRIPTURE_SUNDAY_MINUTES = 20;

export function getFreeSpeechToScriptureLimitMinutes(now = new Date()): number {
  return now.getUTCDay() === 0
    ? FREE_SPEECH_TO_SCRIPTURE_SUNDAY_MINUTES
    : FREE_SPEECH_TO_SCRIPTURE_MINUTES;
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
): Promise<{ usedMinutes: number; usedCredits: number }> {
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startIso = startOfDay.toISOString();
  const result = await db.collection("credit_transactions").aggregate([
    {
      $match: {
        userId,
        type: "usage",
        source: { $in: ["transcription", "speech_to_scripture"] },
        $or: [
          { createdAt: { $gte: startIso } },
          { createdAt: { $gte: startOfDay } },
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

  const usedCredits = Number(result[0]?.usedCredits) || 0;
  const safeCost = Number.isFinite(creditsPerMinute) && creditsPerMinute > 0 ? creditsPerMinute : 1;
  return { usedCredits, usedMinutes: usedCredits / safeCost };
}
