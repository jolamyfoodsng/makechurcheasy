/**
 * countdownStore.ts — IndexedDB CRUD for countdown configurations
 *
 * Follows the same pattern as liveToolStore.ts:
 * - Uses the centralized obs-church-studio database
 * - Auto-scoped by userId via USER_STORES
 * - Syncs to Tauri dock and BroadcastChannel after mutations
 */

import { deleteRecord, getAll, putRecord, STORES } from "../services/db";
import type { CountdownConfig, CountdownSnapshot } from "./types";
import { getOverlayBaseUrlSync } from "../services/overlayUrl";

// ── DB operations ──────────────────────────────────────────────────────────

export async function getCountdowns(): Promise<CountdownConfig[]> {
  return getAll<CountdownConfig>(STORES.COUNTDOWNS);
}

export async function getCountdown(id: string): Promise<CountdownConfig | undefined> {
  const { getByKey } = await import("../services/db");
  return getByKey<CountdownConfig>(STORES.COUNTDOWNS, id);
}

export async function saveCountdown(config: CountdownConfig): Promise<CountdownConfig> {
  const record: CountdownConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
  };
  await putRecord(STORES.COUNTDOWNS, record);
  await syncCountdownsToDock();
  await broadcastCountdownsToDock();
  return record;
}

export async function deleteCountdown(id: string): Promise<void> {
  // Clean up managed asset before deleting the countdown record
  const existing = await getCountdown(id);
  if (existing?.background.assetId) {
    // Check if any other countdowns reference this asset
    const all = await getCountdowns();
    const othersUsing = all.some((cd) => cd.id !== id && cd.background.assetId === existing.background.assetId);
    if (!othersUsing) {
      await deleteCountdownAsset(existing.background.assetId).catch(() => { });
    }
  }

  await deleteRecord(STORES.COUNTDOWNS, id);
  await syncCountdownsToDock();
  await broadcastCountdownsToDock();
}

export async function duplicateCountdown(config: CountdownConfig): Promise<CountdownConfig> {
  const { nanoid } = await import("nanoid");
  const now = new Date().toISOString();
  const duplicate: CountdownConfig = {
    ...config,
    id: nanoid(),
    title: config.title ? `${config.title} (Copy)` : "Countdown (Copy)",
    createdAt: now,
    updatedAt: now,
  };
  await putRecord(STORES.COUNTDOWNS, duplicate);
  await syncCountdownsToDock();
  await broadcastCountdownsToDock();
  return duplicate;
}

// ── Asset management ───────────────────────────────────────────────────────

/**
 * Save a file as a managed countdown asset.
 * Generates a nanoid assetId, copies file to ~/Documents/MakeChurchEasy/uploads/countdowns/,
 * and returns the assetId + overlay URL for rendering.
 */
export async function saveCountdownAsset(file: File): Promise<{ assetId: string; overlayUrl: string; diskPath: string }> {
  const { nanoid } = await import("nanoid");
  const { invoke } = await import("@tauri-apps/api/core");
  const assetId = nanoid(12);

  const arrayBuffer = await file.arrayBuffer();
  const fileData = Array.from(new Uint8Array(arrayBuffer));

  const diskPath = await invoke<string>("save_countdown_asset", {
    assetId,
    fileName: file.name,
    fileData,
  });

  const ext = file.name.split(".").pop() || "bin";
  const overlayUrl = `${getOverlayBaseUrlSync()}/uploads/countdowns/${assetId}.${ext}`;

  return { assetId, overlayUrl, diskPath };
}

/**
 * Delete a countdown asset by its assetId.
 */
export async function deleteCountdownAsset(assetId: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("delete_countdown_asset", { assetId });
}

/**
 * Resolve an assetId to an overlay URL usable in <img>/<video> tags and OBS.
 */
export function resolveCountdownAssetUrl(assetId: string, ext: string): string {
  return `${getOverlayBaseUrlSync()}/uploads/countdowns/${assetId}.${ext}`;
}

/**
 * Scan all countdowns, collect used assetIds, and delete orphaned files from disk.
 */
export async function cleanupUnusedCountdownAssets(): Promise<number> {
  const { invoke } = await import("@tauri-apps/api/core");
  const countdowns = await getCountdowns();
  const usedIds = new Set<string>();

  for (const cd of countdowns) {
    if (cd.background.assetId) usedIds.add(cd.background.assetId);
  }

  const deleted = await invoke<number>("cleanup_unused_countdown_assets", {
    usedAssetIds: Array.from(usedIds),
  });
  return deleted;
}

// ── Snapshot / sync ────────────────────────────────────────────────────────

export async function getCountdownSnapshot(): Promise<CountdownSnapshot> {
  const countdowns = await getCountdowns();
  return {
    countdowns,
    updatedAt: new Date().toISOString(),
  };
}

export async function syncCountdownsToDock(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const snapshot = await getCountdownSnapshot();
    await invoke("save_dock_data", {
      name: "dock-countdowns",
      data: JSON.stringify(snapshot),
    });
  } catch (err) {
    console.warn("[countdownStore] Failed to sync countdowns to dock:", err);
  }
}

async function broadcastCountdownsToDock(): Promise<void> {
  try {
    const { dockBridge } = await import("../services/dockBridge");
    const snapshot = await getCountdownSnapshot();
    dockBridge.sendState({
      type: "state:countdowns",
      payload: snapshot,
      timestamp: Date.now(),
    });
  } catch {
    // BroadcastChannel is optional; dock JSON sync above is the durable fallback.
  }
}
