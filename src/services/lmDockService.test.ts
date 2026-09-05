import { beforeEach, describe, expect, it, vi } from "vitest";
import { LmDockService, type LmDockSnapshot } from "./lmDockService";
import { ScriptureDetectionEngine, type DetectionResult, type ScriptureMatch } from "./scriptureEngine";

vi.mock("./dockBridge", () => ({ dockBridge: { sendState: vi.fn() } }));
vi.mock("./overlayUrl", () => ({ getOverlayBaseUrl: async () => "http://localhost" }));
vi.mock("../multiview/mvStore", () => ({ getSettings: () => ({ inputGain: 100 }) }));
vi.mock("./tauriSafe", () => ({ hasTauriInvoke: () => false, safeTauriInvoke: vi.fn(), safeTauriListen: vi.fn() }));
vi.mock("../bible/bibleEmbeddings", () => ({ hasEmbeddings: () => false, loadBibleEmbeddings: async () => false }));

interface Harness {
  snapshot: LmDockSnapshot;
  scriptureEngine: ScriptureDetectionEngine;
  processChunk(text: string, isFinal: boolean): void;
  queueQuoteSearch(text: string): void;
  pushStatus(): void;
  pushCandidates(): void;
  matchingQueueRunning: boolean;
  quoteSearchInFlight: boolean;
  sessionToken: number;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const match: ScriptureMatch = {
  candidate: { book: "Psalms", chapter: 23, verse: 1, label: "Psalms 23:1", translation: "KJV", snippet: "Old quote", confidence: 0.95, source: "alias" },
  source: "quote", confidence: 0.95,
};

let service: LmDockService;
let harness: Harness;
beforeEach(() => {
  service = new LmDockService();
  harness = service as unknown as Harness;
  harness.snapshot = { ...service.getSnapshot(), status: "listening" };
  vi.spyOn(harness, "pushStatus").mockImplementation(() => {});
  vi.spyOn(harness, "pushCandidates").mockImplementation(() => {});
});

async function settled() {
  await vi.waitFor(() => {
    expect(harness.matchingQueueRunning).toBe(false);
    expect(harness.quoteSearchInFlight).toBe(false);
  }, { timeout: 10_000 });
}

describe("live transcript routing", () => {
  it.each([
    [["first", "Cor", "chapter thirteen", "verse four"], "1 Corinthians 13:4"],
    [["second", "2nd Kings chapter six verse seventeen"], "2 Kings 6:17"],
    [["1stCor 13:4"], "1 Corinthians 13:4"],
    [["second 2nd cor 5:17"], "2 Corinthians 5:17"],
  ] as const)("queues the intended verse from %j", async (chunks, label) => {
    const search = vi.spyOn(harness.scriptureEngine, "searchQuotesWithText");
    for (const chunk of chunks) harness.processChunk(chunk, true);
    await settled();
    expect(service.getSnapshot().latestMatch?.label).toBe(label);
    expect(service.getSnapshot().queue[0]?.label).toBe(label);
    expect(search).not.toHaveBeenCalled();
  });

  it("surfaces a spoken reference as the latest match and does not search it as a quotation", async () => {
    const search = vi.spyOn(harness.scriptureEngine, "searchQuotesWithText");
    harness.processChunk("Romans chapter eight verse twenty eight.", true);
    await settled();
    expect(service.getSnapshot().latestMatch?.label).toBe("Romans 8:28");
    expect(search).not.toHaveBeenCalled();
  });

  it("finds a quotation split across finalized audio turns", async () => {
    harness.processChunk("And the eyes of them", true);
    await settled();
    harness.processChunk("both were opened.", true);
    await settled();
    expect(service.getSnapshot().latestMatch).toMatchObject({ book: "Genesis", chapter: 3, verse: 7 });
  });

  it("keeps a complete quote when the turn also ends with Amen", async () => {
    harness.processChunk("For God so loved the world that he gave his only begotten son. Amen.", true);
    await settled();
    expect(service.getSnapshot().latestMatch).toMatchObject({ book: "John", chapter: 3, verse: 16 });
  });

  it("a newer reference invalidates an older quote even before its search finishes", async () => {
    const old = deferred<ScriptureMatch[]>();
    vi.spyOn(harness.scriptureEngine, "searchQuotesWithText").mockReturnValueOnce(old.promise);
    harness.queueQuoteSearch("the lord is my shepherd");
    harness.processChunk("Genesis 3:7", true);
    await vi.waitFor(() => expect(service.getSnapshot().latestMatch?.label).toBe("Genesis 3:7"));
    old.resolve([match]);
    await settled();
    expect(service.getSnapshot().latestMatch?.label).toBe("Genesis 3:7");
    expect(service.getSnapshot().suggestions).toEqual([]);
  });

  it("invalidates old quote results when the next query is queued", async () => {
    const old = deferred<ScriptureMatch[]>();
    const next = deferred<ScriptureMatch[]>();
    vi.spyOn(harness.scriptureEngine, "searchQuotesWithText")
      .mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    harness.queueQuoteSearch("the lord is my shepherd");
    harness.queueQuoteSearch("and the eyes of them both were opened");
    old.resolve([match]);
    await vi.waitFor(() => expect(harness.scriptureEngine.searchQuotesWithText).toHaveBeenCalledTimes(2));
    expect(service.getSnapshot().latestMatch).toBeUndefined();
    next.resolve([]);
    await settled();
  });

  it("ignores reference results from a previous listening session", async () => {
    const old = deferred<DetectionResult>();
    vi.spyOn(harness.scriptureEngine, "processChunk").mockReturnValueOnce(old.promise);
    harness.processChunk("John 3:16", true);
    harness.sessionToken++;
    harness.scriptureEngine = new ScriptureDetectionEngine();
    old.resolve({ matches: [match], context: { stack: [] }, handledReference: true });
    await settled();
    expect(service.getSnapshot().queue).toEqual([]);
  });

  it("refreshes the text and translation of a verse already at the front of the queue", async () => {
    const engine = harness.scriptureEngine;
    vi.spyOn(engine, "processChunk").mockResolvedValueOnce({ matches: [{ ...match, source: "reference" }], context: { stack: [] }, handledReference: true });
    harness.processChunk("Psalm 23:1", true);
    await settled();
    const translated = { ...match, source: "reference" as const, candidate: { ...match.candidate, translation: "NIV", snippet: "New translated words" } };
    vi.mocked(engine.processChunk).mockResolvedValueOnce({ matches: [translated], context: { stack: [] }, handledReference: true });
    harness.processChunk("use NIV", true);
    await settled();
    expect(service.getSnapshot().queue[0]).toMatchObject({ translation: "NIV", snippet: "New translated words" });
  });
});
