/**
 * Migration: Backfill signupCountry, country, and locationHistory for existing users.
 *
 * Run with:
 *   npx tsx scripts/backfill-signup-country.ts
 *
 * For every user in the users collection:
 * - If `signupCountry` is missing, lock it in from `country` (or `lastLoginCountry` if present).
 * - If `country` is missing, set it from `signupCountry` or `lastLoginCountry`.
 * - If `locationHistory` is missing or empty, initialize it with their existing location data.
 *
 * Idempotent: safe to run multiple times.
 */

import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  if (!MONGODB_URI) {
    console.error("Error: MONGODB_URI environment variable is required.");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("Connected to MongoDB.");

    const db = client.db();
    const usersCollection = db.collection("users");

    const users = await usersCollection.find({}).toArray();
    console.log(`Found ${users.length} users to inspect.`);

    let updatedCount = 0;

    for (const user of users) {
      const permanentCountry =
        user.signupCountry ||
        user.country ||
        user.lastLoginCountry ||
        "";

      const setFields: Record<string, any> = {};

      if (!user.signupCountry && permanentCountry) {
        setFields.signupCountry = permanentCountry;
      }
      if (!user.country && permanentCountry) {
        setFields.country = permanentCountry;
      }
      if (!user.signupCity && (user.city || user.lastLoginCity)) {
        setFields.signupCity = user.city || user.lastLoginCity;
      }
      if (!user.signupIp && (user.signupIp || user.lastLoginIp || user.lastIp || user.ipAddress)) {
        setFields.signupIp = user.signupIp || user.lastLoginIp || user.lastIp || user.ipAddress;
      }

      if (!user.locationHistory || user.locationHistory.length === 0) {
        const historyEntry = {
          country: permanentCountry || "UNKNOWN",
          ...(user.signupCity || user.city || user.lastLoginCity ? { city: user.signupCity || user.city || user.lastLoginCity } : {}),
          ...(user.signupTimezone || user.timezone || user.lastLoginTimezone ? { timezone: user.signupTimezone || user.timezone || user.lastLoginTimezone } : {}),
          ...(user.signupIp || user.lastLoginIp || user.lastIp ? { ip: user.signupIp || user.lastLoginIp || user.lastIp } : {}),
          timestamp: user.createdAt?.toISOString?.() || user.createdAt || new Date().toISOString(),
        };
        setFields.locationHistory = [historyEntry];
      }

      if (Object.keys(setFields).length > 0) {
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: setFields }
        );
        updatedCount++;
      }
    }

    console.log(`Backfill complete. Updated ${updatedCount} of ${users.length} users.`);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
