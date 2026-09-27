import clientPromise from "./mongodb";

/** Whether this user has ever completed a paid monthly or yearly subscription purchase. */
export async function hasSuccessfulPaidSubscription(userId: string): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const previousPurchase = await db.collection("billing_transactions").findOne(
    {
      userId,
      status: { $in: ["success", "completed", "paid"] },
      type: { $in: ["subscription_purchase", "subscription_renewal", "plan_upgrade"] },
      billingCycle: { $in: ["monthly", "yearly"] },
      purchaseKind: { $ne: "one_time" },
    },
    { projection: { _id: 1 } },
  );
  return Boolean(previousPurchase);
}
