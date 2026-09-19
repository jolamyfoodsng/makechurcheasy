import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not found in env");
  process.exit(1);
}

async function run() {
  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  const db = client.db();

  console.log("Connected to MongoDB. Deduplicating first_presentation events...");

  const eventsCol = db.collection("activity_events");
  const usersCol = db.collection("users");

  // Find all first_presentation events grouped by userId
  const duplicateUsers = await eventsCol
    .aggregate([
      { $match: { event: "first_presentation" } },
      { $group: { _id: "$userId", count: { $sum: 1 }, events: { $push: { id: "$_id", timestamp: "$timestamp", createdAt: "$createdAt" } } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  console.log(`Found ${duplicateUsers.length} user(s) with duplicate first_presentation events.`);

  let totalDeleted = 0;

  for (const item of duplicateUsers) {
    const userId = item._id;
    // Sort events by timestamp ascending
    const sorted = item.events.sort((a: any, b: any) => {
      const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
      const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    const keepEvent = sorted[0];
    const removeEvents = sorted.slice(1);
    const removeIds = removeEvents.map((e: any) => e.id);

    const deleteResult = await eventsCol.deleteMany({ _id: { $in: removeIds } });
    totalDeleted += deleteResult.deletedCount;
    console.log(`User ${userId}: kept earliest event ${keepEvent.id} (${keepEvent.timestamp || keepEvent.createdAt}), deleted ${deleteResult.deletedCount} duplicate(s).`);

    // Ensure user record's firstPresentationAt reflects earliest timestamp
    if (userId && ObjectId.isValid(userId)) {
      const earliestIso = new Date(keepEvent.timestamp || keepEvent.createdAt).toISOString();
      await usersCol.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            "activationMilestones.firstPresentation": true,
            "activationMilestones.firstPresentationAt": earliestIso,
          },
        },
      );
    }
  }

  console.log(`Deduplication complete. Total duplicate events removed: ${totalDeleted}`);
  await client.close();
}

run().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
