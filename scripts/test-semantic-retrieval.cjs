#!/usr/bin/env node
/**
 * test-semantic-retrieval.cjs
 *
 * Diagnostic script to verify semantic retrieval quality.
 * Usage: node scripts/test-semantic-retrieval.cjs
 */

const fs = require("fs");
const path = require("path");

const EMBEDDINGS_PATH = path.join(__dirname, "..", "public", "bible-embeddings-kjv.json");
const INDEX_PATH = path.join(__dirname, "..", "public", "bible-hnsw-index.json");

const QUERY = "For God so loved the world";

// ── HNSW Implementation (same as hnswIndex.ts) ──

class HnswIndex {
  constructor(config) {
    this.config = { maxConnections: 16, maxConnections0: 32, efConstruction: 200, maxLevel: 4, ...config };
    this.nodes = new Map();
    this.entryPoint = null;
    this.maxLevel = 0;
  }

  search(query, k, ef = 64) {
    if (this.entryPoint === null) return [];
    let currentNearest = this.entryPoint;
    for (let l = this.maxLevel; l > 0; l--) {
      const results = this.searchLayer(query, currentNearest, 1, l);
      if (results.length > 0) currentNearest = results[0].id;
    }
    return this.searchLayer(query, currentNearest, Math.max(ef, k), 0).slice(0, k);
  }

  searchLayer(query, entryPoint, ef, level) {
    const visited = new Set([entryPoint]);
    const candidates = [];
    const results = [];
    const entryNode = this.nodes.get(entryPoint);
    if (!entryNode) return [];
    const entryDist = this.cosineDistance(query, entryNode.vector);
    candidates.push({ id: entryPoint, distance: entryDist });
    results.push({ id: entryPoint, distance: entryDist });

    while (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance);
      const current = candidates.shift();
      if (results.length >= ef) {
        results.sort((a, b) => a.distance - b.distance);
        if (current.distance > results[results.length - 1].distance) break;
      }
      const currentNode = this.nodes.get(current.id);
      if (!currentNode) continue;
      const neighbors = currentNode.neighbors.get(level);
      if (!neighbors) continue;

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const neighborNode = this.nodes.get(neighborId);
        if (!neighborNode) continue;
        const dist = this.cosineDistance(query, neighborNode.vector);
        if (results.length < ef) {
          candidates.push({ id: neighborId, distance: dist });
          results.push({ id: neighborId, distance: dist });
        } else {
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

  cosineDistance(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 1 : 1 - dot / denom;
  }

  static deserialize(data) {
    const index = new HnswIndex(data.config);
    index.entryPoint = data.entryPoint;
    index.maxLevel = data.maxLevel;
    for (const nodeData of data.nodes) {
      const node = { id: nodeData.id, vector: new Float32Array(nodeData.vector), level: nodeData.level, neighbors: new Map() };
      for (const [level, neighborIds] of nodeData.neighbors) {
        node.neighbors.set(level, new Set(neighborIds));
      }
      index.nodes.set(node.id, node);
    }
    return index;
  }
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Main ──

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("SEMANTIC RETRIEVAL DIAGNOSTIC");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // ── 1. Load data ──
  console.log("[1] Loading embeddings...");
  const t0 = performance.now();
  const embeddingsData = JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, "utf-8"));
  console.log(`    Loaded ${embeddingsData.length} verses in ${(performance.now() - t0).toFixed(0)}ms`);

  // ── 2. Verify embedding dimensions ──
  console.log("\n[2] Verifying embedding dimensions...");
  const firstVerse = embeddingsData[0];
  console.log(`    Verse embedding dimension: ${firstVerse.embedding.length}`);
  console.log(`    Expected (all-MiniLM-L6-v2): 384`);
  console.log(`    Match: ${firstVerse.embedding.length === 384 ? "✓ YES" : "✗ NO — MISMATCH!"}`);

  // ── 3. Find John 3:16 index ──
  console.log("\n[3] Finding John 3:16...");
  let john316Idx = -1;
  let john11Idx = -1;
  for (let i = 0; i < embeddingsData.length; i++) {
    if (embeddingsData[i].book === "John" && embeddingsData[i].chapter === 3 && embeddingsData[i].verse === 16) {
      john316Idx = i;
    }
    if (embeddingsData[i].book === "John" && embeddingsData[i].chapter === 1 && embeddingsData[i].verse === 1) {
      john11Idx = i;
    }
  }
  console.log(`    John 3:16 index: ${john316Idx}`);
  console.log(`    John 1:1 index: ${john11Idx}`);
  if (john316Idx >= 0) console.log(`    John 3:16 text: "${embeddingsData[john316Idx].text.substring(0, 80)}..."`);
  if (john11Idx >= 0) console.log(`    John 1:1 text: "${embeddingsData[john11Idx].text.substring(0, 80)}..."`);

  // ── 4. Generate query embedding ──
  console.log("\n[4] Generating query embedding...");
  console.log(`    Query: "${QUERY}"`);
  console.log(`    Preprocessing: toLowerCase().trim() → "${QUERY.toLowerCase().trim()}"`);

  let queryEmbedding;
  try {
    const { pipeline } = await import("@xenova/transformers");
    const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    const output = await extractor(QUERY.toLowerCase().trim(), { pooling: "mean", normalize: true });
    queryEmbedding = new Float32Array(output.data);
    console.log(`    Query embedding dimension: ${queryEmbedding.length}`);
    console.log(`    Match: ${queryEmbedding.length === firstVerse.embedding.length ? "✓ YES" : "✗ NO — MISMATCH!"}`);
  } catch (err) {
    console.error("    Failed to generate query embedding:", err.message);
    console.log("\n    Install @xenova/transformers: npm install @xenova/transformers");
    process.exit(1);
  }

  // ── 5. Brute-force cosine similarity (GROUND TRUTH) ──
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("[5] BRUTE-FORCE COSINE SIMILARITY (GROUND TRUTH)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const t1 = performance.now();
  const bruteForceResults = [];
  for (let i = 0; i < embeddingsData.length; i++) {
    const verseVec = new Float32Array(embeddingsData[i].embedding);
    const similarity = cosineSimilarity(queryEmbedding, verseVec);
    bruteForceResults.push({ index: i, similarity });
  }
  bruteForceResults.sort((a, b) => b.similarity - a.similarity);
  const bruteForceTime = performance.now() - t1;

  console.log(`    Time: ${bruteForceTime.toFixed(1)}ms\n`);
  console.log("    Top 20 results:");
  console.log("    ─────────────────────────────────────────────────────────");
  console.log("    Rank  Similarity  Distance  Reference");
  console.log("    ─────────────────────────────────────────────────────────");

  for (let i = 0; i < Math.min(20, bruteForceResults.length); i++) {
    const r = bruteForceResults[i];
    const v = embeddingsData[r.index];
    const distance = 1 - r.similarity;
    const marker = (v.book === "John" && v.chapter === 3 && v.verse === 16) ? " ← JOHN 3:16" : "";
    console.log(`    ${String(i + 1).padStart(4)}  ${r.similarity.toFixed(6)}    ${distance.toFixed(6)}    ${v.book} ${v.chapter}:${v.verse}${marker}`);
  }

  // ── 6. John 3:16 vs John 1:1 comparison ──
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("[6] JOHN 3:16 vs JOHN 1:1 COMPARISON");
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (john316Idx >= 0 && john11Idx >= 0) {
    const j316Vec = new Float32Array(embeddingsData[john316Idx].embedding);
    const j11Vec = new Float32Array(embeddingsData[john11Idx].embedding);
    const j316Sim = cosineSimilarity(queryEmbedding, j316Vec);
    const j11Sim = cosineSimilarity(queryEmbedding, j11Vec);

    console.log(`    John 3:16 similarity: ${j316Sim.toFixed(6)}`);
    console.log(`    John 1:1  similarity: ${j11Sim.toFixed(6)}`);
    console.log(`    John 3:16 > John 1:1: ${j316Sim > j11Sim ? "✓ YES" : "✗ NO — PROBLEM!"}`);
    console.log(`    Difference: ${(j316Sim - j11Sim).toFixed(6)}`);
  }

  // ── 7. HNSW retrieval ──
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("[7] HNSW RETRIEVAL");
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (fs.existsSync(INDEX_PATH)) {
    console.log("    Loading HNSW index...");
    const t2 = performance.now();
    const indexData = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
    const hnswIndex = HnswIndex.deserialize(indexData);
    console.log(`    Loaded in ${(performance.now() - t2).toFixed(0)}ms`);
    console.log(`    Vectors in index: ${hnswIndex.nodes.size}`);

    const t3 = performance.now();
    const hnswResults = hnswIndex.search(queryEmbedding, 40, 128);
    const hnswTime = performance.now() - t3;

    console.log(`    Search time: ${hnswTime.toFixed(1)}ms\n`);
    console.log("    Top 20 HNSW results:");
    console.log("    ─────────────────────────────────────────────────────────");
    console.log("    Rank  Distance    Similarity  Reference");
    console.log("    ─────────────────────────────────────────────────────────");

    for (let i = 0; i < Math.min(20, hnswResults.length); i++) {
      const r = hnswResults[i];
      const v = embeddingsData[r.id];
      const similarity = 1 - r.distance;
      const marker = (v && v.book === "John" && v.chapter === 3 && v.verse === 16) ? " ← JOHN 3:16" : "";
      console.log(`    ${String(i + 1).padStart(4)}  ${r.distance.toFixed(6)}    ${similarity.toFixed(6)}    ${v ? `${v.book} ${v.chapter}:${v.verse}` : "UNKNOWN"}${marker}`);
    }

    // Check if John 3:16 is in HNSW results
    const j316InHnsw = hnswResults.findIndex(r => {
      const v = embeddingsData[r.id];
      return v && v.book === "John" && v.chapter === 3 && v.verse === 16;
    });
    console.log(`\n    John 3:16 in HNSW results: ${j316InHnsw >= 0 ? `✓ YES (rank ${j316InHnsw + 1})` : "✗ NO — HNSW MISSING IT!"}`);
  } else {
    console.log("    ✗ HNSW index not found at:", INDEX_PATH);
    console.log("    Run: npm run generate:embeddings");
  }

  // ── 8. Diagnosis ──
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("[8] DIAGNOSIS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const bfTop5 = bruteForceResults.slice(0, 5).map(r => {
    const v = embeddingsData[r.index];
    return `${v.book} ${v.chapter}:${v.verse} (${(r.similarity * 100).toFixed(1)}%)`;
  });

  const j316BfRank = bruteForceResults.findIndex(r => {
    const v = embeddingsData[r.index];
    return v.book === "John" && v.chapter === 3 && v.verse === 16;
  });

  console.log("    Brute-force top 5:", bfTop5.join(", "));
  console.log("    John 3:16 brute-force rank:", j316BfRank >= 0 ? j316BfRank + 1 : "NOT FOUND");

  if (j316BfRank >= 0 && j316BfRank < 5) {
    console.log("\n    ✓ Brute-force returns John 3:16 near top.");
    console.log("    → Embeddings are GOOD. Problem is in HNSW index or scoring.");
  } else if (j316BfRank >= 5 && j316BfRank < 20) {
    console.log("\n    ⚠ Brute-force returns John 3:16 but not in top 5.");
    console.log("    → Embeddings are mediocre. Consider better preprocessing.");
  } else {
    console.log("\n    ✗ Brute-force does NOT return John 3:16 near top.");
    console.log("    → Embeddings are BAD. Regenerate with better preprocessing.");
  }

  console.log("\n═══════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Diagnostic failed:", err);
  process.exit(1);
});
