import { describe, it, expect } from "vitest";
import {
  getAllScenes,
  getAllInputs,
  getAllSceneItems,
  registerScene,
  registerInput,
  getSceneBySlot,
  getInputBySlot,
} from "./obsRegistry";

describe("obsRegistry self-healing and safety", () => {
  it("exports all necessary registration and retrieval functions", () => {
    expect(typeof getAllScenes).toBe("function");
    expect(typeof getAllInputs).toBe("function");
    expect(typeof getAllSceneItems).toBe("function");
    expect(typeof registerScene).toBe("function");
    expect(typeof registerInput).toBe("function");
    expect(typeof getSceneBySlot).toBe("function");
    expect(typeof getInputBySlot).toBe("function");
  });

  it("safely handles reading from registry when indexedDB stores are being initialized", async () => {
    // In Node / Vitest environments without full IndexedDB implementation,
    // calls should gracefully resolve or return empty arrays without uncaught exceptions
    const scenes = await getAllScenes();
    const inputs = await getAllInputs();
    const items = await getAllSceneItems();

    expect(Array.isArray(scenes)).toBe(true);
    expect(Array.isArray(inputs)).toBe(true);
    expect(Array.isArray(items)).toBe(true);
  });
});
