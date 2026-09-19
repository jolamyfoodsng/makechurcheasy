/**
 * Migration: Two-way binding for credit_transactions, devices, and church_profiles → users
 *
 * For each user document, this script:
 *  1. Finds all credit_transactions where userId matches → pushes _ids into users.creditTransactions
 *  2. Finds all devices where userId matches → pushes _ids into users.devices
 *  3. Finds the church_profile where userId matches → sets users.churchProfileId
 *
 * Run:  node web/scripts/migrate-two-way-binding.js
 */

const { MongoClient, ObjectId } = require("mongodb");
const fs = require("fs");
const path = require("path");

// Load MONGODB_URI from .env.local
let uri = process.env.MONGODB_URI;
if (!uri) {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/MONGODB_URI=(.+)/);
    if (match) uri = match[1].trim();
  }
}
if (!uri) {
  console.error("No MONGODB_URI found. Set it or create web/.env.local");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri, {
    tls: true,
    serverApi: { version: "1", strict: false, deprecationErrors: false },
  });
  await client.connect();
  const db = client.db();

  console.log("Connected to MongoDB\n");

  // ── 1. Backfill users.creditTransactions ──────────────────────────────────
  console.log("── Backfilling users.creditTransactions ──");
  const creditTxns = await db.collection("credit_transactions").find({}).toArray();
  console.log(`  Found ${creditTxns.length} credit transactions`);

  // Group by userId
  const txnsByUser = {};
  for (const txn of creditTxns) {
    const uid = txn.userId;
    if (!uid) continue;
    if (!txnsByUser[uid]) txnsByUser[uid] = [];
    txnsByUser[uid].push(txn._id.toString());
  }
  console.log(`  ${Object.keys(txnsByUser).length} users have credit transactions`);

  let creditUpdated = 0;
  for (const [userId, txnIds] of Object.entries(txnsByUser)) {
    try {
      const result = await db.collection("users").updateOne(
        { _id: new ObjectId(userId) },
        { $addToSet: { creditTransactions: { $each: txnIds } } }
      );
      if (result.modifiedCount > 0) creditUpdated++;
    } catch (e) {
      console.warn(`  ⚠ Failed to update user ${userId} creditTransactions: ${e.message}`);
    }
  }
  console.log(`  ✓ Updated ${creditUpdated} users with creditTransactions\n`);

  // ── 2. Backfill users.devices ─────────────────────────────────────────────
  console.log("── Backfilling users.devices ──");
  const devices = await db.collection("devices").find({}).toArray();
  console.log(`  Found ${devices.length} devices`);

  const devicesByUser = {};
  for (const dev of devices) {
    const uid = dev.userId;
    if (!uid) continue;
    if (!devicesByUser[uid]) devicesByUser[uid] = [];
    devicesByUser[uid].push(dev._id.toString());
  }
  console.log(`  ${Object.keys(devicesByUser).length} users have devices`);

  let devicesUpdated = 0;
  for (const [userId, devIds] of Object.entries(devicesByUser)) {
    try {
      const result = await db.collection("users").updateOne(
        { _id: new ObjectId(userId) },
        { $addToSet: { devices: { $each: devIds } } }
      );
      if (result.modifiedCount > 0) devicesUpdated++;
    } catch (e) {
      console.warn(`  ⚠ Failed to update user ${userId} devices: ${e.message}`);
    }
  }
  console.log(`  ✓ Updated ${devicesUpdated} users with devices\n`);

  // ── 3. Backfill users.churchProfileId ─────────────────────────────────────
  console.log("── Backfilling users.churchProfileId ──");
  const profiles = await db.collection("church_profiles").find({}).toArray();
  console.log(`  Found ${profiles.length} church profiles`);

  let profileUpdated = 0;
  for (const profile of profiles) {
    const userId = profile.userId;
    if (!userId) continue;
    try {
      const result = await db.collection("users").updateOne(
        { _id: new ObjectId(userId), $or: [
          { churchProfileId: { $exists: false } },
          { churchProfileId: "" },
          { churchProfileId: null },
        ]},
        { $set: { churchProfileId: profile._id.toString() } }
      );
      if (result.modifiedCount > 0) profileUpdated++;
    } catch (e) {
      console.warn(`  ⚠ Failed to update user ${userId} churchProfileId: ${e.message}`);
    }
  }
  console.log(`  ✓ Updated ${profileUpdated} users with churchProfileId\n`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("── Summary ──");
  const totalUsers = await db.collection("users").countDocuments();
  const withCreditTxns = await db.collection("users").countDocuments({ creditTransactions: { $exists: true, $ne: [] } });
  const withDevices = await db.collection("users").countDocuments({ devices: { $exists: true, $ne: [] } });
  const withProfileId = await db.collection("users").countDocuments({ churchProfileId: { $exists: true, $ne: "" } });
  console.log(`  Total users:          ${totalUsers}`);
  console.log(`  With creditTxns:      ${withCreditTxns}`);
  console.log(`  With devices:         ${withDevices}`);
  console.log(`  With churchProfileId: ${withProfileId}`);

  await client.close();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
