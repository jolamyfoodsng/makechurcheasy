/**
 * GET /api/admin/subscriptions
 *
 * Lists Paystack and admin-managed subscriptions for the admin dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { COLLECTIONS } from "@/lib/db";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";
import type { Subscription } from "@/types/schemas";

interface UserDoc {
  _id: unknown;
  name?: string;
  email?: string;
  churchName?: string;
  plan?: string;
  subscriptionExpiresAt?: string | null;
  scheduledDowngradeAt?: string | null;
  adminManagedSubscription?: {
    active?: boolean;
    plan?: string;
    billingCycle?: string;
    startedBy?: string;
    startedAt?: string;
    renewedAt?: string;
    expiresAt?: string;
    amountCollected?: number;
    currency?: string;
    paymentReference?: string;
    note?: string;
    emailSentAt?: string;
    endedAt?: string;
    endedBy?: string;
    endedReason?: string;
  } | null;
}

interface BillingTransactionDoc {
  userId?: string;
  amount?: number;
  currency?: string;
  paymentProvider?: string;
  paystackReference?: string;
  providerReference?: string;
  type?: string;
  status?: string;
  billingCycle?: string;
  expiresAt?: string;
  paidAt?: string;
  createdAt?: string;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "toISOString" in value) {
    try {
      return (value as { toISOString: () => string }).toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function objectIdToString(value: unknown): string {
  return value && typeof value === "object" && "toString" in value
    ? value.toString()
    : String(value || "");
}

function isExpired(endDate?: string | null): boolean {
  if (!endDate) return false;
  const ms = new Date(endDate).getTime();
  return Number.isFinite(ms) && ms <= Date.now();
}

function statusFor(subscription?: Subscription | null, user?: UserDoc): string {
  const managed = user?.adminManagedSubscription;
  if (managed?.active && isExpired(managed.expiresAt)) return "expired";
  if (subscription?.status === "active" && isExpired(subscription.currentPeriodEnd)) return "expired";
  if (subscription?.status) return subscription.status;
  if (managed?.active) return "active";
  return "cancelled";
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status") || "all";
    const providerFilter = url.searchParams.get("provider") || "all";

    const client = await clientPromise;
    const db = client.db();

    const subscriptionDocs = await db
      .collection<Subscription>(COLLECTIONS.SUBSCRIPTIONS)
      .find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(1000)
      .toArray();

    const userIds = new Set(subscriptionDocs.map((sub) => sub.userId).filter(Boolean));
    const adminManagedUsers = await db
      .collection<UserDoc>("users")
      .find(
        {
          adminManagedSubscription: { $exists: true, $ne: null },
        },
        {
          projection: {
            password: 0,
          },
        },
      )
      .toArray();

    for (const user of adminManagedUsers) {
      const id = objectIdToString(user._id);
      if (id) userIds.add(id);
    }

    const { ObjectId } = await import("mongodb");
    const objectIds = [...userIds]
      .map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return null;
        }
      })
      .filter((id): id is InstanceType<typeof ObjectId> => Boolean(id));

    let users = await db
      .collection<UserDoc>("users")
      .find(
        { _id: { $in: objectIds } } as any,
        {
          projection: {
            password: 0,
          },
        },
      )
      .toArray();

    users = await Promise.all(
      users.map((user) => checkAndApplyScheduledDowngrade(objectIdToString(user._id), user)),
    );

    const usersById = new Map(users.map((user) => [objectIdToString(user._id), user]));
    const subsByUserId = new Map(subscriptionDocs.map((sub) => [sub.userId, sub]));

    const latestTransactions = await db
      .collection<BillingTransactionDoc>("billing_transactions")
      .aggregate([
        { $match: { userId: { $in: [...userIds] }, status: "success" } },
        { $sort: { paidAt: -1, createdAt: -1 } },
        { $group: { _id: "$userId", tx: { $first: "$$ROOT" } } },
      ])
      .toArray();
    const txByUserId = new Map(latestTransactions.map((row) => [String(row._id), row.tx as BillingTransactionDoc]));

    const adminIds = [
      ...new Set(
        users
          .flatMap((user) => [
            user.adminManagedSubscription?.startedBy,
            user.adminManagedSubscription?.endedBy,
            subsByUserId.get(objectIdToString(user._id))?.managedByAdminId,
          ])
          .filter(Boolean)
          .map(String),
      ),
    ];
    const adminObjectIds = adminIds
      .map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return null;
        }
      })
      .filter((id): id is InstanceType<typeof ObjectId> => Boolean(id));
    const adminUsers = adminObjectIds.length
      ? await db.collection("users").find({ _id: { $in: adminObjectIds } }, { projection: { name: 1, email: 1 } }).toArray()
      : [];
    const adminById = new Map(
      adminUsers.map((admin) => [
        admin._id.toString(),
        { name: admin.name || admin.email || "Admin", email: admin.email || "" },
      ]),
    );

    const rows = [...userIds]
      .map((userId) => {
        const user = usersById.get(userId);
        if (!user) return null;

        const subscription = subsByUserId.get(userId) || null;
        const managed = user.adminManagedSubscription || null;
        const tx = txByUserId.get(userId) || null;
        const source = managed?.active || subscription?.adminManaged
          ? "admin_collected"
          : subscription?.paymentProvider || tx?.paymentProvider || "paystack";
        const status = statusFor(subscription, user);
        const plan = managed?.plan || subscription?.plan || user.plan || "free";
        const currentPeriodEnd =
          managed?.expiresAt ||
          subscription?.currentPeriodEnd ||
          user.subscriptionExpiresAt ||
          user.scheduledDowngradeAt ||
          null;
        const startedBy = managed?.startedBy || subscription?.managedByAdminId || null;
        const managedBy = startedBy ? adminById.get(startedBy) : null;

        return {
          id: subscription?._id ? objectIdToString(subscription._id) : `user:${userId}`,
          userId,
          user: {
            name: user.name || "",
            email: user.email || "",
            churchName: user.churchName || "",
          },
          plan,
          status,
          billingCycle: managed?.billingCycle || subscription?.billingCycle || tx?.billingCycle || "monthly",
          source,
          adminManaged: source === "admin_collected" || Boolean(subscription?.adminManaged),
          amount: managed?.amountCollected ?? subscription?.price ?? tx?.amount ?? 0,
          currency: managed?.currency || subscription?.currency || tx?.currency || "NGN",
          paymentReference:
            managed?.paymentReference ||
            subscription?.adminPaymentReference ||
            tx?.providerReference ||
            tx?.paystackReference ||
            "",
          currentPeriodStart:
            managed?.startedAt ||
            subscription?.currentPeriodStart ||
            toIso(tx?.paidAt) ||
            subscription?.startDate ||
            null,
          currentPeriodEnd,
          nextBillingDate: subscription?.nextBillingDate || currentPeriodEnd,
          autoRenew: subscription?.autoRenew ?? false,
          startedAt: managed?.startedAt || subscription?.startDate || toIso(tx?.paidAt) || null,
          renewedAt: managed?.renewedAt || null,
          endedAt: managed?.endedAt || subscription?.cancelledAt || null,
          note: managed?.note || subscription?.adminPaymentNote || "",
          emailSentAt: managed?.emailSentAt || null,
          managedBy,
          createdAt: subscription?.createdAt || toIso(tx?.createdAt) || managed?.startedAt || null,
          updatedAt: subscription?.updatedAt || managed?.renewedAt || managed?.startedAt || null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => statusFilter === "all" || row.status === statusFilter)
      .filter((row) => providerFilter === "all" || row.source === providerFilter)
      .sort((a, b) => {
        const aDate = a.updatedAt || a.currentPeriodEnd || a.createdAt || "";
        const bDate = b.updatedAt || b.currentPeriodEnd || b.createdAt || "";
        return bDate.localeCompare(aDate);
      });

    const stats = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "active" || row.status === "trialing") acc.active += 1;
        if (row.status === "cancelled" || row.status === "expired") acc.cancelled += 1;
        if (row.adminManaged) acc.adminManaged += 1;
        return acc;
      },
      { total: 0, active: 0, cancelled: 0, adminManaged: 0 },
    );

    return NextResponse.json({ stats, subscriptions: rows });
  } catch (error) {
    console.error("Admin subscriptions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
