import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => new Map<string, string>());

vi.mock("../services/userScopedStorage", () => ({
  readUserScopedStorage: (key: string) => memory.get(key) ?? null,
  writeUserScopedStorage: (key: string, value: string) => {
    memory.set(key, value);
  },
}));

import {
  DOCK_SPELLCHECK_DICTIONARY_KEY,
  loadDockSpellcheckDictionary,
  saveDockSpellcheckDictionary,
} from "./dockSpellcheckDictionary";

describe("dock spellcheck personal dictionary", () => {
  beforeEach(() => memory.clear());

  it("persists dismissed names and normalizes them case-insensitively", () => {
    saveDockSpellcheckDictionary(["Tayo", "Tayo", "Ọlọ́run"]);

    expect(loadDockSpellcheckDictionary()).toEqual(new Set(["tayo", "ọlọ́run"]));
    expect(JSON.parse(memory.get(DOCK_SPELLCHECK_DICTIONARY_KEY) ?? "{}").words).toEqual(["ọlọ́run", "tayo"]);
  });
});
