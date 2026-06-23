import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

import {
  backupToCloud,
  restoreFromCloud,
  getSyncStatus,
} from "./cloudSyncService";

function okJson(data: unknown) {
  return { ok: true, json: async () => data };
}

function errJson(message: string, status = 403) {
  return { ok: false, status, json: async () => ({ error: message }) };
}

const SAMPLE_DATA = {
  songs: [{ id: 1, title: "Amazing Grace" }],
  media: [{ id: 1, name: "cross.png" }],
  themes: [],
};

// ── Backup ──

describe("cloudSyncService — backupToCloud", () => {
  it("uploads backup data successfully", async () => {
    mockFetch.mockResolvedValueOnce(okJson({
      success: true,
      job: { _id: "j1", sizeBytes: 1024, recordCount: 2, categories: ["songs", "media"] },
    }));

    const result = await backupToCloud(SAMPLE_DATA);
    expect(result.job._id).toBe("j1");
    expect(result.job.recordCount).toBe(2);

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("/api/cloud-sync/backup");
    expect(call[1].method).toBe("POST");
  });

  it("throws on entitlement error", async () => {
    mockFetch.mockResolvedValueOnce(errJson("Cloud sync requires Growth plan or higher", 403));
    await expect(backupToCloud(SAMPLE_DATA)).rejects.toThrow("Growth plan");
  });

  it("sends categories when provided", async () => {
    mockFetch.mockResolvedValueOnce(okJson({
      success: true,
      job: { _id: "j2", sizeBytes: 512, recordCount: 1, categories: ["songs"] },
    }));

    await backupToCloud(SAMPLE_DATA, ["songs"]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.categories).toEqual(["songs"]);
  });
});

// ── Restore ──

describe("cloudSyncService — restoreFromCloud", () => {
  it("restores all data by default", async () => {
    mockFetch.mockResolvedValueOnce(okJson({
      success: true,
      data: SAMPLE_DATA,
      job: { _id: "j3", recordCount: 2, categories: ["songs", "media"] },
    }));

    const result = await restoreFromCloud();
    expect(result.data.songs).toHaveLength(1);
    expect(result.data.media).toHaveLength(1);
  });

  it("restores specific categories only", async () => {
    mockFetch.mockResolvedValueOnce(okJson({
      success: true,
      data: { songs: SAMPLE_DATA.songs },
      job: { _id: "j4", recordCount: 1, categories: ["songs"] },
    }));

    const result = await restoreFromCloud(["songs"]);
    expect(result.data.songs).toBeDefined();
    expect(result.data.media).toBeUndefined();
  });

  it("throws when no backup exists", async () => {
    mockFetch.mockResolvedValueOnce(errJson("No backup found", 404));
    await expect(restoreFromCloud()).rejects.toThrow("No backup found");
  });
});

// ── Status ──

describe("cloudSyncService — getSyncStatus", () => {
  it("returns backup info and job history", async () => {
    mockFetch.mockResolvedValueOnce(okJson({
      backup: { exists: true, sizeBytes: 1024, recordCount: 2, updatedAt: "2025-01-01" },
      jobs: [{ _id: "j1", type: "backup", status: "completed" }],
    }));

    const result = await getSyncStatus();
    expect(result.backup.exists).toBe(true);
    expect(result.jobs).toHaveLength(1);
  });

  it("returns empty backup when none exists", async () => {
    mockFetch.mockResolvedValueOnce(okJson({
      backup: { exists: false },
      jobs: [],
    }));

    const result = await getSyncStatus();
    expect(result.backup.exists).toBe(false);
  });
});
