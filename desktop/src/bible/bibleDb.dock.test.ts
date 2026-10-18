import { afterEach, describe, expect, it, vi } from "vitest";
import { getInstalledTranslations, publishInstalledTranslationFromDock } from "./bibleDb";
import type { InstalledBible } from "./types";

// A Dock-like environment: no Tauri, no IndexedDB, only the local server's /uploads files.
function stubServer(files: Record<string, unknown>) {
  const writes: Array<{ name: string; data: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST" && url === "/api/save-dock-data") {
      const body = JSON.parse(String(init.body)) as { name: string; data: string };
      const data = JSON.parse(body.data);
      files[body.name] = data;
      writes.push({ name: body.name, data });
      return new Response('{"ok":true}', { status: 200 });
    }
    const name = decodeURIComponent(String(url)).replace(/^\/uploads\//, "").replace(/\.json.*$/, "");
    return name in files
      ? new Response(JSON.stringify(files[name]), { status: 200 })
      : new Response("Not found", { status: 404 });
  }));
  return writes;
}

afterEach(() => vi.unstubAllGlobals());

describe("Bibles in the OBS Dock", () => {
  it("lists the Bibles the app installed (shared manifest)", async () => {
    stubServer({
      "dock-bible-translations": [
        { id: "1", abbr: "kjv", name: "King James Version", language: "English", downloadedAt: "2026-01-01", filesize: 1 },
        { id: "2", abbr: "NKJV", name: "New King James Version", language: "English", downloadedAt: "2026-01-02", filesize: 1 },
      ],
    });
    const list = await getInstalledTranslations();
    expect(list.map((b) => b.abbr)).toEqual(["KJV", "NKJV"]);
  });

  it("shares a Bible downloaded in the Dock: data file first, then the manifest, keeping the app's entries", async () => {
    const writes = stubServer({
      "dock-bible-translations": [{ id: "1", abbr: "KJV", name: "King James Version", language: "English", downloadedAt: "2026-01-01", filesize: 1 }],
    });
    const bible = { id: "9", abbr: "niv", name: "NIV", language: "English", downloadedAt: "2026-02-01", filesize: 5, data: { Genesis: {} } } as unknown as InstalledBible;
    await publishInstalledTranslationFromDock(bible);
    expect(writes.map((w) => w.name)).toEqual(["dock-bible-translation-niv", "dock-bible-translations"]);
    const manifest = writes[1].data as Array<{ abbr: string }>;
    expect(manifest.map((m) => m.abbr)).toEqual(["KJV", "NIV"]);
    expect(JSON.stringify(manifest)).not.toContain("Genesis");
  });
});
