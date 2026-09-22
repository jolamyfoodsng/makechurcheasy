import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchLatestPublishedRelease,
  clearPublishedReleaseCache,
  LATEST_MANIFEST_URL,
  RELEASES_API,
} from "./updateService";
import { refreshAppSettings } from "./forcedUpdateService";
import * as updateService from "./updateService";
import * as desktopConfigModule from "./desktopConfig";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
  exit: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: vi.fn(),
}));
vi.mock("@tauri-apps/api/path", () => ({
  tempDir: vi.fn().mockResolvedValue("/tmp"),
  join: vi.fn((...args: string[]) => Promise.resolve(args.join("/"))),
}));
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

describe("updateService - fetchLatestPublishedRelease & CORS isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPublishedReleaseCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never fetches LATEST_MANIFEST_URL using browser fetch in non-Tauri environment", async () => {
    // In a browser environment without Tauri internals
    vi.stubGlobal("window", {});

    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === LATEST_MANIFEST_URL) {
        throw new Error("CORS error: latest.json should not be fetched in browser");
      }
      if (url === RELEASES_API) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              tag_name: "v4.0.0",
              draft: false,
              prerelease: false,
              assets: [{ name: "MakeChurchEasy.exe", browser_download_url: "https://example.com/download" }],
            }),
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const release = await fetchLatestPublishedRelease();

    expect(release.version).toBe("4.0.0");
    expect(release.tag_name).toBe("v4.0.0");
    expect(fetchSpy).toHaveBeenCalledWith(RELEASES_API, undefined);
    expect(fetchSpy).not.toHaveBeenCalledWith(LATEST_MANIFEST_URL);
  });

  it("caches the fetched release in-memory and avoids repeated network calls", async () => {
    vi.stubGlobal("window", {});

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          tag_name: "v4.0.0",
          draft: false,
          prerelease: false,
          assets: [],
        }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const release1 = await fetchLatestPublishedRelease();
    const release2 = await fetchLatestPublishedRelease();

    expect(release1.version).toBe("4.0.0");
    expect(release2.version).toBe("4.0.0");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    clearPublishedReleaseCache();
    await fetchLatestPublishedRelease();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("forcedUpdateService - non-Tauri isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bypasses fetchLatestPublishedRelease in non-Tauri browser environments", async () => {
    // Non-Tauri environment: window exists, __TAURI_INTERNALS__ does not
    vi.stubGlobal("window", {});

    const fetchLatestSpy = vi.spyOn(updateService, "fetchLatestPublishedRelease");
    vi.spyOn(desktopConfigModule, "refreshDesktopConfig").mockResolvedValue({
      ...desktopConfigModule.DEFAULT_DESKTOP_CONFIG,
      appUpdates: {
        ...desktopConfigModule.DEFAULT_DESKTOP_CONFIG.appUpdates,
        latestVersion: "3.9.0",
        minimumSupportedVersion: "3.5.0",
      },
    });

    const settings = await refreshAppSettings();

    expect(settings).not.toBeNull();
    expect(settings?.latestVersion).toBe("3.9.0");
    expect(fetchLatestSpy).not.toHaveBeenCalled();
  });
});
