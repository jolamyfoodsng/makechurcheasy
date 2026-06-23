/**
 * migrationService.ts — One-time upload of local data to MongoDB
 *
 * On first login after the MongoDB migration update, uploads existing
 * IndexedDB transcripts and custom themes to the MongoDB API.
 * Uses a localStorage flag to ensure this only runs once.
 */

import { invoke } from "@tauri-apps/api/core";
import { getDeviceId } from "./authService";

const MIGRATION_FLAG_KEY = "mce_mongo_content_migration_v1";

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://web-tayo-akosiles-projects.vercel.app";

async function apiPost(path: string, body: unknown): Promise<void> {
  const deviceId = getDeviceId();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(deviceId ? { "X-Device-Id": deviceId } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API ${res.status}`);
  }
}

/**
 * Upload existing transcripts from the local filesystem to MongoDB.
 * Reads via the Tauri command (same data that was previously filesystem-only).
 */
async function uploadTranscripts(): Promise<number> {
  try {
    const json = await invoke<string>("load_transcripts");
    const transcripts = JSON.parse(json) as Array<Record<string, unknown>>;
    if (!Array.isArray(transcripts) || transcripts.length === 0) return 0;

    let uploaded = 0;
    for (const t of transcripts) {
      try {
        await apiPost("/api/transcripts", { transcript: t });
        uploaded++;
      } catch (err) {
        console.warn("[migration] Failed to upload transcript:", t.id, err);
      }
    }
    return uploaded;
  } catch (err) {
    console.warn("[migration] Failed to load transcripts from filesystem:", err);
    return 0;
  }
}

/**
 * Upload existing custom themes from IndexedDB to MongoDB.
 */
async function uploadThemes(): Promise<number> {
  try {
    const { getCustomThemes } = await import("../bible/bibleDb");
    const themes = await getCustomThemes();
    if (themes.length === 0) return 0;

    let uploaded = 0;
    for (const theme of themes) {
      try {
        await apiPost("/api/themes", {
          theme: {
            themeId: theme.id,
            name: theme.name,
            description: theme.description,
            source: theme.source || "custom",
            templateType: theme.templateType,
            category: theme.category,
            categories: theme.categories,
            settings: theme.settings,
            preview: theme.preview,
            hidden: theme.hidden,
            createdAt: theme.createdAt,
            updatedAt: theme.updatedAt,
          },
        });
        uploaded++;
      } catch (err) {
        console.warn("[migration] Failed to upload theme:", theme.id, err);
      }
    }
    return uploaded;
  } catch (err) {
    console.warn("[migration] Failed to load themes from IndexedDB:", err);
    return 0;
  }
}

/**
 * Run the one-time migration if it hasn't completed yet.
 * Safe to call multiple times — the flag prevents re-runs.
 */
export async function runContentMigrationIfNeeded(): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATION_FLAG_KEY)) return;
  if (!getDeviceId()) return; // Not authenticated yet

  try {
    const [transcriptCount, themeCount] = await Promise.all([
      uploadTranscripts(),
      uploadThemes(),
    ]);

    if (transcriptCount > 0 || themeCount > 0) {
      console.log(
        `[migration] Uploaded ${transcriptCount} transcripts and ${themeCount} themes to MongoDB`,
      );
    }

    localStorage.setItem(MIGRATION_FLAG_KEY, "done");
  } catch (err) {
    console.error("[migration] Content migration failed (will retry next launch):", err);
    // Don't set flag — will retry on next launch
  }
}
