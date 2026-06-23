/**
 * cloudSyncService.ts — Backup and restore data to/from cloud (Growth+ feature).
 */

const API_BASE = "";

export interface SyncJobInfo {
  _id: string;
  type: "backup" | "restore";
  status: string;
  sizeBytes: number;
  recordCount: number;
  categories: string[];
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface BackupInfo {
  exists: boolean;
  sizeBytes?: number;
  recordCount?: number;
  categories?: string[];
  updatedAt?: string;
}

export interface SyncStatus {
  backup: BackupInfo;
  jobs: SyncJobInfo[];
}

/**
 * Upload data to cloud backup.
 * @param data — Object with category keys (songs, media, themes, etc.) mapping to arrays of records
 * @param categories — Optional list of category names to include
 */
export async function backupToCloud(
  data: Record<string, unknown[]>,
  categories?: string[]
): Promise<{ job: SyncJobInfo }> {
  const res = await fetch(`${API_BASE}/api/cloud-sync/backup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, categories }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `Backup failed (${res.status})`);
  }
  return json;
}

/**
 * Restore data from cloud backup.
 * @param categories — Optional: only restore specific categories. If empty, restores all.
 */
export async function restoreFromCloud(
  categories?: string[]
): Promise<{ data: Record<string, unknown[]>; job: SyncJobInfo }> {
  const res = await fetch(`${API_BASE}/api/cloud-sync/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categories }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `Restore failed (${res.status})`);
  }
  return json;
}

/**
 * Get sync status and job history.
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(`${API_BASE}/api/cloud-sync/status`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `Status check failed (${res.status})`);
  }
  return json;
}
