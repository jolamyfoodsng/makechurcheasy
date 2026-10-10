/**
 * Small, dependency-light helpers that the announcements code uses to decide
 * whether a user holds a live win-back offer. The engine itself lives in
 * offerJourneys.ts; keep this file free of imports from it (and from
 * announcements.ts) so the two can both depend on it.
 */
import type { ObjectId } from "mongodb";
import clientPromise from "./mongodb";
import { COLLECTIONS } from "./db";
import {
  isOfferActionable,
  type OfferBillingCycle,
  type OfferKind,
  type OfferPlan,
  type OfferStatus,
} from "./offerLadderLogic";

export interface UserOfferParams {
  trialExtensionDays: number;
  freeDays: number;
  percentOff: number;
  discountMonths: number;
  plans: OfferPlan[];
  billingCycle: OfferBillingCycle;
}

/** One rung issued to one user. Parameters are frozen at issue time. */
export interface UserOffer {
  _id?: ObjectId;
  userId: string;
  ladderId: string;
  rungId: string;
  rungIndex: number;
  kind: OfferKind;
  status: OfferStatus;
  params: UserOfferParams;
  /** Discount code for percent-off rungs. */
  code: string | null;
  issuedAt: string;
  /** When the offer stops being open (or, after a free claim, occupying). */
  closesAt: string;
  seenAt?: string | null;
  clickedAt?: string | null;
  claimedAt?: string | null;
  /** End of the free period or extended trial that claiming granted. */
  freeUntil?: string | null;
  redeemedAt?: string | null;
  paymentRef?: string | null;
  channels: {
    email?: { sentAt: string | null; skippedReason?: string | null };
    inApp?: { firstShownAt: string | null };
  };
  /** "Your free period ends soon" reminder, for combos. */
  reminderSentAt?: string | null;
  createdBy: string;
  note?: string | null;
}

const ACTIONABLE_STATUSES: OfferStatus[] = ["issued", "seen", "clicked", "claimed"];

export async function findActionableOffer(
  userId: string,
  ladderId: string,
  rungId: string,
  now = new Date(),
): Promise<UserOffer | null> {
  if (!userId) return null;
  const client = await clientPromise;
  const offer = await client
    .db()
    .collection<UserOffer>(COLLECTIONS.USER_OFFERS)
    .findOne({ userId, ladderId, rungId, status: { $in: ACTIONABLE_STATUSES } });
  if (!offer) return null;
  return isOfferActionable({ status: offer.status, closesAt: offer.closesAt, percentOff: offer.params.percentOff }, now)
    ? offer
    : null;
}

/** Whether the user holds a live offer for this rung. Used for the personal_offer_users audience. */
export async function userHoldsOffer(userId: string, ladderId: string, rungId: string): Promise<boolean> {
  return Boolean(await findActionableOffer(userId, ladderId, rungId));
}

/** A pop-up was handed to the user: the first time, note that the offer was seen. */
export async function markOfferSeen(userId: string, ladderId: string, rungId: string): Promise<void> {
  const client = await clientPromise;
  const now = new Date().toISOString();
  const offers = client.db().collection<UserOffer>(COLLECTIONS.USER_OFFERS);
  await offers.updateOne(
    { userId, ladderId, rungId, status: "issued" },
    { $set: { status: "seen", seenAt: now } },
  );
  await offers.updateOne(
    { userId, ladderId, rungId, "channels.inApp.firstShownAt": null },
    { $set: { "channels.inApp.firstShownAt": now } },
  );
}

/** The user clicked a button on the pop-up. */
export async function markOfferClicked(userId: string, ladderId: string, rungId: string): Promise<void> {
  const client = await clientPromise;
  const now = new Date().toISOString();
  await client
    .db()
    .collection<UserOffer>(COLLECTIONS.USER_OFFERS)
    .updateOne(
      { userId, ladderId, rungId, status: { $in: ["issued", "seen"] } },
      { $set: { status: "clicked", clickedAt: now } },
    );
}

/** Per-user details the app needs to draw the pop-up (countdown, kind). */
export async function getPersonalOfferSummary(
  userId: string,
  ladderId: string,
  rungId: string,
): Promise<{ offerId: string; kind: OfferKind; closesAt: string } | null> {
  const offer = await findActionableOffer(userId, ladderId, rungId);
  if (!offer?._id) return null;
  return { offerId: offer._id.toString(), kind: offer.kind, closesAt: offer.closesAt };
}

const NOT_YET_REDEEMED: OfferStatus[] = ["issued", "seen", "clicked", "claimed", "superseded", "expired"];

/**
 * A payment went through with this offer's code. The code is unique to one rung
 * and was checked against the live offer when checkout started, so the offer is
 * marked redeemed whatever state it has reached since.
 */
export async function markOfferRedeemed(userId: string, code: string, paymentRef: string | null): Promise<boolean> {
  if (!userId || !code) return false;
  const client = await clientPromise;
  const db = client.db();
  const now = new Date().toISOString();
  const offer = await db
    .collection<UserOffer>(COLLECTIONS.USER_OFFERS)
    .findOneAndUpdate(
      { userId, code: code.trim().toUpperCase(), status: { $in: NOT_YET_REDEEMED } },
      { $set: { status: "redeemed", redeemedAt: now, paymentRef: paymentRef || null } },
      { returnDocument: "after" },
    );
  if (!offer) return false;
  await db.collection(COLLECTIONS.OFFER_JOURNEYS).updateOne(
    { userId, ladderId: offer.ladderId },
    {
      $set: {
        state: "closed",
        closedAt: now,
        closedReason: "redeemed",
        nextEvaluateAt: null,
        convertedAt: now,
        updatedAt: now,
      },
    },
  );
  return true;
}

/**
 * The person became a paying customer, with or without using an offer. Open
 * offers stop, journeys close, and the conversion is recorded so results can
 * compare people who were offered something with the holdout group.
 */
export async function markUserConverted(userId: string): Promise<void> {
  if (!userId) return;
  const client = await clientPromise;
  const db = client.db();
  const now = new Date().toISOString();
  await db
    .collection<UserOffer>(COLLECTIONS.USER_OFFERS)
    .updateMany({ userId, status: { $in: ["issued", "seen", "clicked", "claimed"] } }, { $set: { status: "superseded", closesAt: now } });
  const journeys = db.collection(COLLECTIONS.OFFER_JOURNEYS);
  await journeys.updateMany(
    { userId, state: "open" },
    { $set: { state: "closed", closedAt: now, closedReason: "paid", nextEvaluateAt: null, convertedAt: now, updatedAt: now } },
  );
  await journeys.updateMany({ userId, convertedAt: null }, { $set: { convertedAt: now, updatedAt: now } });
}

/**
 * Whether a pop-up for this offer is still worth showing: the offer is open and
 * has not been claimed yet. (A claimed free period that carries a discount stays
 * valid at checkout, but its pop-up has done its job.)
 */
export async function userHasOpenPopupOffer(userId: string, ladderId: string, rungId: string): Promise<boolean> {
  const offer = await findActionableOffer(userId, ladderId, rungId);
  return Boolean(offer && (offer.status === "issued" || offer.status === "seen" || offer.status === "clicked"));
}
