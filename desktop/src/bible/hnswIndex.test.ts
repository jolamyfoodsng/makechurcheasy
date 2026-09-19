import { afterEach, describe, expect, it, vi } from "vitest";
import { HnswIndex } from "./hnswIndex";

afterEach(() => vi.restoreAllMocks());

function fixture() {
  let seed = 42;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  vi.spyOn(Math, "random").mockImplementation(random);
  const vectors = Array.from({ length: 160 }, () => Float32Array.from({ length: 24 }, () => random() * 2 - 1));
  const index = new HnswIndex({ maxConnections: 4, maxConnections0: 8, efConstruction: 40, maxLevel: 3 });
  vectors.forEach((vector, id) => index.add(id, vector));
  return { index, vectors };
}

describe("semantic verse index", () => {
  it("keeps useful bounded connections when insertions prune existing neighbours", () => {
    const { index } = fixture();
    const data = index.serialize() as { nodes: Array<{ id: number; neighbors: Array<[number, number[]]> }> };
    expect(data.nodes).toHaveLength(160);
    for (const node of data.nodes) {
      for (const [level, neighbours] of node.neighbors) {
        expect(neighbours).not.toContain(node.id);
        expect(neighbours.length).toBeLessThanOrEqual(level === 0 ? 8 : 4);
        expect(neighbours.every((id) => id >= 0 && id < 160)).toBe(true);
      }
    }
  });

  it("retrieves exact vectors throughout the index before and after persistence", () => {
    const { index, vectors } = fixture();
    const restored = HnswIndex.deserialize(index.serialize());
    for (const id of [0, 7, 31, 79, 120, 159]) {
      expect(index.search(vectors[id], 5, 160)[0].id).toBe(id);
      expect(restored.search(vectors[id], 5, 160)).toEqual(index.search(vectors[id], 5, 160));
    }
  });

  it("agrees with exhaustive cosine ranking for a nearby query", () => {
    const { index, vectors } = fixture();
    const query = vectors[57].map((value, i) => value + (i % 3 - 1) * 0.03);
    const distance = (v: Float32Array) => {
      let dot = 0, a = 0, b = 0;
      query.forEach((value, i) => { dot += value * v[i]; a += value * value; b += v[i] * v[i]; });
      return 1 - dot / Math.sqrt(a * b);
    };
    const expected = vectors.map((vector, id) => ({ id, distance: distance(vector) }))
      .sort((a, b) => a.distance - b.distance).slice(0, 5).map((result) => result.id);
    expect(index.search(query, 5, 160).map((result) => result.id)).toEqual(expected);
  });
});
