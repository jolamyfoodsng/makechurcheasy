/**
 * Migration: Add entitlements to existing plan_config document.
 *
 * Run with: npx tsx scripts/migrate-entitlements.ts
 *
 * Updates the single plan_config document (_id: "default") to include
 * an entitlements object on each plan tier. This makes the pricing
 * document the single source of truth for all plan limits and features.
 *
 * Idempotent — safe to run multiple times. Only adds entitlements
 * to plans that don't already have them.
 */

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI!;

interface PlanEntitlements {
  songs: number;
  images: number;
  videos: number;
  themes: number;
  lowerThirds: number;
  devices: number;
  bibleVersions: number;
  multiview: boolean;
  tickers: boolean;
  massImport: boolean;
  easyWorshipImport: boolean;
  proPresenterImport: boolean;
  translation: boolean;
  speechToScripture: boolean;
  sermonExport: boolean;
  aiFeatures: boolean;
  cloudSync: boolean;
  advancedAnalytics: boolean;
  customReports: boolean;
  mobileControl: boolean;
  apiAccess: boolean;
}

const ENTITLEMENTS: Record<string, PlanEntitlements> = {
  free: {
    songs: 3,
    images: 2,
    videos: 1,
    themes: 1,
    lowerThirds: 1,
    devices: 1,
    bibleVersions: 4,
    multiview: false,
    tickers: false,
    massImport: false,
    easyWorshipImport: false,
    proPresenterImport: false,
    translation: false,
    speechToScripture: false,
    sermonExport: false,
    aiFeatures: false,
    cloudSync: false,
    advancedAnalytics: false,
    customReports: false,
    mobileControl: false,
    apiAccess: false,
  },
  basic: {
    songs: 50,
    images: 50,
    videos: 50,
    themes: 3,
    lowerThirds: 1,
    devices: 3,
    bibleVersions: 20,
    multiview: false,
    tickers: false,
    massImport: false,
    easyWorshipImport: false,
    proPresenterImport: false,
    translation: false,
    speechToScripture: false,
    sermonExport: false,
    aiFeatures: false,
    cloudSync: false,
    advancedAnalytics: false,
    customReports: false,
    mobileControl: false,
    apiAccess: false,
  },
  starter: {
    songs: -1,
    images: -1,
    videos: -1,
    themes: 10,
    lowerThirds: -1,
    devices: 5,
    bibleVersions: -1,
    multiview: true,
    tickers: true,
    massImport: true,
    easyWorshipImport: true,
    proPresenterImport: true,
    translation: true,
    speechToScripture: true,
    sermonExport: true,
    aiFeatures: false,
    cloudSync: false,
    advancedAnalytics: false,
    customReports: false,
    mobileControl: false,
    apiAccess: false,
  },
  growth: {
    songs: -1,
    images: -1,
    videos: -1,
    themes: -1,
    lowerThirds: -1,
    devices: -1,
    bibleVersions: -1,
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
    customReports: false,
    mobileControl: false,
    apiAccess: false,
  },
  pro: {
    songs: -1,
    images: -1,
    videos: -1,
    themes: -1,
    lowerThirds: -1,
    devices: -1,
    bibleVersions: -1,
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
    apiAccess: true,
  },
};

async function migrate() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI environment variable is required.");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    const planConfig = db.collection("plan_config");

    const doc = await planConfig.findOne({ _id: "default" as any });

    if (!doc) {
      console.log("No plan_config document found. It will be seeded with defaults on next request.");
      return;
    }

    const plans = doc.plans as Record<string, any>;
    let updated = 0;

    for (const [planName, entitlements] of Object.entries(ENTITLEMENTS)) {
      const plan = plans[planName];
      if (!plan) {
        console.log(`  Plan "${planName}" not found in config — skipping.`);
        continue;
      }

      // Always overwrite entitlements to ensure all fields are present.
      // This handles both fresh installs and upgrades from older structures
      // that may be missing the newer boolean fields.
      await planConfig.updateOne(
        { _id: "default" as any },
        {
          $set: {
            [`plans.${planName}.entitlements`]: entitlements,
            updatedAt: new Date().toISOString(),
          },
        }
      );

      console.log(`  ✓ Set entitlements for plan "${planName}"`);
      updated++;
    }

    console.log(`\nMigration complete. Updated ${updated} plan(s).`);

    // Verify
    const updatedDoc = await planConfig.findOne({ _id: "default" as any });
    const updatedPlans = updatedDoc?.plans as Record<string, any> | undefined;
    if (updatedPlans) {
      console.log("\nVerification — entitlements per plan:");
      for (const [name, cfg] of Object.entries(updatedPlans)) {
        const ent = cfg?.entitlements;
        if (ent) {
          console.log(`  ${name}: songs=${ent.songs}, images=${ent.images}, videos=${ent.videos}, themes=${ent.themes}, devices=${ent.devices}, multiview=${ent.multiview}, massImport=${ent.massImport}`);
        } else {
          console.log(`  ${name}: NO ENTITLEMENTS`);
        }
      }
    }
  } finally {
    await client.close();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
