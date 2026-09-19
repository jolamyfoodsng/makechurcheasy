/**
 * Migration: plan_config v1 → v2
 *
 * Run with: npx tsx scripts/migrate-plan-config-v2.ts
 *
 * Converts the plan_config document from v1 format (flat `price` per tier)
 * to v2 format (multi-currency `pricing` + `paystack` codes + new entitlement fields).
 *
 * Idempotent — skips if version is already 2.
 *
 * Rollback: set version back to 1 and restore flat `price` fields.
 */

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  console.error("MONGODB_URI environment variable is required");
  process.exit(1);
}

// ── v2 entitlement defaults for new fields ────────────────────────────────────

const NEW_ENTITLEMENT_DEFAULTS: Record<string, Record<string, number | boolean>> = {
  free: {
    multiviewTemplates: 0, tickerThemes: 0, themePresets: 0, cloudStorageGB: 0, slideshow: false,
  },
  basic: {
    multiviewTemplates: 0, tickerThemes: 0, themePresets: 3, cloudStorageGB: 1, slideshow: true,
  },
  starter: {
    multiviewTemplates: 2, tickerThemes: 5, themePresets: 10, cloudStorageGB: 5, slideshow: true,
  },
  growth: {
    multiviewTemplates: -1, tickerThemes: -1, themePresets: -1, cloudStorageGB: 20, slideshow: true,
  },
  pro: {
    multiviewTemplates: -1, tickerThemes: -1, themePresets: -1, cloudStorageGB: -1, slideshow: true,
  },
};

// ── Paystack plan codes (production) ─────────────────────────────────────────

const PAYSTACK_CODES: Record<string, { monthlyPlanCode: string; yearlyPlanCode: string }> = {
  basic: { monthlyPlanCode: "mce_basic_monthly", yearlyPlanCode: "mce_basic_yearly" },
  starter: { monthlyPlanCode: "mce_starter_monthly", yearlyPlanCode: "mce_starter_yearly" },
  growth: { monthlyPlanCode: "mce_growth_monthly", yearlyPlanCode: "mce_growth_yearly" },
  pro: { monthlyPlanCode: "mce_pro_monthly", yearlyPlanCode: "mce_pro_yearly" },
  free: { monthlyPlanCode: "", yearlyPlanCode: "" },
};

// ── Production prices (NGN) ──────────────────────────────────────────────────

const PRODUCTION_PRICES: Record<string, { monthly: number; yearly: number }> = {
  free: { monthly: 0, yearly: 0 },
  basic: { monthly: 3500, yearly: 42000 },
  starter: { monthly: 8500, yearly: 102000 },
  growth: { monthly: 15000, yearly: 180000 },
  pro: { monthly: 34000, yearly: 408000 },
};

const USD_PRICES: Record<string, { monthly: number; yearly: number }> = {
  free: { monthly: 0, yearly: 0 },
  basic: { monthly: 5, yearly: 60 },
  starter: { monthly: 10, yearly: 120 },
  growth: { monthly: 15, yearly: 180 },
  pro: { monthly: 30, yearly: 360 },
};

async function migrate() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection("plan_config");

    const doc = await collection.findOne({ _id: "default" as any });
    if (!doc) {
      console.log("No plan_config document found — nothing to migrate.");
      return;
    }

    // Already v2?
    if (doc.version === 2) {
      console.log("plan_config is already v2 — skipping migration.");
      return;
    }

    console.log(`Migrating plan_config from v${doc.version || 1} → v2...`);

    const now = new Date().toISOString();
    const plans: Record<string, any> = doc.plans || {};

    for (const [tier, tierConfig] of Object.entries(plans)) {
      const tc = tierConfig as any;

      // Convert flat `price` to multi-currency `pricing`
      if (typeof tc.price === "number" && !tc.pricing) {
        const ngnMonthly = PRODUCTION_PRICES[tier]?.monthly ?? tc.price;
        const ngnYearly = PRODUCTION_PRICES[tier]?.yearly ?? Math.round(tc.price * 12 * 0.9);
        const usdMonthly = USD_PRICES[tier]?.monthly ?? 0;
        const usdYearly = USD_PRICES[tier]?.yearly ?? 0;

        tc.pricing = {
          NGN: { monthly: ngnMonthly, yearly: ngnYearly },
          USD: { monthly: usdMonthly, yearly: usdYearly },
        };

        // Remove flat price (keep for backward compat during transition)
        // tc.price is left as-is so getPlanMonthlyPrice() still works
      }

      // Add paystack codes if missing
      if (!tc.paystack) {
        tc.paystack = PAYSTACK_CODES[tier] || { monthlyPlanCode: "", yearlyPlanCode: "" };
      }

      // Add new entitlement fields if missing
      if (tc.entitlements) {
        const defaults = NEW_ENTITLEMENT_DEFAULTS[tier] || {};
        for (const [key, val] of Object.entries(defaults)) {
          if (tc.entitlements[key] === undefined) {
            tc.entitlements[key] = val;
          }
        }
      }
    }

    // Set version to 2
    await collection.updateOne(
      { _id: "default" as any },
      {
        $set: {
          plans,
          version: 2,
          updatedAt: now,
        },
      }
    );

    console.log("Migration complete. plan_config is now v2.");
    console.log("Tiers migrated:", Object.keys(plans).join(", "));
  } finally {
    await client.close();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
