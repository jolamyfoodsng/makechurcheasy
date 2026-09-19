/**
 * One-time migration: Backfill reserved_emails from existing emailHistory.
 *
 * Run with: npx tsx scripts/backfill-reserved-emails.ts
 *
 * For every user with emailHistory[], inserts each historical email into
 * the reserved_emails collection. Skips duplicates (idempotent).
 */

import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI!;

async function migrate() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI environment variable is required.");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    const users = db.collection("users");
    const reserved = db.collection("reserved_emails");

    // Ensure unique index on email (idempotent)
    await reserved.createIndex({ email: 1 }, { unique: true });
    await reserved.createIndex({ userId: 1 });

    // Find all users with emailHistory
    const usersWithHistory = await users
      .find({ emailHistory: { $exists: true, $ne: [] } })
      .toArray();

    console.log(`Found ${usersWithHistory.length} users with email history`);

    let reservedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of usersWithHistory) {
      const history = user.emailHistory as { email: string; changedAt: string }[];

      for (const entry of history) {
        const normalizedEmail = entry.email.trim().toLowerCase();

        try {
          const result = await reserved.updateOne(
            { email: normalizedEmail },
            {
              $setOnInsert: {
                userId: user._id.toString(),
                email: normalizedEmail,
                reservedAt: entry.changedAt,
                reason: "email_change",
              },
            },
            { upsert: true }
          );

          if (result.upsertedCount > 0) {
            reservedCount++;
          } else {
            skippedCount++;
          }
        } catch (err: any) {
          // Duplicate key error is expected and safe to skip
          if (err?.code === 11000) {
            skippedCount++;
          } else {
            console.error(`Error reserving ${normalizedEmail}:`, err.message);
            errorCount++;
          }
        }
      }
    }

    console.log(`\nMigration complete:`);
    console.log(`  Users processed: ${usersWithHistory.length}`);
    console.log(`  Emails reserved: ${reservedCount}`);
    console.log(`  Duplicates skipped: ${skippedCount}`);
    console.log(`  Errors: ${errorCount}`);
  } finally {
    await client.close();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
