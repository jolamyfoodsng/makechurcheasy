import { describe, expect, it } from "vitest";
import type { VoiceBibleCandidate } from "../services/voiceBibleTypes";
import {
  AUTO_COOLDOWN_MS,
  appendNew,
  candidateKey,
  mentionKey,
  decideAutoProjection,
  isAutoProjectable,
  moveItem,
  suggestionReason,
} from "./studioQueue";

const c = (book: string, chapter: number, verse: number, extra: Partial<VoiceBibleCandidate> = {}): VoiceBibleCandidate => ({
  book,
  chapter,
  verse,
  translation: "KJV",
  label: `${book} ${chapter}:${verse}`,
  snippet: "",
  confidence: 1,
  source: "keyword",
  detectedAt: 1000,
  ...extra,
});

describe("queue lists", () => {
  it("appends new detections once, oldest first, and skips ones the operator removed", () => {
    const john = c("John", 3, 16);
    const romans = c("Romans", 8, 28);
    const isaiah = c("Isaiah", 40, 31);
    // The service lists newest first.
    let list = appendNew([], [romans, john]);
    expect(list.map((x) => x.label)).toEqual(["Romans 8:28", "John 3:16"]);
    // Mentioned again: not duplicated.
    list = appendNew(list, [john, romans]);
    expect(list).toHaveLength(2);
    // Removed by the operator: not brought back by the next detection burst.
    list = appendNew(list, [isaiah], new Set([candidateKey(isaiah)]));
    expect(list).toHaveLength(2);
  });

  it("returns the same array when nothing changed (no needless re-render)", () => {
    const list = [c("John", 3, 16)];
    expect(appendNew(list, [c("John", 3, 16)])).toBe(list);
  });

  it("moves items", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    const same = ["a"];
    expect(moveItem(same, 0, 0)).toBe(same);
  });
});

describe("Auto mode", () => {
  const state = (over: Partial<{ since: number; lastAt: number; handled: Set<string> }> = {}) => ({ since: 0, lastAt: 0, handled: new Set<string>(), ...over });

  it("only certain spoken references qualify (no possible matches, no low-confidence quotes)", () => {
    expect(isAutoProjectable(c("John", 3, 16))).toBe(true);
    expect(isAutoProjectable(c("John", 3, 16, { source: "fuzzy" }))).toBe(false);
    expect(isAutoProjectable(c("John", 3, 16, { confidence: 0.9 }))).toBe(false); // chapter only
    expect(isAutoProjectable(c("John", 3, 16, { confidence: 0.86 }))).toBe(false); // keyword quote
  });

  it("projects the newest new reference", () => {
    const d = decideAutoProjection([c("John", 3, 16, { detectedAt: 2000 })], state(), 5000);
    expect(d.target?.label).toBe("John 3:16");
    expect(d.target?.keys).toEqual([mentionKey(c("John", 3, 16, { detectedAt: 2000 }))]);
  });

  it("ignores what was said before Auto mode was switched on", () => {
    const d = decideAutoProjection([c("John", 3, 16, { detectedAt: 900 })], state({ since: 1000 }), 5000);
    expect(d.target).toBeNull();
  });

  it("never projects the same reference twice", () => {
    const john = c("John", 3, 16, { detectedAt: 2000 });
    const d = decideAutoProjection([john], state({ handled: new Set([mentionKey(john)]) }), 5000);
    expect(d.target).toBeNull();
  });

  it("waits for the cool-down, then shows only the newest; older ones are passed over", () => {
    const first = c("John", 3, 16, { detectedAt: 2000 });
    const second = c("Romans", 8, 28, { detectedAt: 2500 });
    const waiting = decideAutoProjection([first, second], state({ lastAt: 1800 }), 2600);
    expect(waiting.target).toBeNull();
    expect(waiting.retryInMs).toBe(1800 + AUTO_COOLDOWN_MS - 2600);
    const later = decideAutoProjection([first, second], state({ lastAt: 1800 }), 1800 + AUTO_COOLDOWN_MS);
    expect(later.target?.label).toBe("Romans 8:28");
    expect(later.skip).toEqual([mentionKey(first)]);
  });

  it("shows a spoken passage (one candidate per verse) as one range", () => {
    const at = { detectedAt: 3000 };
    const d = decideAutoProjection([c("John", 3, 16, at), c("John", 3, 17, at), c("John", 3, 18, at)], state(), 9000);
    expect(d.target).toMatchObject({ book: "John", chapter: 3, verse: 16, endVerse: 18, label: "John 3:16-18" });
    expect(d.target?.keys).toHaveLength(3);
  });
});

describe("suggestion reasons", () => {
  it("names the words a suggestion shares with what was said", () => {
    const reason = suggestionReason(
      { snippet: "Now unto him that is able to do exceeding abundantly above all that we ask or think, according to the power that worketh in us" },
      "God is able to do much more than we could ever imagine. His power is greater than our limitations.",
    );
    expect(reason).toBe("Matches: able, power");
  });

  it("falls back to a plain line when no word is shared", () => {
    expect(suggestionReason({ snippet: "Jesus wept." }, "Hallelujah")).toBe("Close in meaning to what was said");
  });
});
