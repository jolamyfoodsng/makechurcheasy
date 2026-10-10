import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  createLocalSnapshot,
  restoreSnapshot,
  uploadSnapshotToCloud,
  fetchLatestCloudSnapshot,
  isAutoSyncEnabled,
  setAutoSyncEnabled,
  isIncludeMediaEnabled,
  setIncludeMediaEnabled,
  getSyncDeviceName,
  setSyncDeviceName,
  type CloudSyncSnapshot,
} from "./cloudSyncService";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
  };
}

// Mock dependencies
vi.mock("./authService", () => ({
  getCurrentUser: vi.fn(() => ({
    id: "user-123",
    email: "pastor@church.org",
    churchName: "Grace Faith Church",
    plan: "basic",
  })),
  getDeviceId: vi.fn(() => "device-pc-1"),
}));

vi.mock("./licenseService", () => ({
  canUseCloudSync: vi.fn(() => true),
  getUserPlanLimits: vi.fn(() => ({ cloudSync: true, cloudStorageGB: 5 })),
}));

vi.mock("../worship/worshipDb", () => ({
  getAllSongs: vi.fn(async () => [
    {
      id: "song-1",
      metadata: { title: "Amazing Grace", author: "John Newton" },
      lyrics: "Amazing grace how sweet the sound",
      updatedAt: new Date().toISOString(),
    },
  ]),
  restoreSongsFromCloud: vi.fn(async () => {}),
}));

vi.mock("./broadcastSettingsService", () => ({
  loadBroadcastStore: vi.fn(() => ({
    profiles: [
      {
        id: "p1",
        name: "Senior Pastor",
        nickname: "Pastor",
        color: "#6366f1",
        channels: [
          {
            id: "ch1",
            name: "Church YouTube",
            platform: "youtube",
            streamKey: "live_abc123",
            serverUrl: "Primary YouTube ingest server",
            enabled: true,
          },
        ],
      },
    ],
    activeProfileId: "p1",
    multistreamMode: "direct",
  })),
  saveBroadcastStore: vi.fn(),
}));

vi.mock("../dock/dockNotesStorage", () => ({
  loadDockNotes: vi.fn(() => [
    {
      id: "note-1",
      title: "Sunday Sermon",
      content: "John 3:16",
      updatedAt: Date.now(),
    },
  ]),
  saveDockNotes: vi.fn(),
  loadDockNotesPreferences: vi.fn(() => ({ overlayMode: "fullscreen" })),
  saveDockNotesPreferences: vi.fn(),
  DOCK_NOTES_KEY: "ocs-dock-notes-v1",
}));

vi.mock("../multiview/mvStore", () => ({
  getSettings: vi.fn(() => ({
    churchName: "Grace Faith Church",
    mainPastorName: "Pastor Akosile",
    brandColor: "#4f46e5",
    obsUrl: "ws://127.0.0.1:4455",
  })),
  updateSettings: vi.fn(),
  clearStore: vi.fn(async () => {}),
  STORES: { WORSHIP_SONGS: "worship_songs" },
}));

vi.mock("../library/libraryDb", () => ({
  getAllMedia: vi.fn(async () => []),
  saveMedia: vi.fn(async () => {}),
}));

describe("cloudSyncService", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates an atomic snapshot bundling worship, broadcast, notes, and settings", async () => {
    const snapshot = await createLocalSnapshot({ deviceName: "Auditorium PC" });

    expect(snapshot.manifest).toBeDefined();
    expect(snapshot.manifest.deviceName).toBe("Auditorium PC");
    expect(snapshot.manifest.counts.worshipSongs).toBe(1);
    expect(snapshot.manifest.counts.broadcastProfiles).toBe(1);
    expect(snapshot.manifest.counts.broadcastChannels).toBe(1);
    expect(snapshot.manifest.counts.notesCount).toBe(1);

    expect(snapshot.data.worship.songs.length).toBe(1);
    expect(snapshot.data.worship.songs[0].metadata.title).toBe("Amazing Grace");
    expect(snapshot.data.broadcast.storeState.profiles[0].channels[0].streamKey).toBe("live_abc123");
    expect(snapshot.data.notes.items[0].title).toBe("Sunday Sermon");
    expect(snapshot.data.settings.mvSettings.churchName).toBe("Grace Faith Church");
  });

  it("restores snapshot correctly into local stores", async () => {
    const mockSnapshot: CloudSyncSnapshot = {
      manifest: {
        version: 1,
        snapshotId: "snap-test",
        createdAt: new Date().toISOString(),
        userId: "user-123",
        deviceId: "laptop-2",
        deviceName: "New Laptop",
        appVersion: "1.0.0",
        counts: {
          worshipSongs: 1,
          broadcastProfiles: 1,
          broadcastChannels: 1,
          notesCount: 1,
          mediaCount: 0,
          hasBranding: true,
          hasSettings: true,
        },
      },
      data: {
        worship: {
          songs: [
            {
              id: "song-restored",
              metadata: { title: "Great Are You Lord", artist: "All Sons & Daughters" },
              lyrics: "All the earth will shout...",
              slides: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
        broadcast: {
          storeState: {
            profiles: [
              {
                id: "p2",
                name: "Youth Church",
                nickname: "Youth",
                color: "#10b981",
                channels: [],
              },
            ],
            activeProfileId: "p2",
            multistreamMode: "direct",
          },
        },
        notes: {
          items: [
            {
              id: "n2",
              title: "Youth Message",
              content: "Proverbs 3:5",
              updatedAt: Date.now(),
            },
          ],
        },
        settings: {
          mvSettings: {
            churchName: "Restored Grace Church",
          },
        },
      },
    };

    const result = await restoreSnapshot(mockSnapshot, { mode: "merge" });
    expect(result.success).toBe(true);
    expect(result.restoredCounts.worshipSongs).toBe(1);
    expect(result.restoredCounts.broadcastProfiles).toBe(1);
  });

  it("manages user sync preferences correctly", () => {
    expect(isAutoSyncEnabled()).toBe(true);
    setAutoSyncEnabled(false);
    expect(isAutoSyncEnabled()).toBe(false);

    expect(isIncludeMediaEnabled()).toBe(false);
    setIncludeMediaEnabled(true);
    expect(isIncludeMediaEnabled()).toBe(true);

    setSyncDeviceName("Media PC Room 1");
    expect(getSyncDeviceName()).toBe("Media PC Room 1");
  });

  it("uploads snapshot and caches without throwing quota exceeded error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    })) as unknown as typeof fetch;

    try {
      const uploadResult = await uploadSnapshotToCloud();
      expect(uploadResult.success).toBe(true);
      expect(uploadResult.snapshotId).toBeDefined();

      const cached = await fetchLatestCloudSnapshot();
      expect(cached).not.toBeNull();
      expect(cached?.manifest.snapshotId).toBe(uploadResult.snapshotId);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
