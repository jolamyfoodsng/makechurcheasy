/**
 * Keeps the "Update - Windows" and "Update - Mac" Zoho Campaigns lists in step
 * with who has actually updated the desktop app.
 *
 * Runs once a day before the 5 PM sends. Anyone whose newest reported app
 * version is at or above the fix version is taken off the update list they are
 * on, so the remaining emails only reach people who still need to update.
 *
 * Only the two update lists are touched; contacts stay on every other list.
 * Each person is handled once (recorded in `updateCampaignPruned`). By default
 * it is a dry run that reports counts and changes nothing in Zoho.
 */

import type { Db, Document } from "mongodb";
import { ObjectId } from "mongodb";

export const UPDATE_CAMPAIGN_FIX_VERSION = "4.2.1";
const PRUNED_COLLECTION = "updateCampaignPruned";
const MAX_REMOVALS_PER_RUN = 150;

interface PruneConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  windowsListKey: string;
  macListKey: string;
  windowEnd: Date;
}

export interface UpdateCampaignPruneResult {
  status: "ok" | "disabled" | "window_closed";
  reason?: string;
  dryRun: boolean;
  updatedUsers: number;
  alreadyHandled: number;
  wouldRemove: number;
  removed: number;
  failed: number;
}

function emptyResult(status: UpdateCampaignPruneResult["status"], dryRun: boolean, reason?: string): UpdateCampaignPruneResult {
  return { status, reason, dryRun, updatedUsers: 0, alreadyHandled: 0, wouldRemove: 0, removed: 0, failed: 0 };
}

function getConfig(): { config: PruneConfig } | { reason: string } {
  const clientId = process.env.ZOHO_CAMPAIGNS_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOHO_CAMPAIGNS_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ZOHO_CAMPAIGNS_REFRESH_TOKEN?.trim();
  const windowsListKey = process.env.ZOHO_CAMPAIGNS_UPDATE_WINDOWS_LIST_KEY?.trim();
  const macListKey = process.env.ZOHO_CAMPAIGNS_UPDATE_MAC_LIST_KEY?.trim();
  const windowEndRaw = process.env.UPDATE_CAMPAIGN_WINDOW_END?.trim();

  if (!clientId || !clientSecret || !refreshToken || !windowsListKey || !macListKey || !windowEndRaw) {
    return { reason: "configuration_incomplete" };
  }
  const windowEnd = new Date(windowEndRaw);
  if (Number.isNaN(windowEnd.getTime())) return { reason: "invalid_window_end" };

  return { config: { clientId, clientSecret, refreshToken, windowsListKey, macListKey, windowEnd } };
}

function parseVersion(value: string): number[] {
  return value.trim().replace(/^v/i, "").split(/[.-]/).map((n) => parseInt(n, 10) || 0);
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function isRealEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    && !email.endsWith("@phone.makechurcheazy.com")
    && !email.endsWith("@placeholder.local");
}

interface UpdatedUser {
  email: string;
  list: "windows" | "mac";
}

/** Users whose newest device version is at or above the fix, with the list they belong on. */
async function findUpdatedUsers(db: Db): Promise<UpdatedUser[]> {
  const devices = await db.collection("devices")
    .find({ deletedAt: { $exists: false } }, { projection: { userId: 1, appVersion: 1, appPlatform: 1 } })
    .toArray();

  const byUser = new Map<string, { best: string; mac: boolean }>();
  for (const d of devices as Document[]) {
    const userId = typeof d.userId === "string" ? d.userId : String(d.userId ?? "");
    const version = typeof d.appVersion === "string" ? d.appVersion.trim() : "";
    if (!userId || !version) continue;
    const mac = /mac/i.test(String(d.appPlatform ?? ""));
    const current = byUser.get(userId);
    if (!current) {
      byUser.set(userId, { best: version, mac });
    } else {
      if (compareVersions(version, current.best) > 0) current.best = version;
      current.mac = current.mac || mac;
    }
  }

  const updatedIds = [...byUser.entries()]
    .filter(([, v]) => compareVersions(v.best, UPDATE_CAMPAIGN_FIX_VERSION) >= 0)
    .map(([id]) => id)
    .filter((id) => ObjectId.isValid(id));
  if (updatedIds.length === 0) return [];

  const users = await db.collection("users")
    .find({ _id: { $in: updatedIds.map((id) => new ObjectId(id)) } }, { projection: { email: 1 } })
    .toArray();

  const result: UpdatedUser[] = [];
  for (const u of users as Document[]) {
    const email = typeof u.email === "string" ? u.email.trim().toLowerCase() : "";
    if (!isRealEmail(email)) continue;
    // People with a Mac and a Windows computer were put on the Mac list.
    result.push({ email, list: byUser.get(String(u._id))?.mac ? "mac" : "windows" });
  }
  return result;
}

async function getAccessToken(config: PruneConfig): Promise<string | null> {
  const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string };
  return response.ok && payload.access_token ? payload.access_token : null;
}

/** Takes one person off one list. Zoho's listunsubscribe leaves their other lists untouched. */
async function removeFromList(accessToken: string, listKey: string, email: string): Promise<boolean> {
  const response = await fetch("https://campaigns.zoho.com/api/v1.1/json/listunsubscribe", {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      resfmt: "JSON",
      listkey: listKey,
      contactinfo: JSON.stringify({ "Contact Email": email }),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json().catch(() => ({}))) as { status?: string };
  return response.ok && payload.status === "success";
}

export async function pruneUpdatedUsersFromUpdateLists(
  db: Db,
  options: { apply: boolean },
): Promise<UpdateCampaignPruneResult> {
  const configResult = getConfig();
  if (!("config" in configResult)) return emptyResult("disabled", !options.apply, configResult.reason);
  const { config } = configResult;

  // Stop touching Zoho after the campaign window closes.
  if (Date.now() > config.windowEnd.getTime()) return emptyResult("window_closed", !options.apply);

  const updated = await findUpdatedUsers(db);
  const handled = new Set(
    (await db.collection(PRUNED_COLLECTION).find({}, { projection: { email: 1 } }).toArray())
      .map((d) => String((d as Document).email)),
  );
  const todo = updated.filter((u) => !handled.has(u.email));

  const result: UpdateCampaignPruneResult = {
    status: "ok",
    dryRun: !options.apply,
    updatedUsers: updated.length,
    alreadyHandled: updated.length - todo.length,
    wouldRemove: todo.length,
    removed: 0,
    failed: 0,
  };
  if (!options.apply || todo.length === 0) return result;

  const accessToken = await getAccessToken(config);
  if (!accessToken) return { ...result, failed: Math.min(todo.length, MAX_REMOVALS_PER_RUN), reason: "oauth_failed" };

  for (const user of todo.slice(0, MAX_REMOVALS_PER_RUN)) {
    try {
      const listKey = user.list === "mac" ? config.macListKey : config.windowsListKey;
      if (await removeFromList(accessToken, listKey, user.email)) {
        await db.collection(PRUNED_COLLECTION).updateOne(
          { email: user.email },
          { $set: { email: user.email, list: user.list, removedAt: new Date() } },
          { upsert: true },
        );
        result.removed += 1;
      } else {
        result.failed += 1;
      }
    } catch (error) {
      console.error("[Update Campaign] Removal failed:", error instanceof Error ? error.name : "unknown_error");
      result.failed += 1;
    }
  }
  return result;
}
