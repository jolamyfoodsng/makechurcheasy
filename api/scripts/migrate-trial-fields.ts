/**
 * Migration: Convert flat trial fields → nested trial object.
 *
 * Run with: npx tsx scripts/migrate-trial-fields.ts [--dry-run]
 *
 * This script:
 * 1. Finds all users with legacy flat trial fields (trialStartedAt, trialEndsAt, etc.)
 * 2. Creates a nested `trial` object from those fields
 * 3. $unsets the flat fields
 * 4. Adds a "trial" tier to the plan_config collection
 *
 * Safe to run multiple times — skips users already migrated.
 */

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI!;
const DRY_RUN = process.argv.includes("--dry-run");

/** Trial tier config to add to plan_config collection. */
const TRIAL_TIER_CONFIG = {
  label: "Trial",
  credits: 500,
  price: 0,
  billingCycle: "monthly",
  entitlements: {
    devices: 5,
    songs: -1,
    images: -1,
    videos: -1,
    themes: -1,
    lowerThirds: -1,
    bibleVersions: -1,
    multiviewTemplates: -1,
    tickerThemes: -1,
    themePresets: -1,
    cloudStorageGB: 5,
    multiview: true,
    tickers: true,
    massImport: true,
    easyWorshipImport: true,
    proPresenterImport: true,
    translation: true,
    speechToScripture: true,
    sermonExport: true,
    aiFeatures: true,
    cloudSync: true,
    advancedAnalytics: true,
    customReports: true,
    mobileControl: true,
    apiAccess: false,
    teamManagement: false,
    campusManagement: false,
    slideshow: true,
  },
};

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
    const users = db.collection("users");
    const planConfig = db.collection("plan_config");

    // ── Step 1: Migrate flat trial fields → nested trial object ──

    // Find users that have ANY legacy flat trial field
    const usersWithFlatFields = await users
      .find({
        $or: [
          { trialStartedAt: { $exists: true, $nin: [null, ""] } },
          { trialEndsAt: { $exists: true, $nin: [null, ""] } },
          { trialDurationDays: { $exists: true, $ne: null } },
          { trialWelcomeShown: { $exists: true } },
        ],
        // Skip users that already have the nested trial object
        "trial": { $exists: false },
      })
      .toArray();

    console.log(`Found ${usersWithFlatFields.length} users with legacy flat trial fields.`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const user of usersWithFlatFields) {
      const flatTrialEndsAt = user.trialEndsAt as string | null | undefined;
      const flatTrialStartedAt = user.trialStartedAt as string | null | undefined;
      const flatTrialDurationDays = user.trialDurationDays as number | null | undefined;
      const flatTrialWelcomeShown = user.trialWelcomeShown as boolean | undefined;

      // Determine if trial is active (not expired)
      const now = new Date();
      const isActive = !!(flatTrialEndsAt && new Date(flatTrialEndsAt).getTime() > now.getTime());

      const trialObject = {
        active: isActive,
        startedAt: flatTrialStartedAt || null,
        endsAt: flatTrialEndsAt || null,
        durationDays: flatTrialDurationDays || 7,
        welcomeShown: flatTrialWelcomeShown || false,
      };

      if (DRY_RUN) {
        console.log(`  [DRY] Would migrate ${user.email || user._id}:`, JSON.stringify(trialObject));
        skippedCount++;
        continue;
      }

      await users.updateOne(
        { _id: user._id },
        {
          $set: { trial: trialObject },
          $unset: {
            trialStartedAt: "",
            trialEndsAt: "",
            trialDurationDays: "",
            trialWelcomeShown: "",
          },
        }
      );

      migratedCount++;
      if (migratedCount % 100 === 0) {
        console.log(`  Migrated ${migratedCount} users...`);
      }
    }

    console.log(`\n✅ Migrated ${migratedCount} users from flat fields → nested trial object.`);
    if (skippedCount > 0) {
      console.log(`   (Dry run: ${skippedCount} users would be migrated)`);
    }

    // ── Step 2: Add "trial" tier to plan_config ──

    const existingConfig = await planConfig.findOne({});

    if (!existingConfig) {
      console.log("\n⚠️  No plan_config document found. Skipping trial tier addition.");
      console.log("   The trial tier will be available once plan_config is created.");
    } else {
      const plans = existingConfig.plans || {};
      if (plans.trial) {
        console.log("\n✅ Trial tier already exists in plan_config. Skipping.");
      } else {
        if (DRY_RUN) {
          console.log("\n[DRY] Would add 'trial' tier to plan_config.");
        } else {
          await planConfig.updateOne(
            { _id: existingConfig._id },
            { $set: { "plans.trial": TRIAL_TIER_CONFIG } }
          );
          console.log("\n✅ Added 'trial' tier to plan_config collection.");
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
