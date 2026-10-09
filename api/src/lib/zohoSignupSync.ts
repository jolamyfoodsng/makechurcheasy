import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import {
  sendVerifiedSignupWelcomeThroughZoho,
  type ZohoSignupWelcomeResult,
} from "@/lib/zohoCampaigns";

const MAX_BATCH_SIZE = 25;
const LEASE_MS = 60_000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1_000;

type SyncState = {
  status: "pending" | "processing" | "retry" | "needs_attention" | "synced" | "disabled" | "confirmation_required";
  requestedAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  lastAttemptAt?: Date;
  leaseUntil?: Date;
  syncedAt?: Date;
  errorCode?: string;
  stage?: string;
  httpStatus?: number;
};

export type ProcessZohoSignupResult =
  | { status: "sent" }
  | { status: "disabled"; errorCode: string }
  | { status: "confirmation-required" }
  | { status: "failed"; errorCode: string; stage: string; httpStatus?: number }
  | { status: "busy" | "not-eligible" };

function parseUserId(userId: string | ObjectId): ObjectId | null {
  if (userId instanceof ObjectId) return userId;
  return ObjectId.isValid(userId) ? new ObjectId(userId) : null;
}

function retryDelayMs(attempt: number): number {
  return Math.min(15 * 60 * 1_000 * 2 ** Math.max(0, attempt - 1), MAX_RETRY_DELAY_MS);
}

/** Enrolls a verified user in Zoho once, retaining failures for scheduled retry. */
export async function processVerifiedSignupZohoSync(
  userId: string | ObjectId,
): Promise<ProcessZohoSignupResult> {
  const _id = parseUserId(userId);
  if (!_id) return { status: "not-eligible" };

  const client = await clientPromise;
  const db = client.db();
  const users = db.collection("users");
  const user = await users.findOne(
    { _id, emailVerified: true },
    { projection: { email: 1, name: 1, zohoSignupSync: 1 } },
  );
  if (!user?.email) return { status: "not-eligible" };

  const now = new Date();
  await users.updateOne(
    { _id, emailVerified: true, zohoSignupSync: { $exists: false } },
    {
      $set: {
        zohoSignupSync: {
          status: "pending",
          requestedAt: now,
          attempts: 0,
          nextAttemptAt: now,
        } satisfies SyncState,
      },
    },
  );

  const claimed = await users.findOneAndUpdate(
    {
      _id,
      emailVerified: true,
      $or: [
        { "zohoSignupSync.status": "pending", "zohoSignupSync.nextAttemptAt": { $lte: now } },
        { "zohoSignupSync.status": "retry", "zohoSignupSync.nextAttemptAt": { $lte: now } },
        { "zohoSignupSync.status": "needs_attention", "zohoSignupSync.nextAttemptAt": { $lte: now } },
        { "zohoSignupSync.status": "processing", "zohoSignupSync.leaseUntil": { $lte: now } },
      ],
    },
    {
      $set: {
        "zohoSignupSync.status": "processing",
        "zohoSignupSync.lastAttemptAt": now,
        "zohoSignupSync.leaseUntil": new Date(now.getTime() + LEASE_MS),
      },
      $inc: { "zohoSignupSync.attempts": 1 },
      $unset: { "zohoSignupSync.errorCode": "", "zohoSignupSync.stage": "", "zohoSignupSync.httpStatus": "" },
    },
    { returnDocument: "after", projection: { email: 1, name: 1, zohoSignupSync: 1 } },
  );

  if (!claimed) return { status: "busy" };
  const attempts = Math.max(1, Number(claimed.zohoSignupSync?.attempts) || 1);
  const result: ZohoSignupWelcomeResult = await sendVerifiedSignupWelcomeThroughZoho({
    email: user.email,
    firstName: user.name,
  });

  if (result.status === "sent") {
    await users.updateOne(
      { _id, "zohoSignupSync.status": "processing" },
      {
        $set: {
          "zohoSignupSync.status": "synced",
          "zohoSignupSync.syncedAt": new Date(),
          "lifecycleEmails.welcomeSent": true,
        },
        $unset: { "zohoSignupSync.leaseUntil": "", "zohoSignupSync.nextAttemptAt": "" },
      },
    );
    return { status: "sent" };
  }

  if (result.status === "disabled") {
    await users.updateOne(
      { _id, "zohoSignupSync.status": "processing" },
      {
        $set: { "zohoSignupSync.status": "disabled", "zohoSignupSync.errorCode": result.errorCode },
        $unset: { "zohoSignupSync.leaseUntil": "", "zohoSignupSync.nextAttemptAt": "" },
      },
    );
    return result;
  }

  if (result.status === "confirmation-required") {
    await users.updateOne(
      { _id, "zohoSignupSync.status": "processing" },
      {
        $set: {
          "zohoSignupSync.status": "confirmation_required",
          "zohoSignupSync.errorCode": "zoho_confirmation_required",
        },
        $unset: { "zohoSignupSync.leaseUntil": "", "zohoSignupSync.nextAttemptAt": "" },
      },
    );
    return { status: "confirmation-required" };
  }

  const nextAttemptAt = new Date(Date.now() + retryDelayMs(attempts));
  const status = attempts >= 5 ? "needs_attention" : "retry";
  await users.updateOne(
    { _id, "zohoSignupSync.status": "processing" },
    {
      $set: {
        "zohoSignupSync.status": status,
        "zohoSignupSync.nextAttemptAt": nextAttemptAt,
        "zohoSignupSync.errorCode": result.errorCode,
        "zohoSignupSync.stage": result.stage,
        ...(result.httpStatus ? { "zohoSignupSync.httpStatus": result.httpStatus } : {}),
      },
      $unset: { "zohoSignupSync.leaseUntil": "" },
    },
  );
  return result;
}

/** Processes a bounded batch; called only by the secret-protected scheduled route. */
export async function processDueZohoSignupSyncs(): Promise<{
  checked: number;
  sent: number;
  failed: number;
  waiting: number;
}> {
  const client = await clientPromise;
  const db = client.db();
  const now = new Date();
  const dueUsers = await db.collection("users").find(
    {
      emailVerified: true,
      $or: [
        {
          "zohoSignupSync.status": { $in: ["pending", "retry", "needs_attention"] },
          "zohoSignupSync.nextAttemptAt": { $lte: now },
        },
        { "zohoSignupSync.status": "processing", "zohoSignupSync.leaseUntil": { $lte: now } },
      ],
    },
    { projection: { _id: 1 }, sort: { "zohoSignupSync.nextAttemptAt": 1 }, limit: MAX_BATCH_SIZE },
  ).toArray();

  const counts = { checked: dueUsers.length, sent: 0, failed: 0, waiting: 0 };
  for (const user of dueUsers) {
    try {
      const result = await processVerifiedSignupZohoSync(user._id);
      if (result.status === "sent") counts.sent += 1;
      else if (result.status === "failed") counts.failed += 1;
      else counts.waiting += 1;
    } catch (error) {
      console.error("[Zoho Signup Sync] Retry job failed:", {
        userId: user._id.toString(),
        error: error instanceof Error ? error.name : "unknown_error",
      });
      counts.failed += 1;
    }
  }
  return counts;
}
