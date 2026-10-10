import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadSavedBroadcastGraphics,
  saveBroadcastGraphic,
  updateBroadcastGraphic,
  deleteBroadcastGraphic,
  duplicateBroadcastGraphic,
  toggleGraphicObsAvailability,
} from "./broadcastGraphicsStorage";

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
};
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

describe("broadcastGraphicsStorage", () => {
  beforeEach(() => {
    storageMap.clear();
    vi.clearAllMocks();
  });

  it("loads empty list by default", () => {
    const list = loadSavedBroadcastGraphics();
    expect(list).toEqual([]);
  });

  it("saves a new graphic and returns it with generated id and timestamps", () => {
    const saved = saveBroadcastGraphic({
      name: "Pastor Henry — Speaker Intro",
      templateId: "lt-kx-01-word-rise",
      category: "speaker",
      displayType: "lower-third",
      variables: {
        firstName: "HENRY",
        lastName: "ODEWALE",
        title: "Senior Pastor",
      },
      isAddedToObs: false,
    });

    expect(saved.id).toBeDefined();
    expect(saved.name).toBe("Pastor Henry — Speaker Intro");
    expect(saved.variables.firstName).toBe("HENRY");

    const list = loadSavedBroadcastGraphics();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(saved.id);
  });

  it("updates an existing saved graphic", () => {
    const saved = saveBroadcastGraphic({
      name: "Sunday Service Welcome",
      templateId: "lt-ch-join-group",
      category: "welcome",
      displayType: "lower-third",
      variables: {
        title: "Welcome to Church",
      },
      isAddedToObs: false,
    });

    const updated = updateBroadcastGraphic(saved.id, {
      name: "Midweek Welcome Banner",
    });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe("Midweek Welcome Banner");

    const list = loadSavedBroadcastGraphics();
    expect(list[0].name).toBe("Midweek Welcome Banner");
  });

  it("duplicates an existing graphic", () => {
    const saved = saveBroadcastGraphic({
      name: "Church Giving Details",
      templateId: "lt-ch-give-navy",
      category: "giving",
      displayType: "lower-third",
      variables: {
        bankName: "First Bank",
      },
      isAddedToObs: true,
    });

    const copy = duplicateBroadcastGraphic(saved.id);
    expect(copy).not.toBeNull();
    expect(copy?.id).not.toBe(saved.id);
    expect(copy?.name).toBe("Church Giving Details (Copy)");
    expect(copy?.isAddedToObs).toBe(false);

    const list = loadSavedBroadcastGraphics();
    expect(list.length).toBe(2);
  });

  it("deletes a saved graphic", () => {
    const saved = saveBroadcastGraphic({
      name: "To Delete",
      templateId: "lt-kx-02-slide-reveal",
      category: "speaker",
      displayType: "lower-third",
      variables: {},
      isAddedToObs: false,
    });

    expect(loadSavedBroadcastGraphics().length).toBe(1);
    const success = deleteBroadcastGraphic(saved.id);
    expect(success).toBe(true);
    expect(loadSavedBroadcastGraphics().length).toBe(0);
  });

  it("toggles OBS availability", () => {
    const saved = saveBroadcastGraphic({
      name: "Subscribe Overlay",
      templateId: "lt-sub-01-sub-1",
      category: "subscribe",
      displayType: "lower-third",
      variables: {},
      isAddedToObs: false,
    });

    const nextState = toggleGraphicObsAvailability(saved.id);
    expect(nextState).toBe(true);

    const list = loadSavedBroadcastGraphics();
    expect(list[0].isAddedToObs).toBe(true);
  });
});
