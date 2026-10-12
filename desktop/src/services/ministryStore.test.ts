import { describe, expect, it } from "vitest";

/** A tiny localStorage for the test (the store reads `mv-settings`, as the desktop app does). */
function installStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const storage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = storage;
  if (!(globalThis as unknown as { window?: unknown }).window) {
    (globalThis as unknown as { window: unknown }).window = {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
    };
  }
  return storage;
}

function settings(over: Record<string, unknown>) {
  return JSON.stringify({
    churchName: "Old Church",
    pastorSpeakers: [{ name: "Pastor John Smith", role: "Senior Pastor", isMain: true }],
    churchWebsite: "https://old.org",
    churchPhone: "111",
    churchSocials: { facebook: "https://facebook.com/old" },
    ...over,
  });
}

describe("ministry store: church details and their history", () => {
  it("reads the church details from settings and remembers the old ones when they change", async () => {
    const storage = installStorage({ "mv-settings": settings({}) });
    const store = await import("./ministryStore");

    const first = store.getMinistryData();
    expect(first.churchName).toBe("Old Church");
    expect(first.website).toBe("https://old.org");
    expect(first.phone).toBe("111");
    expect(first.socials).toEqual({ facebook: "https://facebook.com/old" });
    expect(first.mainPastorName).toBe("Pastor John Smith");
    expect(store.getMinistryHistory().length).toBe(0);

    // The church edits its profile on the website and the desktop app syncs it.
    storage.setItem("mv-settings", settings({ churchName: "New Church", churchPhone: "222" }));
    store.refreshMinistry();

    const next = store.getMinistryData();
    expect(next.churchName).toBe("New Church");
    expect(next.phone).toBe("222");
    const history = store.getMinistryHistory();
    expect(history.length).toBe(1);
    expect(history[0].churchName).toBe("Old Church");
    expect(history[0].phone).toBe("111");

    // Syncing the same details again does not add to the history.
    store.refreshMinistry();
    expect(store.getMinistryHistory().length).toBe(1);

    // Another change keeps both earlier versions, newest first.
    storage.setItem("mv-settings", settings({ churchName: "Newest Church" }));
    store.refreshMinistry();
    expect(store.getMinistryHistory().map((h) => h.churchName)).toEqual(["New Church", "Old Church"]);
  });
});
