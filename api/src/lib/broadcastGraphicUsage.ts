/**
 * broadcastGraphicUsage.ts — who uses which Broadcast Graphic, and how often.
 *
 * The desktop app sends two tracking events (POST /api/tracking/event):
 *   broadcast_graphic_added_to_obs  { themeId, name? }   — "Add to OBS Dock" (template, saved graphic, or editor)
 *   broadcast_graphic_shown         { themeId, name? }   — the graphic was sent on air from the Dock
 *
 * Each event is folded into one row per (user, graphic) in `broadcast_graphic_usage`, so the
 * admin page can list totals per graphic and, per graphic, every church with its email.
 * Raw events are still stored in activity_events by the tracking route.
 */
import { ObjectId } from "mongodb";
import clientPromise from "./mongodb";

export const GRAPHIC_USAGE_COLLECTION = "broadcast_graphic_usage";
export const GRAPHIC_ADDED_EVENT = "broadcast_graphic_added_to_obs";
export const GRAPHIC_SHOWN_EVENT = "broadcast_graphic_shown";

export interface GraphicUsageRow {
  userId: string;
  graphicId: string;
  name?: string | null;
  addedCount: number;
  shownCount: number;
  firstAddedAt?: string | null;
  lastAddedAt?: string | null;
  firstShownAt?: string | null;
  lastShownAt?: string | null;
  updatedAt: string;
}

export interface GraphicUsageSummary {
  graphicId: string;
  usersAdded: number;
  addsTotal: number;
  usersShown: number;
  shownTotal: number;
  lastUsedAt: string | null;
}

export interface GraphicUsageUser {
  userId: string;
  name: string;
  email: string;
  churchName: string;
  plan: string;
  addedCount: number;
  shownCount: number;
  firstAddedAt: string | null;
  lastAddedAt: string | null;
  lastShownAt: string | null;
}

/** Desktop theme id → admin graphic id ("lt-pkg-<id>" for uploaded packages). */
export function graphicIdFromThemeId(themeId: string): string {
  const id = String(themeId || "").trim();
  return id.startsWith("lt-pkg-") ? id.slice("lt-pkg-".length) : id;
}

let indexesReady: Promise<void> | null = null;
async function ensureUsageIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const client = await clientPromise;
      const col = client.db().collection(GRAPHIC_USAGE_COLLECTION);
      await Promise.all([
        col.createIndex({ userId: 1, graphicId: 1 }, { unique: true }),
        col.createIndex({ graphicId: 1, updatedAt: -1 }),
      ]);
    })().catch((error) => {
      indexesReady = null;
      throw error;
    });
  }
  return indexesReady;
}

export function isGraphicUsageEvent(event: string): boolean {
  return event === GRAPHIC_ADDED_EVENT || event === GRAPHIC_SHOWN_EVENT;
}

/** Fold one tracking event into the per-user, per-graphic row. No-op without a user or graphic. */
export async function recordGraphicUsage(
  userId: string | null | undefined,
  event: string,
  properties: Record<string, unknown>,
  at: Date,
): Promise<void> {
  if (!userId || !isGraphicUsageEvent(event)) return;
  const themeId = typeof properties.themeId === "string" ? properties.themeId : "";
  const graphicId = graphicIdFromThemeId(themeId).slice(0, 200);
  if (!graphicId) return;
  const name = typeof properties.name === "string" ? properties.name.slice(0, 200) : null;
  const iso = Number.isFinite(at.getTime()) ? at.toISOString() : new Date().toISOString();
  const added = event === GRAPHIC_ADDED_EVENT;

  await ensureUsageIndexes();
  const client = await clientPromise;
  const col = client.db().collection(GRAPHIC_USAGE_COLLECTION);
  await col.updateOne(
    { userId, graphicId },
    {
      $inc: added ? { addedCount: 1 } : { shownCount: 1 },
      $min: added ? { firstAddedAt: iso } : { firstShownAt: iso },
      $max: { ...(added ? { lastAddedAt: iso } : { lastShownAt: iso }), updatedAt: iso },
      ...(name ? { $set: { name } } : {}),
      $setOnInsert: added ? { shownCount: 0 } : { addedCount: 0 },
    },
    { upsert: true },
  );
}

/** Totals per graphic, for the admin list. */
export async function getGraphicUsageSummaries(): Promise<GraphicUsageSummary[]> {
  await ensureUsageIndexes();
  const client = await clientPromise;
  const rows = await client
    .db()
    .collection(GRAPHIC_USAGE_COLLECTION)
    .aggregate<GraphicUsageSummary>([
      {
        $group: {
          _id: "$graphicId",
          usersAdded: { $sum: { $cond: [{ $gt: ["$addedCount", 0] }, 1, 0] } },
          addsTotal: { $sum: "$addedCount" },
          usersShown: { $sum: { $cond: [{ $gt: ["$shownCount", 0] }, 1, 0] } },
          shownTotal: { $sum: "$shownCount" },
          lastUsedAt: { $max: "$updatedAt" },
        },
      },
      { $project: { _id: 0, graphicId: "$_id", usersAdded: 1, addsTotal: 1, usersShown: 1, shownTotal: 1, lastUsedAt: 1 } },
    ])
    .toArray();
  return rows;
}

/** Every church that added or showed one graphic, with name and email. */
export async function getGraphicUsageUsers(graphicId: string, limit = 500): Promise<GraphicUsageUser[]> {
  await ensureUsageIndexes();
  const client = await clientPromise;
  const db = client.db();
  const rows = await db
    .collection<GraphicUsageRow>(GRAPHIC_USAGE_COLLECTION)
    .find({ graphicId })
    .sort({ shownCount: -1, addedCount: -1, updatedAt: -1 })
    .limit(Math.max(1, Math.min(limit, 2000)))
    .toArray();

  const ids = rows.map((r) => r.userId).filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const users = ids.length
    ? await db
      .collection("users")
      .find({ _id: { $in: ids } }, { projection: { name: 1, email: 1, churchName: 1, plan: 1 } })
      .toArray()
    : [];
  const byId = new Map(users.map((u) => [u._id.toString(), u]));

  return rows.map((r) => {
    const u = byId.get(r.userId);
    return {
      userId: r.userId,
      name: String(u?.name || ""),
      email: String(u?.email || ""),
      churchName: String(u?.churchName || ""),
      plan: String(u?.plan || "free"),
      addedCount: r.addedCount || 0,
      shownCount: r.shownCount || 0,
      firstAddedAt: r.firstAddedAt || null,
      lastAddedAt: r.lastAddedAt || null,
      lastShownAt: r.lastShownAt || null,
    };
  });
}
