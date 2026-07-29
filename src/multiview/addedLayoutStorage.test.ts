import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/userScopedStorage", () => ({
  getUserScopedKey: (baseKey: string) => `${baseKey}:user-1`,
}));

import {
  loadAddedLayoutIdsFromDockData,
  loadLocalAddedLayoutIds,
  mergeAddedLayoutIds,
  parseAddedLayoutIds,
  saveAddedLayoutIdsToDockData,
  saveLocalAddedLayoutIds,
  serializeAddedLayoutIds,
} from "./addedLayoutStorage";

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const storage = {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    }),
  };
  vi.stubGlobal("localStorage", storage);
  return storage;
}

describe("addedLayoutStorage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installLocalStorageMock();
  });

  it("parses and serializes clean added layout IDs", () => {
    const ids = parseAddedLayoutIds(JSON.stringify([" layout-a ", "", null, "layout-b", "layout-a"]));

    expect([...ids]).toEqual(["layout-a", "layout-b"]);
    expect(serializeAddedLayoutIds(ids)).toBe(JSON.stringify(["layout-a", "layout-b"]));
  });

  it("merges scoped and unscoped localStorage entries and migrates both keys", () => {
    localStorage.setItem("mvg-added-ids", JSON.stringify(["layout-a", "layout-b"]));
    localStorage.setItem("mvg-added-ids:user-1", JSON.stringify(["layout-b", "layout-c"]));

    const ids = loadLocalAddedLayoutIds();

    expect([...ids]).toEqual(["layout-a", "layout-b", "layout-c"]);
    expect(JSON.parse(localStorage.getItem("mvg-added-ids") ?? "[]")).toEqual(["layout-a", "layout-b", "layout-c"]);
    expect(JSON.parse(localStorage.getItem("mvg-added-ids:user-1") ?? "[]")).toEqual(["layout-a", "layout-b", "layout-c"]);
  });

  it("saves added layout IDs to both localStorage keys", () => {
    const saved = saveLocalAddedLayoutIds(["layout-a", "layout-a", "layout-b"]);

    expect([...saved]).toEqual(["layout-a", "layout-b"]);
    expect(JSON.parse(localStorage.getItem("mvg-added-ids") ?? "[]")).toEqual(["layout-a", "layout-b"]);
    expect(JSON.parse(localStorage.getItem("mvg-added-ids:user-1") ?? "[]")).toEqual(["layout-a", "layout-b"]);
  });

  it("keeps local IDs when the dock data source is empty", () => {
    const merged = mergeAddedLayoutIds(new Set(["local-layout"]), new Set());

    expect([...merged]).toEqual(["local-layout"]);
  });

  it("loads added IDs from the dock data JSON file", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(["layout-a", "layout-b"]), { status: 200 })
    );

    const ids = await loadAddedLayoutIdsFromDockData(fetchMock);

    expect([...ids]).toEqual(["layout-a", "layout-b"]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/uploads/mv-added-ids.json");
  });

  it("saves added IDs to the dock data endpoint", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("{}", { status: 200 })
    );

    const ok = await saveAddedLayoutIdsToDockData(["layout-a"], fetchMock);

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/save-dock-data", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "mv-added-ids", data: JSON.stringify(["layout-a"]) }),
    }));
  });
});
