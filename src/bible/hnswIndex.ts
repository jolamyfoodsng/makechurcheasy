/**
 * hnswIndex.ts — Lightweight HNSW (Hierarchical Navigable Small World) index
 *
 * Pure TypeScript implementation for browser-based approximate nearest neighbor search.
 * Reduces search from O(n) brute-force to O(log n).
 *
 * Based on the HNSW paper: "Efficient and robust approximate nearest neighbor
 * search using Hierarchical Navigable Small World graphs" (Malkov & Yashunin, 2016)
 */

export interface HnswNode {
  id: number;
  vector: Float32Array;
  level: number;
  neighbors: Map<number, Set<number>>; // level -> set of neighbor IDs
}

export interface HnswSearchResult {
  id: number;
  distance: number;
}

interface HnswConfig {
  /** Max connections per node (M) */
  maxConnections: number;
  /** Max connections for level 0 (2*M) */
  maxConnections0: number;
  /** Size of dynamic candidate list during construction */
  efConstruction: number;
  /** Size of dynamic candidate list during search */
  efSearch: number;
  /** Max level in the graph */
  maxLevel: number;
}

const DEFAULT_CONFIG: HnswConfig = {
  maxConnections: 16,
  maxConnections0: 32,
  efConstruction: 200,
  efSearch: 64,
  maxLevel: 4,
};

function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 1 : 1 - dot / denom;
}

function randomLevel(maxLevel: number): number {
  let level = 0;
  while (Math.random() < 0.5 && level < maxLevel) {
    level++;
  }
  return level;
}

export class HnswIndex {
  private nodes: Map<number, HnswNode> = new Map();
  private config: HnswConfig;
  private entryPoint: number | null = null;
  private maxLevel = 0;
  private dimension = 0;

  constructor(config: Partial<HnswConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add a vector to the index.
   */
  add(id: number, vector: Float32Array): void {
    if (this.dimension === 0) {
      this.dimension = vector.length;
    }

    const level = randomLevel(this.config.maxLevel);
    const node: HnswNode = {
      id,
      vector,
      level,
      neighbors: new Map(),
    };

    // Initialize neighbor sets for each level
    for (let l = 0; l <= level; l++) {
      node.neighbors.set(l, new Set());
    }

    this.nodes.set(id, node);

    if (this.entryPoint === null) {
      this.entryPoint = id;
      this.maxLevel = level;
      return;
    }

    // Find nearest neighbors at each level and connect
    let currentNearest = this.entryPoint;

    // Search from top level down to level+1
    for (let l = this.maxLevel; l > level; l--) {
      currentNearest = this.searchLayer(vector, currentNearest, 1, l)[0].id;
    }

    // Search and connect at each level from min(level, maxLevel) down to 0
    for (let l = Math.min(level, this.maxLevel); l >= 0; l--) {
      const candidates = this.searchLayer(vector, currentNearest, this.config.efConstruction, l);
      const maxConn = l === 0 ? this.config.maxConnections0 : this.config.maxConnections;

      // Select neighbors (simple heuristic: closest M)
      const neighbors = candidates.slice(0, maxConn);

      // Connect bidirectionally
      const nodeNeighbors = node.neighbors.get(l)!;
      for (const neighbor of neighbors) {
        nodeNeighbors.add(neighbor.id);

        const neighborNode = this.nodes.get(neighbor.id);
        if (neighborNode) {
          if (!neighborNode.neighbors.has(l)) {
            neighborNode.neighbors.set(l, new Set());
          }
          neighborNode.neighbors.get(l)!.add(id);

          // Prune neighbors if exceeding max
          if (neighborNode.neighbors.get(l)!.size > maxConn) {
            const neighborCandidates = this.searchLayer(
              neighborNode.vector,
              neighbor.id,
              maxConn + 1,
              l,
            );
            const pruned = neighborCandidates.slice(0, maxConn);
            neighborNode.neighbors.set(l, new Set(pruned.map((c) => c.id)));
          }
        }
      }

      currentNearest = candidates[0].id;
    }

    if (level > this.maxLevel) {
      this.maxLevel = level;
      this.entryPoint = id;
    }
  }

  /**
   * Search for k nearest neighbors.
   */
  search(query: Float32Array, k: number, efSearch?: number): HnswSearchResult[] {
    if (this.entryPoint === null || this.nodes.size === 0) return [];

    const ef = efSearch ?? this.config.efSearch;
    let currentNearest = this.entryPoint;

    // Search from top level down to level 1
    for (let l = this.maxLevel; l > 0; l--) {
      const results = this.searchLayer(query, currentNearest, 1, l);
      if (results.length > 0) {
        currentNearest = results[0].id;
      }
    }

    // Search level 0 with ef
    const results = this.searchLayer(query, currentNearest, Math.max(ef, k), 0);

    return results.slice(0, k);
  }

  /**
   * Search within a single layer.
   */
  private searchLayer(
    query: Float32Array,
    entryPoint: number,
    ef: number,
    level: number,
  ): HnswSearchResult[] {
    const visited = new Set<number>([entryPoint]);
    const candidates: Array<{ id: number; distance: number }> = [];
    const results: Array<{ id: number; distance: number }> = [];

    const entryNode = this.nodes.get(entryPoint);
    if (!entryNode) return [];

    const entryDist = cosineDistance(query, entryNode.vector);
    candidates.push({ id: entryPoint, distance: entryDist });
    results.push({ id: entryPoint, distance: entryDist });

    while (candidates.length > 0) {
      // Get closest candidate
      candidates.sort((a, b) => a.distance - b.distance);
      const current = candidates.shift()!;

      // If current is farther than the farthest in results, stop
      if (results.length >= ef) {
        results.sort((a, b) => a.distance - b.distance);
        if (current.distance > results[results.length - 1].distance) {
          break;
        }
      }

      // Check neighbors
      const currentNode = this.nodes.get(current.id);
      if (!currentNode) continue;

      const neighbors = currentNode.neighbors.get(level);
      if (!neighbors) continue;

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighborNode = this.nodes.get(neighborId);
        if (!neighborNode) continue;

        const dist = cosineDistance(query, neighborNode.vector);

        if (results.length < ef) {
          candidates.push({ id: neighborId, distance: dist });
          results.push({ id: neighborId, distance: dist });
        } else {
          // Check if better than worst in results
          results.sort((a, b) => a.distance - b.distance);
          if (dist < results[results.length - 1].distance) {
            candidates.push({ id: neighborId, distance: dist });
            results[results.length - 1] = { id: neighborId, distance: dist };
          }
        }
      }
    }

    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  /**
   * Get the number of vectors in the index.
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * Serialize the index to JSON for persistence.
   */
  serialize(): object {
    const nodes: Array<{
      id: number;
      vector: number[];
      level: number;
      neighbors: Array<[number, number[]]>;
    }> = [];

    for (const [id, node] of this.nodes) {
      const neighbors: Array<[number, number[]]> = [];
      for (const [level, neighborIds] of node.neighbors) {
        neighbors.push([level, Array.from(neighborIds)]);
      }
      nodes.push({
        id,
        vector: Array.from(node.vector),
        level: node.level,
        neighbors,
      });
    }

    return {
      config: this.config,
      entryPoint: this.entryPoint,
      maxLevel: this.maxLevel,
      dimension: this.dimension,
      nodes,
    };
  }

  /**
   * Load an index from serialized JSON.
   */
  static deserialize(data: ReturnType<HnswIndex["serialize"]>): HnswIndex {
    const d = data as {
      config: HnswConfig;
      entryPoint: number | null;
      maxLevel: number;
      dimension: number;
      nodes: Array<{
        id: number;
        vector: number[];
        level: number;
        neighbors: Array<[number, number[]]>;
      }>;
    };

    const index = new HnswIndex(d.config);
    index.entryPoint = d.entryPoint;
    index.maxLevel = d.maxLevel;
    index.dimension = d.dimension;

    for (const nodeData of d.nodes) {
      const node: HnswNode = {
        id: nodeData.id,
        vector: new Float32Array(nodeData.vector),
        level: nodeData.level,
        neighbors: new Map(),
      };
      for (const [level, neighborIds] of nodeData.neighbors) {
        node.neighbors.set(level, new Set(neighborIds));
      }
      index.nodes.set(node.id, node);
    }

    return index;
  }
}
