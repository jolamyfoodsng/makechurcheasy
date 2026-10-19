import { afterEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: { name: string; data?: string }) => {
    if (cmd === "load_dock_data") return files.get(args.name) ?? "";
    if (cmd === "save_dock_data") files.set(args.name, args.data ?? "");
    return undefined;
  }),
}));
vi.mock("./dockBridge", () => ({ dockBridge: { sendFavoriteThemesUpdated: vi.fn() } }));

describe("syncSavedGraphicsToDock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    files.clear();
  });

  it("reads the saved graphics from the app folder before writing the Dock file at start-up", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, dispatchEvent: () => true, addEventListener: () => undefined });
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      key: () => null,
      length: 0,
    });
    const { syncSavedGraphicsToDock, DOCK_SAVED_GRAPHICS_FILE } = await import("./broadcastGraphicsStorage");
    const saved = [{ id: "bg-1", name: "Share Your Testimony", templateId: "lt-kx-01-word-rise", isAddedToObs: true }];
    // The saved list lives only in the app folder file; nothing has read it yet.
    for (const name of ["saved-broadcast-graphics"]) files.set(name, JSON.stringify(saved));
    files.set(DOCK_SAVED_GRAPHICS_FILE, JSON.stringify(saved));

    await syncSavedGraphicsToDock();

    const written = JSON.parse(files.get(DOCK_SAVED_GRAPHICS_FILE) ?? "[]") as Array<{ id: string }>;
    expect(written.map((g) => g.id)).toEqual(["bg-1"]);
  });
});
