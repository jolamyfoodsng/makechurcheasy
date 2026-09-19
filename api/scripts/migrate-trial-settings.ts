/**
 * Migration: Seed trial_settings + backfill trial.status on existing users.
 *
 * Run with: npx tsx scripts/migrate-trial-settings.ts [--dry-run]
 *
 * This script:
 * 1. Seeds the `trial_settings` collection with defaults (if empty)
 * 2. Backfills `trial.status` on all users with a trial object
 *    - "active" if trial.active === true or endsAt is in the future
 *    - "expired" otherwise
 * 3. Creates indexes on new collections (trial_audit_logs, trial_notifications)
 *
 * Safe to run multiple times — skips already-migrated data.
 */

import { MongoClient, IndexSpecification } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI!;
const DRY_RUN = process.argv.includes("--dry-run");

const DEFAULT_TRIAL_SETTINGS = {
  _id: "default",
  enableForNewUsers: true,
  enableForExistingUsers: false,
  defaultDurationDays: 14,
  maxExtensionDays: 30,
  emailReminders: {
    enabled: true,
    day3: true,
    day1: true,
    day0: true,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const INDEXES: { collection: string; spec: IndexSpecification; options?: object }[] = [
  {
    collection: "trial_audit_logs",
    spec: { userId: 1, action: 1, createdAt: -1 } as any,
    options: { background: true },
  },
  {
    collection: "trial_notifications",
    spec: { userId: 1, type: 1, sent: 1 } as any,
    options: { background: true },
  },
];

async function migrate() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI environment variable is required.");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("🔍 DRY RUN — no changes will be made\n");
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();

    // ── Step 1: Seed trial_settings collection ──

    const existingSettings = await db.collection("trial_settings").findOne({ _id: "default" });
    if (existingSettings) {
      console.log("✅ trial_settings already exists. Skipping seed.");
    } else {
      if (DRY_RUN) {
        console.log("[DRY] Would seed trial_settings with defaults:", JSON.stringify(DEFAULT_TRIAL_SETTINGS, null, 2));
      } else {
        await db.collection("trial_settings").insertOne({ ...DEFAULT_TRIAL_SETTINGS });
        console.log("✅ Seeded trial_settings collection with defaults.");
      }
    }

    // ── Step 2: Backfill trial.status on existing users ──

    const usersWithTrial = await db
      .collection("users")
      .find({
        "trial": { $exists: true, $ne: null },
        "trial.status": { $exists: false },
      })
      .toArray();

    console.log(`\nFound ${usersWithTrial.length} users with trial objects missing status field.`);

    let backfilledCount = 0;
    let skippedCount = 0;

    for (const user of usersWithTrial) {
      const trial = user.trial as Record<string, unknown>;
      const now = new Date();

      // Determine status from existing fields
      let status: string;
      if (trial.active === true) {
        // Check if the trial has actually expired
        const endsAt = trial.endsAt ? new Date(trial.endsAt as string) : null;
        if (endsAt && endsAt.getTime() <= now.getTime()) {
          status = "expired";
        } else {
          status = "active";
        }
      } else {
        status = "expired";
      }

      if (DRY_RUN) {
        console.log(`  [DRY] Would set trial.status = "${status}" for ${user.email || user._id}`);
        skippedCount++;
        continue;
      }

      await db.collection("users").updateOne(
        { _id: user._id },
        { $set: { "trial.status": status } }
      );

      backfilledCount++;
      if (backfilledCount % 100 === 0) {
        console.log(`  Backfilled ${backfilledCount} users...`);
      }
    }

    console.log(`\n✅ Backfilled trial.status on ${backfilledCount} users.`);
    if (skippedCount > 0) {
      console.log(`   (Dry run: ${skippedCount} users would be backfilled)`);
    }

    // ── Step 3: Create indexes on new collections ──

    for (const { collection, spec, options } of INDEXES) {
      if (DRY_RUN) {
        console.log(`[DRY] Would create index on ${collection}:`, spec);
        continue;
      }
      try {
        await db.collection(collection).createIndex(spec, options);
        console.log(`✅ Index created on ${collection}.`);
      } catch (err: any) {
        // Code 86 means index already exists — that's fine
        if (err?.code === 86) {
          console.log(`✅ Index already exists on ${collection}.`);
        } else {
          console.error(`⚠️  Failed to create index on ${collection}:`, err.message);
        }
      }
    }

    console.log("\n🎉 Migration complete.");
  } finally {
    await client.close();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
