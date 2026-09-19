/**
 * MongoDB Setup Script
 *
 * Run this once to create the required collections and indexes:
 *   node web/scripts/setup-db.js
 *
 * Requires MONGODB_URI environment variable (or defaults to localhost:27017/makechurcheasy).
 */

const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/makechurcheasy";

async function setup() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db();

    console.log(`Connected to: ${uri}`);

    // ── users collection ──
    await db.createCollection("users").catch(() =>
      console.log("users collection already exists")
    );
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("users").createIndex({ appId: 1 }, { unique: true });
    console.log("✓ users collection ready (indexes: email, appId)");

    // ── downloads collection ──
    await db.createCollection("downloads").catch(() =>
      console.log("downloads collection already exists")
    );
    await db.collection("downloads").createIndex({ userId: 1 });
    await db.collection("downloads").createIndex({ downloadedAt: -1 });
    console.log("✓ downloads collection ready (indexes: userId, downloadedAt)");

    // ── apiKeys collection ──
    await db.createCollection("apiKeys").catch(() =>
      console.log("apiKeys collection already exists")
    );
    await db.collection("apiKeys").createIndex({ userId: 1 }, { unique: true });
    console.log("✓ apiKeys collection ready (index: userId)");

    // ── devices collection ──
    await db.createCollection("devices").catch(() =>
      console.log("devices collection already exists")
    );
    await db.collection("devices").createIndex({ userId: 1 });
    await db.collection("devices").createIndex({ deviceId: 1 }, { unique: true });
    await db.collection("devices").createIndex({ appVersion: 1 });
    console.log("✓ devices collection ready (indexes: userId, deviceId, appVersion)");

    // ── pairingCodes collection ──
    await db.createCollection("pairingCodes").catch(() =>
      console.log("pairingCodes collection already exists")
    );
    await db.collection("pairingCodes").createIndex({ code: 1 }, { unique: true });
    await db.collection("pairingCodes").createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 }
    );
    console.log("✓ pairingCodes collection ready (indexes: code, expiresAt TTL)");

    // ── activity_events collection ──
    await db.createCollection("activity_events").catch(() =>
      console.log("activity_events collection already exists")
    );
    await db.collection("activity_events").createIndex({ userId: 1, timestamp: -1 });
    await db.collection("activity_events").createIndex({ event: 1, timestamp: -1 });
    await db.collection("activity_events").createIndex({ timestamp: -1 });
    await db.collection("activity_events").createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90-day TTL
    );
    console.log("✓ activity_events collection ready (indexes: userId+timestamp, event+timestamp, timestamp, 90-day TTL)");

    // ── daily_metrics collection ──
    await db.createCollection("daily_metrics").catch(() =>
      console.log("daily_metrics collection already exists")
    );
    await db.collection("daily_metrics").createIndex({ date: 1 }, { unique: true });
    console.log("✓ daily_metrics collection ready (index: date unique)");

    console.log("\nDatabase setup complete!");
  } finally {
    await client.close();
  }
}

setup().catch(console.error);
