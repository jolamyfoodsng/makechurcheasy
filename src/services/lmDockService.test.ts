import { beforeEach, describe, expect, it, vi } from "vitest";
import { LmDockService, type LmDockSnapshot, splitSentenceBoundaries, stripCommittedPrefix, isHallucinated } from "./lmDockService";
import { ScriptureDetectionEngine, type DetectionResult, type ScriptureMatch } from "./scriptureEngine";

vi.mock("./dockBridge", () => ({ dockBridge: { sendState: vi.fn() } }));
vi.mock("./overlayUrl", () => ({ getOverlayBaseUrl: async () => "http://localhost" }));
vi.mock("../multiview/mvStore", () => ({ getSettings: () => ({ inputGain: 100 }) }));
vi.mock("./tauriSafe", () => ({ hasTauriInvoke: () => false, safeTauriInvoke: vi.fn(), safeTauriListen: vi.fn() }));
vi.mock("../bible/bibleEmbeddings", () => ({
  hasEmbeddings: () => false,
  loadBibleEmbeddings: async () => false,
  searchByEmbedding: vi.fn().mockResolvedValue([]),
}));

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
  it("does not bury a new short quotation in unrelated previous speech", async () => {
    harness.processChunk("We are thankful to be here this morning", true);
    await settled();
    harness.processChunk("God loved the world", true);
    await settled();
    expect(service.getSnapshot().latestMatch).toMatchObject({ label: "John 3:16", confidence: 1 });
  }, 15_000);

  it("replaces a shared phrase with the specific verse as more words arrive", async () => {
    harness.queueQuoteSearch("sons of men");
    await settled();
    expect(service.getSnapshot().suggestions.length).toBeGreaterThan(1);
    harness.processChunk("the Lord looketh from heaven he beholdeth all the sons of men", true);
    await settled();
    expect(service.getSnapshot().latestMatch?.label).toBe("Psalms 33:13");
  });
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

  it("uses the preceding words to disambiguate a shared short phrase", async () => {
    harness.processChunk("A new commandment I give unto you that", true);
    await settled();
    harness.processChunk("ye love one another", true);
    await settled();
    expect(service.getSnapshot().latestMatch).toMatchObject({ label: "John 13:34", source: "keyword" });
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

describe("sentence splitting & prefix stripping", () => {
  it("splits multi-sentence text into individual sentences on punctuation", () => {
    const text = "It can be on a Sunday if you get to a point that the kids can say it on their own. Oh, I am intelligent, I have a sound mind. Like monthly confession for the children.";
    const result = splitSentenceBoundaries(text, false);
    expect(result.completed).toEqual([
      "It can be on a Sunday if you get to a point that the kids can say it on their own.",
      "Oh, I am intelligent, I have a sound mind.",
      "Like monthly confession for the children.",
    ]);
    expect(result.remaining).toBe("");
  });

  it("leaves incomplete trailing text in remaining", () => {
    const text = "It can be on a Sunday if you get to a point that the kids can say it on their own. Oh, I am intelligent";
    const result = splitSentenceBoundaries(text, false);
    expect(result.completed).toEqual([
      "It can be on a Sunday if you get to a point that the kids can say it on their own.",
    ]);
    expect(result.remaining).toBe("Oh, I am intelligent");
  });

  it("does not split on Bible abbreviations or decimal numbers", () => {
    const text = "Turn to 1 Cor. 13:4 or John 3.16 for your reading.";
    const result = splitSentenceBoundaries(text, false);
    expect(result.completed).toEqual([
      "Turn to 1 Cor. 13:4 or John 3.16 for your reading.",
    ]);
    expect(result.remaining).toBe("");
  });

  it("strips committed prefix from ongoing turn text", () => {
    const full = "It can be on a Sunday if you get to a point that the kids can say it on their own. Oh, I am intelligent, I have a sound mind.";
    const committed = "It can be on a Sunday if you get to a point that the kids can say it on their own.";
    const uncommitted = stripCommittedPrefix(full, committed);
    expect(uncommitted).toBe("Oh, I am intelligent, I have a sound mind.");
  });
});

describe("anti-hallucination detection", () => {
  it("flags non-Latin text spam as hallucinated", () => {
    expect(isHallucinated("Привет как дела это проверка транскрипции")).toBe(true);
    expect(isHallucinated("这是一个测试文本用于检测幻觉")).toBe(true);
  });

  it("flags repetitive word loops as hallucinated", () => {
    expect(isHallucinated("you you you you you")).toBe(true);
    expect(isHallucinated("thank you thank you thank you thank you")).toBe(true);
  });

  it("permits genuine speech and Biblical phrases", () => {
    expect(isHallucinated("Holy, Holy, Holy, Lord God Almighty")).toBe(false);
    expect(isHallucinated("Oh, I am intelligent, I have a sound mind.")).toBe(false);
  });
});

describe("line-per-line transcript streaming", () => {
  it("segments multi-sentence turn line-by-line and triggers instant quote search", async () => {
    // Simulate streaming the user's exact example
    service.handleTranscriptStream({
      text: "It can be on a Sunday if you get to a point that the kids can say it on their own. Oh, I am intelligent, I have a sound mind.",
      end_of_turn: false,
      audio_start: 1000,
      audio_end: 5000,
    });

    const entries = service.getSnapshot().entries;
    expect(entries.length).toBe(2);
    expect(entries[0].text).toBe("It can be on a Sunday if you get to a point that the kids can say it on their own.");
    expect(entries[0].finalized).toBe(true);
    expect(entries[1].text).toBe("Oh, I am intelligent, I have a sound mind.");
    expect(entries[1].finalized).toBe(true);

    await settled();

    // Line 2 contains "sound mind" which should immediately match 2 Timothy 1:7
    const snapshot = service.getSnapshot();
    const match = snapshot.latestMatch || snapshot.suggestions[0] || snapshot.queue[0];
    expect(match?.label).toBe("2 Timothy 1:7");
  });

  it("bounds memory to MAX_IN_MEMORY_ENTRIES (200) to protect 4GB/6GB RAM devices", () => {
    for (let i = 1; i <= 250; i++) {
      service.handleTranscriptStream({
        text: `Line sentence number ${i}.`,
        end_of_turn: true,
        audio_start: i * 1000,
        audio_end: (i + 1) * 1000,
      });
    }

    const entries = service.getSnapshot().entries;
    expect(entries.length).toBeLessThanOrEqual(200);
    expect(entries[entries.length - 1].text).toBe("Line sentence number 250.");
  });
});
