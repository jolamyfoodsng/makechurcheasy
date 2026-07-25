#!/usr/bin/env node
/**
 * generate-bible-embeddings.cjs
 *
 * Pre-computes embeddings for all Bible verses and builds an HNSW index.
 * Output: public/bible-embeddings-kjv.json + public/bible-hnsw-index.json
 *
 * Usage: node scripts/generate-bible-embeddings.cjs
 *
 * First run will download the embedding model (~23MB).
 * Subsequent runs use the cached model.
 */

const fs = require("fs");
const path = require("path");

const BIBLE_PATH = path.join(__dirname, "..", "public", "bible-kjv.json");
const OUTPUT_PATH = path.join(__dirname, "..", "public", "bible-embeddings-kjv.json");
const INDEX_PATH = path.join(__dirname, "..", "public", "bible-hnsw-index.json");

// All Bible books in order
const BIBLE_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
  "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
  "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews",
  "James", "1 Peter", "2 Peter", "1 John", "2 John",
  "3 John", "Jude", "Revelation",
];

// Simple HNSW implementation for Node.js build
class HnswIndex {
  constructor(config) {
    this.config = { maxConnections: 16, maxConnections0: 32, efConstruction: 200, maxLevel: 4, ...config };
    this.nodes = new Map();
    this.entryPoint = null;
    this.maxLevel = 0;
  }

  add(id, vector) {
    const level = this.randomLevel();
    const node = { id, vector, level, neighbors: new Map() };
    for (let l = 0; l <= level; l++) node.neighbors.set(l, new Set());
    this.nodes.set(id, node);

    if (this.entryPoint === null) {
      this.entryPoint = id;
      this.maxLevel = level;
      return;
    }

    let currentNearest = this.entryPoint;
    for (let l = this.maxLevel; l > level; l--) {
      currentNearest = this.searchLayer(vector, currentNearest, 1, l)[0].id;
    }

    for (let l = Math.min(level, this.maxLevel); l >= 0; l--) {
      const candidates = this.searchLayer(vector, currentNearest, this.config.efConstruction, l);
      const maxConn = l === 0 ? this.config.maxConnections0 : this.config.maxConnections;
      const neighbors = candidates.slice(0, maxConn);

      const nodeNeighbors = node.neighbors.get(l);
      for (const neighbor of neighbors) {
        nodeNeighbors.add(neighbor.id);
        const neighborNode = this.nodes.get(neighbor.id);
        if (neighborNode) {
          if (!neighborNode.neighbors.has(l)) neighborNode.neighbors.set(l, new Set());
          neighborNode.neighbors.get(l).add(id);
          if (neighborNode.neighbors.get(l).size > maxConn) {
            const pruned = this.searchLayer(neighborNode.vector, neighbor.id, maxConn + 1, l).slice(0, maxConn);
            neighborNode.neighbors.set(l, new Set(pruned.map(c => c.id)));
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

  randomLevel() {
    let level = 0;
    while (Math.random() < 0.5 && level < this.config.maxLevel) level++;
    return level;
  }

  serialize() {
    const nodes = [];
    for (const [id, node] of this.nodes) {
      const neighbors = [];
      for (const [level, neighborIds] of node.neighbors) {
        neighbors.push([level, Array.from(neighborIds)]);
      }
      nodes.push({ id, vector: Array.from(node.vector), level: node.level, neighbors });
    }
    return { config: this.config, entryPoint: this.entryPoint, maxLevel: this.maxLevel, nodes };
  }
}

async function main() {
  console.log("Loading Bible data...");
  const bibleData = JSON.parse(fs.readFileSync(BIBLE_PATH, "utf-8"));

  // Collect all verses
  const verses = [];
  for (const book of BIBLE_BOOKS) {
    const bookData = bibleData[book];
    if (!bookData) continue;
    for (const [chapter, chapterData] of Object.entries(bookData)) {
      for (const [verse, text] of Object.entries(chapterData)) {
        verses.push({
          book,
          chapter: parseInt(chapter, 10),
          verse: parseInt(verse, 10),
          reference: `${book} ${chapter}:${verse}`,
          text: String(text),
        });
      }
    }
  }

  console.log(`Found ${verses.length} verses. Loading embedding model...`);

  // Dynamic import for ESM module
  const { pipeline } = await import("@xenova/transformers");
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  console.log("Model loaded. Generating embeddings...");

  const results = [];
  const batchSize = 64;
  let processed = 0;

  for (let i = 0; i < verses.length; i += batchSize) {
    const batch = verses.slice(i, i + batchSize);
    const texts = batch.map((v) => v.text.toLowerCase());

    const outputs = await Promise.all(
      texts.map((text) => extractor(text, { pooling: "mean", normalize: true }))
    );

    for (let j = 0; j < batch.length; j++) {
      results.push({
        ...batch[j],
        embedding: Array.from(outputs[j].data),
      });
    }

    processed += batch.length;
    if (processed % 500 === 0 || processed === verses.length) {
      console.log(`  ${processed}/${verses.length} verses embedded (${((processed / verses.length) * 100).toFixed(1)}%)`);
    }
  }

  // Write embeddings file
  console.log(`Writing ${results.length} embedded verses to ${OUTPUT_PATH}...`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results));
  const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`Embeddings file: ${sizeMB} MB`);

  // Build HNSW index
  console.log("Building HNSW index...");
  const index = new HnswIndex({
    maxConnections: 16,
    maxConnections0: 32,
    efConstruction: 200,
    maxLevel: 4,
  });

  for (let i = 0; i < results.length; i++) {
    index.add(i, results[i].embedding);
    if ((i + 1) % 5000 === 0 || i === results.length - 1) {
      console.log(`  ${i + 1}/${results.length} vectors indexed`);
    }
  }

  // Write HNSW index
  console.log(`Writing HNSW index to ${INDEX_PATH}...`);
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index.serialize()));
  const indexSizeMB = (fs.statSync(INDEX_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`HNSW index: ${indexSizeMB} MB`);

  console.log("Done!");
}

main().catch((err) => {
  console.error("Failed to generate embeddings:", err);
  process.exit(1);
});
