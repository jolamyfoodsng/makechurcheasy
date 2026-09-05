import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  extractor: vi.fn(async () => ({ data: new Float32Array([1, 0, 0]) })),
  pipeline: vi.fn(),
}));
vi.mock("@xenova/transformers", () => ({ pipeline: mocks.pipeline }));

describe("speech quote embedding model", () => {
  it("reuses one model across consecutive and concurrent transcript queries", async () => {
    mocks.pipeline.mockImplementation(async () => mocks.extractor);
    const { embedQuery } = await import("./bibleEmbeddings");
    await Promise.all([embedQuery("first quotation"), embedQuery("second quotation")]);
    await embedQuery("third quotation");
    expect(mocks.pipeline).toHaveBeenCalledTimes(1);
    expect(mocks.extractor).toHaveBeenCalledTimes(3);
  });
});
